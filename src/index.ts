import type {
    LiveAuthResult,
    VerifyOptions,
    PowChallengeResponse,
    PowVerifyRequest,
    PowVerifyResponse,
    PowSolution,
    AuthStartResponse,
    AuthConfirmResponse,
    LiveAuthConfig, LightningStart
} from './types';
import {LiveAuthCancelledError, LiveAuthTimeoutError} from "./errors";

export class LiveAuth {
    private readonly baseUrl: string;
    private readonly headers: HeadersInit;

    constructor(private readonly config: LiveAuthConfig) {
        if (!config.publicKey) {
            throw new Error('LiveAuth: publicKey is required');
        }

        this.baseUrl = config.baseUrl ?? 'https://api.liveauth.app';

        this.headers = {
            'Content-Type': 'application/json',
            'X-LW-Public': config.publicKey
        };
    }

    /* ======================================================
     * PUBLIC ENTRYPOINT
     * ====================================================== */

    async verify(): Promise<LiveAuthResult> {
        const startedAt = performance.now();

        const challenge = await this.getPowChallenge();
        const solution = await this.solvePow(challenge);

        const verifyRes = await this.verifyPow({
            challengeHex: challenge.challengeHex,
            nonce: solution.nonce,
            hashHex: solution.hashHex,
            expiresAtUnix: challenge.expiresAtUnix,
            sig: challenge.sig
        });

        if (verifyRes.verified && verifyRes.token) {
            return {
                method: 'pow',
                token: verifyRes.token,
                solveMs: Math.round(performance.now() - startedAt),
                difficultyBits: challenge.difficultyBits
            };
        }

        if (verifyRes.fallback === 'lightning') {
            const lightning = await this.startLightning();
            return {
                method: 'lightning',
                lightning
            };
        }

        throw new Error('LiveAuth: verification failed');
    }

    /* ======================================================
     * POW FLOW
     * ====================================================== */

    private async getPowChallenge(): Promise<PowChallengeResponse> {
        const res = await fetch(`${this.baseUrl}/api/public/pow/challenge`, {
            headers: this.headers
        });

        if (!res.ok) throw new Error('PoW challenge failed');
        return res.json();
    }

    private async verifyPow(req: PowVerifyRequest): Promise<PowVerifyResponse> {
        const res = await fetch(`${this.baseUrl}/api/public/pow/verify`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(req)
        });

        if (!res.ok) throw new Error('PoW verify failed');
        return res.json();
    }

    /* ======================================================
     * POW SOLVER (WORKER)
     * ====================================================== */

    private solvePow(challenge: PowChallengeResponse): Promise<PowSolution> {
        if (!this.canUsePow()) {
            return Promise.reject(
                new Error('LiveAuth: PoW not supported in this environment')
            );
        }

        return new Promise((resolve, reject) => {
            const worker = new Worker(
                new URL('./pow.worker.js', import.meta.url),
                {type: 'module'}
            );

            worker.onmessage = e => {
                worker.terminate();
                resolve(e.data);
            };

            worker.onerror = e => {
                worker.terminate();
                reject(e);
            };

            worker.postMessage({
                projectPublicKey: challenge.projectPublicKey,
                challengeHex: challenge.challengeHex,
                targetHex: challenge.targetHex
            });
        });
    }

    /* ======================================================
     * LIGHTNING FALLBACK
     * ====================================================== */

    private async startLightning(): Promise<LightningStart> {
        const res = await fetch(`${this.baseUrl}/api/public/auth/start`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({userHint: 'browser'})
        });

        if (!res.ok) {
            throw new Error('Lightning auth start failed');
        }

        return res.json();
    }

    private canUsePow(): boolean {
        try {
            // SSR / Node guard
            if (typeof window === 'undefined') return false;

            // Worker support
            if (typeof Worker === 'undefined') return false;

            // Basic URL support (needed for module workers)
            if (typeof URL === 'undefined') return false;

            return true;
        } catch {
            return false;
        }
    }

    async pollLightning(
        sessionId: string,
        options?: {
            timeoutMs?: number;
            signal?: AbortSignal;
            intervalMs?: number;
        }
    ): Promise<string> {
        const timeoutMs = options?.timeoutMs ?? 5 * 60_000; // 5 min
        const intervalMs = options?.intervalMs ?? 2000;
        const externalSignal = options?.signal;

        const controller = new AbortController();
        const signal = controller.signal;

        // If caller passes a signal, bridge it
        if (externalSignal) {
            if (externalSignal.aborted) {
                throw new LiveAuthCancelledError();
            }

            externalSignal.addEventListener('abort', () => {
                controller.abort();
            });
        }

        // Timeout enforcement
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            while (true) {
                if (signal.aborted) {
                    throw externalSignal?.aborted
                        ? new LiveAuthCancelledError()
                        : new LiveAuthTimeoutError();
                }

                const res = await fetch(
                    `${this.baseUrl}/api/public/auth/confirm`,
                    {
                        method: 'POST',
                        headers: this.headers,
                        body: JSON.stringify({sessionId}),
                        signal
                    }
                );

                if (!res.ok) {
                    throw new Error('Lightning confirm failed');
                }

                const json = await res.json();

                if (json.verified && json.token) {
                    return json.token;
                }

                await sleep(intervalMs);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }


}

/* ======================================================
 * UTILS
 * ====================================================== */

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

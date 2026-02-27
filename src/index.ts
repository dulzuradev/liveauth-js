import type {
    LiveAuthResult,
    VerifyOptions,
    PowChallengeResponse,
    PowVerifyRequest,
    PowVerifyResponse,
    PowSolution,
    LiveAuthConfig,
    LightningStart
} from './types';
import {
    LiveAuthCancelledError,
    LiveAuthTimeoutError,
    LiveAuthNetworkError,
    LiveAuthPowUnsupportedError,
    LiveAuthPowTimeoutError
} from './errors';
import type { PowWorkerResult } from './pow.worker';

// Re-export for consumers
export * from './types';
export * from './errors';

const SDK_VERSION = '0.2.0';

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
            'X-LW-Public': config.publicKey,
            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
            'X-LW-SDK-Version': SDK_VERSION
        };
    }

    /* ======================================================
     * PUBLIC ENTRYPOINT
     * ====================================================== */

    async verify(options: VerifyOptions = {}): Promise<LiveAuthResult> {
        const { 
            forceLightning = false, 
            onProgress,
            powTimeoutMs = 30_000,
            maxPowIterations = 50_000_000
        } = options;

        // Skip PoW if forced to Lightning or PoW not supported
        if (forceLightning) {
            const lightning = await this.startLightning();
            return {
                method: 'lightning',
                lightning,
                diagnostics: { reason: 'forced_lightning' }
            };
        }

        if (!this.canUsePow()) {
            const lightning = await this.startLightning();
            return {
                method: 'lightning',
                lightning,
                diagnostics: { reason: 'pow_unsupported' }
            };
        }

        const startedAt = performance.now();

        try {
            const challenge = await this.getPowChallenge();
            const solution = await this.solvePow(challenge, { 
                onProgress, 
                timeoutMs: powTimeoutMs,
                maxIterations: maxPowIterations
            });

            const verifyRes = await this.verifyPow({
                challengeHex: challenge.challengeHex,
                nonce: solution.nonce,
                hashHex: solution.hashHex,
                expiresAtUnix: challenge.expiresAtUnix,
                difficultyBits: challenge.difficultyBits,
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
                    lightning,
                    diagnostics: { reason: 'pow_server_fallback' }
                };
            }

            throw new Error('LiveAuth: verification failed');

        } catch (err) {
            // On PoW failure, fall back to Lightning
            if (err instanceof LiveAuthPowTimeoutError || err instanceof LiveAuthPowUnsupportedError) {
                const lightning = await this.startLightning();
                return {
                    method: 'lightning',
                    lightning,
                    diagnostics: { 
                        reason: 'pow_failed', 
                        detail: err.message 
                    }
                };
            }
            throw err;
        }
    }

    /* ======================================================
     * POW FLOW
     * ====================================================== */

    private async getPowChallenge(): Promise<PowChallengeResponse> {
        const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/pow/challenge`, {
            headers: this.headers
        });

        if (!res.ok) throw new LiveAuthNetworkError('PoW challenge failed');
        return res.json();
    }

    private async verifyPow(req: PowVerifyRequest): Promise<PowVerifyResponse> {
        const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/pow/verify`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(req)
        });

        if (!res.ok) throw new LiveAuthNetworkError('PoW verify failed');
        return res.json();
    }

    /* ======================================================
     * POW SOLVER (WORKER)
     * ====================================================== */

    private solvePow(
        challenge: PowChallengeResponse, 
        options: {
            onProgress?: (hashesPerSec: number, iterations: number) => void;
            timeoutMs?: number;
            maxIterations?: number;
        } = {}
    ): Promise<PowSolution> {
        const { onProgress, timeoutMs = 30_000, maxIterations = 50_000_000 } = options;

        if (!this.canUsePow()) {
            return Promise.reject(new LiveAuthPowUnsupportedError());
        }

        // Inline worker as blob URL for better bundler compatibility
        const workerCode = `
            self.onmessage = async (e) => {
                const { projectPublicKey, challengeHex, targetHex, maxIterations = 50000000, progressInterval = 10000 } = e.data;
                let nonce = 0;
                const startTime = performance.now();
                let lastProgressTime = startTime;

                while (nonce < maxIterations) {
                    const input = projectPublicKey + ':' + challengeHex + ':' + nonce;
                    const hash = await sha256Hex(input);
                    if (hash <= targetHex) {
                        const elapsed = performance.now() - startTime;
                        self.postMessage({ type: 'solution', nonce, hashHex: hash, iterations: nonce + 1, hashesPerSec: Math.round((nonce + 1) / (elapsed / 1000)) });
                        return;
                    }
                    nonce++;
                    if (nonce % progressInterval === 0) {
                        const now = performance.now();
                        self.postMessage({ type: 'progress', iterations: nonce, hashesPerSec: Math.round(progressInterval / ((now - lastProgressTime) / 1000)) });
                        lastProgressTime = now;
                    }
                }
                self.postMessage({ type: 'timeout', iterations: nonce });
            };
            async function sha256Hex(input) {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
                return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
            }
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        return new Promise((resolve, reject) => {
            const worker = new Worker(workerUrl);

            const timeoutId = setTimeout(() => {
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                reject(new LiveAuthPowTimeoutError(`PoW timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            worker.onmessage = (e: MessageEvent<PowWorkerResult>) => {
                const data = e.data;

                if (data.type === 'progress') {
                    onProgress?.(data.hashesPerSec ?? 0, data.iterations ?? 0);
                    return;
                }

                if (data.type === 'timeout') {
                    clearTimeout(timeoutId);
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    reject(new LiveAuthPowTimeoutError(`PoW hit max iterations (${maxIterations})`));
                    return;
                }

                if (data.type === 'solution' && data.nonce !== undefined && data.hashHex) {
                    clearTimeout(timeoutId);
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    resolve({ nonce: data.nonce, hashHex: data.hashHex });
                    return;
                }
            };

            worker.onerror = e => {
                clearTimeout(timeoutId);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                reject(new LiveAuthPowUnsupportedError(`Worker error: ${e.message}`));
            };

            worker.postMessage({
                projectPublicKey: challenge.projectPublicKey,
                challengeHex: challenge.challengeHex,
                targetHex: challenge.targetHex,
                maxIterations
            });
        });
    }

    /* ======================================================
     * LIGHTNING FALLBACK
     * ====================================================== */

    private async startLightning(): Promise<LightningStart> {
        const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/auth/start`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ userHint: 'browser' })
        });

        if (!res.ok) {
            throw new LiveAuthNetworkError('Lightning auth start failed');
        }

        return res.json();
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
                        body: JSON.stringify({ sessionId }),
                        signal
                    }
                );

                if (!res.ok) {
                    throw new LiveAuthNetworkError('Lightning confirm failed');
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

    /* ======================================================
     * UTILITIES
     * ====================================================== */

    private canUsePow(): boolean {
        try {
            // SSR / Node guard
            if (typeof window === 'undefined') return false;

            // Worker support
            if (typeof Worker === 'undefined') return false;

            // Basic URL support (needed for module workers)
            if (typeof URL === 'undefined') return false;

            // Crypto.subtle required for SHA-256
            if (typeof crypto === 'undefined' || !crypto.subtle) return false;

            return true;
        } catch {
            return false;
        }
    }

    private async fetchWithRetry(
        url: string,
        init?: RequestInit,
        retries = 2,
        backoffMs = 500
    ): Promise<Response> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, init);
                return res;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                
                if (attempt < retries) {
                    await sleep(backoffMs * Math.pow(2, attempt));
                }
            }
        }

        throw new LiveAuthNetworkError(
            `Request failed after ${retries + 1} attempts`,
            lastError
        );
    }
}

/* ======================================================
 * UTILS
 * ====================================================== */

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

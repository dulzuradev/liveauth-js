interface LiveAuthConfig {
    /** Public project key (browser-safe) */
    publicKey: string;
    /** API secret key (for Lightning auth) - get from dashboard */
    apiKey?: string;
    /** Optional API base URL (defaults to liveauth.app) */
    baseUrl?: string;
}
interface VerifyOptions {
    /** Skip PoW and go straight to Lightning */
    forceLightning?: boolean;
    /** Progress callback for PoW solving */
    onProgress?: (hashesPerSec: number, iterations: number) => void;
    /** Max time to spend on PoW before falling back to Lightning (default: 30s) */
    powTimeoutMs?: number;
    /** Max iterations for PoW before falling back (default: 50M) */
    maxPowIterations?: number;
}
interface PowChallengeResponse {
    projectPublicKey: string;
    challengeHex: string;
    targetHex: string;
    difficultyBits: number;
    expiresAtUnix: number;
    sig: string;
}
interface PowSolution {
    nonce: number;
    hashHex: string;
}
interface PowVerifyRequest {
    challengeHex: string;
    nonce: number;
    hashHex: string;
    expiresAtUnix: number;
    difficultyBits: number;
    sig: string;
}
interface PowVerifyResponse {
    verified: boolean;
    token?: string;
    fallback?: 'lightning';
}
interface LightningStart {
    sessionId: string;
    invoice: string | null;
    amountSats: number;
    expiresAtUnix: number;
    mode: 'TEST' | 'LIVE';
}
interface AuthStartResponse {
    sessionId: string;
    invoice?: string;
    amountSats: number;
    expiresAtUnix: number;
    mode?: 'TEST' | 'LIVE';
}
interface AuthConfirmResponse {
    verified: boolean;
    token?: string;
}
interface LiveAuthDiagnostics {
    reason?: 'forced_lightning' | 'pow_unsupported' | 'pow_failed' | 'pow_server_fallback';
    detail?: string;
}
type LiveAuthMethod = 'pow' | 'lightning';
type LiveAuthResult = {
    method: 'pow';
    token: string;
    solveMs: number;
    difficultyBits: number;
    diagnostics?: LiveAuthDiagnostics;
} | {
    method: 'lightning';
    lightning: LightningStart;
    diagnostics?: LiveAuthDiagnostics;
};

declare class LiveAuthTimeoutError extends Error {
    constructor(message?: string);
}
declare class LiveAuthCancelledError extends Error {
    constructor(message?: string);
}
declare class LiveAuthNetworkError extends Error {
    readonly cause?: Error | undefined;
    constructor(message?: string, cause?: Error | undefined);
}
declare class LiveAuthPowUnsupportedError extends Error {
    constructor(message?: string);
}
declare class LiveAuthPowTimeoutError extends Error {
    constructor(message?: string);
}

declare class LiveAuth {
    private readonly config;
    private readonly baseUrl;
    private readonly headers;
    constructor(config: LiveAuthConfig);
    verify(options?: VerifyOptions): Promise<LiveAuthResult>;
    private getPowChallenge;
    private verifyPow;
    private solvePow;
    private startLightning;
    pollLightning(sessionId: string, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
        intervalMs?: number;
    }): Promise<string>;
    private canUsePow;
    private fetchWithRetry;
}

export { type AuthConfirmResponse, type AuthStartResponse, type LightningStart, LiveAuth, LiveAuthCancelledError, type LiveAuthConfig, type LiveAuthDiagnostics, type LiveAuthMethod, LiveAuthNetworkError, LiveAuthPowTimeoutError, LiveAuthPowUnsupportedError, type LiveAuthResult, LiveAuthTimeoutError, type PowChallengeResponse, type PowSolution, type PowVerifyRequest, type PowVerifyResponse, type VerifyOptions };

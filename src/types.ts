/* ======================================================
 * SDK CONFIG
 * ====================================================== */

export interface LiveAuthConfig {
    /** Public project key (browser-safe) */
    publicKey: string;

    /** Optional API base URL (defaults to liveauth.app) */
    baseUrl?: string;
}

/* ======================================================
 * PoW Challenge (GET /api/public/pow/challenge)
 * ====================================================== */

export interface PowChallengeResponse {
    projectPublicKey: string;
    challengeHex: string;
    targetHex: string;
    difficultyBits: number;
    expiresAtUnix: number;
    sig: string;
}

/* ======================================================
 * PoW Solver Result (Worker → Main Thread)
 * ====================================================== */

export interface PowSolution {
    nonce: number;
    hashHex: string;
}

/* ======================================================
 * PoW Verify (POST /api/public/pow/verify)
 * ====================================================== */

export interface PowVerifyRequest {
    challengeHex: string;
    nonce: number;
    hashHex: string;
    expiresAtUnix: number;
    sig: string;
}

export interface PowVerifyResponse {
    verified: boolean;
    token?: string;
    fallback?: 'lightning';
}

/* ======================================================
 * Lightning Flow (PUBLIC)
 * ====================================================== */

export interface AuthStartResponse {
    sessionId: string;
    invoice?: string;
    amountSats: number;
    expiresAtUnix: number;
    mode?: 'TEST' | 'LIVE';
}

export interface AuthConfirmResponse {
    verified: boolean;
    token?: string;
}

export type LiveAuthMethod = 'pow' | 'lightning';

export interface VerifyOptions {
    /** Demo / UI option: skip PoW and go straight to Lightning */
    forceLightning?: boolean;

    /** If true, try Lightning first (useful for some app flows) */
    preferLightning?: boolean;

    /** Optional end-user hint (email/uid/whatever) */
    userHint?: string;

    /** Poll interval for /auth/confirm */
    pollIntervalMs?: number;
}

export interface LiveAuthDiagnostics {
    reason?:
        | 'forced_lightning'
        | 'pow_unsupported'
        | 'pow_failed'
        | 'pow_server_fallback'
        | 'unknown';
    detail?: string;
}

/* POW */
export interface PowChallengeResponse {
    projectPublicKey: string;
    challengeHex: string;
    targetHex: string;
    difficultyBits: number;
    expiresAtUnix: number;
    sig: string;
}

export interface PowSolution {
    nonce: number;
    hashHex: string;
}

export interface PowVerifyRequest {
    challengeHex: string;
    nonce: number;
    hashHex: string;
    expiresAtUnix: number;
    sig: string;
}

export interface PowVerifyResponse {
    verified: boolean;
    token?: string;
    fallback?: 'lightning';
}

/* Lightning */
export interface AuthStartResponse {
    sessionId: string;
    invoice?: string;
    amountSats: number;
    expiresAtUnix: number;
    mode?: 'TEST' | 'LIVE';
}

export interface AuthConfirmResponse {
    verified: boolean;
    token?: string;
}

export interface LightningStart {
    sessionId: string;
    invoice: string | null;
    amountSats: number;
    expiresAtUnix: number;
    mode: 'TEST' | 'LIVE';
}

export type LiveAuthResult =
    | {
    method: 'pow';
    token: string;
    solveMs: number;
    difficultyBits: number;
    diagnostics?: LiveAuthDiagnostics;
}
    | {
    method: 'lightning';
    lightning: LightningStart;
};


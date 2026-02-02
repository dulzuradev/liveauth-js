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
 * VERIFY OPTIONS
 * ====================================================== */

export interface VerifyOptions {
    /** Skip PoW and go straight to Lightning */
    forceLightning?: boolean;

    /** Progress callback for PoW solving */
    onProgress?: (hashesPerSec: number, iterations: number) => void;

    /** Max time to spend on PoW before falling back to Lightning (default: 30s) */
    powTimeoutMs?: number;

    /** Max iterations for PoW before falling back (default: 50M) */
    maxPowIterations?: number;
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
    difficultyBits: number;
    sig: string;
}

export interface PowVerifyResponse {
    verified: boolean;
    token?: string;
    fallback?: 'lightning';
}

/* ======================================================
 * Lightning Flow
 * ====================================================== */

export interface LightningStart {
    sessionId: string;
    invoice: string | null;
    amountSats: number;
    expiresAtUnix: number;
    mode: 'TEST' | 'LIVE';
}

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

/* ======================================================
 * DIAGNOSTICS
 * ====================================================== */

export interface LiveAuthDiagnostics {
    reason?:
        | 'forced_lightning'
        | 'pow_unsupported'
        | 'pow_failed'
        | 'pow_server_fallback';
    detail?: string;
}

/* ======================================================
 * RESULT TYPES
 * ====================================================== */

export type LiveAuthMethod = 'pow' | 'lightning';

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
          diagnostics?: LiveAuthDiagnostics;
      };

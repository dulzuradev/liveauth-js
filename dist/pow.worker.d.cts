interface PowWorkerMessage {
    projectPublicKey: string;
    challengeHex: string;
    targetHex: string;
    maxIterations?: number;
    progressInterval?: number;
}
interface PowWorkerResult {
    type: 'solution' | 'progress' | 'timeout';
    nonce?: number;
    hashHex?: string;
    iterations?: number;
    hashesPerSec?: number;
}

export type { PowWorkerMessage, PowWorkerResult };

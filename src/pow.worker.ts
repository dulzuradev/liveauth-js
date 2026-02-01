export interface PowWorkerMessage {
    projectPublicKey: string;
    challengeHex: string;
    targetHex: string;
    maxIterations?: number;
    progressInterval?: number;
}

export interface PowWorkerResult {
    type: 'solution' | 'progress' | 'timeout';
    nonce?: number;
    hashHex?: string;
    iterations?: number;
    hashesPerSec?: number;
}

self.onmessage = async (e: MessageEvent<PowWorkerMessage>) => {
    const { 
        projectPublicKey, 
        challengeHex, 
        targetHex, 
        maxIterations = 50_000_000,
        progressInterval = 10_000
    } = e.data;

    let nonce = 0;
    const startTime = performance.now();
    let lastProgressTime = startTime;

    while (nonce < maxIterations) {
        const input = `${projectPublicKey}:${challengeHex}:${nonce}`;
        const hash = await sha256Hex(input);

        if (hash <= targetHex) {
            const elapsed = performance.now() - startTime;
            postMessage({ 
                type: 'solution', 
                nonce, 
                hashHex: hash,
                iterations: nonce + 1,
                hashesPerSec: Math.round((nonce + 1) / (elapsed / 1000))
            } satisfies PowWorkerResult);
            return;
        }

        nonce++;

        // Send progress updates periodically
        if (nonce % progressInterval === 0) {
            const now = performance.now();
            const elapsed = now - startTime;
            const recentElapsed = now - lastProgressTime;
            
            postMessage({ 
                type: 'progress', 
                iterations: nonce,
                hashesPerSec: Math.round(progressInterval / (recentElapsed / 1000))
            } satisfies PowWorkerResult);
            
            lastProgressTime = now;
        }
    }

    // Hit max iterations without solution
    postMessage({ 
        type: 'timeout', 
        iterations: nonce 
    } satisfies PowWorkerResult);
};

async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input)
    );

    return [...new Uint8Array(buf)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

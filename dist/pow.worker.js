// src/pow.worker.ts
self.onmessage = async (e) => {
  const {
    projectPublicKey,
    challengeHex,
    targetHex,
    maxIterations = 5e7,
    progressInterval = 1e4
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
        type: "solution",
        nonce,
        hashHex: hash,
        iterations: nonce + 1,
        hashesPerSec: Math.round((nonce + 1) / (elapsed / 1e3))
      });
      return;
    }
    nonce++;
    if (nonce % progressInterval === 0) {
      const now = performance.now();
      const elapsed = now - startTime;
      const recentElapsed = now - lastProgressTime;
      postMessage({
        type: "progress",
        iterations: nonce,
        hashesPerSec: Math.round(progressInterval / (recentElapsed / 1e3))
      });
      lastProgressTime = now;
    }
  }
  postMessage({
    type: "timeout",
    iterations: nonce
  });
};
async function sha256Hex(input) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=pow.worker.js.map
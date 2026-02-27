"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/pow.worker.ts
var pow_worker_exports = {};
module.exports = __toCommonJS(pow_worker_exports);
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
//# sourceMappingURL=pow.worker.cjs.map
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  LiveAuth: () => LiveAuth,
  LiveAuthCancelledError: () => LiveAuthCancelledError,
  LiveAuthNetworkError: () => LiveAuthNetworkError,
  LiveAuthPowTimeoutError: () => LiveAuthPowTimeoutError,
  LiveAuthPowUnsupportedError: () => LiveAuthPowUnsupportedError,
  LiveAuthTimeoutError: () => LiveAuthTimeoutError
});
module.exports = __toCommonJS(src_exports);

// src/errors.ts
var LiveAuthTimeoutError = class extends Error {
  constructor(message = "LiveAuth verification timed out") {
    super(message);
    this.name = "LiveAuthTimeoutError";
  }
};
var LiveAuthCancelledError = class extends Error {
  constructor(message = "LiveAuth verification cancelled") {
    super(message);
    this.name = "LiveAuthCancelledError";
  }
};
var LiveAuthNetworkError = class extends Error {
  constructor(message = "LiveAuth network request failed", cause) {
    super(message);
    this.cause = cause;
    this.name = "LiveAuthNetworkError";
  }
};
var LiveAuthPowUnsupportedError = class extends Error {
  constructor(message = "Proof-of-Work is not supported in this environment") {
    super(message);
    this.name = "LiveAuthPowUnsupportedError";
  }
};
var LiveAuthPowTimeoutError = class extends Error {
  constructor(message = "Proof-of-Work timed out") {
    super(message);
    this.name = "LiveAuthPowTimeoutError";
  }
};

// src/index.ts
var import_meta = {};
var SDK_VERSION = "0.2.0";
var LiveAuth = class {
  constructor(config) {
    this.config = config;
    if (!config.publicKey) {
      throw new Error("LiveAuth: publicKey is required");
    }
    this.baseUrl = config.baseUrl ?? "https://api.liveauth.app";
    this.headers = {
      "Content-Type": "application/json",
      "X-LW-Public": config.publicKey,
      "X-LW-SDK-Version": SDK_VERSION
    };
  }
  /* ======================================================
   * PUBLIC ENTRYPOINT
   * ====================================================== */
  async verify(options = {}) {
    const {
      forceLightning = false,
      onProgress,
      powTimeoutMs = 3e4,
      maxPowIterations = 5e7
    } = options;
    if (forceLightning) {
      const lightning = await this.startLightning();
      return {
        method: "lightning",
        lightning,
        diagnostics: { reason: "forced_lightning" }
      };
    }
    if (!this.canUsePow()) {
      const lightning = await this.startLightning();
      return {
        method: "lightning",
        lightning,
        diagnostics: { reason: "pow_unsupported" }
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
          method: "pow",
          token: verifyRes.token,
          solveMs: Math.round(performance.now() - startedAt),
          difficultyBits: challenge.difficultyBits
        };
      }
      if (verifyRes.fallback === "lightning") {
        const lightning = await this.startLightning();
        return {
          method: "lightning",
          lightning,
          diagnostics: { reason: "pow_server_fallback" }
        };
      }
      throw new Error("LiveAuth: verification failed");
    } catch (err) {
      if (err instanceof LiveAuthPowTimeoutError || err instanceof LiveAuthPowUnsupportedError) {
        const lightning = await this.startLightning();
        return {
          method: "lightning",
          lightning,
          diagnostics: {
            reason: "pow_failed",
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
  async getPowChallenge() {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/pow/challenge`, {
      headers: this.headers
    });
    if (!res.ok) throw new LiveAuthNetworkError("PoW challenge failed");
    return res.json();
  }
  async verifyPow(req) {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/pow/verify`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new LiveAuthNetworkError("PoW verify failed");
    return res.json();
  }
  /* ======================================================
   * POW SOLVER (WORKER)
   * ====================================================== */
  solvePow(challenge, options = {}) {
    const { onProgress, timeoutMs = 3e4, maxIterations = 5e7 } = options;
    if (!this.canUsePow()) {
      return Promise.reject(new LiveAuthPowUnsupportedError());
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./pow.worker.js", import_meta.url),
        { type: "module" }
      );
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new LiveAuthPowTimeoutError(`PoW timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      worker.onmessage = (e) => {
        const data = e.data;
        if (data.type === "progress") {
          onProgress?.(data.hashesPerSec ?? 0, data.iterations ?? 0);
          return;
        }
        if (data.type === "timeout") {
          clearTimeout(timeoutId);
          worker.terminate();
          reject(new LiveAuthPowTimeoutError(`PoW hit max iterations (${maxIterations})`));
          return;
        }
        if (data.type === "solution" && data.nonce !== void 0 && data.hashHex) {
          clearTimeout(timeoutId);
          worker.terminate();
          resolve({ nonce: data.nonce, hashHex: data.hashHex });
          return;
        }
      };
      worker.onerror = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
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
  async startLightning() {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/public/auth/start`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ userHint: "browser" })
    });
    if (!res.ok) {
      throw new LiveAuthNetworkError("Lightning auth start failed");
    }
    return res.json();
  }
  async pollLightning(sessionId, options) {
    const timeoutMs = options?.timeoutMs ?? 5 * 6e4;
    const intervalMs = options?.intervalMs ?? 2e3;
    const externalSignal = options?.signal;
    const controller = new AbortController();
    const signal = controller.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new LiveAuthCancelledError();
      }
      externalSignal.addEventListener("abort", () => {
        controller.abort();
      });
    }
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      while (true) {
        if (signal.aborted) {
          throw externalSignal?.aborted ? new LiveAuthCancelledError() : new LiveAuthTimeoutError();
        }
        const res = await fetch(
          `${this.baseUrl}/api/public/auth/confirm`,
          {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ sessionId }),
            signal
          }
        );
        if (!res.ok) {
          throw new LiveAuthNetworkError("Lightning confirm failed");
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
  canUsePow() {
    try {
      if (typeof window === "undefined") return false;
      if (typeof Worker === "undefined") return false;
      if (typeof URL === "undefined") return false;
      if (typeof crypto === "undefined" || !crypto.subtle) return false;
      return true;
    } catch {
      return false;
    }
  }
  async fetchWithRetry(url, init, retries = 2, backoffMs = 500) {
    let lastError;
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
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LiveAuth,
  LiveAuthCancelledError,
  LiveAuthNetworkError,
  LiveAuthPowTimeoutError,
  LiveAuthPowUnsupportedError,
  LiveAuthTimeoutError
});
//# sourceMappingURL=index.cjs.map
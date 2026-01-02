# LiveAuth – Developer Portal Documentation

## Getting Started

LiveAuth verifies humans economically instead of heuristically.

Instead of CAPTCHAs or tracking, LiveAuth asks the browser to perform a short
cryptographic proof. If that fails or is skipped, it falls back to a small
Bitcoin Lightning payment.

No cookies.  
No fingerprinting.  
No behavioral profiling.

---

## What LiveAuth Does

When a user clicks “Verify”:

1. **Browser attempts Proof-of-Work (PoW)**  
   – Takes ~200–800ms for a real device  
   – Bots pay CPU / battery cost

2. **If PoW fails → Lightning fallback**  
   – Small payment (e.g. 21 sats)  
   – Real economic cost to bots

3. **LiveAuth returns a short-lived JWT**  
   – Verifiable on your backend  
   – No user identity required

Most humans never see the Lightning step.

---

## Installation (JavaScript)

```bash
npm install @liveauth-labs/sdk
```

---

## Basic Usage

```ts
import { LiveAuth } from '@liveauth-labs/sdk';

const liveauth = new LiveAuth({
  publicKey: 'la_pk_XXXXXXXX'
});

const result = await liveauth.verify();
```

---

## Example Result

```ts
{
  token: "eyJhbGciOi...",
  method: "pow",
  solveMs: 412,
  difficultyBits: 18
}
```

---

## Verifying on Your Backend

Send the JWT to your backend and verify it using your LiveAuth secret key.

The token includes:

- projectId
- projectPublicKey
- authType (pow or lightning)
- short expiration (default: 10 minutes)

---

## Why LiveAuth

| CAPTCHA | LiveAuth |
|-------|----------|
| Tracks behavior | No tracking |
| ML heuristics | Cryptography |
| CAPTCHA farms | Real economic cost |
| Bad UX | Invisible to humans |

---

## Debug Mode

Add `?liveauth_debug=1` to your URL to see:

- Verification method
- PoW difficulty
- Solve time
- Lightning fallback (demo mode)

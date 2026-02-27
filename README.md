# LiveAuth JS SDK

> Human verification through economics, not heuristics.

[![npm version](https://img.shields.io/npm/v/@liveauth-labs/sdk.svg)](https://www.npmjs.com/package/@liveauth-labs/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is LiveAuth?

LiveAuth verifies humans economically instead of heuristically.

Instead of CAPTCHAs or tracking, LiveAuth asks the browser to perform a short cryptographic proof. If that fails or is skipped, it falls back to a small Bitcoin Lightning payment.

- No cookies
- No fingerprinting  
- No behavioral profiling

## How It Works

When a user triggers verification:

1. **Browser attempts Proof-of-Work (PoW)**  
   Takes ~200–800ms for a real device. Bots pay CPU/battery cost.

2. **If PoW fails → Lightning fallback**  
   Small payment (e.g. 21 sats). Real economic cost to bots.

3. **LiveAuth returns a short-lived JWT**  
   Verifiable on your backend. No user identity required.

Most humans never see the Lightning step.

## Installation

```bash
npm install @liveauth-labs/sdk
```

## Quick Start

```ts
import { LiveAuth } from '@liveauth-labs/sdk';

const liveauth = new LiveAuth({
  publicKey: 'la_pk_XXXXXXXX',  // Public key from dashboard
  apiKey: 'la_sk_XXXXXXXX'     // Secret key from dashboard
});

const result = await liveauth.verify();

if (result.method === 'pow') {
  // PoW succeeded - send token to your backend
  console.log('Verified via PoW:', result.token);
} else {
  // Lightning fallback - show invoice to user
  console.log('Pay invoice:', result.lightning.invoice);
  
  // Poll for payment confirmation
  const token = await liveauth.pollLightning(result.lightning.sessionId);
  console.log('Verified via Lightning:', token);
}
```

## API Reference

### `new LiveAuth(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `publicKey` | `string` | ✓ | Your LiveAuth public key |
| `apiKey` | `string` | | Your LiveAuth secret key (for Lightning fallback) |
| `baseUrl` | `string` | | API base URL (default: `https://api.liveauth.app`) |
| `baseUrl` | `string` | | API base URL (default: `https://api.liveauth.app`) |

### `verify(options?)`

Attempts verification, starting with PoW and falling back to Lightning if needed.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `forceLightning` | `boolean` | `false` | Skip PoW, go straight to Lightning |
| `onProgress` | `function` | | Callback: `(hashesPerSec, iterations) => void` |
| `powTimeoutMs` | `number` | `30000` | Max time for PoW before fallback |
| `maxPowIterations` | `number` | `50000000` | Max iterations before fallback |

**Returns:** `Promise<LiveAuthResult>`

```ts
// PoW success
{
  method: 'pow',
  token: 'eyJhbGciOi...',
  solveMs: 412,
  difficultyBits: 18
}

// Lightning fallback
{
  method: 'lightning',
  lightning: {
    sessionId: 'sess_xxx',
    invoice: 'lnbc...',
    amountSats: 21,
    expiresAtUnix: 1234567890,
    mode: 'LIVE'
  },
  diagnostics: {
    reason: 'pow_unsupported'
  }
}
```

### `pollLightning(sessionId, options?)`

Polls for Lightning payment confirmation.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | `number` | `300000` | Max wait time (5 min) |
| `intervalMs` | `number` | `2000` | Poll interval |
| `signal` | `AbortSignal` | | Cancellation signal |

**Returns:** `Promise<string>` - The verification token

## Error Handling

```ts
import { 
  LiveAuth,
  LiveAuthTimeoutError,
  LiveAuthCancelledError,
  LiveAuthNetworkError,
  LiveAuthPowTimeoutError
} from '@liveauth-labs/sdk';

try {
  const result = await liveauth.verify();
} catch (err) {
  if (err instanceof LiveAuthNetworkError) {
    console.error('Network issue:', err.message);
  } else if (err instanceof LiveAuthPowTimeoutError) {
    console.error('PoW took too long');
  }
}
```

## Progress Feedback

Show users what's happening during PoW:

```ts
const result = await liveauth.verify({
  onProgress: (hashesPerSec, iterations) => {
    console.log(`${(iterations / 1000).toFixed(0)}k hashes @ ${hashesPerSec}/sec`);
  }
});
```

## Backend Verification

Send the JWT to your backend and verify it using your LiveAuth secret key.

### Example (Node.js)

```ts
import jwt from 'jsonwebtoken';

app.post('/api/verify-liveauth', (req, res) => {
  const { token } = req.body;
  
  try {
    // Verify JWT signature with your LiveAuth secret key
    const decoded = jwt.verify(token, process.env.LIVEAUTH_SECRET_KEY);
    
    // Check expiration (JWT library handles this, but you can also check manually)
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    // Extract claims
    const { projectId, projectPublicKey, authType, sub } = decoded;
    
    // Verify it matches your project
    if (projectPublicKey !== process.env.LIVEAUTH_PUBLIC_KEY) {
      return res.status(401).json({ error: 'Invalid project' });
    }
    
    // Success - user is verified
    res.json({ 
      verified: true, 
      authType, // 'pow' or 'lightning'
      userId: sub 
    });
    
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

### Token Claims

The JWT contains:
- `sub` - Unique user identifier (format: `pow:{projectId}:{challengeHex}` or `lightning:{invoiceId}`)
- `projectId` - Your project's UUID
- `projectPublicKey` - Your public API key
- `authType` - Verification method: `pow` or `lightning`
- `exp` - Expiration timestamp (default: 10 minutes from issuance)
- `iat` - Issued at timestamp

**Security Notes:**
- Always verify the JWT signature using your secret key
- Check the `projectPublicKey` claim matches your expected key
- Respect the `exp` (expiration) claim
- The `sub` claim is ephemeral - don't use it as a permanent user ID unless you're tracking sessions

## Debug Mode

Add `?liveauth_debug=1` to your URL to see:
- Verification method used
- PoW difficulty and solve time
- Lightning fallback triggers

## Why LiveAuth?

| Traditional CAPTCHA | LiveAuth |
|--------------------|----------|
| Tracks behavior | No tracking |
| ML heuristics | Cryptography |
| CAPTCHA farms | Real economic cost |
| Bad UX | Invisible to most humans |

## License

MIT

self.onmessage = async e => {
    const { projectPublicKey, challengeHex, targetHex } = e.data;

    let nonce = 0;

    while (true) {
        const input = `${projectPublicKey}:${challengeHex}:${nonce}`;
        const hash = await sha256Hex(input);

        if (hash <= targetHex) {
            postMessage({ nonce, hashHex: hash });
            return;
        }

        nonce++;
    }
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

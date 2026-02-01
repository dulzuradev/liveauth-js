export class LiveAuthTimeoutError extends Error {
    constructor(message = 'LiveAuth verification timed out') {
        super(message);
        this.name = 'LiveAuthTimeoutError';
    }
}

export class LiveAuthCancelledError extends Error {
    constructor(message = 'LiveAuth verification cancelled') {
        super(message);
        this.name = 'LiveAuthCancelledError';
    }
}

export class LiveAuthNetworkError extends Error {
    constructor(message = 'LiveAuth network request failed', public readonly cause?: Error) {
        super(message);
        this.name = 'LiveAuthNetworkError';
    }
}

export class LiveAuthPowUnsupportedError extends Error {
    constructor(message = 'Proof-of-Work is not supported in this environment') {
        super(message);
        this.name = 'LiveAuthPowUnsupportedError';
    }
}

export class LiveAuthPowTimeoutError extends Error {
    constructor(message = 'Proof-of-Work timed out') {
        super(message);
        this.name = 'LiveAuthPowTimeoutError';
    }
}

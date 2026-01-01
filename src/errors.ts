export class LiveAuthTimeoutError extends Error {
    constructor(message = 'Lightning verification timed out') {
        super(message);
        this.name = 'LiveAuthTimeoutError';
    }
}

export class LiveAuthCancelledError extends Error {
    constructor(message = 'Lightning verification cancelled') {
        super(message);
        this.name = 'LiveAuthCancelledError';
    }
}

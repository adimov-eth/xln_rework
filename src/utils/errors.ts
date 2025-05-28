export enum ErrorCode {
    // General errors
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    INVALID_PARAMETER = 'INVALID_PARAMETER',
    NOT_FOUND = 'NOT_FOUND',
    ALREADY_EXISTS = 'ALREADY_EXISTS',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',

    // Machine errors
    MACHINE_NOT_FOUND = 'MACHINE_NOT_FOUND',
    MACHINE_TYPE_MISMATCH = 'MACHINE_TYPE_MISMATCH',
    INVALID_MACHINE_STATE = 'INVALID_MACHINE_STATE',
    MACHINE_ALREADY_EXISTS = 'MACHINE_ALREADY_EXISTS',

    // Transaction errors
    INVALID_TRANSACTION = 'INVALID_TRANSACTION',
    INVALID_SIGNATURE = 'INVALID_SIGNATURE',
    INVALID_NONCE = 'INVALID_NONCE',
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',
    MEMPOOL_FULL = 'MEMPOOL_FULL',

    // Channel errors
    CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
    CHANNEL_CLOSED = 'CHANNEL_CLOSED',
    INSUFFICIENT_CAPACITY = 'INSUFFICIENT_CAPACITY',
    INVALID_CHANNEL_STATE = 'INVALID_CHANNEL_STATE',
    CHANNEL_DISPUTE = 'CHANNEL_DISPUTE',

    // Entity errors
    ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
    PROPOSAL_NOT_FOUND = 'PROPOSAL_NOT_FOUND',
    PROPOSAL_EXPIRED = 'PROPOSAL_EXPIRED',
    INSUFFICIENT_QUORUM = 'INSUFFICIENT_QUORUM',
    INVALID_VALIDATOR = 'INVALID_VALIDATOR',

    // Storage errors
    STORAGE_ERROR = 'STORAGE_ERROR',
    SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
    MERKLE_TREE_ERROR = 'MERKLE_TREE_ERROR',

    // Network errors
    NETWORK_ERROR = 'NETWORK_ERROR',
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    TIMEOUT = 'TIMEOUT',
    RATE_LIMITED = 'RATE_LIMITED',

    // Consensus errors
    CONSENSUS_FAILED = 'CONSENSUS_FAILED',
    INVALID_BLOCK = 'INVALID_BLOCK',
    FORK_DETECTED = 'FORK_DETECTED'
}

export class XLNError extends Error {
    public readonly code: ErrorCode;
    public readonly details?: any;
    public readonly timestamp: number;

    constructor(code: ErrorCode, message: string, details?: any) {
        super(message);
        this.name = 'XLNError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();

        // Ensure the stack trace includes this class
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, XLNError);
        }
    }

    toJSON(): object {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }

    static fromJSON(data: any): XLNError {
        const error = new XLNError(data.code, data.message, data.details);
        if (data.stack) {
            error.stack = data.stack;
        }
        return error;
    }
}

// Specific error classes
export class MachineError extends XLNError {
    constructor(code: ErrorCode, message: string, machineId?: Buffer) {
        super(code, message, { machineId: machineId?.toString('hex') });
    }
}

export class TransactionError extends XLNError {
    constructor(code: ErrorCode, message: string, transaction?: any) {
        super(code, message, { transaction });
    }
}

export class ChannelError extends XLNError {
    constructor(code: ErrorCode, message: string, channelId?: Buffer) {
        super(code, message, { channelId: channelId?.toString('hex') });
    }
}

export class EntityError extends XLNError {
    constructor(code: ErrorCode, message: string, entityId?: Buffer) {
        super(code, message, { entityId: entityId?.toString('hex') });
    }
}

export class StorageError extends XLNError {
    constructor(message: string, details?: any) {
        super(ErrorCode.STORAGE_ERROR, message, details);
    }
}

export class NetworkError extends XLNError {
    constructor(code: ErrorCode, message: string, details?: any) {
        super(code, message, details);
    }
}

export class ConsensusError extends XLNError {
    constructor(code: ErrorCode, message: string, details?: any) {
        super(code, message, details);
    }
}

// Error handling utilities
export function isXLNError(error: any): error is XLNError {
    return error instanceof XLNError;
}

export function wrapError(error: unknown, code: ErrorCode = ErrorCode.UNKNOWN_ERROR): XLNError {
    if (isXLNError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return new XLNError(code, error.message, { originalError: error.name });
    }

    return new XLNError(code, String(error));
}

export function createErrorHandler<T extends any[]>(
    handler: (...args: T) => Promise<any>,
    errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
) {
    return async (...args: T): Promise<any> => {
        try {
            return await handler(...args);
        } catch (error) {
            throw wrapError(error, errorCode);
        }
    };
}

// Result type for operations that can fail
export type Result<T, E = XLNError> =
    | {
          success: true;
          data: T;
      }
    | {
          success: false;
          error: E;
      };

export function success<T>(data: T): Result<T> {
    return { success: true, data };
}

export function failure<E = XLNError>(error: E): Result<never, E> {
    return { success: false, error };
}

export async function safeAsync<T>(
    operation: () => Promise<T>,
    errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
): Promise<Result<T>> {
    try {
        const result = await operation();
        return success(result);
    } catch (error) {
        return failure(wrapError(error, errorCode));
    }
}

export function safe<T>(
    operation: () => T,
    errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
): Result<T> {
    try {
        const result = operation();
        return success(result);
    } catch (error) {
        return failure(wrapError(error, errorCode));
    }
}

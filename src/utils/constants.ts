// System constants
export const SYSTEM_VERSION = '1.0.0';
export const PROTOCOL_VERSION = 1;

// Block and timing constants
export const DEFAULT_BLOCK_TIME = 100; // milliseconds
export const DEFAULT_PROPOSAL_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_DISPUTE_WINDOW = 86400000; // 24 hours

// Size limits
export const MAX_TRANSACTION_SIZE = 65536; // 64KB
export const MAX_BLOCK_SIZE = 1048576; // 1MB
export const MAX_MESSAGE_SIZE = 65536; // 64KB
export const MAX_MEMPOOL_SIZE = 10000; // transactions

// Network constants
export const DEFAULT_PORT = 8080;
export const DEFAULT_WS_PORT = 8081;
export const MAX_CONNECTIONS = 1000;
export const CONNECTION_TIMEOUT = 30000; // 30 seconds
export const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Cryptographic constants
export const HASH_SIZE = 32; // bytes
export const SIGNATURE_SIZE = 64; // bytes
export const PUBLIC_KEY_SIZE = 32; // bytes
export const PRIVATE_KEY_SIZE = 32; // bytes

// Address and ID constants
export const ADDRESS_SIZE = 32; // bytes
export const MACHINE_ID_SIZE = 32; // bytes
export const CHANNEL_ID_SIZE = 32; // bytes
export const PROPOSAL_ID_SIZE = 32; // bytes

// Merkle tree constants
export const DEFAULT_BIT_WIDTH = 4;
export const DEFAULT_LEAF_THRESHOLD = 16;
export const MAX_BIT_WIDTH = 16;
export const MAX_LEAF_THRESHOLD = 1024;

// Storage constants
export const SNAPSHOT_INTERVAL = 100; // blocks
export const MAX_SNAPSHOT_AGE = 86400000; // 24 hours
export const CACHE_SIZE = 1073741824; // 1GB

// Gas and fee constants
export const DEFAULT_GAS_LIMIT = 10000000;
export const BASE_GAS_COST = 21000;
export const GAS_PER_BYTE = 16;
export const MAX_GAS_LIMIT = 100000000;

// Channel constants
export const MIN_CHANNEL_BALANCE = BigInt(1000); // minimum balance in wei
export const MAX_CHANNEL_BALANCE = BigInt('1000000000000000000000'); // 1000 ETH
export const DEFAULT_CREDIT_LIMIT = BigInt(0);
export const MAX_CREDIT_LIMIT = BigInt('100000000000000000000'); // 100 ETH

// Entity constants
export const MIN_QUORUM_SIZE = 1;
export const MAX_QUORUM_SIZE = 100;
export const DEFAULT_QUORUM_THRESHOLD = 1;
export const MAX_VALIDATORS = 100;

// Rate limiting constants
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 1000;
export const BURST_LIMIT = 100;

// API constants
export const API_VERSION = 'v1';
export const MAX_REQUEST_SIZE = 10485760; // 10MB
export const REQUEST_TIMEOUT = 30000; // 30 seconds

// Storage keys
export const STORAGE_KEYS = {
    SERVER_STATE: 'server:state',
    SIGNER_PREFIX: 'signer:',
    ENTITY_PREFIX: 'entity:',
    CHANNEL_PREFIX: 'channel:',
    BLOCK_PREFIX: 'block:',
    SNAPSHOT_PREFIX: 'snapshot:',
    MUTABLE_SNAPSHOT: 'snapshot:mutable',
    IMMUTABLE_SNAPSHOT_PREFIX: 'snapshot:immutable:'
} as const;

// Error retry constants
export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000; // milliseconds
export const BACKOFF_MULTIPLIER = 2;

// Performance monitoring
export const METRICS_INTERVAL = 60000; // 1 minute
export const SLOW_OPERATION_THRESHOLD = 1000; // 1 second
export const MEMORY_WARNING_THRESHOLD = 0.8; // 80% of available memory

// Development vs Production
export const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
export const LOG_LEVEL = process.env.LOG_LEVEL || (IS_DEVELOPMENT ? 'debug' : 'info');

// Asset types
export const ASSET_TYPES = {
    ETH: 'ETH',
    ERC20: 'ERC20',
    ERC721: 'ERC721',
    NATIVE: 'NATIVE'
} as const;

// Message types (numeric constants for efficient encoding)
export const MESSAGE_TYPES = {
    // Transaction messages
    SIGNER_TRANSACTION: 0x01,
    ENTITY_TRANSACTION: 0x02,
    CHANNEL_MESSAGE: 0x03,

    // Consensus messages
    PROPOSE_BLOCK: 0x10,
    VOTE_BLOCK: 0x11,
    COMMIT_BLOCK: 0x12,

    // Channel protocol
    CHANNEL_UPDATE: 0x20,
    CHANNEL_ACK: 0x21,
    CHANNEL_CLOSE: 0x22,

    // System messages
    PING: 0x30,
    PONG: 0x31,
    SYNC_REQUEST: 0x32,
    SYNC_RESPONSE: 0x33
} as const;

// Status codes
export const STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    SERVICE_UNAVAILABLE: 503
} as const;

// Event names
export const EVENTS = {
    // Machine events
    MACHINE_STARTED: 'machine:started',
    MACHINE_STOPPED: 'machine:stopped',
    MACHINE_ERROR: 'machine:error',

    // Block events
    BLOCK_CREATED: 'block:created',
    BLOCK_FINALIZED: 'block:finalized',

    // Transaction events
    TRANSACTION_RECEIVED: 'transaction:received',
    TRANSACTION_VALIDATED: 'transaction:validated',
    TRANSACTION_EXECUTED: 'transaction:executed',
    TRANSACTION_FAILED: 'transaction:failed',

    // Channel events
    CHANNEL_OPENED: 'channel:opened',
    CHANNEL_UPDATED: 'channel:updated',
    CHANNEL_CLOSED: 'channel:closed',
    PAYMENT_SENT: 'payment:sent',
    PAYMENT_RECEIVED: 'payment:received',

    // Entity events
    ENTITY_CREATED: 'entity:created',
    PROPOSAL_CREATED: 'proposal:created',
    PROPOSAL_VOTED: 'proposal:voted',
    PROPOSAL_EXECUTED: 'proposal:executed',

    // Network events
    CLIENT_CONNECTED: 'client:connected',
    CLIENT_DISCONNECTED: 'client:disconnected',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_RECEIVED: 'message:received'
} as const;

// Feature flags
export const FEATURES = {
    ENABLE_METRICS: true,
    ENABLE_DEBUG_LOGS: IS_DEVELOPMENT,
    ENABLE_RATE_LIMITING: true,
    ENABLE_COMPRESSION: true,
    ENABLE_CACHING: true,
    ENABLE_SNAPSHOTS: true
} as const;

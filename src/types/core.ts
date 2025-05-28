export type Hash = Buffer;
export type Address = Buffer;
export type Signature = Buffer;
export type Amount = bigint;
export type Nonce = number;

export enum MachineType {
	SERVER = "server",
	SIGNER = "signer",
	ENTITY = "entity",
	CHANNEL = "channel",
	DEPOSITARY = "depositary",
}

export enum EntityStatus {
	IDLE = "idle",
	PROCESSING = "processing",
	WAITING = "waiting",
}

export enum ChannelStatus {
	READY = "ready",
	PENDING = "pending",
	CLOSING = "closing",
	CLOSED = "closed",
}

export enum ProposalType {
	TRANSFER = "transfer",
	ADD_VALIDATOR = "addValidator",
	REMOVE_VALIDATOR = "removeValidator",
	CUSTOM = "custom",
}

export enum ProposalStatus {
	PENDING = "pending",
	APPROVED = "approved",
	REJECTED = "rejected",
	EXPIRED = "expired",
}

export enum MessageType {
	SIGNER_TRANSACTION = 0x01,
	ENTITY_TRANSACTION = 0x02,
	CHANNEL_MESSAGE = 0x03,
	PROPOSE_BLOCK = 0x10,
	VOTE_BLOCK = 0x11,
	COMMIT_BLOCK = 0x12,
	CHANNEL_UPDATE = 0x20,
	CHANNEL_ACK = 0x21,
	CHANNEL_CLOSE = 0x22,
	PING = 0x30,
	PONG = 0x31,
	SYNC_REQUEST = 0x32,
	SYNC_RESPONSE = 0x33,
}

export interface MachineID {
	serverId: Buffer;
	signerId: Buffer;
	entityId: Buffer;
	submachineId: Buffer;
}

export interface Block {
	previousBlock: Hash;
	blockNumber: number;
	timestamp: number;
	transactions: Buffer;
	stateHash: Hash;
	signatures?: Signature;
}

export interface Transaction {
	from: Address;
	to: Address;
	nonce: Nonce;
	data: Buffer;
	signature: Signature;
	timestamp: number;
	fee?: Amount;
}

export interface Message {
	type: MessageType;
	sender: MachineID;
	recipient: MachineID;
	nonce: Nonce;
	data: Buffer;
	signature?: Signature;
}

export interface MachineState {
	id: Buffer;
	type: MachineType;
	root: Hash;
	state: Hash;
	submachines: Map<Buffer, MachineReference>;
}

export interface MachineReference {
	id: Buffer;
	type: MachineType;
	lastSeen: number;
}

export interface ValidatorInfo {
	address: Address;
	publicKey: Buffer;
	weight: number;
	active: boolean;
}

export interface Proposal {
	id: Hash;
	type: ProposalType;
	data: Buffer;
	proposer: Address;
	votes: Map<Address, Signature>;
	createdAt: number;
	expiresAt: number;
	status: ProposalStatus;
}

export interface EntityState {
	status: EntityStatus;
	validators: Map<Address, ValidatorInfo>;
	proposals: Map<Hash, Proposal>;
	balances: Map<string, Amount>;
	channels: Map<Buffer, Hash>;
	orderbook: Map<string, any>;
	nonce: Nonce;
	finalBlock: EntityBlock;
	consensusBlock?: EntityBlock;
}

export interface EntityBlock {
	blockNumber: number;
	storage: Map<number, any>;
	channelRoot: Buffer;
	channelMap: Map<Buffer, any>;
	inbox: Transaction[];
}

export interface ChannelState {
	id: Buffer;
	participants: [Address, Address];
	balances: Map<string, { left: Amount; right: Amount }>;
	nonce: Nonce;
	status: ChannelStatus;
	latestBlock: Hash;
	disputeWindow: number;
	collateral: Amount;
	creditLimits: { left: Amount; right: Amount };
	ondelta: Amount;
	offdelta: Amount;
}

export interface TreeConfig {
	bitWidth: number;
	leafThreshold: number;
}

export interface ServerConfig {
	id: string;
	host: string;
	port: number;
	storage: StorageConfig;
	consensus: ConsensusConfig;
	limits: LimitsConfig;
}

export interface StorageConfig {
	path: string;
	snapshotInterval: number;
	cacheSize?: string;
}

export interface ConsensusConfig {
	blockTime: number;
	proposalTimeout: number;
}

export interface LimitsConfig {
	maxChannels: number;
	maxEntities: number;
	maxBlockSize: string;
}

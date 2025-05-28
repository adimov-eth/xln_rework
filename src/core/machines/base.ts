import { EventEmitter } from "node:events";
import type {
	Hash,
	MachineState,
	MachineType,
	Message,
	Transaction,
} from "../../types/core";

export abstract class BaseMachine extends EventEmitter {
	protected id: Buffer;
	protected type: MachineType;
	protected state: MachineState;
	protected parent?: BaseMachine;
	protected children: Map<Buffer, BaseMachine>;
	protected mempool: Transaction[];
	protected lastBlockHash: Hash;

	constructor(id: Buffer, type: MachineType, parent?: BaseMachine) {
		super();
		this.id = id;
		this.type = type;
		this.parent = parent;
		this.children = new Map();
		this.mempool = [];
		this.lastBlockHash = Buffer.alloc(32);

		this.state = {
			id,
			type,
			root: Buffer.alloc(32),
			state: Buffer.alloc(32),
			submachines: new Map(),
		};
	}

	getId(): Buffer {
		return this.id;
	}

	getType(): MachineType {
		return this.type;
	}

	getState(): MachineState {
		return { ...this.state };
	}

	getParent(): BaseMachine | undefined {
		return this.parent;
	}

	getChildren(): Map<Buffer, BaseMachine> {
		return new Map(this.children);
	}

	addChild(child: BaseMachine): void {
		this.children.set(child.getId(), child);
		this.state.submachines.set(child.getId(), {
			id: child.getId(),
			type: child.getType(),
			lastSeen: Date.now(),
		});
	}

	removeChild(childId: Buffer): boolean {
		const removed = this.children.delete(childId);
		if (removed) {
			this.state.submachines.delete(childId);
		}
		return removed;
	}

	getChild(childId: Buffer): BaseMachine | undefined {
		return this.children.get(childId);
	}

	async receiveMessage(message: Message): Promise<void> {
		this.emit("message", message);
		await this.handleMessage(message);
	}

	async receiveTransaction(transaction: Transaction): Promise<void> {
		this.mempool.push(transaction);
		this.emit("transaction", transaction);
		await this.handleTransaction(transaction);
	}

	protected async sendMessage(
		recipient: Buffer,
		message: Message,
	): Promise<void> {
		const child = this.children.get(recipient);
		if (child) {
			await child.receiveMessage(message);
		} else if (this.parent) {
			await this.parent.receiveMessage(message);
		}
	}

	protected async sendTransaction(transaction: Transaction): Promise<void> {
		if (this.parent) {
			await this.parent.receiveTransaction(transaction);
		}
	}

	getMempool(): Transaction[] {
		return [...this.mempool];
	}

	clearMempool(): void {
		this.mempool = [];
	}

	abstract processBlock(): Promise<Hash>;

	protected abstract handleMessage(message: Message): Promise<void>;

	protected abstract handleTransaction(transaction: Transaction): Promise<void>;

	abstract getStateRoot(): Hash;

	protected updateStateRoot(newRoot: Hash): void {
		this.state.state = newRoot;
		this.state.root = newRoot;
	}

	protected updateLastBlockHash(hash: Hash): void {
		this.lastBlockHash = hash;
	}

	getLastBlockHash(): Hash {
		return this.lastBlockHash;
	}

	async start(): Promise<void> {
		this.emit("started");
		await this.onStart();
	}

	async stop(): Promise<void> {
		for (const child of this.children.values()) {
			await child.stop();
		}
		this.emit("stopped");
		await this.onStop();
	}

	protected async onStart(): Promise<void> {
		// Override in subclasses
	}

	protected async onStop(): Promise<void> {
		// Override in subclasses
	}
}

import { randomBytes } from "crypto";
import { keccak256Hash } from "../../crypto/hashing";
import {
	type Hash,
	MachineType,
	type Message,
	type Transaction,
} from "../../types/core";
import { BaseMachine } from "./base";
import { EntityMachine } from "./entity";

export class SignerMachine extends BaseMachine {
	private privateKey: Buffer;
	private publicKey: Buffer;

	constructor(id: Buffer, parent: BaseMachine, privateKey?: Buffer) {
		super(id, MachineType.SIGNER, parent);
		this.privateKey = privateKey || this.generatePrivateKey();
		this.publicKey = this.derivePublicKey(this.privateKey);
	}

	private generatePrivateKey(): Buffer {
		return randomBytes(32);
	}

	private derivePublicKey(privateKey: Buffer): Buffer {
		// Simplified public key derivation - in production use proper crypto
		return keccak256Hash(privateKey);
	}

	getPublicKey(): Buffer {
		return this.publicKey;
	}

	async createEntity(
		entityId: Buffer,
		isMultiSig = false,
	): Promise<EntityMachine> {
		const entity = new EntityMachine(entityId, this, isMultiSig);
		this.addChild(entity);
		await entity.start();
		return entity;
	}

	async processBlock(): Promise<Hash> {
		const entityRoots: Buffer[] = [];

		for (const child of this.children.values()) {
			if (child instanceof EntityMachine) {
				const entityRoot = await child.processBlock();
				entityRoots.push(entityRoot);
			}
		}

		const signerRoot =
			entityRoots.length > 0
				? keccak256Hash(Buffer.concat(entityRoots))
				: Buffer.alloc(32);

		this.updateStateRoot(signerRoot);
		return signerRoot;
	}

	protected async handleMessage(message: Message): Promise<void> {
		const targetEntity = this.children.get(message.recipient.entityId);
		if (targetEntity) {
			await targetEntity.receiveMessage(message);
		}
	}

	protected async handleTransaction(transaction: Transaction): Promise<void> {
		// Route transaction to appropriate entity
		// For now, simple routing based on transaction data

		if (this.children.size > 0) {
			// Simple routing: send to first entity for now
			const firstEntity = this.children.values().next().value;
			if (firstEntity) {
				await firstEntity.receiveTransaction(transaction);
			}
		}
	}

	getStateRoot(): Hash {
		const entityHashes: Buffer[] = [];
		for (const child of this.children.values()) {
			entityHashes.push(child.getStateRoot());
		}

		return entityHashes.length > 0
			? keccak256Hash(Buffer.concat(entityHashes))
			: Buffer.alloc(32);
	}

	signData(data: Buffer): Buffer {
		// Simplified signing - in production use proper crypto library
		return keccak256Hash(Buffer.concat([this.privateKey, data]));
	}

	verifySignature(data: Buffer, signature: Buffer): boolean {
		const expectedSignature = this.signData(data);
		return expectedSignature.equals(signature);
	}

	getEntities(): EntityMachine[] {
		return Array.from(this.children.values()).filter(
			(child) => child instanceof EntityMachine,
		) as EntityMachine[];
	}

	async signTransaction(transaction: Transaction): Promise<Transaction> {
		const txData = Buffer.concat([
			transaction.from,
			transaction.to,
			Buffer.from(transaction.nonce.toString()),
			transaction.data,
		]);

		return {
			...transaction,
			signature: this.signData(txData),
		};
	}
}

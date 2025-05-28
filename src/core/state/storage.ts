import type { EntityState, TreeConfig } from "../../types/core";
import { createMachineId, decodeRLP, encodeRLP } from "../../utils/encoding";
import { MerkleTree } from "./merkle";

export class MerkleStore {
	private tree: MerkleTree;

	constructor(config: TreeConfig = { bitWidth: 4, leafThreshold: 16 }) {
		this.tree = new MerkleTree(config);
	}

	updateEntityState(
		signerId: Buffer,
		entityId: Buffer,
		state: EntityState,
	): void {
		const key = this.createEntityKey(signerId, entityId);
		const value = encodeRLP({
			status: state.status,
			nonce: state.nonce,
			finalBlock: {
				blockNumber: state.finalBlock.blockNumber,
				storage: Array.from(state.finalBlock.storage.entries()),
				channelRoot: state.finalBlock.channelRoot,
				channelMap: Array.from(state.finalBlock.channelMap.entries()),
				inbox: state.finalBlock.inbox,
			},
			consensusBlock: state.consensusBlock
				? {
						blockNumber: state.consensusBlock.blockNumber,
						storage: Array.from(state.consensusBlock.storage.entries()),
						channelRoot: state.consensusBlock.channelRoot,
						channelMap: Array.from(state.consensusBlock.channelMap.entries()),
						inbox: state.consensusBlock.inbox,
					}
				: null,
			validators: Array.from(state.validators.entries()),
			proposals: Array.from(state.proposals.entries()),
			balances: Array.from(state.balances.entries()),
			channels: Array.from(state.channels.entries()),
			orderbook: Array.from(state.orderbook.entries()),
		});

		this.tree.set(key, value);
	}

	getEntityState(signerId: Buffer, entityId: Buffer): EntityState | undefined {
		const key = this.createEntityKey(signerId, entityId);
		const value = this.tree.get(key);

		if (!value) {
			return undefined;
		}

		const decoded = decodeRLP(value);
		return {
			status: decoded.status,
			nonce: decoded.nonce,
			finalBlock: {
				blockNumber: decoded.finalBlock.blockNumber,
				storage: new Map(decoded.finalBlock.storage),
				channelRoot: decoded.finalBlock.channelRoot,
				channelMap: new Map(decoded.finalBlock.channelMap),
				inbox: decoded.finalBlock.inbox,
			},
			consensusBlock: decoded.consensusBlock
				? {
						blockNumber: decoded.consensusBlock.blockNumber,
						storage: new Map(decoded.consensusBlock.storage),
						channelRoot: decoded.consensusBlock.channelRoot,
						channelMap: new Map(decoded.consensusBlock.channelMap),
						inbox: decoded.consensusBlock.inbox,
					}
				: undefined,
			validators: new Map(decoded.validators),
			proposals: new Map(decoded.proposals),
			balances: new Map(decoded.balances),
			channels: new Map(decoded.channels),
			orderbook: new Map(decoded.orderbook),
		};
	}

	updateSignerState(signerId: Buffer, entities: Map<Buffer, any>): void {
		const key = this.createSignerKey(signerId);
		const value = encodeRLP({
			entities: Array.from(entities.entries()),
		});

		this.tree.set(key, value);
	}

	getSignerState(signerId: Buffer): Map<Buffer, any> | undefined {
		const key = this.createSignerKey(signerId);
		const value = this.tree.get(key);

		if (!value) {
			return undefined;
		}

		const decoded = decodeRLP(value);
		return new Map(decoded.entities);
	}

	getRoot(): Buffer {
		return this.tree.getRoot();
	}

	visualize(): string {
		return this.tree.visualize();
	}

	getStats() {
		return this.tree.getStats();
	}

	private createEntityKey(signerId: Buffer, entityId: Buffer): Buffer {
		return createMachineId(
			Buffer.alloc(8),
			signerId,
			entityId,
			Buffer.alloc(8),
		);
	}

	private createSignerKey(signerId: Buffer): Buffer {
		return createMachineId(
			Buffer.alloc(8),
			signerId,
			Buffer.alloc(8),
			Buffer.alloc(8),
		);
	}

	private createChannelKey(
		signerId: Buffer,
		entityId: Buffer,
		channelId: Buffer,
	): Buffer {
		return createMachineId(Buffer.alloc(8), signerId, entityId, channelId);
	}
}

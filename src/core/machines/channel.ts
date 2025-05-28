import { keccak256Hash } from "../../crypto/hashing";
import type {
	ChannelState,
	ChannelStatus,
	Hash,
	MachineType,
	Message,
	Transaction,
} from "../../types/core";
import { BaseMachine } from "./base";

export class ChannelMachine extends BaseMachine {
	private channelState: ChannelState;
	private peerEntityId: Buffer;

	constructor(
		id: Buffer,
		parent: BaseMachine,
		peerEntityId: Buffer,
		initialBalance: bigint,
	) {
		super(id, MachineType.CHANNEL, parent);
		this.peerEntityId = peerEntityId;

		this.channelState = {
			id,
			participants: [parent.getId(), peerEntityId],
			balances: new Map([["ETH", { left: initialBalance, right: 0n }]]),
			nonce: 0,
			status: ChannelStatus.READY,
			latestBlock: Buffer.alloc(32),
			disputeWindow: 86400000, // 24 hours in milliseconds
			collateral: initialBalance,
			creditLimits: { left: 0n, right: 0n },
			ondelta: 0n,
			offdelta: 0n,
		};
	}

	getChannelState(): ChannelState {
		return { ...this.channelState };
	}

	async makePayment(
		asset: string,
		amount: bigint,
		recipient: Buffer,
	): Promise<boolean> {
		const balance = this.channelState.balances.get(asset);
		if (!balance) {
			return false;
		}

		const isLeftToRight = this.channelState.participants[0].equals(
			this.parent!.getId(),
		);
		const senderBalance = isLeftToRight ? balance.left : balance.right;
		const senderCredit = isLeftToRight
			? this.channelState.creditLimits.left
			: this.channelState.creditLimits.right;

		// Check if payment can be made (balance + credit)
		if (senderBalance + senderCredit < amount) {
			return false;
		}

		// Update balances
		if (isLeftToRight) {
			balance.left -= amount;
			balance.right += amount;
		} else {
			balance.right -= amount;
			balance.left += amount;
		}

		this.channelState.nonce++;
		this.channelState.offdelta += amount;

		this.emit("payment", {
			from: this.parent!.getId(),
			to: recipient,
			amount,
			asset,
			nonce: this.channelState.nonce,
		});

		return true;
	}

	async updateCollateral(amount: bigint): Promise<void> {
		this.channelState.collateral += amount;
		this.channelState.ondelta += amount;
		this.channelState.nonce++;
	}

	async setCreditLimit(side: "left" | "right", limit: bigint): Promise<void> {
		this.channelState.creditLimits[side] = limit;
		this.channelState.nonce++;
	}

	async initiateClose(): Promise<void> {
		this.channelState.status = ChannelStatus.CLOSING;
		this.emit("closing", {
			channelId: this.id,
			finalState: this.channelState,
		});
	}

	async cooperativeClose(): Promise<void> {
		this.channelState.status = ChannelStatus.CLOSED;

		// Settle final balances
		const finalBalances = new Map();
		for (const [asset, balance] of this.channelState.balances) {
			finalBalances.set(asset, balance);
		}

		this.emit("closed", {
			channelId: this.id,
			finalBalances,
			cooperative: true,
		});
	}

	async disputeClose(evidence: Buffer): Promise<void> {
		this.channelState.status = ChannelStatus.CLOSING;

		this.emit("dispute", {
			channelId: this.id,
			evidence,
			disputeWindow: this.channelState.disputeWindow,
		});

		// In a real implementation, this would start the dispute window
		setTimeout(() => {
			this.forceClose();
		}, this.channelState.disputeWindow);
	}

	private async forceClose(): Promise<void> {
		this.channelState.status = ChannelStatus.CLOSED;

		this.emit("closed", {
			channelId: this.id,
			finalBalances: this.channelState.balances,
			cooperative: false,
		});
	}

	getBalance(
		asset: string,
		participant?: Buffer,
	): { left: bigint; right: bigint } | bigint {
		const balance = this.channelState.balances.get(asset);
		if (!balance) {
			return participant ? 0n : { left: 0n, right: 0n };
		}

		if (participant) {
			const isLeft = this.channelState.participants[0].equals(participant);
			return isLeft ? balance.left : balance.right;
		}

		return balance;
	}

	getAvailableCapacity(asset: string, participant: Buffer): bigint {
		const balance = this.getBalance(asset, participant) as bigint;
		const isLeft = this.channelState.participants[0].equals(participant);
		const creditLimit = isLeft
			? this.channelState.creditLimits.left
			: this.channelState.creditLimits.right;

		return balance + creditLimit;
	}

	async processBlock(): Promise<Hash> {
		// Channels are leaf nodes - they don't process child blocks
		return this.getStateRoot();
	}

	protected async handleMessage(message: Message): Promise<void> {
		// Handle channel-specific messages
		try {
			const messageData = JSON.parse(message.data.toString());

			switch (messageData.type) {
				case "payment":
					await this.makePayment(
						messageData.asset,
						BigInt(messageData.amount),
						message.sender.entityId,
					);
					break;
				case "close":
					await this.initiateClose();
					break;
				case "cooperativeClose":
					await this.cooperativeClose();
					break;
				case "dispute":
					await this.disputeClose(Buffer.from(messageData.evidence, "hex"));
					break;
			}
		} catch (error) {
			this.emit("error", error);
		}
	}

	protected async handleTransaction(transaction: Transaction): Promise<void> {
		// Channels typically don't receive transactions directly
		// They operate through messages from their parent entity
	}

	getStateRoot(): Hash {
		// Simple deterministic state root computation
		const balancesObj: any = {};
		for (const [key, value] of this.channelState.balances.entries()) {
			balancesObj[key] = {
				left: value.left.toString(),
				right: value.right.toString(),
			};
		}

		const stateString = JSON.stringify({
			id: this.channelState.id.toString("hex"),
			participants: this.channelState.participants.map((p) =>
				p.toString("hex"),
			),
			balances: balancesObj,
			nonce: this.channelState.nonce.toString(),
			status: this.channelState.status,
			collateral: this.channelState.collateral.toString(),
			creditLimits: {
				left: this.channelState.creditLimits.left.toString(),
				right: this.channelState.creditLimits.right.toString(),
			},
			ondelta: this.channelState.ondelta.toString(),
			offdelta: this.channelState.offdelta.toString(),
		});

		return keccak256Hash(Buffer.from(stateString));
	}

	canReceive(asset: string, amount: bigint, participant: Buffer): boolean {
		const isLeft = this.channelState.participants[0].equals(participant);
		const peerBalance = isLeft
			? this.channelState.balances.get(asset)?.right || 0n
			: this.channelState.balances.get(asset)?.left || 0n;
		const peerCredit = isLeft
			? this.channelState.creditLimits.right
			: this.channelState.creditLimits.left;

		return peerBalance + peerCredit >= amount;
	}

	getPeerEntityId(): Buffer {
		return this.peerEntityId;
	}

	isActive(): boolean {
		return this.channelState.status === ChannelStatus.READY;
	}
}

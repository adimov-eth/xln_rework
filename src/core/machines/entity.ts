import { BaseMachine } from './base';
import { ChannelMachine } from './channel';
import { MachineType, Message, Transaction, Hash, EntityState, EntityStatus, Proposal, ProposalType, ProposalStatus, ValidatorInfo } from '../../types/core';
import { keccak256Hash } from '../../crypto/hashing';
import { encodeRLP } from '../../utils/encoding';
import { randomBytes } from 'crypto';

export class EntityMachine extends BaseMachine {
    private entityState: EntityState;
    private isMultiSig: boolean;
    private quorumThreshold: number;

    constructor(id: Buffer, parent: BaseMachine, isMultiSig: boolean = false) {
        super(id, MachineType.ENTITY, parent);
        this.isMultiSig = isMultiSig;
        this.quorumThreshold = isMultiSig ? 2 : 1; // Default 2-of-N for multi-sig
        
        this.entityState = {
            status: EntityStatus.IDLE,
            validators: new Map(),
            proposals: new Map(),
            balances: new Map(),
            channels: new Map(),
            orderbook: new Map(),
            nonce: 0,
            finalBlock: {
                blockNumber: 0,
                storage: new Map(),
                channelRoot: Buffer.alloc(32),
                channelMap: new Map(),
                inbox: []
            }
        };

        // Add self as initial validator if single-sig
        if (!isMultiSig && parent) {
            this.addValidator(parent.getId(), Buffer.alloc(32), 1);
        }
    }

    getEntityState(): EntityState {
        return { ...this.entityState };
    }

    addValidator(address: Buffer, publicKey: Buffer, weight: number): void {
        this.entityState.validators.set(address, {
            address,
            publicKey,
            weight,
            active: true
        });
    }

    removeValidator(address: Buffer): boolean {
        return this.entityState.validators.delete(address);
    }

    async createChannel(peerEntityId: Buffer, initialBalance: bigint): Promise<ChannelMachine> {
        const channelId = randomBytes(8);
        const channel = new ChannelMachine(channelId, this, peerEntityId, initialBalance);
        
        this.addChild(channel);
        this.entityState.channels.set(channelId, channel.getStateRoot());
        
        await channel.start();
        return channel;
    }

    async createProposal(type: ProposalType, data: Buffer, proposer: Buffer): Promise<Buffer> {
        const proposalId = randomBytes(32);
        const proposal: Proposal = {
            id: proposalId,
            type,
            data,
            proposer,
            votes: new Map(),
            createdAt: Date.now(),
            expiresAt: Date.now() + 30000, // 30 second timeout
            status: ProposalStatus.PENDING
        };

        this.entityState.proposals.set(proposalId, proposal);

        // Auto-approve for single-sig entities
        if (!this.isMultiSig) {
            await this.executeProposal(proposalId);
        }

        return proposalId;
    }

    async voteOnProposal(proposalId: Buffer, voter: Buffer, signature: Buffer): Promise<boolean> {
        const proposal = this.entityState.proposals.get(proposalId);
        if (!proposal || proposal.status !== ProposalStatus.PENDING) {
            return false;
        }

        const validator = this.entityState.validators.get(voter);
        if (!validator || !validator.active) {
            return false;
        }

        proposal.votes.set(voter, signature);

        // Check if quorum reached
        const totalWeight = this.getTotalValidatorWeight();
        const voteWeight = this.getVoteWeight(proposal);
        
        if (voteWeight >= this.quorumThreshold || voteWeight * 2 > totalWeight) {
            await this.executeProposal(proposalId);
            return true;
        }

        return false;
    }

    private async executeProposal(proposalId: Buffer): Promise<void> {
        const proposal = this.entityState.proposals.get(proposalId);
        if (!proposal) return;

        proposal.status = ProposalStatus.APPROVED;

        switch (proposal.type) {
            case ProposalType.TRANSFER:
                await this.executeTransfer(proposal.data);
                break;
            case ProposalType.ADD_VALIDATOR:
                await this.executeAddValidator(proposal.data);
                break;
            case ProposalType.REMOVE_VALIDATOR:
                await this.executeRemoveValidator(proposal.data);
                break;
            case ProposalType.CUSTOM:
                await this.executeCustomProposal(proposal.data);
                break;
        }

        this.emit('proposalExecuted', { proposalId, proposal });
    }

    private async executeTransfer(data: Buffer): Promise<void> {
        // Decode transfer data and execute
        const decoded = JSON.parse(data.toString());
        const { to, amount, asset } = decoded;
        
        const currentBalance = this.entityState.balances.get(asset) || 0n;
        if (currentBalance >= BigInt(amount)) {
            this.entityState.balances.set(asset, currentBalance - BigInt(amount));
            // In a real implementation, this would create an outgoing transaction
        }
    }

    private async executeAddValidator(data: Buffer): Promise<void> {
        const decoded = JSON.parse(data.toString());
        const { address, publicKey, weight } = decoded;
        this.addValidator(Buffer.from(address, 'hex'), Buffer.from(publicKey, 'hex'), weight);
    }

    private async executeRemoveValidator(data: Buffer): Promise<void> {
        const decoded = JSON.parse(data.toString());
        const { address } = decoded;
        this.removeValidator(Buffer.from(address, 'hex'));
    }

    private async executeCustomProposal(data: Buffer): Promise<void> {
        // Override in subclasses for custom logic
        this.emit('customProposal', data);
    }

    private getTotalValidatorWeight(): number {
        let total = 0;
        for (const validator of this.entityState.validators.values()) {
            if (validator.active) {
                total += validator.weight;
            }
        }
        return total;
    }

    private getVoteWeight(proposal: Proposal): number {
        let weight = 0;
        for (const voter of proposal.votes.keys()) {
            const validator = this.entityState.validators.get(voter);
            if (validator && validator.active) {
                weight += validator.weight;
            }
        }
        return weight;
    }

    async processBlock(): Promise<Hash> {
        this.entityState.finalBlock.blockNumber++;
        this.entityState.nonce++;

        // Process any pending proposals
        await this.processExpiredProposals();

        // Update channel states
        for (const child of this.children.values()) {
            if (child instanceof ChannelMachine) {
                const channelRoot = await child.processBlock();
                this.entityState.channels.set(child.getId(), channelRoot);
            }
        }

        // Update entity state root
        const stateRoot = this.computeEntityStateRoot();
        this.updateStateRoot(stateRoot);

        return stateRoot;
    }

    private async processExpiredProposals(): Promise<void> {
        const now = Date.now();
        for (const [proposalId, proposal] of this.entityState.proposals) {
            if (proposal.status === ProposalStatus.PENDING && proposal.expiresAt < now) {
                proposal.status = ProposalStatus.EXPIRED;
            }
        }
    }

    private computeEntityStateRoot(): Hash {
        const stateData = encodeRLP({
            status: this.entityState.status,
            nonce: this.entityState.nonce,
            validatorCount: this.entityState.validators.size,
            proposalCount: this.entityState.proposals.size,
            channelCount: this.entityState.channels.size,
            finalBlockNumber: this.entityState.finalBlock.blockNumber
        });

        return keccak256Hash(stateData);
    }

    protected async handleMessage(message: Message): Promise<void> {
        const targetChannel = this.children.get(message.recipient.submachineId);
        if (targetChannel) {
            await targetChannel.receiveMessage(message);
        }
    }

    protected async handleTransaction(transaction: Transaction): Promise<void> {
        this.entityState.finalBlock.inbox.push(transaction);
        
        // Simple transaction processing
        if (transaction.data.length > 0) {
            try {
                const txData = JSON.parse(transaction.data.toString());
                
                if (txData.type === 'propose') {
                    await this.createProposal(
                        txData.proposalType,
                        Buffer.from(JSON.stringify(txData.proposalData)),
                        transaction.from
                    );
                } else if (txData.type === 'vote') {
                    await this.voteOnProposal(
                        Buffer.from(txData.proposalId, 'hex'),
                        transaction.from,
                        transaction.signature
                    );
                }
            } catch (error) {
                // Invalid transaction data
            }
        }
    }

    getStateRoot(): Hash {
        return this.computeEntityStateRoot();
    }

    getChannels(): ChannelMachine[] {
        return Array.from(this.children.values()).filter(
            child => child instanceof ChannelMachine
        ) as ChannelMachine[];
    }

    getBalance(asset: string): bigint {
        return this.entityState.balances.get(asset) || 0n;
    }

    setBalance(asset: string, amount: bigint): void {
        this.entityState.balances.set(asset, amount);
    }

    adjustBalance(asset: string, delta: bigint): bigint {
        const current = this.getBalance(asset);
        const newBalance = current + delta;
        this.setBalance(asset, newBalance);
        return newBalance;
    }
}
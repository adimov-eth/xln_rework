import { BaseMachine } from './base';
import { SignerMachine } from './signer';
import { MachineType, Message, Transaction, Hash, Block } from '../../types/core';
import { keccak256Hash } from '../../crypto/hashing';
import { encodeRLP } from '../../utils/encoding';

export class ServerMachine extends BaseMachine {
    private blockNumber: number;
    private blockInterval: number;
    private blockTimer?: NodeJS.Timeout;

    constructor(id: Buffer) {
        super(id, MachineType.SERVER);
        this.blockNumber = 0;
        this.blockInterval = 100; // 100ms block time
    }

    async createSigner(signerId: Buffer, privateKey?: Buffer): Promise<SignerMachine> {
        const signer = new SignerMachine(signerId, this, privateKey);
        this.addChild(signer);
        await signer.start();
        return signer;
    }

    async processBlock(): Promise<Hash> {
        const timestamp = Date.now();
        const transactions = encodeRLP(this.mempool);
        
        const signerRoots: Buffer[] = [];
        for (const child of this.children.values()) {
            if (child instanceof SignerMachine) {
                const signerRoot = await child.processBlock();
                signerRoots.push(signerRoot);
            }
        }

        const block: Block = {
            previousBlock: this.lastBlockHash,
            blockNumber: this.blockNumber++,
            timestamp,
            transactions,
            stateHash: this.getStateRoot(),
            signatures: undefined
        };

        const blockHash = keccak256Hash(encodeRLP([
            block.previousBlock,
            block.blockNumber,
            block.timestamp,
            block.transactions,
            block.stateHash
        ]));

        this.updateLastBlockHash(blockHash);
        this.clearMempool();

        this.emit('block', { block, hash: blockHash });
        return blockHash;
    }

    protected async handleMessage(message: Message): Promise<void> {
        const targetSigner = this.children.get(message.recipient.signerId);
        if (targetSigner) {
            await targetSigner.receiveMessage(message);
        }
    }

    protected async handleTransaction(transaction: Transaction): Promise<void> {
        // Server doesn't process transactions directly, routes to signers
        const targetAddress = transaction.to;
        
        // Simple routing: broadcast to all signers for now
        for (const child of this.children.values()) {
            if (child instanceof SignerMachine) {
                await child.receiveTransaction(transaction);
            }
        }
    }

    getStateRoot(): Hash {
        const signerHashes: Buffer[] = [];
        for (const child of this.children.values()) {
            signerHashes.push(child.getStateRoot());
        }
        
        return signerHashes.length > 0 
            ? keccak256Hash(Buffer.concat(signerHashes))
            : Buffer.alloc(32);
    }

    protected async onStart(): Promise<void> {
        this.startBlockProduction();
    }

    protected async onStop(): Promise<void> {
        this.stopBlockProduction();
    }

    private startBlockProduction(): void {
        this.blockTimer = setInterval(async () => {
            try {
                await this.processBlock();
            } catch (error) {
                this.emit('error', error);
            }
        }, this.blockInterval);
    }

    private stopBlockProduction(): void {
        if (this.blockTimer) {
            clearInterval(this.blockTimer);
            this.blockTimer = undefined;
        }
    }

    getBlockNumber(): number {
        return this.blockNumber;
    }

    setBlockInterval(interval: number): void {
        this.blockInterval = interval;
        if (this.blockTimer) {
            this.stopBlockProduction();
            this.startBlockProduction();
        }
    }

    getSigners(): SignerMachine[] {
        return Array.from(this.children.values()).filter(
            child => child instanceof SignerMachine
        ) as SignerMachine[];
    }
}
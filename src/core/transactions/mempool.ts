import { Transaction, MessageType } from '../../types/core';

export interface TransactionPool {
    signerTransactions: Transaction[];
    entityTransactions: Transaction[];
    channelMessages: Transaction[];
    proposalVotes: Transaction[];
}

export class Mempool {
    private pools: Map<string, TransactionPool>;
    private priorityQueue: Transaction[];
    private maxSize: number;

    constructor(maxSize: number = 10000) {
        this.pools = new Map();
        this.priorityQueue = [];
        this.maxSize = maxSize;
    }

    addTransaction(machineId: string, transaction: Transaction): boolean {
        if (this.priorityQueue.length >= this.maxSize) {
            return false;
        }

        if (!this.pools.has(machineId)) {
            this.pools.set(machineId, {
                signerTransactions: [],
                entityTransactions: [],
                channelMessages: [],
                proposalVotes: []
            });
        }

        const pool = this.pools.get(machineId)!;
        const txType = this.categorizeTransaction(transaction);

        switch (txType) {
            case 'signer':
                pool.signerTransactions.push(transaction);
                break;
            case 'entity':
                pool.entityTransactions.push(transaction);
                break;
            case 'channel':
                pool.channelMessages.push(transaction);
                break;
            case 'vote':
                pool.proposalVotes.push(transaction);
                break;
        }

        this.priorityQueue.push(transaction);
        this.sortByPriority();

        return true;
    }

    getTransactions(machineId: string): TransactionPool | undefined {
        return this.pools.get(machineId);
    }

    getAllTransactions(): Transaction[] {
        return [...this.priorityQueue];
    }

    getTransactionsByPriority(limit?: number): Transaction[] {
        return limit ? this.priorityQueue.slice(0, limit) : [...this.priorityQueue];
    }

    removeTransaction(transaction: Transaction): boolean {
        const index = this.priorityQueue.findIndex(tx => 
            tx.from.equals(transaction.from) && 
            tx.nonce === transaction.nonce
        );

        if (index === -1) {
            return false;
        }

        this.priorityQueue.splice(index, 1);

        // Remove from specific pools
        for (const pool of this.pools.values()) {
            this.removeFromArray(pool.signerTransactions, transaction);
            this.removeFromArray(pool.entityTransactions, transaction);
            this.removeFromArray(pool.channelMessages, transaction);
            this.removeFromArray(pool.proposalVotes, transaction);
        }

        return true;
    }

    clear(machineId?: string): void {
        if (machineId) {
            this.pools.delete(machineId);
            this.rebuildPriorityQueue();
        } else {
            this.pools.clear();
            this.priorityQueue = [];
        }
    }

    getSize(): number {
        return this.priorityQueue.length;
    }

    getPoolSize(machineId: string): number {
        const pool = this.pools.get(machineId);
        if (!pool) return 0;

        return pool.signerTransactions.length +
               pool.entityTransactions.length +
               pool.channelMessages.length +
               pool.proposalVotes.length;
    }

    hasNonceConflict(transaction: Transaction): boolean {
        return this.priorityQueue.some(tx => 
            tx.from.equals(transaction.from) && 
            tx.nonce === transaction.nonce
        );
    }

    getNextNonce(from: Buffer): number {
        const txs = this.priorityQueue.filter(tx => tx.from.equals(from));
        if (txs.length === 0) return 0;
        
        const maxNonce = Math.max(...txs.map(tx => tx.nonce));
        return maxNonce + 1;
    }

    private categorizeTransaction(transaction: Transaction): string {
        try {
            const data = JSON.parse(transaction.data.toString());
            
            if (data.type === 'propose' || data.type === 'vote') {
                return 'vote';
            } else if (data.type === 'payment' || data.type === 'channel') {
                return 'channel';
            } else if (data.type === 'entity') {
                return 'entity';
            } else {
                return 'signer';
            }
        } catch {
            return 'signer';
        }
    }

    private sortByPriority(): void {
        this.priorityQueue.sort((a, b) => {
            // Priority order: votes > channels > entities > signers
            const aPriority = this.getTransactionPriority(a);
            const bPriority = this.getTransactionPriority(b);
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }

            // Secondary sort by fee (if available)
            const aFee = a.fee || 0n;
            const bFee = b.fee || 0n;
            
            if (aFee !== bFee) {
                return aFee > bFee ? -1 : 1;
            }

            // Tertiary sort by timestamp (FIFO)
            return a.timestamp - b.timestamp;
        });
    }

    private getTransactionPriority(transaction: Transaction): number {
        const category = this.categorizeTransaction(transaction);
        
        switch (category) {
            case 'vote': return 4;
            case 'channel': return 3;
            case 'entity': return 2;
            case 'signer': return 1;
            default: return 0;
        }
    }

    private removeFromArray(array: Transaction[], transaction: Transaction): void {
        const index = array.findIndex(tx => 
            tx.from.equals(transaction.from) && 
            tx.nonce === transaction.nonce
        );
        
        if (index !== -1) {
            array.splice(index, 1);
        }
    }

    private rebuildPriorityQueue(): void {
        this.priorityQueue = [];
        
        for (const pool of this.pools.values()) {
            this.priorityQueue.push(
                ...pool.signerTransactions,
                ...pool.entityTransactions,
                ...pool.channelMessages,
                ...pool.proposalVotes
            );
        }
        
        this.sortByPriority();
    }

    getStatistics(): {
        totalTransactions: number;
        poolCount: number;
        averagePoolSize: number;
        typeDistribution: Record<string, number>;
    } {
        const typeDistribution: Record<string, number> = {
            signer: 0,
            entity: 0,
            channel: 0,
            vote: 0
        };

        for (const tx of this.priorityQueue) {
            const type = this.categorizeTransaction(tx);
            typeDistribution[type]++;
        }

        return {
            totalTransactions: this.priorityQueue.length,
            poolCount: this.pools.size,
            averagePoolSize: this.pools.size > 0 ? this.priorityQueue.length / this.pools.size : 0,
            typeDistribution
        };
    }
}
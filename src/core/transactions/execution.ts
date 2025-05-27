import { Transaction, Hash, Block } from '../../types/core';
import { BaseMachine } from '../machines/base';
import { ServerMachine } from '../machines/server';
import { SignerMachine } from '../machines/signer';
import { EntityMachine } from '../machines/entity';
import { ChannelMachine } from '../machines/channel';
import { TransactionValidator, ValidationResult } from './validation';
import { Mempool } from './mempool';
import { encodeRLP } from '../../utils/encoding';
import { keccak256Hash } from '../../crypto/hashing';

export interface ExecutionResult {
    success: boolean;
    gasUsed: number;
    error?: string;
    events?: any[];
}

export interface ExecutionContext {
    block: {
        number: number;
        timestamp: number;
        hash: Hash;
    };
    transaction: Transaction;
    gasLimit: number;
    gasPrice: bigint;
}

export class TransactionExecutor {
    private validator: TransactionValidator;
    private mempool: Mempool;
    private gasLimit: number;

    constructor(validator: TransactionValidator, mempool: Mempool, gasLimit: number = 10000000) {
        this.validator = validator;
        this.mempool = mempool;
        this.gasLimit = gasLimit;
    }

    async executeTransaction(
        transaction: Transaction, 
        machine: BaseMachine,
        context: ExecutionContext
    ): Promise<ExecutionResult> {
        // Validate transaction
        const validation = this.validator.validateTransaction(transaction);
        if (!validation.valid) {
            return {
                success: false,
                gasUsed: 0,
                error: validation.error
            };
        }

        // Create execution environment
        const executor = new TransactionExecutionEnvironment(context);

        try {
            // Route transaction to appropriate machine type
            let result: ExecutionResult;

            switch (machine.getType()) {
                case 'server':
                    result = await this.executeServerTransaction(transaction, machine as ServerMachine, executor);
                    break;
                case 'signer':
                    result = await this.executeSignerTransaction(transaction, machine as SignerMachine, executor);
                    break;
                case 'entity':
                    result = await this.executeEntityTransaction(transaction, machine as EntityMachine, executor);
                    break;
                case 'channel':
                    result = await this.executeChannelTransaction(transaction, machine as ChannelMachine, executor);
                    break;
                default:
                    result = {
                        success: false,
                        gasUsed: 1000,
                        error: 'Unknown machine type'
                    };
            }

            // Update nonce if successful
            if (result.success) {
                this.validator.updateNonce(transaction.from, transaction.nonce);
            }

            return result;

        } catch (error) {
            return {
                success: false,
                gasUsed: context.gasLimit,
                error: error instanceof Error ? error.message : 'Unknown execution error'
            };
        }
    }

    async executeBatch(
        transactions: Transaction[],
        machine: BaseMachine,
        blockContext: { number: number; timestamp: number; hash: Hash }
    ): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];

        for (const transaction of transactions) {
            const context: ExecutionContext = {
                block: blockContext,
                transaction,
                gasLimit: this.gasLimit,
                gasPrice: transaction.fee || 0n
            };

            const result = await this.executeTransaction(transaction, machine, context);
            results.push(result);

            // Stop on first failure for atomic batches
            if (!result.success && this.isAtomicBatch(transactions)) {
                break;
            }
        }

        return results;
    }

    private async executeServerTransaction(
        transaction: Transaction,
        server: ServerMachine,
        executor: TransactionExecutionEnvironment
    ): Promise<ExecutionResult> {
        const gasUsed = 1000; // Base gas for server operations
        
        try {
            const data = this.parseTransactionData(transaction);
            
            switch (data.type) {
                case 'createSigner':
                    const signer = await server.createSigner(
                        Buffer.from(data.signerId, 'hex'),
                        data.privateKey ? Buffer.from(data.privateKey, 'hex') : undefined
                    );
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'SignerCreated',
                            signerId: signer.getId().toString('hex'),
                            publicKey: signer.getPublicKey().toString('hex')
                        }]
                    };

                default:
                    return {
                        success: false,
                        gasUsed,
                        error: 'Unknown server operation'
                    };
            }
        } catch (error) {
            return {
                success: false,
                gasUsed,
                error: error instanceof Error ? error.message : 'Server execution failed'
            };
        }
    }

    private async executeSignerTransaction(
        transaction: Transaction,
        signer: SignerMachine,
        executor: TransactionExecutionEnvironment
    ): Promise<ExecutionResult> {
        const gasUsed = 2000; // Base gas for signer operations
        
        try {
            const data = this.parseTransactionData(transaction);
            
            switch (data.type) {
                case 'createEntity':
                    const entity = await signer.createEntity(
                        Buffer.from(data.entityId, 'hex'),
                        data.isMultiSig || false
                    );
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'EntityCreated',
                            entityId: entity.getId().toString('hex'),
                            signerId: signer.getId().toString('hex'),
                            isMultiSig: data.isMultiSig || false
                        }]
                    };

                case 'signTransaction':
                    const signedTx = await signer.signTransaction(data.transaction);
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'TransactionSigned',
                            originalTx: data.transaction,
                            signedTx
                        }]
                    };

                default:
                    return {
                        success: false,
                        gasUsed,
                        error: 'Unknown signer operation'
                    };
            }
        } catch (error) {
            return {
                success: false,
                gasUsed,
                error: error instanceof Error ? error.message : 'Signer execution failed'
            };
        }
    }

    private async executeEntityTransaction(
        transaction: Transaction,
        entity: EntityMachine,
        executor: TransactionExecutionEnvironment
    ): Promise<ExecutionResult> {
        const gasUsed = 5000; // Base gas for entity operations
        
        try {
            const data = this.parseTransactionData(transaction);
            
            switch (data.type) {
                case 'propose':
                    const proposalId = await entity.createProposal(
                        data.proposalType,
                        Buffer.from(JSON.stringify(data.proposalData)),
                        transaction.from
                    );
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'ProposalCreated',
                            proposalId: proposalId.toString('hex'),
                            proposer: transaction.from.toString('hex'),
                            proposalType: data.proposalType
                        }]
                    };

                case 'vote':
                    const voteResult = await entity.voteOnProposal(
                        Buffer.from(data.proposalId, 'hex'),
                        transaction.from,
                        transaction.signature
                    );
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'VoteCast',
                            proposalId: data.proposalId,
                            voter: transaction.from.toString('hex'),
                            executed: voteResult
                        }]
                    };

                case 'createChannel':
                    const channel = await entity.createChannel(
                        Buffer.from(data.peerEntityId, 'hex'),
                        BigInt(data.initialBalance)
                    );
                    
                    return {
                        success: true,
                        gasUsed: gasUsed + 3000, // Additional gas for channel creation
                        events: [{
                            type: 'ChannelCreated',
                            channelId: channel.getId().toString('hex'),
                            entityId: entity.getId().toString('hex'),
                            peerEntityId: data.peerEntityId,
                            initialBalance: data.initialBalance
                        }]
                    };

                case 'transfer':
                    const currentBalance = entity.getBalance(data.asset);
                    const amount = BigInt(data.amount);
                    
                    if (currentBalance >= amount) {
                        entity.adjustBalance(data.asset, -amount);
                        
                        return {
                            success: true,
                            gasUsed,
                            events: [{
                                type: 'Transfer',
                                from: entity.getId().toString('hex'),
                                to: data.to,
                                asset: data.asset,
                                amount: data.amount
                            }]
                        };
                    } else {
                        return {
                            success: false,
                            gasUsed,
                            error: 'Insufficient balance'
                        };
                    }

                default:
                    return {
                        success: false,
                        gasUsed,
                        error: 'Unknown entity operation'
                    };
            }
        } catch (error) {
            return {
                success: false,
                gasUsed,
                error: error instanceof Error ? error.message : 'Entity execution failed'
            };
        }
    }

    private async executeChannelTransaction(
        transaction: Transaction,
        channel: ChannelMachine,
        executor: TransactionExecutionEnvironment
    ): Promise<ExecutionResult> {
        const gasUsed = 3000; // Base gas for channel operations
        
        try {
            const data = this.parseTransactionData(transaction);
            
            switch (data.type) {
                case 'payment':
                    const paymentResult = await channel.makePayment(
                        data.asset,
                        BigInt(data.amount),
                        Buffer.from(data.recipient, 'hex')
                    );
                    
                    if (paymentResult) {
                        return {
                            success: true,
                            gasUsed,
                            events: [{
                                type: 'ChannelPayment',
                                channelId: channel.getId().toString('hex'),
                                asset: data.asset,
                                amount: data.amount,
                                recipient: data.recipient
                            }]
                        };
                    } else {
                        return {
                            success: false,
                            gasUsed,
                            error: 'Payment failed - insufficient capacity'
                        };
                    }

                case 'updateCollateral':
                    await channel.updateCollateral(BigInt(data.amount));
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'CollateralUpdated',
                            channelId: channel.getId().toString('hex'),
                            amount: data.amount
                        }]
                    };

                case 'setCreditLimit':
                    await channel.setCreditLimit(data.side, BigInt(data.limit));
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'CreditLimitSet',
                            channelId: channel.getId().toString('hex'),
                            side: data.side,
                            limit: data.limit
                        }]
                    };

                case 'close':
                    if (data.cooperative) {
                        await channel.cooperativeClose();
                    } else {
                        await channel.initiateClose();
                    }
                    
                    return {
                        success: true,
                        gasUsed,
                        events: [{
                            type: 'ChannelClosed',
                            channelId: channel.getId().toString('hex'),
                            cooperative: data.cooperative
                        }]
                    };

                default:
                    return {
                        success: false,
                        gasUsed,
                        error: 'Unknown channel operation'
                    };
            }
        } catch (error) {
            return {
                success: false,
                gasUsed,
                error: error instanceof Error ? error.message : 'Channel execution failed'
            };
        }
    }

    private parseTransactionData(transaction: Transaction): any {
        try {
            return JSON.parse(transaction.data.toString());
        } catch {
            return {};
        }
    }

    private isAtomicBatch(transactions: Transaction[]): boolean {
        // Check if this is an atomic batch based on transaction data
        return transactions.some(tx => {
            try {
                const data = JSON.parse(tx.data.toString());
                return data.atomic === true;
            } catch {
                return false;
            }
        });
    }
}

class TransactionExecutionEnvironment {
    public readonly context: ExecutionContext;
    private gasUsed: number = 0;

    constructor(context: ExecutionContext) {
        this.context = context;
    }

    useGas(amount: number): boolean {
        if (this.gasUsed + amount > this.context.gasLimit) {
            return false;
        }
        this.gasUsed += amount;
        return true;
    }

    getGasUsed(): number {
        return this.gasUsed;
    }

    getRemainingGas(): number {
        return this.context.gasLimit - this.gasUsed;
    }
}
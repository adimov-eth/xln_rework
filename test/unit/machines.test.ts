import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ServerMachine } from '../../src/core/machines/server';
import { SignerMachine } from '../../src/core/machines/signer';
import { EntityMachine } from '../../src/core/machines/entity';
import { ChannelMachine } from '../../src/core/machines/channel';
import { MachineType, Transaction, ProposalType } from '../../src/types/core';
import { randomBytes } from 'crypto';

describe('Machine Hierarchy', () => {
    let server: ServerMachine;
    let serverId: Buffer;

    beforeEach(() => {
        serverId = randomBytes(32);
        server = new ServerMachine(serverId);
    });

    afterEach(async () => {
        await server.stop();
    });

    describe('ServerMachine', () => {
        test('should create server with correct properties', () => {
            expect(server.getId()).toEqual(serverId);
            expect(server.getType()).toBe(MachineType.SERVER);
            expect(server.getBlockNumber()).toBe(0);
        });

        test('should create signers', async () => {
            const signerId = randomBytes(8);
            const signer = await server.createSigner(signerId);

            expect(signer).toBeInstanceOf(SignerMachine);
            expect(signer.getId()).toEqual(signerId);
            expect(server.getChildren().has(signerId)).toBe(true);
        });

        test('should process blocks', async () => {
            await server.start();
            
            const initialBlockNumber = server.getBlockNumber();
            const blockHash = await server.processBlock();
            
            expect(server.getBlockNumber()).toBe(initialBlockNumber + 1);
            expect(blockHash).toBeInstanceOf(Buffer);
            expect(blockHash.length).toBe(32);
        });

        test('should emit block events', async () => {
            await server.start();
            
            let blockEvent: any = null;
            server.on('block', (event) => {
                blockEvent = event;
            });

            await server.processBlock();
            
            expect(blockEvent).not.toBeNull();
            expect(blockEvent.block).toBeDefined();
            expect(blockEvent.hash).toBeDefined();
        });
    });

    describe('SignerMachine', () => {
        let signer: SignerMachine;

        beforeEach(async () => {
            signer = await server.createSigner(randomBytes(8));
        });

        test('should have public key', () => {
            const publicKey = signer.getPublicKey();
            expect(publicKey).toBeInstanceOf(Buffer);
            expect(publicKey.length).toBe(32);
        });

        test('should create entities', async () => {
            const entityId = randomBytes(8);
            const entity = await signer.createEntity(entityId, false);

            expect(entity).toBeInstanceOf(EntityMachine);
            expect(entity.getId()).toEqual(entityId);
            expect(signer.getChildren().has(entityId)).toBe(true);
        });

        test('should sign transactions', async () => {
            const transaction: Transaction = {
                from: randomBytes(32),
                to: randomBytes(32),
                nonce: 1,
                data: Buffer.from('test'),
                signature: Buffer.alloc(32),
                timestamp: Date.now()
            };

            const signedTx = await signer.signTransaction(transaction);
            expect(signedTx.signature).not.toEqual(transaction.signature);
            expect(signedTx.signature.length).toBe(32);
        });
    });

    describe('EntityMachine', () => {
        let signer: SignerMachine;
        let entity: EntityMachine;

        beforeEach(async () => {
            signer = await server.createSigner(randomBytes(8));
            entity = await signer.createEntity(randomBytes(8), false);
        });

        test('should manage balances', () => {
            const initialBalance = entity.getBalance('ETH');
            expect(initialBalance).toBe(0n);

            entity.setBalance('ETH', 1000n);
            expect(entity.getBalance('ETH')).toBe(1000n);

            entity.adjustBalance('ETH', 500n);
            expect(entity.getBalance('ETH')).toBe(1500n);

            entity.adjustBalance('ETH', -200n);
            expect(entity.getBalance('ETH')).toBe(1300n);
        });

        test('should create channels', async () => {
            const peerEntityId = randomBytes(8);
            const initialBalance = 1000n;

            const channel = await entity.createChannel(peerEntityId, initialBalance);

            expect(channel).toBeInstanceOf(ChannelMachine);
            expect(entity.getChildren().has(channel.getId())).toBe(true);
        });

        test('should create and execute proposals (single-sig)', async () => {
            const proposalData = Buffer.from(JSON.stringify({
                to: 'test-address',
                amount: '100',
                asset: 'ETH'
            }));

            let proposalExecuted = false;
            entity.on('proposalExecuted', () => {
                proposalExecuted = true;
            });

            const proposalId = await entity.createProposal(
                ProposalType.TRANSFER,
                proposalData,
                signer.getId()
            );

            expect(proposalId).toBeInstanceOf(Buffer);
            expect(proposalId.length).toBe(32);
            
            // Single-sig should auto-execute
            expect(proposalExecuted).toBe(true);
        });

        test('should handle multi-sig proposals', async () => {
            // Create multi-sig entity
            const multiSigEntity = await signer.createEntity(randomBytes(8), true);
            
            // Add validators
            const validator1 = randomBytes(32);
            const validator2 = randomBytes(32);
            multiSigEntity.addValidator(validator1, randomBytes(32), 1);
            multiSigEntity.addValidator(validator2, randomBytes(32), 1);

            const proposalData = Buffer.from(JSON.stringify({
                to: 'test-address',
                amount: '100',
                asset: 'ETH'
            }));

            const proposalId = await multiSigEntity.createProposal(
                ProposalType.TRANSFER,
                proposalData,
                validator1
            );

            // Should not auto-execute for multi-sig
            const state = multiSigEntity.getEntityState();
            const proposal = state.proposals.get(proposalId);
            expect(proposal?.status).toBe('pending');

            // Vote with first validator
            await multiSigEntity.voteOnProposal(proposalId, validator1, randomBytes(32));
            
            // Vote with second validator to reach quorum
            const executed = await multiSigEntity.voteOnProposal(proposalId, validator2, randomBytes(32));
            expect(executed).toBe(true);
        });
    });

    describe('ChannelMachine', () => {
        let entity: EntityMachine;
        let channel: ChannelMachine;
        const peerEntityId = randomBytes(8);
        const initialBalance = 1000n;

        beforeEach(async () => {
            const signer = await server.createSigner(randomBytes(8));
            entity = await signer.createEntity(randomBytes(8), false);
            channel = await entity.createChannel(peerEntityId, initialBalance);
        });

        test('should create channel with correct state', () => {
            const state = channel.getChannelState();
            
            expect(state.participants).toHaveLength(2);
            expect(state.participants[0]).toEqual(entity.getId());
            expect(state.participants[1]).toEqual(peerEntityId);
            expect(state.collateral).toBe(initialBalance);
            expect(state.status).toBe('ready');
        });

        test('should handle payments', async () => {
            const paymentAmount = 100n;
            const recipient = randomBytes(32);

            const result = await channel.makePayment('ETH', paymentAmount, recipient);
            expect(result).toBe(true);

            const balance = channel.getBalance('ETH') as { left: bigint; right: bigint };
            expect(balance.left).toBe(initialBalance - paymentAmount);
            expect(balance.right).toBe(paymentAmount);
        });

        test('should reject payments exceeding capacity', async () => {
            const excessiveAmount = initialBalance + 1n;
            const recipient = randomBytes(32);

            const result = await channel.makePayment('ETH', excessiveAmount, recipient);
            expect(result).toBe(false);
        });

        test('should handle credit limits', async () => {
            const creditLimit = 500n;
            await channel.setCreditLimit('left', creditLimit);

            const state = channel.getChannelState();
            expect(state.creditLimits.left).toBe(creditLimit);

            // Should now be able to pay beyond collateral
            const largePayment = initialBalance + 200n;
            const recipient = randomBytes(32);

            const result = await channel.makePayment('ETH', largePayment, recipient);
            expect(result).toBe(true);
        });

        test('should handle channel closure', async () => {
            let channelClosed = false;
            channel.on('closed', () => {
                channelClosed = true;
            });

            await channel.cooperativeClose();
            
            expect(channelClosed).toBe(true);
            expect(channel.getChannelState().status).toBe('closed');
        });

        test('should update collateral', async () => {
            const additionalCollateral = 500n;
            await channel.updateCollateral(additionalCollateral);

            const state = channel.getChannelState();
            expect(state.collateral).toBe(initialBalance + additionalCollateral);
        });

        test('should check available capacity', () => {
            const capacity = channel.getAvailableCapacity('ETH', entity.getId());
            expect(capacity).toBe(initialBalance);

            // Set credit limit and check again
            channel.setCreditLimit('left', 200n);
            const newCapacity = channel.getAvailableCapacity('ETH', entity.getId());
            expect(newCapacity).toBe(initialBalance + 200n);
        });
    });

    describe('Integration Tests', () => {
        test('should handle full transaction flow', async () => {
            await server.start();

            // Create signers and entities
            const signer1 = await server.createSigner(randomBytes(8));
            const signer2 = await server.createSigner(randomBytes(8));
            const entity1 = await signer1.createEntity(randomBytes(8), false);
            const entity2 = await signer2.createEntity(randomBytes(8), false);

            // Set initial balances
            entity1.setBalance('ETH', 2000n);
            entity2.setBalance('ETH', 1000n);

            // Create channel
            const channel = await entity1.createChannel(entity2.getId(), 1000n);

            // Make payment
            const paymentResult = await channel.makePayment('ETH', 300n, entity2.getId());
            expect(paymentResult).toBe(true);

            // Check balances
            const balance = channel.getBalance('ETH') as { left: bigint; right: bigint };
            expect(balance.left).toBe(700n);
            expect(balance.right).toBe(300n);

            // Process blocks
            const blockHash = await server.processBlock();
            expect(blockHash).toBeInstanceOf(Buffer);
        });

        test('should maintain state consistency across block processing', async () => {
            await server.start();

            const signer = await server.createSigner(randomBytes(8));
            const entity = await signer.createEntity(randomBytes(8), false);
            entity.setBalance('ETH', 1000n);

            const initialStateRoot = server.getStateRoot();
            
            // Process several blocks
            for (let i = 0; i < 5; i++) {
                await server.processBlock();
            }

            // State should be consistent
            expect(entity.getBalance('ETH')).toBe(1000n);
            
            // State root should have changed due to block processing
            const finalStateRoot = server.getStateRoot();
            expect(finalStateRoot).not.toEqual(initialStateRoot);
        });
    });
});
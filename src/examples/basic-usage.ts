import XLNNode from '../index';
import { ConfigManager } from '../utils/config';

async function basicUsageExample() {
    console.log('=== XLN Basic Usage Example ===\n');

    // 1. Create and configure a node
    const config = new ConfigManager({
        id: 'example-node',
        host: 'localhost',
        port: 8080
    });

    const node = new XLNNode(config);

    try {
        // 2. Start the node
        console.log('Starting XLN node...');
        await node.start();

        // 3. Create a signer (wallet/identity)
        console.log('Creating signer...');
        const signer = await node.createTestSigner();
        console.log(`Signer created: ${signer.getId().toString('hex')}`);

        // 4. Create an entity (account abstraction)
        console.log('Creating entity...');
        const entity = await node.createTestEntity(signer.getId());
        console.log(`Entity created: ${entity.getId().toString('hex')}`);

        // 5. Set initial balance
        entity.setBalance('ETH', BigInt('1000000000000000000')); // 1 ETH
        console.log(`Entity balance: ${entity.getBalance('ETH')} wei`);

        // 6. Create a payment channel
        console.log('Creating payment channel...');
        const channel = await entity.createChannel(
            Buffer.from('peer-entity-id', 'hex').subarray(0, 8),
            BigInt('500000000000000000') // 0.5 ETH
        );
        console.log(`Channel created: ${channel.getId().toString('hex')}`);

        // 7. Make a payment through the channel
        console.log('Making payment...');
        const paymentResult = await channel.makePayment(
            'ETH',
            BigInt('100000000000000000'), // 0.1 ETH
            Buffer.from('recipient-address', 'hex').subarray(0, 32)
        );
        console.log(`Payment successful: ${paymentResult}`);

        // 8. Check channel balances
        const balance = channel.getBalance('ETH');
        console.log(`Channel balance:`, balance);

        // 9. Check node stats
        const stats = node.getMempool().getStatistics();
        console.log('Node statistics:', stats);

        // 10. Demonstrate API access
        console.log('\nAPI endpoints available:');
        console.log('- REST API: http://localhost:8080/api/v1/');
        console.log('- WebSocket: ws://localhost:8081/api/v1/ws');

        console.log('\nExample REST API calls:');
        console.log('- GET /api/v1/server/status');
        console.log('- GET /api/v1/server/stats');
        console.log('- POST /api/v1/signers');
        console.log('- POST /api/v1/entities');
        console.log('- POST /api/v1/channels');

        // Wait a bit to see some blocks
        console.log('\nWaiting for blocks...');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        console.log(`Current block number: ${node.getServer().getBlockNumber()}`);
    } catch (error) {
        console.error('Error during example:', error);
    } finally {
        // 11. Stop the node
        console.log('\nStopping XLN node...');
        await node.stop();
        console.log('Example completed!');
    }
}

async function channelPaymentExample() {
    console.log('\n=== Channel Payment Flow Example ===\n');

    const node = new XLNNode();

    try {
        await node.start();

        // Create two entities
        const signerA = await node.createTestSigner();
        const signerB = await node.createTestSigner();

        const entityA = await node.createTestEntity(signerA.getId());
        const entityB = await node.createTestEntity(signerB.getId());

        // Set initial balances
        entityA.setBalance('ETH', BigInt('2000000000000000000')); // 2 ETH
        entityB.setBalance('ETH', BigInt('1000000000000000000')); // 1 ETH

        console.log('Initial balances:');
        console.log(`Entity A: ${entityA.getBalance('ETH')} wei`);
        console.log(`Entity B: ${entityB.getBalance('ETH')} wei`);

        // Create channel between entities
        const channel = await entityA.createChannel(
            entityB.getId(),
            BigInt('1000000000000000000') // 1 ETH initial
        );

        console.log(`\nChannel created: ${channel.getId().toString('hex')}`);

        // Make multiple payments
        console.log('\nMaking payments...');

        for (let i = 1; i <= 3; i++) {
            const amount = BigInt('50000000000000000'); // 0.05 ETH
            const result = await channel.makePayment('ETH', amount, entityB.getId());
            console.log(`Payment ${i}: ${result ? 'Success' : 'Failed'} - ${amount} wei`);

            const balance = channel.getBalance('ETH');
            console.log(`  Channel balance:`, balance);
        }

        // Set credit limits
        console.log('\nSetting credit limits...');
        await channel.setCreditLimit('left', BigInt('200000000000000000')); // 0.2 ETH
        await channel.setCreditLimit('right', BigInt('100000000000000000')); // 0.1 ETH

        // Test payment with credit
        console.log('Testing payment with credit...');
        const creditPayment = await channel.makePayment(
            'ETH',
            BigInt('300000000000000000'), // 0.3 ETH (requires credit)
            entityB.getId()
        );
        console.log(`Credit payment: ${creditPayment ? 'Success' : 'Failed'}`);

        // Check available capacity
        const capacity = channel.getAvailableCapacity('ETH', entityA.getId());
        console.log(`Available capacity for Entity A: ${capacity} wei`);
    } catch (error) {
        console.error('Error during channel example:', error);
    } finally {
        await node.stop();
    }
}

async function merkleTreeExample() {
    console.log('\n=== Merkle Tree Example ===\n');

    const node = new XLNNode();

    try {
        await node.start();

        // Create some test data
        const signer = await node.createTestSigner();
        const entity = await node.createTestEntity(signer.getId());

        // Add some test entities and channels
        for (let i = 0; i < 5; i++) {
            const testEntity = await node.createTestEntity(signer.getId());
            testEntity.setBalance('ETH', BigInt(i * 1000000000000000000n)); // i ETH

            if (i > 0) {
                await testEntity.createChannel(entity.getId(), BigInt(500000000000000000n));
            }
        }

        // Process a block to update state
        await node.getServer().processBlock();

        console.log('Merkle tree visualization:');
        console.log('(This would show the hierarchical state structure)');

        const serverRoot = node.getServer().getStateRoot();
        console.log(`Server state root: ${serverRoot.toString('hex')}`);

        console.log('\nTree statistics would show:');
        console.log('- Number of signers');
        console.log('- Number of entities per signer');
        console.log('- Number of channels per entity');
        console.log('- Tree depth and branching factor');
    } catch (error) {
        console.error('Error during merkle tree example:', error);
    } finally {
        await node.stop();
    }
}

// Run examples if this file is executed directly
if (require.main === module) {
    (async () => {
        try {
            await basicUsageExample();
            await channelPaymentExample();
            await merkleTreeExample();
        } catch (error) {
            console.error('Example failed:', error);
            process.exit(1);
        }
    })();
}

export { basicUsageExample, channelPaymentExample, merkleTreeExample };

# XLN (Extended Lightning Network)

XLN is an innovative hierarchical blockchain architecture built on Ethereum that revolutionizes payment channel networks by solving the fundamental "inbound capacity problem" present in existing systems like Lightning Network and Raiden.

## 🚀 Key Features

- **Reserve-Credit System**: Combines collateral-based security with credit-based flexibility
- **Hierarchical Actor Model**: Five-layer machine architecture (Server → Signer → Entity → Channel/Depositary)
- **Configurable Merkle Trees**: Optimized state management capable of handling millions of channels
- **Multi-Party Swaps**: Intent-matching with atomic execution via HTLCs
- **Programmable Entities**: Account abstraction with governance capabilities

## 🎯 Performance Targets

- **Scalability**: 10M+ payment channels per hub
- **Speed**: 100ms block times for real-time processing
- **Efficiency**: 10M channels manageable in 100GB RAM
- **Throughput**: Minimal on-chain transactions through off-chain processing

## 📋 Prerequisites

- Node.js 18+
- TypeScript 5+
- npm or yarn

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd xln/v1

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## 🚦 Quick Start

```typescript
import XLNNode from './src/index';

async function quickStart() {
    // Create and start node
    const node = new XLNNode();
    await node.start();

    // Create signer and entity
    const signer = await node.createTestSigner();
    const entity = await node.createTestEntity(signer.getId());

    // Set balance and create channel
    entity.setBalance('ETH', BigInt('1000000000000000000')); // 1 ETH
    const channel = await entity.createChannel(
        peerEntityId, 
        BigInt('500000000000000000') // 0.5 ETH
    );

    // Make payment
    await channel.makePayment(
        'ETH', 
        BigInt('100000000000000000'), // 0.1 ETH
        recipientId
    );

    await node.stop();
}
```

## 🏗️ Architecture Overview

```
Server (Root Machine)
├── Signer Machines (Personal identity/wallet)
│   ├── Entity Machines (Organizational units)
│   │   ├── Channel Machines (Payment channels)
│   │   └── Depositary Machines (Asset bridges)
│   └── More Entities...
└── More Signers...
```

### Core Components

- **Server Machine**: Root-level orchestrator with 100ms block production
- **Signer Machine**: Identity management with cryptographic key handling
- **Entity Machine**: Account abstraction with multi-signature governance
- **Channel Machine**: Bilateral payment channels with reserve-credit system
- **Depositary Machine**: Bridge to external blockchains

## 🔧 Configuration

### Environment Variables

```bash
export XLN_SERVER_ID="xln-server-001"
export XLN_HOST="localhost"
export XLN_PORT="8080"
export XLN_STORAGE_PATH="./data"
export XLN_BLOCK_TIME="100"
```

### Configuration File

```yaml
# config.yaml
server:
  id: "xln-server-001"
  host: "localhost"
  port: 8080

storage:
  path: "./data"
  snapshotInterval: 100
  cacheSize: "1GB"

consensus:
  blockTime: 100ms
  proposalTimeout: 30s

limits:
  maxChannels: 10000000
  maxEntities: 100000
  maxBlockSize: "1MB"
```

## 📡 API Endpoints

### REST API

```
GET    /api/v1/server/status        # Server information
GET    /api/v1/server/stats         # Performance metrics
POST   /api/v1/signers              # Create new signer
GET    /api/v1/entities             # List entities
POST   /api/v1/entities             # Create entity
POST   /api/v1/channels             # Create channel
```

### WebSocket API

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8081/api/v1/ws');

// Create signer
ws.send(JSON.stringify({
    id: "1",
    method: "signer.create",
    params: { signerId: "..." }
}));

// Subscribe to events
ws.send(JSON.stringify({
    id: "2",
    method: "subscribe",
    params: { events: ["block", "payment", "channel"] }
}));
```

## 🧪 Development Scripts

```bash
# Development server with hot reload
npm run dev

# Build project
npm run build

# Run tests
npm test

# Run specific test
npm test -- -t "test name"

# Lint code
npm run lint

# Format code
npm run format

# Start production server
npm start
```

## 🗂️ Project Structure

```
src/
├── core/
│   ├── machines/          # Actor-based machine hierarchy
│   ├── state/            # Merkle tree and storage
│   └── transactions/     # Mempool, validation, execution
├── network/              # WebSocket & REST APIs
├── crypto/               # Cryptographic utilities
├── utils/                # Configuration, errors, constants
├── types/                # TypeScript type definitions
├── examples/             # Usage examples
└── index.ts              # Main XLNNode class

docs/                     # Complete technical specification
test/                     # Test suites
config/                   # Configuration files
scripts/                  # Build and deployment scripts
```

## 🔬 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Generate coverage report
npm run test:coverage
```

## 📊 Monitoring

The system provides comprehensive metrics:

- Transaction throughput and latency
- Channel statistics and capacity
- Memory usage and performance
- Block production timing
- Network connectivity

Access metrics at `/metrics` endpoint or through the WebSocket API.

## 🔐 Security

- BLS12-381 signature aggregation for consensus
- Keccak256 hashing (Ethereum compatible)
- Hierarchical deterministic key derivation
- Multi-signature entity governance
- Dispute resolution mechanisms

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

### Phase 1: MVP (Current)
- ✅ Core hierarchical machine architecture
- ✅ Basic reserve-credit system
- ✅ Single-signer entities
- ✅ Simple payment channels
- ✅ REST and WebSocket APIs

### Phase 2: Advanced Features
- Multi-signature consensus with BLS aggregation
- Payment channel networks with routing
- Swap mechanism with order books
- Performance optimizations

### Phase 3: Production Ready
- Security audits and hardening
- Mainnet deployment
- Developer SDK and tools
- Comprehensive documentation

## 🆘 Support

- Documentation: `/docs/XLN_SPECIFICATION.md`
- Examples: `/src/examples/`
- Issues: GitHub Issues
- Discussions: GitHub Discussions

## 🙏 Acknowledgments

- Inspired by Lightning Network and Raiden Network
- Built on Ethereum ecosystem standards
- Actor model implementation patterns
- Modern TypeScript and Node.js best practices
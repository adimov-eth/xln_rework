# Hierarchical Blockchain Architecture: Complete Technical Specification

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture Design](#architecture-design)
4. [Core Components](#core-components)
5. [Data Structures](#data-structures)
6. [Transaction System](#transaction-system)
7. [Consensus Mechanism](#consensus-mechanism)
8. [State Management](#state-management)
9. [Storage Architecture](#storage-architecture)
10. [Network Communication](#network-communication)
11. [Payment Channels](#payment-channels)
12. [Security Model](#security-model)
13. [Performance Optimizations](#performance-optimizations)
14. [Implementation Guidelines](#implementation-guidelines)
15. [API Specifications](#api-specifications)
16. [Testing Strategy](#testing-strategy)
17. [Deployment Considerations](#deployment-considerations)

## 1. Executive Summary

This specification describes a hierarchical blockchain architecture based on the Actor Model design pattern. The system enables scalable payment processing and multi-party interactions through a tree structure of autonomous machines that communicate via message passing.

### Key Features
- **Actor-based architecture** with hierarchical machine organization
- **Three machine types**: Entity, Channel, and Depositary
- **In-memory state management** with LevelDB persistence
- **Aggregated BLS signatures** for efficient consensus
- **Payment channel networks** for instant transactions
- **Swap functionality** with integrated order books

### Design Goals
- Support 10M+ payment channels per hub
- 100ms block times for real-time processing
- Minimize on-chain transactions through off-chain channels
- Enable complex multi-party business logic
- Maintain full auditability and security

## 2. System Overview

### 2.1 Conceptual Model

The system implements a hierarchical structure of "machines" (actors) that maintain their own state and communicate through standardized message interfaces:

```
Server (Root Machine)
├── Signer Machines (Personal identity/wallet)
│   ├── Entity Machines (Organizational units)
│   │   ├── Channel Machines (Payment channels)
│   │   └── Depositary Machines (Asset bridges)
│   └── More Entities...
└── More Signers...
```

### 2.2 Machine Types

#### 2.2.1 Server Machine
- Root-level orchestrator
- Routes messages between machines
- Maintains global state tree
- No consensus required (single instance)

#### 2.2.2 Signer Machine
- Represents individual identity
- Holds private keys
- Creates and signs transactions
- Parent to Entity machines

#### 2.2.3 Entity Machine
- Organizational/business logic container
- Can be single or multi-signature
- Manages proposals and voting
- Parent to Channels and Depositaries

#### 2.2.4 Channel Machine
- Bilateral payment channel
- Enables instant off-chain transfers
- Maintains dispute proofs
- No submachines (leaf node)

#### 2.2.5 Depositary Machine
- Bridge to external blockchains
- Manages asset deposits/withdrawals
- Interfaces with smart contracts
- No submachines (leaf node)

## 3. Architecture Design

### 3.1 Actor Model Implementation

Each machine follows actor principles:
- **Encapsulated state**: Private internal state
- **Message-based communication**: Async message passing
- **Location transparency**: Machines addressable by ID
- **Supervision hierarchy**: Parent machines supervise children

### 3.2 Message Flow Patterns

```
External Request → Server → Signer → Entity → Channel/Depositary
                                         ↓
                                    State Change
                                         ↓
Event ← Server ← Signer ← Entity ← Response
```

### 3.3 Block Structure

```javascript
Block = {
  previous_block: Hash,
  block_number: Integer,
  timestamp: Integer,
  transactions: RLP_encoded_mempool,
  state_hash: Hash,
  signatures: AggregatedSignature (optional)
}
```

## 4. Core Components

### 4.1 Transaction Types

#### 4.1.1 Input Transactions (TX In)
- From external users/systems
- Signed by initiating party
- Contains: from, to, nonce, data, signature

#### 4.1.2 Output Transactions (TX Out)
- To external systems/channels
- Multi-signed by validators
- Contains: same as input + aggregated signatures

#### 4.1.3 Event Messages
- Internal machine communication
- No signatures required (trusted environment)
- Guaranteed delivery within same node

### 4.2 State Components

#### 4.2.1 Machine State
```javascript
MachineState = {
  id: Buffer(32),
  type: Enum(server|signer|entity|channel|depositary),
  root: BlockHash,
  state: MerkleRoot,
  submachines: Map<ID, MachineReference>
}
```

#### 4.2.2 Entity State
```javascript
EntityState = {
  validators: Map<Address, ValidatorInfo>,
  proposals: Map<Hash, Proposal>,
  balances: Map<Asset, Amount>,
  channels: Map<ID, ChannelRoot>,
  orderbook: Map<AssetPair, OrderTree>,
  nonce: Integer
}
```

## 5. Data Structures

### 5.1 Merkle Tree Structure

The system uses a configurable Merkle Patricia Tree:
- **Nibble width**: 1-16 bits (default: 4 bits/hex)
- **Branch factor**: 2^nibble_width
- **Path encoding**: Machine IDs as paths
- **Lazy evaluation**: Hashes computed on flush

### 5.2 Storage Layout

```
Level 0: Server Root
├── Level 1: Signer Roots (by signer ID)
│   ├── Level 2: Entity Roots (by entity ID)
│   │   ├── Storage Type 0x01: Proposals
│   │   ├── Storage Type 0x02: Order books
│   │   ├── Storage Type 0x03: Channels
│   │   └── Storage Type 0x04: Validators
│   └── More entities...
└── More signers...
```

### 5.3 Address Scheme

Machine addresses are hierarchical 32-byte identifiers:
- Bytes 0-7: Server ID (usually 0)
- Bytes 8-15: Signer ID
- Bytes 16-23: Entity ID
- Bytes 24-31: Channel/Depositary ID

## 6. Transaction System

### 6.1 Transaction Lifecycle

1. **Receipt**: Transaction arrives via WebSocket/API
2. **Validation**: Check signatures, nonces, authorization
3. **Mempool**: Add to appropriate machine's mempool
4. **Processing**: Every 100ms, process mempools
5. **Execution**: Apply state changes
6. **Consensus**: Multi-sig entities require voting
7. **Finalization**: Update merkle tree, create receipts
8. **Propagation**: Send TX Out to next machines

### 6.2 Mempool Structure

```javascript
Mempool = {
  signer_transactions: Array<SignerTx>,
  entity_transactions: Array<EntityTx>,
  channel_messages: Array<ChannelMsg>
}
```

### 6.3 Transaction Prioritization

1. **Authorization level**: Server > Signer > Entity
2. **Transaction type**: Consensus > Channel > Regular
3. **Fee/priority**: Higher fees processed first
4. **FIFO**: Within same priority level

## 7. Consensus Mechanism

### 7.1 Single-Signer Entities

- No consensus required
- Immediate transaction execution
- Automatic block creation
- Direct state updates

### 7.2 Multi-Signer Entities

Based on simplified Tendermint:

1. **Proposal Phase**
   - Proposer creates block
   - Includes pending transactions
   - Broadcasts to validators

2. **Voting Phase**
   - Validators verify block
   - Sign block hash
   - Sign outgoing TX hashes
   - Return signatures to proposer

3. **Commit Phase**
   - Proposer aggregates signatures
   - Broadcasts final block
   - All nodes update state
   - Execute approved proposals

### 7.3 Proposal System

```javascript
Proposal = {
  id: Hash,
  type: Enum(transfer|addValidator|removeValidator|custom),
  data: Buffer,
  proposer: Address,
  votes: Map<Address, Signature>,
  created_at: Timestamp,
  expires_at: Timestamp
}
```

Execution when votes ≥ quorum threshold.

## 8. State Management

### 8.1 In-Memory State

All active state maintained in memory:
- JavaScript objects/maps
- Direct property access
- No serialization overhead
- Instant read/write

### 8.2 State Synchronization

1. **Dirty tracking**: Mark modified paths
2. **Lazy hashing**: Compute only on flush
3. **Batch updates**: Group changes
4. **Atomic commits**: All or nothing

### 8.3 State Recovery

On startup:
1. Load latest mutable snapshot
2. Apply blocks since snapshot
3. Reconstruct in-memory state
4. Resume normal operation

## 9. Storage Architecture

### 9.1 LevelDB Schema

```
Key Format: [prefix][machine_path][data_type][specific_key]
Value Format: RLP_encoded(data)

Examples:
- Server root: [0x00]
- Signer root: [0x00][signer_id]
- Entity state: [0x00][signer_id][entity_id][storage_type][key]
- Block by hash: [0x01][block_hash]
- Block by number: [0x02][block_number]
```

### 9.2 Snapshot System

#### 9.2.1 Mutable Snapshots
- Overwrite previous snapshot
- Store at fixed keys
- Enable fast startup
- Created every N blocks

#### 9.2.2 Immutable Snapshots
- Store by content hash
- Permanent archive
- Enable time travel
- Created periodically

### 9.3 Write Patterns

```javascript
// Batch write example
const batch = leveldb.batch();
batch.put(machine_key, encoded_root);
batch.put(block_key, encoded_block);
batch.put(snapshot_key, encoded_snapshot);
await batch.write();
```

## 10. Network Communication

### 10.1 Protocol Stack

1. **Transport**: WebSocket (primary), HTTP (fallback)
2. **Encoding**: RLP for efficiency
3. **Message Format**: `[type, sender, recipient, nonce, data, signature]`
4. **Routing**: Hierarchical ID-based

### 10.2 Message Types

```javascript
MessageType = Enum {
  // Transaction messages
  SIGNER_TRANSACTION: 0x01,
  ENTITY_TRANSACTION: 0x02,
  CHANNEL_MESSAGE: 0x03,
  
  // Consensus messages
  PROPOSE_BLOCK: 0x10,
  VOTE_BLOCK: 0x11,
  COMMIT_BLOCK: 0x12,
  
  // Channel protocol
  CHANNEL_UPDATE: 0x20,
  CHANNEL_ACK: 0x21,
  CHANNEL_CLOSE: 0x22,
  
  // System messages
  PING: 0x30,
  PONG: 0x31,
  SYNC_REQUEST: 0x32,
  SYNC_RESPONSE: 0x33
}
```

### 10.3 Inter-Machine Communication

Local machines (same server):
- Direct memory references
- Synchronous execution
- No network overhead

Remote machines:
- WebSocket connections
- Async message passing
- Automatic reconnection

## 11. Payment Channels

### 11.1 Channel Lifecycle

1. **Creation**
   - Entities agree on channel
   - Initial deposits allocated
   - Channel ID generated

2. **Operation**
   - Off-chain balance updates
   - Signed state transitions
   - Instant payments

3. **Settlement**
   - Cooperative close preferred
   - Dispute mechanism available
   - On-chain settlement fallback

### 11.2 Channel State

```javascript
ChannelState = {
  id: ChannelID,
  participants: [AddressA, AddressB],
  balances: Map<Asset, {A: Amount, B: Amount}>,
  nonce: Integer,
  status: Enum(ready|pending|closing|closed),
  latest_block: BlockHash,
  dispute_window: Duration
}
```

### 11.3 Payment Routing

Multi-hop payments using HTLCs:

```
A → B → C → D
  ↓   ↓   ↓
 ch1 ch2 ch3

1. D generates secret, shares hash
2. A locks payment to B (hashlock)
3. B locks payment to C (same hash)
4. C locks payment to D (same hash)
5. D reveals secret, claims from C
6. C uses secret, claims from B
7. B uses secret, claims from A
```

### 11.4 Capacity Management

```javascript
ChannelCapacity = {
  outgoing: Amount,      // Can send
  incoming: Amount,      // Can receive
  pending_out: Amount,   // Locked outgoing
  pending_in: Amount     // Locked incoming
}
```

## 12. Security Model

### 12.1 Cryptographic Primitives

- **Signatures**: BLS12-381 for aggregation
- **Hashing**: Keccak256 (Ethereum compatible)
- **Encryption**: Optional ChaCha20-Poly1305
- **Key Derivation**: BIP32/BIP44 compatible

### 12.2 Access Control

1. **IP Tokens**: Server-level access
2. **Signatures**: Transaction authorization
3. **Quorum**: Multi-sig entity control
4. **Timeouts**: Automatic proposal expiry

### 12.3 Threat Mitigation

#### 12.3.1 Double Spending
- Nonce tracking per account
- Atomic state updates
- Channel sequence numbers

#### 12.3.2 Eclipse Attacks
- Multiple hub connections
- Diverse network paths
- Consensus verification

#### 12.3.3 Griefing
- Minimum deposit requirements
- Fee mechanisms
- Rate limiting

### 12.4 Dispute Resolution

Channel disputes follow established Lightning Network patterns:
1. Attempt cooperative close
2. Submit latest signed state
3. Challenge period for counter-claims
4. On-chain settlement after timeout

## 13. Performance Optimizations

### 13.1 Memory Management

- **Pre-allocation**: Reserve memory pools
- **Object pooling**: Reuse common structures
- **Lazy loading**: Load data on demand
- **Cache strategies**: LRU for hot data

### 13.2 Batch Processing

```javascript
// Process multiple channels in one pass
async function batchChannelUpdates(updates) {
  const affected = new Map();
  
  // Group by entity
  for (const update of updates) {
    const entity = getEntity(update.channel);
    if (!affected.has(entity)) {
      affected.set(entity, []);
    }
    affected.get(entity).push(update);
  }
  
  // Process each entity once
  for (const [entity, entityUpdates] of affected) {
    await entity.processChannelBatch(entityUpdates);
  }
}
```

### 13.3 Parallelization

- **Actor isolation**: Independent execution
- **Read-write separation**: Concurrent reads
- **Pipeline stages**: Overlap I/O and compute
- **Worker threads**: CPU-intensive tasks

### 13.4 Network Optimization

- **Message batching**: Combine small messages
- **Compression**: LZ4 for large payloads
- **Binary protocols**: Avoid JSON overhead
- **Connection pooling**: Reuse WebSockets

## 14. Implementation Guidelines

### 14.1 Code Structure

```
project/
├── src/
│   ├── server.js       # Server and signer logic
│   ├── entity.js       # Entity consensus, proposals
│   ├── channel.js      # Channel state machine
│   ├── depositary.js   # External blockchain interface
│   ├── storage.js      # LevelDB, snapshots
│   ├── network.js      # WebSocket, messaging
│   ├── crypto.js       # Signatures, hashing
│   └── types.js        # Common data structures
├── test/
├── bench/
└── docs/
```

### 14.2 Development Phases

#### Phase 1: Core Infrastructure
- Basic server/signer machines
- In-memory state management
- Simple transaction processing
- LevelDB integration

#### Phase 2: Entity Logic
- Proposal system
- Single-signer entities
- State persistence
- Basic API

#### Phase 3: Consensus
- Multi-sig entities
- BLS aggregation
- Block production
- Validation logic

#### Phase 4: Channels
- Channel creation/closing
- Balance updates
- Dispute proofs
- Simple routing

#### Phase 5: Advanced Features
- Multi-hop payments
- Order book swaps
- External bridges
- Performance optimization

### 14.3 Testing Requirements

- **Unit tests**: 90%+ coverage
- **Integration tests**: Full scenarios
- **Stress tests**: 10K+ channels
- **Fuzzing**: Random input generation

## 15. API Specifications

### 15.1 WebSocket API

```javascript
// Connection
ws://localhost:8080/api

// Message format
{
  "id": "unique-request-id",
  "method": "method_name",
  "params": {...},
  "token": "auth_token"
}

// Methods
- server.info
- signer.create
- entity.create
- entity.propose
- entity.vote
- channel.open
- channel.update
- channel.close
- depositary.deposit
- depositary.withdraw
```

### 15.2 HTTP API (REST)

```
GET  /api/v1/server/status
GET  /api/v1/signers
POST /api/v1/signers
GET  /api/v1/entities/:id
POST /api/v1/entities/:id/proposals
POST /api/v1/entities/:id/proposals/:pid/vote
GET  /api/v1/channels/:id
POST /api/v1/channels/:id/update
```

### 15.3 Response Format

```javascript
{
  "id": "request-id",
  "result": {...} | null,
  "error": {
    "code": -32000,
    "message": "Error description",
    "data": {...}
  } | null
}
```

## 16. Testing Strategy

### 16.1 Test Categories

1. **Unit Tests**
   - Individual function testing
   - Mock dependencies
   - Edge case coverage

2. **Integration Tests**
   - Multi-machine scenarios
   - Consensus rounds
   - Channel operations

3. **Performance Tests**
   - Transaction throughput
   - Memory usage
   - Latency measurements

4. **Chaos Tests**
   - Network partitions
   - Machine failures
   - Byzantine behavior

### 16.2 Test Infrastructure

```javascript
// Example test setup
describe('Entity Consensus', () => {
  let server, signers, entity;
  
  beforeEach(async () => {
    server = new Server();
    signers = await createSigners(server, 3);
    entity = await createMultiSigEntity(signers, 2); // 2-of-3
  });
  
  it('should achieve consensus on valid proposal', async () => {
    const proposal = await entity.propose({
      type: 'transfer',
      amount: 100,
      recipient: 'address'
    });
    
    await signers[0].vote(proposal.id, true);
    await signers[1].vote(proposal.id, true);
    
    expect(proposal.status).toBe('executed');
  });
});
```

## 17. Deployment Considerations

### 17.1 Hardware Requirements

#### Minimum (Development)
- CPU: 2 cores
- RAM: 4GB
- Storage: 50GB SSD
- Network: 100Mbps

#### Recommended (Production Hub)
- CPU: 16+ cores
- RAM: 128GB
- Storage: 2TB NVMe
- Network: 10Gbps

### 17.2 Operational Procedures

1. **Deployment**
   - Docker containers
   - Kubernetes orchestration
   - Health monitoring
   - Auto-scaling

2. **Backup Strategy**
   - Continuous snapshots
   - Off-site replication
   - Point-in-time recovery
   - Encrypted archives

3. **Monitoring**
   - Transaction metrics
   - Channel statistics
   - Consensus health
   - Resource usage

### 17.3 Configuration

```yaml
# config.yaml
server:
  id: "hub-001"
  host: "0.0.0.0"
  port: 8080
  
storage:
  path: "/data/leveldb"
  snapshot_interval: 1000
  cache_size: "10GB"
  
consensus:
  block_time: 100ms
  proposal_timeout: 30s
  
limits:
  max_channels: 10000000
  max_entities: 100000
  max_block_size: "1MB"
```

## Conclusion

This specification defines a comprehensive blockchain architecture that combines the benefits of:
- **Hierarchical organization** for scalability
- **Actor model** for clean separation of concerns
- **Payment channels** for instant transactions
- **Flexible consensus** for different trust models

The system is designed to handle millions of payment channels while maintaining security, auditability, and performance suitable for real-world financial applications.
Below is a short specification outlining our Merkle DB implementation:
• Structure & Node Types
 – The tree is built in a purely functional style with immutable updates and clear, segregated responsibilities.
 – There are several node types organized in a strict hierarchy:
  ∘ Server Node: The root node containing signer nodes.
  ∘ Signer Node: Contains entity nodes related to a particular signer.
  ∘ Entity Node: Contains the storage node (or values) that represent entity state.
  ∘ Storage Node: Holds actual data as a mapping from keys (e.g., StorageType) to Buffer values.
• Path Encoding & Identification
 – Paths are stored as hex strings with a nibble count prefix (two hex digits) to mark the number of significant nibbles.
 – This ensures precise routing and correct handling of keys at every tree level.
• Branches & Splitting
 – Initially, nodes store values in a flat map. When a node’s value count reaches the configurable leafThreshold (e.g., 16), it is split into branches.
 – The splitting leverages a configurable bitWidth (default 4 bits) to extract a "chunk" from the key’s path.
 – Each branch (child node) is indexed by its chunk value, forming a branching structure that allows for efficient navigation and updates.
 – When splitting, values are redistributed into child nodes based on their next “chunk” of the key.
• Data Updates & Integrity
 – Updating an entity state involves:
  ∘ Creating or fetching the appropriate signer and entity nodes.
  ∘ Converting and encoding the state (using RLP for block data) into a storage value.
  ∘ Recursively setting the node value, triggering splits if a node grows too large.
 – Each update invalidates the parent node’s hash so that a full hash recomputation can maintain integrity.
• Hashing & Verification
 – The hash for each node is computed using SHA-256 over deterministic, sorted children or values.
 – Branch nodes are hashed by iterating over sorted child indices, ensuring that any change propagates up to the Merkle root.
• Logging & Testing
 – Debug logs are inserted at strategic points (e.g., node creation, branching/splitting, state updates) to ease testing and verification.
 – The implementation supports LevelDB-style batch updates, catering to efficient financial data operations while keeping side-effects controlled.
This specification sets the foundation for a robust, verifiable Merkle tree tailored to financial systems with clear branch management and auditability.


# Merkle Tree System

## Overview
The Merkle tree implementation provides efficient state management with configurable parameters for optimizing performance and memory usage.

## Configuration
```typescript
interface TreeConfig {
  bitWidth: number;      // 1-16 bits per chunk (default: 4)
  leafThreshold: number; // 1-1024 entries before splitting (default: 16)
}
```

## Key Features

## Tree Layers
- Signer Layer (4-bit nibbles)
- Entity Layer (4-bit nibbles)
- Storage Layer (8-bit nibbles)

## Optimizations
- Configurable nibble sizes
- Padding flags in control bytes
- Separate trees per storage type
- Memory overlays for pending state

## Performance Targets
- Support 10k+ signers efficiently
- Handle 10k+ entities per signer
- Manage 1M+ channels per entity

### Node Structure
- Branch nodes with dynamic children
- Leaf nodes with value maps
- Automatic splitting based on threshold
- Hash caching for performance

### Path Processing
- Configurable bit width for path chunks
- Efficient path traversal
- Reduced logging verbosity for recursive operations

### Visualization
- ASCII tree representation
- Node type identification (Branch/Leaf)
- Value count display
- Truncated hash display

## Performance Considerations
- Leaf threshold affects tree depth and query performance
- Bit width impacts branching factor
- Hash caching reduces redundant calculations
- Path chunk size affects memory usage

## Usage Example
```typescript
const store = createMerkleStore({ 
  bitWidth: 4, 
  leafThreshold: 16 
});

store.updateEntityState(signerId, entityId, {
  status: 'idle',
  entityPool: new Map(),
  finalBlock: {
    blockNumber: 0,
    storage: { value: 0 },
    channelRoot: Buffer.from([]),
    channelMap: new Map(),
    inbox: []
  }
});
```

## Testing
- Reduced test data (10 signers, 10 entities each)
- Random operations for state changes
- Full tree verification
- Visual progress tracking

## Known Limitations
- Maximum bit width of 16
- Maximum leaf threshold of 1024
- Path processing overhead for deep trees 


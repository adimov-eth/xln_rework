# XLN: Extended Lightning Network on Ethereum

## Introduction

XLN is an innovative blockchain solution built on Ethereum, designed to enhance payment channel networks by addressing limitations in existing systems like Lightning Network and Raiden. Traditional channel networks suffer from the "inbound capacity problem," where strict collateral lockup requirements hinder new user onboarding and limit scalability. XLN overcomes this through a reserve-credit system, combining collateral-based security with credit-based flexibility, enabling efficient, secure, and scalable off-chain transactions.

The architecture is rooted in a hierarchical state machine model inspired by the actor model, featuring:
- A dual-input/output interface for transactions and events.
- A layered submachine structure for modularity and scalability.
- Multi-signature validation for secure, distributed state changes.

This brief outlines the system's architecture, key components, and technical details, drawing from the latest specifications to provide a cohesive overview.

## Architecture Overview

XLN's architecture comprises five primary components that interact within a hierarchical, layered framework:

### Key Components

1. **Servers**: Root machines for each user, responsible for:
   - Aggregating messages every 100ms into blocks.
   - Coordinating with signers for transaction signatures.
   - Forming Merkle trees from finalized blocks.
   - Distributing messages to other servers.
   - Acting as a routing and state organization layer without inter-server consensus.

2. **Signers**: Parent machines managing private keys and entity states:
   - Store private keys and sign transactions.
   - Act as intermediaries between servers and entities.
   - Participate in entity-level consensus (e.g., DAOs).

3. **Entities**: Account abstractions representing:
   - Personal or company wallets (e.g., DAOs).
   - Payment hubs, exchanges, or decentralized applications.
   - Handle business logic and state changes via proposals and quorum approvals.

4. **Channels**: Bilateral state machines for direct entity-to-entity communication:
   - Replicated within participating entities.
   - Enable off-chain transactions with global settlement.

5. **Depositories**: Smart contracts managing:
   - Reserve balances.
   - Channel operations.
   - Dispute resolution.

### Layered Structure

The system employs a three-layer architecture:
1. Base Layer: Depository contract for core payment channel mechanics.
2. Programmability Layer: SubcontractProvider for custom payment conditions (e.g., HTLCs, swaps).
3. Governance Layer: EntityProvider for programmable control via multi-signature boards.

This separation ensures modularity, allowing complex financial instruments and governance structures to be built atop a secure foundation.

## Reserve-Credit System

The reserve-credit system is XLN's cornerstone, addressing the inbound capacity problem by blending collateral and credit.

### Core Components

1. **Reserves**: Tokens committed to the Depository, providing security and flexibility:
   - Can be converted to channel collateral.
   - Used to settle debts upon channel closure.

2. **Collateral**: Locked tokens within channels:
   - Offers immediate transaction liquidity.
   - Protects against malicious behavior.

3. **Credit Limits**: Extend transaction capacity beyond collateral:
   - Set independently by each party.
   - Enable trust-based relationships akin to traditional credit lines.

4. **Channel State**: Tracked via:
   - `ondelta`: Permanent state changes (e.g., deposits).
   - `offdelta`: Temporary state changes (e.g., payments).
   - `collateral`: Total locked tokens.
   - `leftCreditLimit` & `rightCreditLimit`: Credit extended by each party.

### Transaction Flow

1. **Setup**: Users deposit tokens into reserves, allocate collateral to channels, and set credit limits.
2. **Payments**:
   - Utilize available collateral first.
   - Consume credit when collateral is exhausted.
   - Total capacity = collateral + ownCreditLimit + peerCreditLimit.
3. **Settlement**:
   - Cooperative closure or dispute resolution determines final state.
   - Collateral is distributed, and unpaid credit becomes debt settled from reserves.

### Advantages

- Capital Efficiency: Less locked capital, higher transaction volumes.
- Security: Collateral-backed payments with dispute resolution.
- Scalability: Off-chain processing with batched settlement.

## Entity System

Entities are programmable state machines managing accounts and interactions.

### State Management

**Structure**:
- Each entity maintains its own state, stored in Merkle trees.
- State changes require proposals and quorum approval from signers.

**Merkle Storage**:
- Multi-layer trees with configurable nibble sizes (e.g., 4-bit for signers/entities, 8-bit for storage).
- Supports 10k+ signers, 10k+ entities per signer, and 1M+ channels per entity.

### Governance

**Board-Based Validation**:
- Entities are governed by boards with configurable voting thresholds.
- Supports nested entities (e.g., DAOs) with recursive signature verification.
- Cycle detection prevents infinite loops.

### Types

Entities can represent:
- Wallets (personal or organizational).
- Hubs/exchanges for payment routing.
- Applications with custom logic.

## Merkle Tree Optimization

XLN uses configurable Merkle trees for efficient state management.

### Design

- Configurable Bit Width: 1-16 bits per path chunk (default: 4-bit nibbles).
- Dynamic Node Splitting: Nodes split when exceeding a threshold (default: 16 entries).
- Layers:
  1. Signer Layer: 4-bit nibbles.
  2. Entity Layer: 4-bit nibbles.
  3. Storage Layer: 8-bit nibbles.

### Performance Targets

- Support 10k+ signers.
- Handle 10k+ entities per signer.
- Sub-50ms path lookups, <1ms node splits.

### Optimizations

- Hash caching reduces redundant calculations.
- Lazy updates minimize overhead.
- Padding flags ensure nibble alignment.

## Channels and Swaps

Channels enable direct, scalable interactions between entities.

### Channel Design

- Submachines: Operate within entities for local-first operations.
- State Tracking: Maintain balances and commitments via ondelta and offdelta.
- Settlement: Global verification ensures consistency.

### Swap Mechanism

- Intent Matching: Entities match swap intents (e.g., token exchanges).
- Execution: Atomic cross-channel swaps using hash timelock contracts (HTLCs).
- Safety: Cryptographic proofs handle timeouts and disputes.

## Implementation Details

### State Management

- In-Memory Operations: JSON objects handle large-scale operations (e.g., 10M channels in 100GB RAM).
- Snapshots:
  - Mutable: Updated every 100 blocks for quick recovery.
  - Immutable: Archived by hash for historical simulation.
- Storage: LevelDB with RLP encoding for efficiency.

### Transaction Processing

**Flow**:
1. Servers aggregate messages into transaction maps.
2. Signers create and sign blocks.
3. Entities execute approved proposals.

**Format**: Includes sender, receiver, nonce, data, and signatures.

### Security

- Initial: API tokens for MVP authorization.
- Future: Full cryptographic verification with aggregated signatures.

### Development vs. Production

- Development Mode: Full logging, time-travel debugging.
- Production Mode: Optimized storage, essential state only.

## Development and Scaling Strategy

XLN adopts a conservative approach to ensure trust and correctness:

- Focus: Basic asset transfers first, expanding to complex features.
- Code Division:
  - Core Primitives (~2000 LOC): State machines, validation, consensus.
  - Infrastructure (~3000 LOC): Storage, networking, APIs.
- Principles: Pure functions for core logic, minimal classes for services.

## Conclusion

XLN introduces transformative innovations:
- A reserve-credit system solving the inbound capacity problem.
- A hierarchical, programmable architecture for flexible governance and scalability.
- Optimized state management via configurable Merkle trees.
- A secure, auditable implementation prioritizing correctness.

This design positions XLN as a robust platform for next-generation decentralized financial applications, combining payment channel scalability with Ethereum's programmability. Future enhancements may include credit scoring, multi-party swaps, and cross-chain integration, further expanding its potential.

This brief synthesizes the latest technical specifications, providing a complete and self-contained overview of XLN's design and capabilities.
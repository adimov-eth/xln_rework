# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XLN (Extended Lightning Network) v1 - A hierarchical blockchain architecture built on Ethereum that revolutionizes payment channel networks by solving the "inbound capacity problem". The system uses a novel reserve-credit mechanism and hierarchical actor model.

## Key Commands

### Development
```bash
bun dev              # Run with auto-reload
bun run build        # Build to dist/
bun run typecheck    # Type check without emitting
```

### Testing
```bash
bun test             # Run all tests
bun test:watch       # Run tests in watch mode
bun test:coverage    # Run tests with coverage
bun test:unit        # Run unit tests only
bun test:integration # Run integration tests only
```

### Code Quality
```bash
bun run lint         # Check linting errors
bun run lint:fix     # Auto-fix linting errors
bun run format       # Format code with Prettier
bun run format:check # Check formatting
```

### Documentation
```bash
bun run docs         # Generate TypeDoc documentation
```

## Architecture

### Hierarchical Actor Model (5 Layers)
1. **Server** - Top-level coordinator, manages signers
2. **Signer** - BLS signer handling entities, enables multi-sig
3. **Entity** - User identity, manages channels
4. **Channel** - Payment channel between entities
5. **Depositary** - Token storage linked to entities

### Core Concepts
- **Reserve-Credit System**: Novel approach where channels have both reserve (collateral) and credit (spending power)
- **100ms Block Times**: Near real-time transaction processing
- **Merkle Trees**: Configurable depth (16-32) for state management
- **BLS Aggregation**: Efficient multi-signature support

### Communication
- **WebSocket**: Real-time bidirectional communication
- **REST API**: Standard HTTP endpoints for queries
- **RLP Encoding**: Ethereum-compatible message serialization

## Development Guidelines

### File Organization
- `/src/core/` - Core business logic (entities, channels, merkle trees)
- `/src/network/` - WebSocket and REST API implementations
- `/src/storage/` - Persistence layer (RocksDB integration)
- `/src/crypto/` - Cryptographic utilities
- `/src/types/` - TypeScript type definitions

### Testing Strategy
- Unit tests for all core logic
- Integration tests for network interactions
- Performance tests for merkle operations and signature aggregation
- Target: 10M+ channels, 100k+ TPS

### Performance Targets
- Block time: 100ms
- Channel operations: <10ms
- Merkle proof generation: <1ms
- Signature aggregation: <5ms for 100 signatures

## Critical Implementation Notes

1. **State Management**: All state changes must go through the merkle tree system
2. **Consensus**: Implement BFT consensus for multi-signer setups
3. **Security**: Use Keccak256 for hashing, secp256k1/BLS for signatures
4. **Concurrency**: Design for high concurrent channel operations
5. **Error Recovery**: Implement rollback mechanisms for failed transitions

## Resources

- Full specification: `/docs/XLN_SPECIFICATION.md`
- Planning documents: `/drafts/`
- Ethereum compatibility: Use RLP encoding, Keccak256 hashing
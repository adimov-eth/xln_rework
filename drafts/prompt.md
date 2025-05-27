<legacy>

outdated Project Description
XLN is an implementation of Extended Lightning Network on top of Ethereum.

Send, trade, borrow and lend any ERC20 token instantly paying no gas-fees.

Channels, being the oldest and simplest to implement layer2 technology, are some of the least used ones. Lightning Network has less TVL lower than a medium sized DeFi project on ETH. Raiden (essentially Lightning Network on ETH) has $420 TVL on mainnet after more than 2 years on mainnet.

Why is that? Do we even correctly understand channels?
I don't think the failure should be attributed to the developing teams or their marketing efforts, instead I claim the one and only reason failure of channel networks failure is its strict collateral lockup requirements, also known as "inbound capacity problem".

Under original no-tradeoff LN architecture a new user cannot onboard without making a hub to commit some collateral to their relationship. The incentives are just not there for this to happen.

Solution: credit lines
I propose to solve it using a similar approach rollups currently use for instant confirmation: a fractional reserve-based promise aka credit line given by the hub/operator to the end user, that the assets will be collateralized in the future (in case of XLN) or the tx will be included in the batch (in case of rollups).

Instead of being collateral-only XLN channels allow any user to open a credit line to other user up to specific credit limit. This alleviates the "no route/capacity" problem of original LN/Raiden.

Why would we still benefit from channel networks when we have rollups being ready?
scalability of XLN is unbounded by onchain gaslimits, i.e. there is no necessary per-tx onchain footprint. You only sync heavily unbalanced channels to L1, and a million of $1 payments can remain entirely offchain as long as they net-out each other to zero.
In other words XLN can survive with expensive CALLDATA (e.g. on Ethereum Classic) and/or low gaslimits per block, while rollups will continuously require cheap CALLDATA and further L1 block gaslimit increase to scale

channels have perfect data availability because they sync current L2 state to L1 state, while rollups simply flush L2 history to L1 history as CALLDATA. There is no hard proof that re-genesis tricks on ETH or other EVM chains won't destroy historical CALLDATA at some point.

while rollups are fully EVM generalized, payment channels support paying/swapping/borrowing and lending (using Rainbow idea) and those are probably 90% of L1 use cases at the moment.

</legacy>

<quick_summary>
# Ethereum Lightning Network: Architecture and Reserve-Credit Model

## Overview and Core Innovations
This Lightning Network (LN) implementation for Ethereum represents a significant advancement in payment channel networks by introducing programmable functionality and flexible capacity management. The system combines off-chain scalability with the programmable capabilities of Ethereum smart contracts to enable sophisticated financial instruments and governance structures.

## Key Architectural Components

### 1. Programmable Subcontracts
The subcontract system enables complex payment conditions within payment channels, supporting various DeFi applications:

- Hash Time Locked Contracts (HTLCs) for atomic swaps and cross-chain transactions
- Credit Default Swaps with external triggers
- Programmable payment schedules and conditional payments
- Token swaps and liquidity provision within channels

The SubcontractProvider contract serves as both a registry and executor for these payment conditions, allowing new financial instruments to be added without modifying the core protocol.

### 2. Programmable Entities
The EntityProvider contract introduces sophisticated governance capabilities that allow channels to be controlled by complex organizational structures rather than simple private keys. This enables:

- Multi-signature control of channels
- DAO-like governance structures
- Delegated control and hierarchical permissions
- Dynamic voting thresholds and stakeholder structures

For example, a channel could be governed by a DAO where token holders vote on operations, or by a federated group with weighted voting rights.

### 3. Layered Architecture
The system implements a three-layer architecture:

1. Base Layer: Depository contract managing core payment channel mechanics
2. Programmability Layer: SubcontractProvider enabling custom payment conditions
3. Governance Layer: EntityProvider enabling programmable control

This structure maintains separation of concerns while enabling complex compositions of functionality.

## The Reserve-Credit Model

### Core Components
The system implements an innovative reserve-credit model that combines multiple balance components:

#### Reserves
- Tokens committed to the Depository contract
- Provide underlying security for channel operations
- Can be moved between channels as needed

#### Collateral
- Portion of reserves locked into specific channels
- Provides base capacity for making payments
- Directly backs payment obligations

#### Credit Limits
- Allow payments beyond collateral amounts
- Establish trust relationships between parties
- Similar to lines of credit in traditional finance

### Balance Calculation
The deriveDelta function calculates payment capacities using these key formulas:

```typescript
    // Calculate total net transfer in channel
    const delta = d.ondelta + d.offdelta;
    const collateral = nonNegative(d.collateral);
    // Calculate collateral distribution
    let inCollateral = delta > 0n ? nonNegative(collateral - delta) : collateral;
    let outCollateral = delta > 0n ? (delta > collateral ? collateral : delta) : 0n;
    // Calculate credit utilization
    let inOwnCredit = nonNegative(-delta);
    if (inOwnCredit > ownCreditLimit) inOwnCredit = ownCreditLimit;
    let outPeerCredit = nonNegative(delta - collateral);
    if (outPeerCredit > peerCreditLimit) outPeerCredit = peerCreditLimit;
```


### Payment Flow
Payments follow a waterfall structure:

1. First utilize available collateral
2. Then consume credit limit if needed
3. Total capacity = collateral + available credit

This creates bidirectional payment channels with:

- Forward Capacity = user's collateral + counterparty's credit limit
- Backward Capacity = counterparty's collateral + user's credit limit
- Dynamic rebalancing as payments flow

### State Visualization
The system includes an innovative ASCII visualization showing:

```
[-------------------====================--------------------]
     Credit Limit       Collateral        Credit Limit
                           |
                     Current Balance
```


This helps users understand:
- Balance position relative to total capacity
- Available collateral and its utilization
- Credit limits in both directions
- Overall channel state

## Benefits and Applications
The combination of programmable contracts and the reserve-credit model provides several key advantages:

### Scalability
- Moves most transactions off-chain
- Maintains security through eventual settlement
- Efficient capacity utilization

### Programmability
- Complex financial instruments within channels
- DeFi functionality without on-chain transactions
- Extensible contract system

### Flexibility
- Dynamic capacity through credit limits
- Complex organizational control structures
- Adaptable trust relationships

### Security
- Collateral-backed payments
- Programmable governance
- Clear separation of concerns

This architecture provides a foundation for building sophisticated financial applications that combine the scalability benefits of payment channels with the programmability of Ethereum smart contracts. It's particularly well-suited for DeFi applications requiring high throughput while maintaining complex payment conditions and governance structures.

The careful balance between on-chain and off-chain execution, combined with the flexible reserve-credit model, creates a powerful platform for next-generation decentralized financial applications.

</quick_summary>

<legacy_code>
// SPDX-License-Identifier: unknown
pragma solidity ^0.8.24;


import "./ECDSA.sol";
import "./console.sol";
import "hardhat/console.sol";

import "./EntityProvider.sol";

import "./SubcontractProvider.sol";

// Add necessary interfaces
interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
}
interface IERC721 {
  function transferFrom(address from, address to, uint256 tokenId) external;
}
interface IERC1155 {
  function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}
contract Depository is Console {

  mapping (address entity => mapping (uint tokenId => uint)) public _reserves;

  mapping (bytes channelKey => ChannelInfo) public _channels;
  mapping (bytes channelKey => mapping(uint tokenId => ChannelCollateral)) public _collaterals; 
  

  mapping (address entity => mapping (uint tokenId => Debt[])) public _debts;
  // the current debt index to pay
  mapping (address entity => mapping (uint tokenId => uint)) public _debtIndex;
  // total number of debts of an entity
  mapping (address entity => uint) public _activeDebts;


  struct Hub {
    address addr;
    uint gasused;
    string uri;
  }
  Hub[] public _hubs;
  
  event TransferReserveToCollateral(address indexed receiver, address indexed addr, uint collateral, int ondelta, uint tokenId);
  event DisputeStarted(address indexed sender, address indexed peer, uint indexed disputeNonce, bytes initialArguments);
  event CooperativeClose(address indexed sender, address indexed peer, uint indexed cooperativeNonce);
  
  //event ChannelUpdated(address indexed receiver, address indexed addr, uint tokenId);


  // Token type identifiers
  uint8 constant TypeERC20 = 0;
  uint8 constant TypeERC721 = 1;
  uint8 constant TypeERC1155 = 2;   




  bytes32[] public _tokens;

  constructor() {
    _tokens.push(bytes32(0));
    
    // empty record, hub_id==0 means not a hub
    _hubs.push(Hub({
      addr: address(0),
      uri: '',
      gasused: 0
    }));
  }
  
  function getTokensLength() public view returns (uint) {
    return _tokens.length;
  }





  struct Batch {
    // tokens move Token <=> Reserve <=> Collateral
    // but never Token <=> Collateral. 'reserve' acts as an intermediary balance
    ReserveToExternalToken[] reserveToExternalToken;
    ExternalTokenToReserve[] externalTokenToReserve;

    // don't require a signature
    ReserveToReserve[] reserveToReserve;
    ReserveToCollateral[] reserveToCollateral;

    // cooperativeUpdate and cooperativeProof are always signed by the peer
    CooperativeUpdate[] cooperativeUpdate;
    CooperativeDisputeProof[] cooperativeDisputeProof;

    // initialDisputeProof is signed by the peer, but could be outdated
    // another peer has time to respond with a newer proof
    InitialDisputeProof[] initialDisputeProof;
    FinalDisputeProof[] finalDisputeProof;


    TokenAmountPair[] flashloans;

    //bytes32[] revealSecret;
    //bytes32[] cleanSecret;
    uint hub_id;
  }


  /*
  function processBatch(bytes calldata encodedBatch, bytes calldata encodedEntity) public returns (bool completeSuccess) {
    address entityAddress = msg.sender;
    if (encodedEntity.length > 0) {
      (address entityProviderAddress, 
      uint entityId, 
      bytes memory entitySignature) = abi.decode(encodedEntity, (address, uint, bytes));

      log("Entity", entityProviderAddress);
      require(EntityProvider(entityProviderAddress).isValidSignature(
        keccak256(encodedBatch),
        entityId,
        entitySignature,
        bytes[]) > 0);

      bytes memory fullEntity = abi.encode(entityProviderAddress, entityId);

      entityAddress = address(keccak256(bytes32(fullEntity)));


    } else {
      log("No entity, fallback to msg.sender");
      
    }

    return _processBatch(entityAddress, abi.decode(encodedBatch, (Batch)));
  }
  */

  function processBatch(Batch calldata batch) public returns (bool completeSuccess) {
    return _processBatch(msg.sender, batch);
  }

  function _processBatch(address entityAddress, Batch memory batch) private returns (bool completeSuccess) {
    uint startGas = gasleft();

    // the order is important: first go methods that increase entity's balance
    // then methods that deduct from it

    completeSuccess = true; 


    /*
    // flashloans allow to settle batch of cooperativeUpdate
    for (uint i = 0; i < batch.flashloans.length; i++) {
      _reserves[msg.sender][batch.flashloans[i].tokenId] += batch.flashloans[i].amount;
    }

    for (uint i = 0; i < batch.flashloans.length; i++) {
      // fails if not enough _reserves 
      _reserves[entityAddress][batch.flashloans[i].tokenId] -= batch.flashloans[i].amount;
    }
    */
    
    for (uint i = 0; i < batch.cooperativeUpdate.length; i++) {
      if(!(cooperativeUpdate(batch.cooperativeUpdate[i]))){
        completeSuccess = false;
      }
    }
    for (uint i = 0; i < batch.cooperativeDisputeProof.length; i++) {
      if(!(cooperativeDisputeProof(batch.cooperativeDisputeProof[i]))){
        completeSuccess = false;
      }
    }

    //submitProof (Header / proofbody)

    for (uint i = 0; i < batch.initialDisputeProof.length; i++) {
      if(!(initialDisputeProof(batch.initialDisputeProof[i]))){
        completeSuccess = false;
      }
    }

    for (uint i = 0; i < batch.finalDisputeProof.length; i++) {
      if(!(finalDisputeProof(batch.finalDisputeProof[i]))){
        completeSuccess = false;
      }
    }

    
    for (uint i = 0; i < batch.reserveToCollateral.length; i++) {
      if(!(reserveToCollateral(batch.reserveToCollateral[i]))){
        completeSuccess = false;
      }
    }
    
    /*
    for (uint i = 0; i < batch.revealSecret.length; i++) {
      revealSecret(batch.revealSecret[i]);
    }

    for (uint i = 0; i < batch.cleanSecret.length; i++) {
      cleanSecret(batch.cleanSecret[i]);
    }*/

    // increase gasused for hubs
    // this is hardest to fake metric of real usage
    if (batch.hub_id != 0 && msg.sender == _hubs[batch.hub_id].addr){
      _hubs[batch.hub_id].gasused += startGas - gasleft();
    }

    return completeSuccess;
    
  }

  
  enum MessageType {
    CooperativeUpdate,
    CooperativeDisputeProof,
    DisputeProof
  }

  struct TokenAmountPair {
    uint tokenId;
    uint amount;
  }

  struct AddrAmountPair {
    address addr;
    uint amount;
  }

  struct ReserveToCollateral {
    uint tokenId;
    address receiver;
    // put in _channels with who (addr) and how much (amount)
    AddrAmountPair[] pairs;
  }

  struct Diff {
    uint tokenId;
    int peerReserveDiff;
    int collateralDiff;
    int ondeltaDiff;
  }

  struct CooperativeUpdate {
    address peer;
    Diff[] diffs;
    uint[] forgiveDebtsInTokenIds;
    bytes sig; 
  }





  struct Allowence {
    uint deltaIndex;
    uint rightAllowence;
    uint leftAllowence;
  }
  struct SubcontractClause {
    address subcontractProviderAddress;
    bytes encodedBatch;
    Allowence[] allowences;
  }

  struct ProofBody{
    int[] offdeltas;
    uint[] tokenIds;
    SubcontractClause[] subcontracts;
  }

  struct CooperativeDisputeProof {
    address peer;
    ProofBody proofbody;
    bytes initialArguments;
    bytes finalArguments;
    bytes sig;
  }

  struct InitialDisputeProof {
    address peer;
    uint cooperativeNonce;
    uint disputeNonce;
    bytes32 proofbodyHash; 
    bytes sig;

    bytes initialArguments;
  }

  struct FinalDisputeProof {
    address peer;
    uint initialCooperativeNonce;
    uint initialDisputeNonce;
    uint disputeUntilBlock;
    bytes32 initialProofbodyHash;
    bytes initialArguments;
    bool startedByLeft;

    uint finalCooperativeNonce;
    uint finalDisputeNonce;
    ProofBody finalProofbody;
    bytes finalArguments;

    bytes sig;
  }

  struct Debt {
    uint amount;
    address creditor;
  }
  
  struct ChannelCollateral {
    // total amount of collateral locked in the channel for this token
    uint collateral;
    // when Left +=/-= .collateral, do the same operation to .ondelta
    int ondelta;   
  }

  struct ChannelInfo{
    // TODO: we could possibly store all channel state as a single hash
    // and provide it with every request as CALLDATA to save gas
    // but unilateral reserveToCollateral would become tricky

    // used for cooperativeUpdate and cooperative close, stored forever
    uint cooperativeNonce;

    // dispute state is stored after dispute is started
    bytes32 disputeHash;
  }
  

  function packTokenReference(uint8 tokenType, address contractAddress, uint96 externalTokenId) public pure returns (bytes32) {
    require(tokenType <= 255);

    // Pack the contractAddress into the most significant 160 bits
    bytes32 packed = bytes32(uint256(uint160(contractAddress)) << 96);

    // Pack the tokenId into the next 96 bits
    packed |= bytes32(uint256(externalTokenId) << 8);

    // Pack the tokenType into the least significant 8 bits
    packed |= bytes32(uint256(tokenType));

    return packed;
  }

  function unpackTokenReference(bytes32 packed) public pure returns (address contractAddress, uint96 externalTokenId, uint8 tokenType) {
    // Unpack the contractAddress from the most significant 160 bits
    contractAddress = address(uint160(uint256(packed) >> 96));

    // Unpack the externalTokenId from the next 96 bits
    externalTokenId = uint96((uint256(packed) >> 8) & 0xFFFFFFFFFFFFFFFFFFFFFF);

    // Unpack the tokenType from the least significant 8 bits
    tokenType = uint8(uint256(packed) & 0xFF);

    return (contractAddress, externalTokenId, tokenType);
  }





  function registerHub(uint hub_id, string memory new_uri) public returns (uint) {
    if (hub_id == 0) {
      _hubs.push(Hub({
        addr: msg.sender,
        uri: new_uri,
        gasused: 0
      }));
      return _hubs.length - 1;
    } else {
      require(msg.sender == _hubs[hub_id].addr);
      _hubs[hub_id].uri = new_uri;
      return hub_id;
    }
  }

  struct ExternalTokenToReserve{
    bytes32 packedToken;
    uint internalTokenId;
    uint amount;
  }
  function externalTokenToReserve(ExternalTokenToReserve memory params) public {
    if (params.internalTokenId == 0) {
      // create new token
      _tokens.push(params.packedToken);
      params.internalTokenId = _tokens.length - 1;

      //console.log("Saved new token:", params.internalTokenId);
    } else {
      params.packedToken = _tokens[params.internalTokenId];
      //require(_tokens[params.internalTokenId] == params.packedToken, "Token data mismatch");
    }


    (address contractAddress, uint96 tokenId, uint8 tokenType) = unpackTokenReference(params.packedToken);
    //console.log('unpackedToken ', contractAddress,tokenId,  tokenType);

    // todo: allow longer uint256 tokenId for ERC721 and ERC1155 
    // e.g. Rarible has format of 0xCreatorAddress..00000TokenId
    if (tokenType == TypeERC20) {
      //console.log("20", contractAddress, msg.sender, address(this));

      require(IERC20(contractAddress).transferFrom(msg.sender, address(this), params.amount), "Fail");
    } else if (tokenType == TypeERC721) {
      // 721 does not return bool on transfer
      IERC721(contractAddress).transferFrom(msg.sender, address(this), uint(tokenId));
    } else if (tokenType == TypeERC1155) {
      IERC1155(contractAddress).safeTransferFrom(msg.sender, address(this), uint(tokenId), params.amount, "");
    }

    _reserves[msg.sender][params.internalTokenId] += params.amount;
  }


  struct ReserveToExternalToken{
    address receiver;
    uint tokenId;
    uint amount;
  }
  function reserveToExternalToken(ReserveToExternalToken memory params) public {
    enforceDebts(msg.sender, params.tokenId);

    (address contractAddress, uint96 tokenId, uint8 tokenType) = unpackTokenReference(_tokens[params.tokenId]);
    //console.log('unpackedToken ', contractAddress,tokenId,  tokenType);

    require(_reserves[msg.sender][params.tokenId] >= params.amount, "Not enough reserve");

    _reserves[msg.sender][params.tokenId] -= params.amount;

    if (tokenType == TypeERC20) {
      require(IERC20(contractAddress).transfer(params.receiver, params.amount));
    } else if (tokenType == TypeERC721) {
      IERC721(contractAddress).transferFrom(address(this), params.receiver, uint(tokenId));
    } else if (tokenType == TypeERC1155) {
      IERC1155(contractAddress).safeTransferFrom(address(this), params.receiver, uint(tokenId), params.amount, "");
    }

  }
  struct ReserveToReserve{
    address receiver;
    uint tokenId;
    uint amount;
  }
  function reserveToReserve(ReserveToReserve memory params) public {
    enforceDebts(msg.sender, params.tokenId);

    require(_reserves[msg.sender][params.tokenId] >= params.amount);
    _reserves[msg.sender][params.tokenId] -= params.amount;
    _reserves[params.receiver][params.tokenId] += params.amount;
  }




  
  function getDebts(address addr, uint tokenId) public view returns (Debt[] memory allDebts, uint currentDebtIndex) {
    currentDebtIndex = _debtIndex[addr][tokenId];
    allDebts = _debts[addr][tokenId];
  }


  // triggered automatically before every reserveTo{Reserve/ChannelCollateral/PackedToken}
  // can be called manually
  // iterates over _debts starting from current _debtIndex, first-in-first-out 
  // max _debts?
  function enforceDebts(address addr, uint tokenId) public returns (uint totalDebts) {
    uint debtsLength = _debts[addr][tokenId].length;
    if (debtsLength == 0) {
      return 0;
    }
   
    uint memoryReserve = _reserves[addr][tokenId]; 
    uint memoryDebtIndex = _debtIndex[addr][tokenId];
    
    if (memoryReserve == 0){
      return debtsLength - memoryDebtIndex;
    }
    // allow partial enforcing in case there are too many _debts to pay off at once (over block gas limit)
    while (true) {
      Debt storage debt = _debts[addr][tokenId][memoryDebtIndex];
      
      if (memoryReserve >= debt.amount) {
        // can pay this debt off in full
        memoryReserve -= debt.amount;
        _reserves[debt.creditor][tokenId] += debt.amount;

        delete _debts[addr][tokenId][memoryDebtIndex];

        // last debt was paid off, the entity is debt free now
        if (memoryDebtIndex+1 == debtsLength) {
          memoryDebtIndex = 0;
          // resets .length to 0
          delete _debts[addr][tokenId]; 
          debtsLength = 0;
          break;
        }
        memoryDebtIndex++;
        _activeDebts[addr]--;
        
      } else {
        // pay off the debt partially and break the loop
        _reserves[debt.creditor][tokenId] += memoryReserve;
        debt.amount -= memoryReserve;
        memoryReserve = 0;
        break;
      }
    }

    // put memory variables back to storage
    _reserves[addr][tokenId] = memoryReserve;
    _debtIndex[addr][tokenId] = memoryDebtIndex;
    
    return debtsLength - memoryDebtIndex;
  }



  function channelKey(address a1, address a2) public pure returns (bytes memory) {
    //determenistic channel key is 40 bytes: concatenated lowerKey + higherKey
    return a1 < a2 ? abi.encodePacked(a1, a2) : abi.encodePacked(a2, a1);
  }
  

  

  function reserveToCollateral(ReserveToCollateral memory params) public returns (bool completeSuccess) {
    uint tokenId = params.tokenId;
    address receiver = params.receiver;
   
    // debts must be paid before any transfers from reserve 
    enforceDebts(msg.sender, tokenId);

    for (uint i = 0; i < params.pairs.length; i++) {
      address addr = params.pairs[i].addr;
      uint amount = params.pairs[i].amount;

      bytes memory ch_key = channelKey(params.receiver, addr);

      logChannel(params.receiver, addr);

      if (_reserves[msg.sender][tokenId] >= amount) {
        ChannelCollateral storage col = _collaterals[ch_key][tokenId];

        _reserves[msg.sender][tokenId] -= amount;
        col.collateral += amount;
        if (params.receiver < addr) { // if receiver is left
          col.ondelta += int(amount);
        }

        emit TransferReserveToCollateral(receiver, addr, col.collateral, col.ondelta, tokenId);

        log("Deposited to channel ", _collaterals[ch_key][tokenId].collateral);
      } else {
        log("Not enough funds", msg.sender);
        return false;
      }
      logChannel(params.receiver, addr);

    }


    return true;
  }




  // mutually agreed update of channel state in a single atomic operation
  function cooperativeUpdate(CooperativeUpdate memory params) public returns (bool) {
    bytes memory ch_key = channelKey(msg.sender, params.peer);

    bytes memory encoded_msg = abi.encode(MessageType.CooperativeUpdate, 
    ch_key, 
    _channels[ch_key].cooperativeNonce, 
    params.diffs, 
    params.forgiveDebtsInTokenIds);

    bytes32 hash = ECDSA.toEthSignedMessageHash(keccak256(encoded_msg));

    log('Encoded msg', encoded_msg);
    
    if(params.peer != ECDSA.recover(hash, params.sig)) {
      log("Invalid signer ", ECDSA.recover(hash, params.sig));
      return false;
    }


    for (uint i = 0; i < params.diffs.length; i++) {
      Diff memory diff = params.diffs[i];

      if (diff.peerReserveDiff < 0) {
        enforceDebts(params.peer, diff.tokenId);
        require(_reserves[params.peer][diff.tokenId] >= uint(-diff.peerReserveDiff), "Not enough peer reserve");

        _reserves[params.peer][diff.tokenId] -= uint(-diff.peerReserveDiff);
      } else {
        _reserves[params.peer][diff.tokenId] += uint(diff.peerReserveDiff);
      }


      // ensure that the entity has enough funds to apply the diffs
      int totalDiff = diff.peerReserveDiff + diff.collateralDiff;
      if (totalDiff > 0) {
        enforceDebts(msg.sender, diff.tokenId);
        // if the sender is sending funds, they must have them
        require(_reserves[msg.sender][diff.tokenId] >= uint(totalDiff), "Not enough sender reserve");

        _reserves[msg.sender][diff.tokenId] -= uint(totalDiff);
      } else {
        // sender is receiving
        _reserves[msg.sender][diff.tokenId] += uint(-totalDiff);
      }


      if (diff.collateralDiff < 0) {
        require(_collaterals[ch_key][diff.tokenId].collateral >= uint(-diff.collateralDiff), "Not enough collateral");
        _collaterals[ch_key][diff.tokenId].collateral -= uint(diff.collateralDiff);
      } else {
        _collaterals[ch_key][diff.tokenId].collateral += uint(diff.collateralDiff);
      }

      // ondeltaDiff can be arbitrary
      _collaterals[ch_key][diff.tokenId].ondelta += diff.ondeltaDiff;
    }
    _channels[ch_key].cooperativeNonce++;

    logChannel(msg.sender, params.peer);
    return true;
  }


 



  // returns tokens to _reserves based on final deltas and _collaterals
  // then increases cooperativeNonce to invalidate all previous dispute proofs

  // todo: private visability
  function finalizeChannel(address entity1, 
      address entity2, 
      ProofBody memory proofbody, 
      bytes memory arguments1, 
      bytes memory arguments2) public returns (bool) 
  {
    address leftAddress;
    address rightAddress;
    bytes memory leftArguments;
    bytes memory rightArguments;
    if (entity1 < entity2) {
      leftAddress = entity1;
      rightAddress = entity2;
      leftArguments = arguments1;
      rightArguments = arguments2;
    } else {
      leftAddress = entity2;
      rightAddress = entity1;    
      leftArguments = arguments2;
      rightArguments = arguments1;
    }

    bytes memory ch_key = abi.encodePacked(leftAddress, rightAddress);

    logChannel(leftAddress, rightAddress);

    // 1. create deltas (ondelta+offdelta) from proofbody
    int[] memory deltas = new int[](proofbody.offdeltas.length);
    for (uint i = 0;i<deltas.length;i++){
      deltas[i] = _collaterals[ch_key][proofbody.tokenIds[i]].ondelta + int(proofbody.offdeltas[i]);
    }
    
    // 2. process subcontracts and apply to deltas
    bytes[] memory decodedLeftArguments = abi.decode(leftArguments, (bytes[]));
    bytes[] memory decodedRightArguments = abi.decode(rightArguments, (bytes[]));

    for (uint i = 0; i < proofbody.subcontracts.length; i++){
      SubcontractClause memory sc = proofbody.subcontracts[i];
      
      // todo: check gas usage
      int[] memory newDeltas = SubcontractProvider(sc.subcontractProviderAddress).applyBatch(
        deltas, 
        sc.encodedBatch, 
        decodedLeftArguments[i],
        decodedRightArguments[i]
      );

      // sanity check 
      if (newDeltas.length != deltas.length) continue;

      // iterate over allowences and apply to new deltas if they are respected
      for (uint j = 0; j < sc.allowences.length; j++){
        Allowence memory allowence = sc.allowences[j];
        int difference = newDeltas[allowence.deltaIndex] - deltas[allowence.deltaIndex];
        if ((difference > 0 && uint(difference) > allowence.rightAllowence) || 
          (difference < 0 && uint(-difference) > allowence.leftAllowence) || 
          difference == 0){
          continue;
        }
        console.log("Update delta");
        console.logInt(deltas[allowence.deltaIndex]);
        console.logInt(newDeltas[allowence.deltaIndex]);
        deltas[allowence.deltaIndex] = newDeltas[allowence.deltaIndex];
      
      }
    }    

    // 3. split _collaterals
    for (uint i = 0;i<deltas.length;i++){
      uint tokenId = proofbody.tokenIds[i];
      int delta = deltas[i];
      ChannelCollateral storage col = _collaterals[ch_key][tokenId];

      if (delta >= 0 && uint(delta) <= col.collateral) {
        // collateral is split between entities
        _reserves[leftAddress][tokenId] += uint(delta);
        _reserves[rightAddress][tokenId] += col.collateral - uint(delta);
      } else {
        // one entity gets entire collateral, another pays credit from reserve or gets debt
        address getsCollateral = delta < 0 ? rightAddress : leftAddress;
        address getsDebt = delta < 0 ? leftAddress : rightAddress;
        uint debtAmount = delta < 0 ? uint(-delta) : uint(delta) - col.collateral;
        _reserves[getsCollateral][tokenId] += col.collateral;
        
        log('gets debt', getsDebt);
        log('debt', debtAmount);

        if (_reserves[getsDebt][tokenId] >= debtAmount) {
          // will pay right away without creating Debt
          _reserves[getsCollateral][tokenId] += debtAmount;
          _reserves[getsDebt][tokenId] -= debtAmount;
        } else {
          // pay what they can, and create Debt
          if (_reserves[getsDebt][tokenId] > 0) {
            _reserves[getsCollateral][tokenId] += _reserves[getsDebt][tokenId];
            debtAmount -= _reserves[getsDebt][tokenId];
            _reserves[getsDebt][tokenId] = 0;
          }
          _debts[getsDebt][tokenId].push(Debt({
            creditor: getsCollateral,
            amount: debtAmount
          }));
          _activeDebts[getsDebt]++;
        }
      }

      delete _collaterals[ch_key][tokenId];
    }


    delete _channels[ch_key].disputeHash;

    _channels[ch_key].cooperativeNonce++;
   
    logChannel(leftAddress, rightAddress);

    return true;

  }

  function cooperativeDisputeProof (CooperativeDisputeProof memory params) public returns (bool) {
    bytes memory ch_key = channelKey(msg.sender, params.peer);


    console.log("Received proof");
    console.logBytes32(keccak256(abi.encode(params.proofbody)));
    console.logBytes32(keccak256(params.initialArguments));

    bytes memory encoded_msg = abi.encode(
      MessageType.CooperativeDisputeProof, 
      ch_key, 
      _channels[ch_key].cooperativeNonce,
      keccak256(abi.encode(params.proofbody)),
      keccak256(params.initialArguments)
    );

    bytes32 hash = keccak256(encoded_msg);


    bytes32 final_hash = ECDSA.toEthSignedMessageHash(keccak256(encoded_msg));

    require(ECDSA.recover(final_hash, params.sig) == params.peer);

    require(_channels[ch_key].disputeHash == bytes32(0));

    delete _channels[ch_key].disputeHash;

    finalizeChannel(msg.sender, params.peer, params.proofbody, params.finalArguments, params.initialArguments);
    
    emit CooperativeClose(msg.sender, params.peer, _channels[ch_key].cooperativeNonce);
  }


  function initialDisputeProof(InitialDisputeProof memory params) public returns (bool) {
    bytes memory ch_key = channelKey(msg.sender, params.peer);

    // entities must always hold a dispute proof with cooperativeNonce equal or higher than the one in the contract
    require(_channels[ch_key].cooperativeNonce <= params.cooperativeNonce);

    bytes memory encoded_msg = abi.encode(MessageType.DisputeProof, 
      ch_key, 
      params.cooperativeNonce, 
      params.disputeNonce, 
      params.proofbodyHash);

    bytes32 final_hash = ECDSA.toEthSignedMessageHash(keccak256(encoded_msg));

    log('encoded_msg',encoded_msg);

    require(ECDSA.recover(final_hash, params.sig) == params.peer, "Invalid signer");

    require(_channels[ch_key].disputeHash == bytes32(0));

    bytes memory encodedDispute = abi.encodePacked(params.cooperativeNonce,
      params.disputeNonce, 
      msg.sender < params.peer, // is started by left
      block.number + 20,
      params.proofbodyHash, 
      keccak256(abi.encodePacked(params.initialArguments)));

    _channels[ch_key].disputeHash = keccak256(encodedDispute);
    emit DisputeStarted(msg.sender, params.peer, params.disputeNonce, params.initialArguments);
  }

  function finalDisputeProof(FinalDisputeProof memory params) public returns (bool) {
    bytes memory ch_key = channelKey(msg.sender, params.peer);
    // verify the dispute was started

    bytes memory encodedDispute = abi.encodePacked(params.initialCooperativeNonce,
      params.initialDisputeNonce, 
      params.startedByLeft, 
      params.disputeUntilBlock,
      params.initialProofbodyHash, 
      keccak256(params.initialArguments));
    
    require(_channels[ch_key].disputeHash == keccak256(encodedDispute), "Dispute not found");

    if (params.sig.length != 0) {
      // counter proof was provided
      bytes32 finalProofbodyHash = keccak256(abi.encode(params.finalProofbody));
      bytes memory encoded_msg = abi.encode(MessageType.DisputeProof, 
        ch_key, 
        params.finalCooperativeNonce, 
        params.finalDisputeNonce, 
        finalProofbodyHash);

      bytes32 final_hash = ECDSA.toEthSignedMessageHash(keccak256(encoded_msg));
      log('encoded_msg',encoded_msg);
      require(ECDSA.recover(final_hash, params.sig) == params.peer, "Invalid signer");

      // TODO: if nonce is same, Left one's proof is considered valid

      require(params.initialDisputeNonce < params.finalDisputeNonce, "New nonce must be greater");

      
    } else {
      // counterparty agrees or does not respond 
      bool senderIsCounterparty = params.startedByLeft != msg.sender < params.peer;
      require(senderIsCounterparty || (block.number >= params.disputeUntilBlock), "Dispute period ended");
      require(params.initialProofbodyHash == keccak256(abi.encode(params.finalProofbody)), "Invalid proofbody");
    }
    

    finalizeChannel(msg.sender, params.peer, params.finalProofbody, params.finalArguments, params.initialArguments);
  

    return true;
  }







  struct TokenReserveDebts {
    uint reserve;
    uint debtIndex;
    Debt[] debts;
  }
  
  struct UserReturn {
    uint ETH_balance;
    TokenReserveDebts[] tokens;
  }

  struct ChannelReturn{
    ChannelInfo channel;
    ChannelCollateral[] collaterals;
  }
  
  
  // return users with reserves in provided tokens
  function getUsers(address[] memory addrs, uint[] memory tokenIds) external view returns (UserReturn[] memory response) {
    response = new UserReturn[](addrs.length);
    for (uint i = 0;i<addrs.length;i++){
      address addr = addrs[i];
      response[i] = UserReturn({
        ETH_balance: addr.balance,
        tokens: new TokenReserveDebts[](tokenIds.length)
      });
    
      for (uint j = 0;j<tokenIds.length;j++){
        response[i].tokens[j]= TokenReserveDebts({
          reserve: _reserves[addr][tokenIds[j]],
          debtIndex: _debtIndex[addr][tokenIds[j]],
          debts: _debts[addr][tokenIds[j]]
        });
      }
    }
    
    return response;
  }
  
  // get many _channels around one address, with collaterals in provided tokens
  function getChannels(address  addr, address[] memory peers, uint[] memory tokenIds) public view returns (ChannelReturn[] memory response) {
    bytes memory ch_key;

    // set length of the response array
    response = new ChannelReturn[](peers.length);

    for (uint i = 0;i<peers.length;i++){
      ch_key = channelKey(addr, peers[i]);

      response[i]=ChannelReturn({
        channel: _channels[ch_key],
        collaterals: new ChannelCollateral[](tokenIds.length)
      });

      for (uint j = 0;j<tokenIds.length;j++){
        response[i].collaterals[j]=_collaterals[ch_key][tokenIds[j]];
      }      
    }
    return response;    
  }

  /*

  function getAllHubs () public view returns (Hub[] memory) {
    return _hubs;
  }
  function getAllTokens () public view returns (bytes32[] memory) {
    return _tokens;
  }
  


  function createDebt(address addr, address creditor, uint tokenId, uint amount) public {
    _debts[addr][tokenId].push(Debt({
      creditor: creditor,
      amount: amount
    }));
  }
  */


  function logChannel(address a1, address a2) public {
    /*
    bytes memory ch_key = channelKey(a1, a2);
    log(">>> Logging channel", ch_key);
    log("cooperativeNonce", _channels[ch_key].cooperativeNonce);
    log("disputeHash", _channels[ch_key].disputeHash);

    for (uint i = 0; i < _tokens.length; i++) {
      log("Token", _tokens[i]);
      log("Left:", _reserves[a1][i]);
      log("Right:", _reserves[a2][i]);
      log("collateral", _collaterals[ch_key][i].collateral);
      log("ondelta", _collaterals[ch_key][i].ondelta);
    }*/
  }       

  function onERC1155Received(
      address operator,
      address from,
      uint256 id,
      uint256 value,
      bytes calldata data
  )
      external
      returns(bytes4)
  {
    return this.onERC1155Received.selector;
  }


}


pragma solidity ^0.8.24;

import "./Token.sol";

contract EntityProvider { 
  struct Entity {

    address tokenAddress;
    string name;

    bytes32 currentBoardHash;
    bytes32 proposedAuthenticatorHash;
  }

  struct Delegate {
    bytes entityId;
    uint16 votingPower;
  }

  struct Board {
    uint16 votingThreshold;
    Delegate[] delegates;
  }

  Entity[] public entities;

  mapping (bytes32 => Entity) public entityMap;
  mapping (uint => uint) public activateAtBlock;


/**
   * @notice Verifies the entity signed _hash, 
     returns uint16: 0 when invalid, or ratio of Yes to Yes+No.
   */
  function isValidSignature(
    bytes32 _hash,
    bytes calldata entityParams,
    bytes calldata encodedEntityBoard,
    bytes calldata encodedSignature,
    bytes32[] calldata entityStack
  ) external view returns (uint16) {

    bytes32 boardHash = keccak256(encodedEntityBoard);

    if (boardHash == bytes32(entityParams)) {
      // uses static board
    } else {
      // uses dynamic board
      require(boardHash == entities[uint(bytes32(entityParams))].currentBoardHash);
    }

    Board memory board = abi.decode(encodedEntityBoard, (Board));
    bytes[] memory signatures = abi.decode(encodedSignature, (bytes[]));


    uint16 voteYes = 0;
    uint16 voteNo = 0;

    for (uint i = 0; i < board.delegates.length; i += 1) {
      Delegate memory delegate = board.delegates[i];

      if (delegate.entityId.length == 20) {
        // EOA address
        address addr = address(uint160(uint256(bytes32(delegate.entityId))));

        /*if (addr == recoverSigner(_hash, signatures[i])) {
          voteYes += delegate.votingPower;
        } else {
          voteNo += delegate.votingPower;
        }*/

      } else {
        // if entityId already exists in stack - recursive, add it to voteYes
        bool recursive = false;
        bytes32 delegateHash = keccak256(delegate.entityId);

        for (uint i2 = 0; i2 < entityStack.length; i2 += 1) {
          if (entityStack[i2] == delegateHash) {
            recursive = true;
            break;
          }
        }

        if (recursive) {
          voteYes += delegate.votingPower;
          continue;
        }


        (address externalEntityProvider, bytes memory externalEntityId) = abi.decode(delegate.entityId, (address, bytes));

        // decode nested signatures
        (bytes memory nestedBoard, bytes memory nestedSignature) = abi.decode(signatures[i], (bytes, bytes) );

        /*

        if (EntityProvider(externalEntityProvider).isValidSignature(
          _hash,
          externalEntityId,
          nestedBoard,
          nestedSignature,
          entityStack
        ) > uint16(0)) {
          voteYes += delegate.votingPower;
        } else {
          voteNo += delegate.votingPower;
        }*/
        // 

      }
      // check if address is in board
    }

    uint16 votingResult = voteYes / (voteYes + voteNo);
    if (votingResult < board.votingThreshold) {
      return 0;
    } else {
      return votingResult;
    }

  }

  function proposeBoard(bytes memory entityId, bytes calldata proposedAuthenticator, bytes[] calldata tokenHolders, bytes[] calldata signatures) public {
    for (uint i = 0; i < tokenHolders.length; i += 1) {

      /* check depositary
      require(
        Token(bytesToAddress(tokenHolders[i])).balanceOf(bytesToAddress(entityId)) > 0,
        "EntityProvider#proposeBoard: token holder does not own any tokens"
      );
      require(
        Token(bytesToAddress(tokenHolders[i])).isValidSignature(
          keccak256(proposedAuthenticator),
          signatures[i]
        ),
        "EntityProvider#proposeBoard: token holder did not sign the proposed board"
      );
      */
    }


    entities[uint(bytes32(entityId))].proposedAuthenticatorHash = keccak256(proposedAuthenticator);


  }

  function activateAuthenticator(bytes calldata entityId) public {
    uint id = uint(bytes32(entityId));
    activateAtBlock[id] = block.number;
    entities[id].currentBoardHash = entities[id].proposedAuthenticatorHash;
  }

  function bytesToAddress(bytes memory bys) private pure returns (address addr) {
      assembly {
        addr := mload(add(bys,20))
      } 
  }
 /**
   * @notice Recover the signer of hash, assuming it's an EOA account
   * @dev Only for EthSign signatures
   * @param _hash       Hash of message that was signed
   * @param _signature  Signature encoded as (bytes32 r, bytes32 s, uint8 v)
   */
   function recoverSigner(
    bytes32 _hash,
    bytes memory _signature
) internal pure returns (address signer) {
    require(_signature.length == 65, "SignatureValidator#recoverSigner: invalid signature length");

    // Extracting v, r, and s from the signature
    uint8 v = uint8(_signature[64]);
    bytes32 r;
    bytes32 s;

    // Assembly code to extract r and s
    assembly {
        // Load the first 32 bytes of the _signature array, skip the first 32 bytes
        r := mload(add(_signature, 32))
        // Load the next 32 bytes of the _signature array
        s := mload(add(_signature, 64))
    }

    // Check the signature recovery id (v) and adjust for Ethereum chain id
    if (v < 27) {
        v += 27;
    }

    require(v == 27 || v == 28, "SignatureValidator#recoverSigner: invalid signature 'v' value");

    // Perform ECDSA signature recovering
    signer = ecrecover(_hash, v, r, s);
    require(signer != address(0), "SignatureValidator#recoverSigner: INVALID_SIGNER");

    return signer;
  }
   /*
  function recoverSigner(
    bytes32 _hash,
    bytes memory _signature
  ) internal pure returns (address signer) {
    require(_signature.length == 65, "SignatureValidator#recoverSigner: invalid signature length");

    // Variables are not scoped in Solidity.
    uint8 v = uint8(_signature[64]);
    //bytes32 r = _signature.readBytes32(0);
    //bytes32 s = _signature.readBytes32(32);

    // Assembly code to extract r and s
    assembly {
        // Load the first 32 bytes of the _signature array, skip the first 32 bytes
        r := mload(add(_signature, 32))
        // Load the next 32 bytes of the _signature array
        s := mload(add(_signature, 64))
    }

    // EIP-2 still allows signature malleability for ecrecover(). Remove this possibility and make the signature
    // unique. Appendix F in the Ethereum Yellow paper (https://ethereum.github.io/yellowpaper/paper.pdf), defines
    // the valid range for s in (281): 0 < s < secp256k1n ÷ 2 + 1, and for v in (282): v ∈ {27, 28}. Most
    // signatures from current libraries generate a unique signature with an s-value in the lower half order.
    //
    // If your library generates malleable signatures, such as s-values in the upper range, calculate a new s-value
    // with 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - s1 and flip v from 27 to 28 or
    // vice versa. If your library also generates signatures with 0/1 for v instead 27/28, add 27 to v to accept
    // these malleable signatures as well.
    //
    // Source OpenZeppelin
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/cryptography/ECDSA.sol

    if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
      revert("SignatureValidator#recoverSigner: invalid signature 's' value");
    }

    if (v != 27 && v != 28) {
      revert("SignatureValidator#recoverSigner: invalid signature 'v' value");
    }

    // Recover ECDSA signer
    signer = ecrecover(_hash, v, r, s);
    
    // Prevent signer from being 0x0
    require(
      signer != address(0x0),
      "SignatureValidator#recoverSigner: INVALID_SIGNER"
    );

    return signer;
  }*/

}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
pragma experimental ABIEncoderV2;

import "./Token.sol";

import "./ECDSA.sol";
import "./console.sol";
import "hardhat/console.sol";

contract SubcontractProvider is Console {
  mapping(bytes32 => uint) public hashToBlock;
  uint MAXUINT32 = type(uint32).max;

  constructor() {
    revealSecret(bytes32(0));
  }
  
  struct Batch {
    Payment[] payment;
    Swap[] swap;
  }

  // actual subcontract structs
  struct Payment {
    uint deltaIndex;
    int amount;
    uint revealedUntilBlock;
    bytes32 hash;
  }

  struct Swap {
    bool ownerIsLeft;

    uint addDeltaIndex;
    uint addAmount;

    uint subDeltaIndex;
    uint subAmount;
  }

  // https://en.wikipedia.org/wiki/Credit_default_swap
  struct CreditDefaultSwap {
    uint deltaIndex;
    int amount;
    address referenceEntity;
    uint tokenId;
    uint exerciseUntilBlock;
  }

  function encodeBatch (Batch memory b) public pure returns (bytes memory) {
    return abi.encode(b);
  }



  // applies arbitrary changes to deltas
  function applyBatch(
    int[] memory deltas,
    bytes calldata encodedBatch,
    bytes calldata leftArguments,
    bytes calldata rightArguments
  ) public returns (int[] memory) {

    Batch memory decodedBatch = abi.decode(encodedBatch, (Batch));

    uint[] memory lArgs = abi.decode(leftArguments, (uint[]));
    uint[] memory rArgs = abi.decode(rightArguments, (uint[]));
    
    for (uint i = 0; i < decodedBatch.payment.length; i++) {
      applyPayment(deltas, decodedBatch.payment[i]);
    }

    uint leftSwaps = 0;
    for (uint i = 0; i < decodedBatch.swap.length; i++) {
      Swap memory swap = decodedBatch.swap[i];

      uint32 fillRatio = uint32(swap.ownerIsLeft ? lArgs[leftSwaps] : rArgs[i  - leftSwaps]);

      applySwap(deltas, swap, fillRatio);
      //logDeltas("Deltas after swap", deltas);

      if (swap.ownerIsLeft) {
        leftSwaps++;
      }
    }

    return deltas;
  }

  function applyPayment(int[] memory deltas, Payment memory payment) private {
    // apply amount to delta if revealed on time
    // this is "sprites" approach (https://arxiv.org/pdf/1702.05812) 
    // the opposite is "blitz" (https://www.usenix.org/system/files/sec21fall-aumayr.pdf)
    uint revealedAt = hashToBlock[payment.hash];
    if (revealedAt == 0 || revealedAt > payment.revealedUntilBlock) {
      return;
    }

    logDeltas("Before payment", deltas);
    deltas[payment.deltaIndex] += payment.amount;
    logDeltas("After payment", deltas);
  }

  function applySwap(int[] memory deltas, Swap memory swap, uint32 fillRatio) private {
    logDeltas("Before swap", deltas);
    deltas[swap.addDeltaIndex] += int(swap.addAmount * fillRatio / MAXUINT32);
    deltas[swap.subDeltaIndex] -= int(swap.subAmount * fillRatio / MAXUINT32);
    logDeltas("After swap", deltas);
  }





  function revealSecret(bytes32 secret) public {
    console.log("Revealing HTLC secret:");
    console.logBytes32(secret);
    console.logBytes32(keccak256(abi.encode(secret)));
    hashToBlock[keccak256(abi.encode(secret))] = block.number;
  }
  
  // anyone can get gas refund by deleting very old revealed secrets
  function cleanSecret(bytes32 hash) public {
    if (hashToBlock[hash] != 0 && hashToBlock[hash] < block.number - 100000){
      delete hashToBlock[hash];
    }
  }

  function logDeltas(string memory msg, int[] memory deltas) public {
    console.log(msg);
    for (uint i = 0; i < deltas.length; i++) {
      console.logInt(deltas[i]);
    }
    console.log('====================');
  }



}


</legacy_code>

<fresh_spec>
Below is a comprehensive technical brief that captures every aspect of the discussion, outlining a novel blockchain design based on hierarchical, actor‐inspired state machines. This design leverages a dual–input/output model for transactions and events, a layered submachine architecture, and multi–signature validation to achieve secure, distributed state changes. The brief is organized into the following sections:

- [1. Overview](#1-overview)
- [2. Account Model and State](#2-account-model-and-state)
- [3. Transaction and Event Flow](#3-transaction-and-event-flow)
- [4. Hierarchical Submachine Architecture](#4-hierarchical-submachine-architecture)
- [5. Actor Model Alignment](#5-actor-model-alignment)
- [6. Transaction Structure and Multi–Signature Validation](#6-transaction-structure-and-multi-signature-validation)
- [7. Event Propagation, Ordering, and Verification](#7-event-propagation-ordering-and-verification)
- [8. Entity Interaction and Machine Types](#8-entity-interaction-and-machine-types)
- [9. Summary and Implementation Considerations](#9-summary-and-implementation-considerations)

---

## 1. Overview

This design proposes a blockchain architecture where state changes occur within isolated "machines" (actors) that communicate exclusively via events and transactions. The key components include:

- **Server:** The root machine for each user that:
  - Aggregates incoming requests/messages every 100ms into blocks with transaction maps
  - Coordinates with signers for block signatures
  - Aggregates finalized blocks from signers into Merkle trees
  - Updates state and finalizes blocks
  - Distributes messages to other servers
  - Acts as a grouping and routing mechanism
  - Maintains no consensus between servers
  - Each server is independent with its own state
  - Only tracks states of entities it participates in
  - Primary purpose is message forwarding and state organization
  - Useful for simulation (single server can simulate multiple environments)

- **Signer:** Encapsulates entities associated with a specific private key:
  - Stores private keys for transaction signing
  - Acts as parent/super-machine for Entities
  - Handles entity-level consensus
  - Can participate in DAOs as proposer, validator, or observer
  - Communicates with other signers as entity representatives
  - Derives state from server
  - Simple key-value mapping to entities
  - No separate block writing (uses server blocks)
  - Acts as intermediary router

- **Entity:** An account abstraction that can represent:
  - Personal wallets
  - Company wallets (DAOs)
  - Payment hubs/exchanges
  - Decentralized applications
  - Handles all complex business logic
  - Manages two types of transactions:
    - Channel-related transactions
    - Account-level transactions (proposals, voting)
  - State shared between participants only
  - Non-participants have no access to state
  All entity management occurs through proposals decided by signer quorums

- **Channel:** A bilateral account abstraction for message transmission:
  - Replicated in both participating entities
  - Facilitates direct entity-to-entity communication

- **Depository:** An entity with hardcoded Ethereum ABI interface:
  - Manages reserves
  - Handles channel operations
  - Resolves disputes

---

## 2. Account Model and State

### Server State Management

- **Block Formation:**
  - Every 100ms, each Server:
    - Aggregates incoming messages
    - Forms transaction maps
    - Coordinates with Signers
    - Creates Merkle trees from finalized blocks
    - Updates global state
    - Distributes messages to other Servers

- **State Persistence:**
  - **Memory State:**
    - All operations happen with JSON objects in memory
    - Can handle large-scale operations (e.g., 10M channels in 100GB RAM)
    - Complete state loaded at startup from LevelDB
    - Server object and signers constructed in memory

  - **Snapshot Types:**
    - **Mutable Snapshots:**
      - Stored under sequential machine IDs
      - Enables instant state restoration
      - Updated every N blocks (e.g., every 100)
      - Used for quick recovery after shutdown
    
    - **Immutable Snapshots:**
      - Stored by hash (Merkle DAG style)
      - Never overwritten, archived permanently
      - Enables historical state simulation
      - Allows complete system restoration to past states

  - **Data Storage Strategy:**
    - Initial MVP: Inline storage within blocks
    - Future: DAG-based transaction storage
    - Property points for granular data breakdown
    - Efficient compression in LevelDB

- **Mempool Construction:**
  - **Data Format:**
    - RLP-encoded key-value arrays
    - Keys array (`bytes32`) for routing
    - Values array for payloads
    - Single buffer composition for efficiency
  - **Routing Logic:**
    - First N values route to sub-machines
    - Remaining values execute locally
    - Real-time RLP decoding during dispatch

- **Block Storage:**
  - Blocks stored in LevelDB under block hash
  - Machine root stored under server ID
  - No explicit end-block marker
  - Previous block reference for chain continuity

### Signer State

- **Private Key Management:**
  - Securely stores private keys
  - Signs transactions for associated Entities
  - Maintains state of all controlled Entities

- **Consensus Participation:**
  - Creates blocks based on received Server data
  - Updates state according to received data
  - Participates in Entity-level consensus

### Entity State

- **Account Abstraction:**
  - Each Entity maintains its own state
  - State changes require Signer quorum approval
  - Can represent various types (wallets, DAOs, hubs)

- **Two-Tiered Management:**
  - **Proposal Phase:**
    - Transactions start as proposals
    - Require accumulation of signer votes
    - Stored as hashed voting shares
  - **Execution Phase:**
    - Executed after quorum reached
    - Batch execution at block end
    - Atomic state transitions
  - **Transaction Types:**
    - Global (server-level) execute directly
    - Entity-level require full proposal process

### Channel and Depository State

- **Channel State:**
  - Bilateral account state replicated in both entities
  - Maintains message transmission history
  - Tracks balances and commitments

- **Depository State:**
  - Manages reserve balances
  - Tracks channel states
  - Records dispute resolution status

### State Synchronization

- **Block-Level Synchronization:**
  - Server aggregates Signer blocks into Merkle trees
  - Signers maintain synchronized state copies
  - Entities update state based on approved proposals

---

## 3. Transaction and Event Flow

### Server Message Processing

- **Message Aggregation:**
  - Every 100ms cycle:
    - Collects incoming messages and requests
    - Forms transaction maps
    - Distributes to relevant Signers

- **Block Formation:**
  - Waits for Signer blocks
  - Creates Merkle trees
  - Finalizes blocks
  - Distributes to other Servers

### Signer Message Handling

- **Block Creation:**
  - Receives Server transaction maps
  - Creates blocks with state changes
  - Signs blocks and transactions
  - Returns signed blocks to Server

- **Entity Communication:**
  - Routes messages to appropriate Entities
  - Handles Entity-level consensus
  - Manages proposal voting

### Entity Message Types

- **Proposal Messages:**
  - State change requests
  - Management decisions
  - Configuration updates
  - Require Signer quorum approval

- **Channel Messages:**
  - Direct entity-to-entity communication
  - Bilateral account updates
  - Balance transfers

### Message Propagation

- **Server-to-Server:**
  - Finalized block distribution
  - Network state updates
  - Cross-server coordination

- **Signer-to-Signer:**
  - Entity representation
  - Consensus participation
  - Proposal voting

- **Entity-to-Entity:**
  - Through Channels (direct)
  - Through Depositories (mediated)

---

## 4. Hierarchical Submachine Architecture

### Second–Level Interactions

- **Submachine Creation:**  
  - A machine can spawn submachines that operate with the same I/O structure—each having a **transaction outbox (txout)** and an **event inbox (eventinbox)**.
  
- **Abstract Representation:**  
  - Visually, each machine can be depicted as a square with two inputs (txinbox and eventinbox) and two outputs (txoutbox and event outbox).  
  - The internal state of each machine is not explicitly modeled in communications; only the final hash of operations is needed for external validation.

### Communication Flow

- **Bidirectional Messaging:**  
  - Upstream (parent to child): Transactions are sent downward.
  - Downstream (child to parent): Events propagate upward.
- **Chaining of Machines:**  
  - This design allows for nested layers of blockchain state changes, where high-level machines delegate tasks to lower-level submachines while maintaining synchronized state and event propagation.

---

## 5. Actor Model Alignment

### Actors as Isolated Entities

- **Conceptual Parallels:**  
  - The design mirrors the actor model, where each actor (machine) is an isolated system with its own state.
  - Actors communicate solely via messages (here, transactions and events), ensuring encapsulation and modularity.
  
- **Real–World Analogy:**  
  - Think of browser windows: each window is an independent entity that spawns new windows and communicates via events.
  
- **Security and Nonce Considerations:**  
  - While actors are abstract and do not enforce implementation details like nonce management, the blockchain layer introduces nonces and cryptographic signatures to ensure security and sequential integrity.

---

## 6. Transaction Structure and Multi–Signature Validation

### Authorization and API Tokens

- **Initial Authorization:**
  - API tokens used for early-stage authorization
  - Tokens managed in memory by console
  - Checked against mempool access control rules
  - Higher-level machines have stricter controls

- **Evolution to Cryptographic Security:**
  - Initial trust-based execution for MVP
  - Planned transition to full signature verification
  - Future aggregated signature implementation
  - Integration with "egg agents" for online presence

### Transaction Format

- **Input Transactions:**  
  - Each transaction includes:
    - **Sender and Receiver Addresses:** Identifying the originator and destination.
    - **Increasing Nonce:** Ensuring each transaction is unique and sequential.
    - **Data Payload:** Contains the method name and parameters.
    - **Signature:** Cryptographically ensures authenticity; supports aggregation.
  
- **Output Transactions:**  
  - Structurally similar to inputs but differ by:
    - **Multi–Signature Requirement:**  
      - For entities with multiple validators (e.g., five participants), the output transaction requires signatures from all validators.
    - **Block Voting Process:**  
      - During block proposal and voting, validators append their signature to both the proposed block and each outgoing transaction.
    - **Resulting Artifacts:**  
      - The proposer collects a signed block and a collection of signed transactions ready for propagation.

---

## 7. Event Propagation, Ordering, and Verification

### Event Sources and Aggregation

- **Event Generation:**  
  - Incoming events originate from higher-level submachines that are deployed on the same node.
  - These events serve as confirmations or outputs of prior transactions executed by parent machines.
  
- **Synchronization Analogy:**  
  - Similar to running multiple Ethereum instances in parallel, the events from each instance (or submachine) aggregate into a common "event pool" (analogous to a mempool but for events).

### Ordering and Verification

- **Definitive Event Ordering:**  
  - The proposer establishes a definitive order for events based on reception timing and then disseminates this reference order across the network.
  
- **Validation Procedures:**  
  - **For Transactions:**  
    - Validators check the integrity of signatures and confirm that nonces increment correctly.
  - **For Events:**  
    - Validators verify that the submachine's state is synchronized up to a specific block number and hash.
    - They confirm that the list of events matches the expected events in their local event pool—even if the order may vary slightly.

### Event–Triggered Actions

- **Upstream and Downstream Effects:**  
  - Events can trigger new transactions upstream. For example:
    - An event indicating receipt of funds in a hub triggers a new transaction (`txout`) to send funds to the next designated channel.
  - Outgoing events may propagate downward toward lower-level signers, ultimately reaching the root signer machine which holds the master private key for instant block signing.

---

## 8. Entity Interaction and Machine Types

### Hierarchical Machine Structure

- **Server as Root Machine:**
  - Each user has a unique Server machine that:
    - Aggregates requests/messages every 100ms into blocks
    - Coordinates with Signers for block signatures
    - Forms Merkle trees from finalized Signer blocks
    - Manages message distribution to other Servers

- **Signer as Parent Machine:**
  - Manages private key for transaction signing
  - Acts as super-machine for all associated Entities
  - Handles entity-level consensus:
    - Automatic for single-signer entities
    - Proposal-based for multi-signer entities (DAOs)
  - Communicates with other Signers as entity representatives

- **Entity as Account Abstraction:**
  - Can represent various types:
    - Personal wallets
    - Company wallets (DAOs)
    - Payment hubs/exchanges
    - Complex decentralized applications
  - All management occurs through proposals
  - Requires quorum of Signers for decisions

### Modes of Interaction

- **Channel-Based Communication:**
  - Channels are bilateral accounts replicated in both entities
  - Enable direct entity-to-entity message transmission
  
- **Depository-Mediated Interaction:**
  - Smart contract managing reserves
  - Handles channel operations
  - Resolves disputes between entities

### State Management and Consensus

1. **Server Block Formation:**
   - Aggregates incoming messages every 100ms
   - Forms transaction maps
   - Coordinates with Signers
   - Finalizes blocks through Merkle tree formation

2. **Signer Operations:**
   - Receives Server blocks for signing
   - Creates own blocks for state changes
   - Participates in consensus:
     - As sole signer (automatic consensus)
     - As DAO participant (proposal-based consensus)

3. **Entity Management:**
   - All changes require Signer proposals
   - Quorum-based decision making
   - Changes propagate through Channels or Depositories

---

## 9. Summary and Implementation Considerations

### Key Takeaways

- **Dual–Interface Machines:**  
  - Each blockchain "machine" operates with a **transaction inbox** and an **event outbox**, enabling clear separation between inputs (commands) and outputs (responses).
  
- **Hierarchical, Actor–Based Design:**  
  - Machines (actors) can spawn submachines, each following the same messaging protocol, resulting in a robust and modular blockchain architecture.
  
- **Synchronized Execution and Consensus:**  
  - The proposer's role in establishing a definitive event order, coupled with multi–signature validation for transactions, ensures all nodes converge on the same blockchain state.
  
- **Flexible Interaction Channels:**  
  - Entities interact directly through channels or, if necessary, indirectly via shared depositories. This flexibility supports both simple and complex organizational structures.

### Implementation Considerations

- **Technical Stack:**
  - WebSocket interface for message reception
  - LevelDB for block and state storage with buffer encoding for efficiency
  - RLP encoding for efficient data representation
  - Promise.all for parallel dispatch
  - Sub-100ms processing intervals  
  - Direct buffer-buffer maps for block hashes


  - **State Management:**
    - In-memory JSON object operations
    - Dual snapshot system (mutable/immutable)
    - Batch LevelDB state loading
    - DAG-based historical state tracking
    - High-scale memory operations (10M+ channels)
    - Participant-only state sharing
    - Efficient state derivation

  - **Storage:**
    - MVP: Inline block storage
    - Future: DAG-based transaction separation
    - Granular property point breakdown
    - Efficient state compression
    - Flexible snapshot intervals
    - Buffer-based key-value encoding
    - RLP preferred over CBOR
    - Batch LevelDB operations
    - Memory-efficient state tracking
    - Minimal block metadata

  - **Security Evolution:**
    - Initial API token-based authorization
    - Planned transition to cryptographic verification
    - Aggregated signature mechanism
    - "Egg agents" for participant availability

  - **Development vs Production:**
    - **Development Mode:**
      - Full state logging
      - Time-travel debugging capability
      - Single server simulating multiple environments
      - Comprehensive transaction history
    
    - **Production Mode:**
      - Essential state only
      - Write-ahead transaction logs
      - Optimized storage format
      - Minimal block data

  - **Architecture:**
    - Server as pure routing layer
    - No inter-server consensus
    - Signer as simple key-value map
    - Entity-level business logic isolation
    - Minimal block structure
    - Hierarchical model for responsibility decomposition
    - Local event pools with network synchronization
    - Two-tiered transaction processing
    - Efficient message routing
    - Independent server states
    - Minimal data replication


# Session Analysis: Channel & Swap Design

## Key Decisions

### Accepted Designs
1. Channels as Submachines
   - What: Channels operate within entities as independent state machines
   - Why: Enables local-first operations with global settlement
   - Implementation: 
     - Each entity manages multiple channels
     - Cross-channel atomic swaps
     - Local execution, global verification

### Critical Components
1. Channel Structure
   - Independent state machines
   - Balance tracking
   - Participant signatures
   - Cross-channel commitments

2. Swap Mechanism
   - Intent matching system
   - Hash timelock contracts
   - Atomic execution
   - Dispute resolution

## Technical Insights

### Core Flow
- Channels create swap intents
- Entities match compatible intents
- Atomic cross-channel execution
- Cryptographic proofs maintain safety

### Edge Cases
- Timeout handling
- Incomplete swaps
- Dispute resolution
- State synchronization

## Future Considerations
- Multi-party swaps
- Cross-network settlement
- Liquidity optimization
- Network effect scaling

## Questions for Next Session
- Optimal intent matching algorithm?
- Timeout parameters?
- Proof structure for swaps? 


# Session Analysis: Core Development Principles

## Key Decisions

### Accepted Approach
1. Functional Core, Service Shell
   - What: Pure functions for core logic, minimal classes for services
   - Why: Financial systems need perfect auditability
   - Implementation:
     - Core state transitions are pure functions
     - Services (P2P, DB) can be classes
     - No hidden state in critical paths

### Code Style 
1. Core Logic (Pure Functions)
   - Explicit state transitions
   - No side effects
   - Clear data flow
   - Everything is provable

2. Service Layer (Minimal Classes)
   - Long-lived resources (DB, Network)
   - Clear lifecycle management
   - Isolated from core logic
   - Stateful but contained

## Technical Insights

### Why This Hybrid Approach
- Financial code must be auditable
- State transitions must be predictable
- Services need lifecycle management
- Balance pragmatism with safety

### Critical Principles
- Start small, perfect execution
- No premature optimization
- Every state change must be provable
- Test everything extensively

## Implementation Notes
- Keep core logic pure
- Explicit state transitions
- Clear data flow
- Minimal dependencies

## Future Considerations
- May need more services as we scale
- Keep monitoring complexity
- Stay focused on correctness

## Questions for Next Session
- First component to implement?
- Test strategy for pure functions?
- Service boundaries? 

# Session Analysis: Financial Infrastructure Scale

## Key Decisions

### Accepted Designs
1. Conservative Growth Strategy
   - What: Start small with perfect execution
   - Why: Building financial infrastructure requires trust
   - Implementation: 
     - Focus on basic asset transfers first
     - Rigorous security and auditing
   - Performance targets: Correctness over speed

### Critical Components
1. Core Financial Primitives (~2000 LOC)
   - Entity/channel state machines
   - Validation and proofs
   - Asset management
   - Consensus logic

2. Infrastructure Layer (~3000 LOC)
   - Storage and indexing
   - P2P networking
   - API/Integration

## Technical Insights

### Safety Requirements
- Immutable audit trails
- Cryptographic proofs for all operations
- Zero trust architecture
- Formal verification where critical
- Regulatory compliance from day one

### Edge Cases
- Cross-depository operations
- Atomic swaps
- Settlement disputes
- State synchronization

## Implementation Notes
- Use bigint for financial calculations
- Every state change must be provable
- Conservative feature rollout
- Multiple independent audits

## Future Considerations
- Regulatory requirements
- Cross-border operations
- Scaling considerations
- Audit requirements

## Questions for Next Session
- Detailed regulatory compliance strategy?
- Audit trail implementation?
- Cross-border settlement approach? 

# Merkle Tree Optimization Session

## Key Decisions

### Accepted Designs
1. Configurable Bit Width
   - What: Allow configurable bit width (1-16 bits) for path chunking
   - Why: Balance between tree depth and branching factor
   - Implementation: 
     - Configurable in TreeConfig
     - Default 4-bit nibbles for most cases
     - 8-bit for high-performance scenarios
   - Performance targets: 
     - Support 10k+ signers
     - Handle 10k+ entities per signer
     - Sub-50ms path lookups

2. Dynamic Node Splitting
   - What: Split leaf nodes when they exceed threshold
   - Why: Maintain balanced tree structure
   - Implementation:
     - Configurable threshold (1-1024)
     - Automatic splitting on insert
     - Hash caching for performance
   - Performance targets:
     - < 1ms split operation
     - < 100ms for 1000 concurrent updates

### Declined Alternatives
1. Fixed Bit Width
   - What: Use fixed 8-bit chunks for all paths
   - Why declined: Less flexible for different use cases
   - Tradeoffs considered:
     - Pros: 
       - Simpler implementation
       - Potentially faster path parsing
     - Cons:
       - No optimization for different scenarios
       - Higher memory usage in some cases
   - Future considerations: May revisit for specialized high-performance cases

2. Separate Trees per Type
   - What: Use different trees for each storage type
   - Why declined: Increased complexity and storage overhead
   - Tradeoffs considered:
     - Pros:
       - Better isolation
       - Simpler per-type operations
     - Cons:
       - More memory usage
       - Complex root calculation
       - Harder to maintain consistency
   - Future considerations: Could be useful for sharding

## Technical Insights

### Performance Optimizations
- Discovered bottlenecks:
  - Path parsing overhead
  - Frequent hash recalculation
  - Memory allocation in splits
- Solutions implemented:
  - Hash caching
  - Lazy tree updates
  - Efficient path chunking
- Metrics to track:
  - Path lookup time
  - Node split duration
  - Memory usage per 1000 nodes

### Edge Cases
- Identified risks:
  - Deep trees with sparse leaves
  - Hash collisions in large datasets
  - Memory spikes during bulk updates
- Mitigation strategies:
  - Configurable bit width
  - Collision-resistant hashing
  - Batch processing support
- Open questions:
  - Optimal threshold for different scenarios
  - Recovery strategy for corrupted nodes
  - Pruning strategy for old states

## Implementation Notes

### Critical Components
1. Path Processing
   - Key requirements:
     - Efficient chunking
     - Minimal allocations
     - Clear error handling
   - Gotchas:
     - Buffer handling in TypeScript
     - Endianness considerations
     - Boundary conditions
   - Testing focus:
     - Edge cases in path lengths
     - Performance under load
     - Memory usage patterns

2. Node Management
   - Key requirements:
     - Thread safety
     - Consistent hashing
     - Efficient splits
   - Gotchas:
     - Cache invalidation
     - Reference management
     - Split timing
   - Testing focus:
     - Concurrent updates
     - Memory leaks
     - Split correctness

### Integration Points
- System dependencies:
  - crypto for hashing
  - rlp for encoding
  - buffer for byte handling
- API contracts:
  - Immutable state updates
  - Consistent error handling
  - Clear type definitions
- Data flow:
  - Input validation
  - Path processing
  - Node updates
  - Hash computation
  - State persistence

## Future Considerations
- Scalability concerns:
  - Memory usage for large trees
  - Performance with deep paths
  - Concurrent update handling
- Potential improvements:
  - Parallel processing
  - Pruning support
  - Snapshot/restore
- Research areas:
  - Compression techniques
  - Alternative path encodings
  - Sharding strategies

## Questions for Next Session
- Unresolved issues:
  - Optimal pruning strategy
  - Recovery procedures
  - Backup format
- Design clarifications needed:
  - Sharding approach
  - Versioning strategy
  - Migration procedures
- Performance concerns:
  - Memory usage patterns
  - Concurrent update scaling
  - Network synchronization 

# XLN: Reserve Credit System

## Core Concept

XLN introduces a novel approach to payment channels through its Reserve Credit System, which combines collateral-based security with credit-based flexibility. This system enables efficient, secure, and scalable off-chain transactions while maintaining strong economic guarantees.

## Key Components

### 1. Reserves
- Personal token holdings stored in the contract
- Can be converted to channel collateral
- Acts as a security deposit for credit operations
- Automatically used to settle debts when channels are closed

### 2. Collateral
- Locked tokens in a channel between two parties
- Provides immediate liquidity for transactions
- Can be split between parties based on channel state
- Protects against malicious behavior

### 3. Credit Limits
- Allows transactions beyond collateral amounts
- Each party can extend credit to their peer
- Credit limits are set independently by each party
- Enables larger transaction volumes with less locked capital

### 4. Channel State
The channel state is tracked through several key metrics:
- `ondelta`: Permanent state changes (e.g., deposits)
- `offdelta`: Temporary state changes (e.g., payments)
- `leftCreditLimit` & `rightCreditLimit`: Credit extended by each party
- `collateral`: Total locked tokens in the channel

## How It Works

1. **Channel Setup**
   - Users deposit tokens into their reserve
   - Convert reserve to channel collateral
   - Set credit limits for their counterparty

2. **Transaction Flow**
   - Payments first use available collateral
   - When collateral is exhausted, credit is used
   - Credit usage is tracked via deltas
   - Total capacity = collateral + own credit + peer credit

3. **Settlement Process**
   - Channels can be closed cooperatively or through dispute
   - Final state determines collateral distribution
   - Credit used is settled from reserves
   - Unpaid credit becomes debt

4. **Debt Handling**
   - Debts must be paid before new reserve operations
   - Automatic debt settlement from available reserves
   - FIFO debt queue system
   - Active debt tracking per entity

## Advantages

1. **Capital Efficiency**
   - Less capital locked in channels
   - Credit enables higher transaction volumes
   - Flexible collateral management

2. **Security**
   - Collateral-backed transactions
   - Automatic debt settlement
   - Dispute resolution mechanism

3. **Scalability**
   - Off-chain state management
   - Batched settlement options
   - Efficient multi-token support

## Technical Implementation

The system is implemented through smart contracts and off-chain state management:

```solidity
struct ChannelCollateral {
    uint collateral;
    int ondelta;
}

struct Debt {
    uint amount;
    address creditor;
}
```

Channel capacity is calculated as:
```
totalCapacity = collateral + ownCreditLimit + peerCreditLimit
inCapacity = inOwnCredit + inCollateral + inPeerCredit - inAllowance
outCapacity = outPeerCredit + outCollateral + outOwnCredit - outAllowance
```

## Future Directions

1. **Credit Scoring**
   - Reputation-based credit limits
   - Dynamic credit adjustment
   - Risk assessment metrics

2. **Network Effects**
   - Credit network formation
   - Liquidity sharing
   - Path-based transactions

3. **Cross-Chain Integration**
   - Multi-chain reserve management
   - Cross-chain credit networks
   - Unified settlement layer 

# Entity System Session Analysis

## Key Decisions

### Accepted Designs
1. Merkle Storage Layers
   - What: Multi-layer merkle trees with configurable nibble sizes
   - Why: Optimize for different data types and access patterns
   - Implementation: 4-bit for signer/entity, 8-bit for storage
   - Performance targets: 10k+ signers, 10k+ entities/signer, 1M+ channels/entity

2. Board-based Validation
   - What: Threshold voting with nested entity support
   - Why: Enable DAO governance and flexible validation
   - Implementation: Recursive signature verification with cycle detection
   - Performance: Batch signature verification, caching

### Declined Alternatives
1. Three+ Party Channels
   - What: Multi-party state channels
   - Why declined: Complexity in consensus, harder to manage state
   - Tradeoffs:
     - Pros: More flexible for complex interactions
     - Cons: Exponential complexity, harder to finalize
   - Future: Might revisit for specific use cases

2. Single Tree Storage
   - What: One merkle tree for all data types
   - Why declined: Performance and flexibility limitations
   - Tradeoffs:
     - Pros: Simpler implementation
     - Cons: No optimization per data type
   - Future: Could work for small-scale deployments

## Technical Insights

### Performance Optimizations
- Discovered: Nibble size impact on tree depth
- Solutions: Padding flags in control bytes
- Metrics: Tree depth, update speed, proof size

### Edge Cases
- Recursive DAO validation cycles
- Channel state recovery
- Partial validator sets
- Mitigation: Cycle detection, inbox-based recovery

## Implementation Notes

### Critical Components
1. Merkle Trees
   - Configurable nibble sizes
   - Padding handling
   - Memory overlays
   - Testing: Focus on large state changes

2. Entity Validation
   - Board threshold checks
   - Nested signature verification
   - Testing: Complex DAO structures

### Integration Points
- Entity Provider contract
- Channel consensus
- Historical storage (entityLogDb)

## Future Considerations
- Merkle proof optimization
- Validator stake delegation
- Channel dispute resolution
- State pruning strategies

## Questions for Next Session
- Optimal nibble sizes for different deployments
- Channel timeout mechanisms
- Board update procedures
- State recovery optimization

# Entity System

## Overview
The entity system manages individual state machines within the network, handling transactions, state transitions, and block creation.

## Core Types

### Entity State
```typescript
interface EntityRoot {
  status: 'idle' | 'precommit' | 'commit'
  finalBlock?: EntityBlock
  consensusBlock?: EntityBlock
  entityPool: Map<string, Buffer>
}

interface EntityBlock {
  blockNumber: number
  storage: EntityStorage
  channelRoot: Buffer
  channelMap: Map<string, Buffer>
  inbox: Buffer[]
  validatorSet?: Buffer[]
}
```

### Input Types
```typescript
type EntityInput =
  | { type: 'AddEntityTx', tx: Buffer }
  | { type: 'AddChannelInput', channelId: string, input: ChannelInput }
  | { type: 'Flush' }
  | { type: 'Sync', blocks: Buffer[], signature: Buffer }
  | { type: 'Consensus', signature: Buffer, blockNumber: number }
```

## State Management

### Storage Types
```typescript
enum StorageType {
  // State types
  CURRENT_BLOCK = 0x01,
  CONSENSUS_BLOCK = 0x02,
  CHANNEL_MAP = 0x03,
  
  // Board & Validator types
  CURRENT_BOARD = 0x10,
  PROPOSED_BOARD = 0x11,
  VALIDATOR_STAKES = 0x12,
  
  // Consensus types
  PRECOMMITS = 0x20,
  VOTES = 0x21,
  
  // Padding flags for nibble alignment
  PADDING_1 = 0x81,  // 1 padding bit
  PADDING_2 = 0x82,  // 2 padding bits
  // ... up to PADDING_7
}
```

### Board Management
```typescript
interface EntityBoard {
  threshold: number
  delegates: Array<{
    entityId: Buffer  // 20 bytes for EOA, longer for nested entity
    votingPower: number
  }>
}

interface EntityConfig {
  depositoryId: Buffer    // Token/depository contract
  name: string
  board: EntityBoard
}
```

### Creation Flow
```typescript
interface CreateEntityTx {
  type: 'CreateEntity'
  config: EntityConfig
  signature: Buffer        // Depository signature
}
```

### State Transitions
1. Input validation
2. State update
3. Block creation (if needed)
4. Storage update

## Type Safety and Buffer Handling

### Buffer Conversions
```typescript
// Always use Buffer.from() for RLP encoding results
const encoded = Buffer.from(encode(data));

// When decoding, validate the result
const decoded = decode(data) as unknown;
if (!Array.isArray(decoded) || decoded.length !== expectedLength) {
  throw new Error('Invalid encoded data');
}
```

### Type Guards
```typescript
function isValidTx(input: EntityInput): input is { type: 'AddEntityTx', tx: Buffer } {
  return input.type === 'AddEntityTx' && Buffer.isBuffer(input.tx);
}
```

## ESM Compatibility

### Import/Export
```typescript
// Use .js extensions in imports
import { StorageType } from './storage/merkle.js';
import { EntityRoot } from './types/entity.js';

// Export with type annotations
export type { EntityRoot, EntityBlock };
export { executeEntityTx, createEntityBlock };
```

## Transaction Processing

## Additional Considerations

### Nested Entity Validation
- Recursive signature verification
- Support for DAO delegates
- Cycle detection in validation
- Efficient signature caching

### State Overlays
- Memory-only pending changes
- Efficient state reconstruction
- Lazy merkle computation
- Batch update support

### Recovery Mechanisms
- Rebuild from entity inbox
- Recompute merkle trees
- Recover channel states
- Resync with validators

### Commands
- Create: Initialize entity
- Increment: Update value
- Custom: Application-specific logic

### Execution Flow
1. Decode transaction
2. Execute command
3. Update storage
4. Create block (if needed)

## Testing
- Reduced test scope (10 entities)
- Random value updates
- State verification
- Block creation validation

## Known Issues and Best Practices

### Type Safety
- Always use explicit Buffer conversions
- Add type guards for runtime validation
- Validate all decoded data structures

### State Management
- Use immutable state updates
- Validate state before persistence
- Handle RLP encoding/decoding carefully

### Performance
- Cache frequently accessed state
- Batch database operations
- Use efficient encoding methods

### Error Handling
- Add descriptive error messages
- Validate inputs thoroughly
- Handle edge cases explicitly

## Known Issues
- Need better error handling for invalid transactions
- Improve transaction validation
- Add more storage types as needed 

# Recovery Procedures

## State Recovery
- Rebuild from entity inbox
- Recompute merkle trees
- Channel state recovery
- Validator resync process

## Safety Measures
- Historical block access
- Proof verification
- Signature validation
- State consistency checks

# Validation System

## Signature Types
- EOA signatures (20 bytes)
- Nested entity signatures
- Board-based validation
- Recursive DAO validation

## Board Rules
- Configurable thresholds
- Delegate voting power
- Stake-based validation
- Timeout handling
Proposer                    Validators
   |                           |
   |-- Aggregate Mempool       |
   |-- Apply Changes           |
   |   - Channel inputs        |
   |   - Entity transactions   |
   |                          |
   |-- Propose Block --------->|
   |                          |
   |<---- Precommits ---------|
   |                          |
   |-- Check Threshold        |
   |-- Finalize Block         | 

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

# Server System

## Overview
ESM-based TypeScript server handling state management, WebSocket communication, and entity coordination.

## Configuration

### TypeScript/ESM Setup
```json
// tsconfig.json
{
  "extends": "@tsconfig/node20/tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "node16",
    "module": "node16",
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}

// package.json
{
  "type": "module",
  "scripts": {
    "start": "NODE_ENV=development ts-node --esm --experimental-specifier-resolution=node src/server.ts"
  }
}
```

## State Management

### Server State
```typescript
interface ServerState {
  pool: Map<string, Map<string, EntityInput[]>>
  block: number
  merkleStore: ReturnType<typeof createMerkleStore>
  unsaved: Set<string>
}
```

### State Updates
- Use immutable state updates
- Track changes in unsaved set
- Batch database operations
- Validate state consistency

### Database Operations
```typescript
// Batch operations for efficiency
const ops = [];
ops.push({
  type: 'put',
  key: Buffer.from([]),
  value: Buffer.from(encode([state.block, merkleRoot, timestamp]))
});

// Save entity states
for (const key of state.unsaved) {
  const [signerId, entityId] = key.split('/');
  const node = state.merkleStore.debug.getEntityNode(signerId, entityId);
  if (node?.value) {
    ops.push({
      type: 'put',
      key: Buffer.from(key, 'hex'),
      value: Buffer.from(encode(Array.from(node.value.entries())))
    });
  }
}
```

## Type Safety

### Buffer Handling
```typescript
// Safe pattern
const encoded = Buffer.from(encode(data));
const merkleRoot = state.merkleStore.getMerkleRoot();

// Unsafe pattern (avoid)
const encoded = encode(data) as Buffer;
```

### Type Guards
```typescript
function isValidInput(input: unknown): input is EntityInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'type' in input &&
    typeof input.type === 'string'
  );
}
```

## WebSocket Communication

### Message Format
```typescript
interface WSMessage {
  signerId: string
  entityId: string
  input: EntityInput
}
```

### Error Handling
```typescript
ws.on('message', async (msg) => {
  try {
    const { signerId, entityId, input } = JSON.parse(msg.toString());
    if (!isValidInput(input)) {
      throw new Error('Invalid input format');
    }
    // Process message
  } catch (error) {
    ws.send(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }));
  }
});
```

## Debugging

### Debug Namespaces
```typescript
const log = {
  state: debug('state:🔵'),
  tx: debug('tx:🟡'),
  block: debug('block:🟢'),
  error: debug('error:🔴'),
  diff: debug('diff:🟣'),
  merkle: debug('merkle:⚪')
};
```

### State Diffing
- Track state changes
- Log merkle root updates
- Monitor pool size
- Track unsaved changes

## Best Practices

### State Management
- Use immutable updates
- Batch database operations
- Validate state before persistence
- Track unsaved changes

### Type Safety
- Use explicit Buffer conversions
- Add type guards
- Validate all inputs
- Handle edge cases

### Performance
- Batch database operations
- Cache merkle roots
- Use efficient encoding
- Monitor memory usage

### Error Handling
- Add descriptive messages
- Validate all inputs
- Handle edge cases
- Log errors properly

## Core Components

### State Management
```typescript
interface ServerState {
  pool: Map<string, Map<string, EntityInput[]>>  // Transaction pool
  block: number                                   // Current block number
  merkleStore: MerkleStore                       // State storage
  unsaved: Set<string>                           // Modified entries
}
```

### Storage
- LevelDB for persistence
- Separate databases for:
  - Log (immutable history)
  - State (current state)
  - Entity log (entity-specific history)

### Communication
- WebSocket server on port 8080
- JSON message format
- Automatic state updates

## Transaction Processing

### Input Types
- Entity transactions
- Channel inputs
- System operations

### State Updates
1. Input validation
2. State transition
3. Merkle root update
4. State persistence

## Development Mode
- REPL interface for debugging
- Live state inspection
- Test transaction generation
- Tree visualization

## Configuration
```typescript
// Debug namespaces
debug.enable('state:*,tx:*,block:*,error:*,diff:*,merkle:*');

// Storage paths
const logDb = new Level('./db/log');
const stateDb = new Level('./db/state');
const entityLogDb = new Level('./db/entitylog');
```

## Testing
- Automated test transactions
- State verification
- Performance monitoring
- Error handling validation

## Known Issues
- ESM/TypeScript import paths require `.js` extension
- Buffer type handling needs explicit imports
- Debug logging verbosity control needed 


</fresh_spec>

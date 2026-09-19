// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Storage layout shared by the beacon implementation and its one-use initializer.
/// New implementation versions must append fields and may not reorder these slots.
abstract contract BrainAssemblyMicroPagesStorage {
    struct Config {uint32 slots;uint32 neurons;uint32 externalInputs;uint32 frames;uint32 chunks;uint8 maxCycles;bytes32 slotRoot;bytes32 dataRoot;bytes32 frameRoot;}
    struct SlotSpec {uint8 width;uint32 gateCount;uint32 netlistBytes;bytes32 netlistHash;bytes32 edgeRoot;uint32[] neurons;uint32[] edgeCounts;uint16[] thresholds;bytes initialState;}
    struct Holding {uint256 tokenId;address depositor;}
    struct Work {uint64 round;uint32 neuron;uint32 cursor;uint32 cycles;uint32 bits;uint8 bitIndex;uint8 phase;}
    struct WorkNode {uint64 round;bytes32 value;}

    Config public config;
    mapping(uint256=>SlotSpec) internal specs;mapping(uint256=>bool) internal configured;mapping(uint256=>bool) internal assignedNeuron;
    mapping(uint256=>Holding) internal holdings;mapping(uint256=>uint256) public occupiedToken;
    mapping(uint256=>uint256) public slotEdgeBase;uint256 public configuredRecords;
    mapping(uint256=>mapping(uint256=>uint32)) internal absoluteWeightSum;
    mapping(uint256=>mapping(uint256=>uint32)) internal edgeOffset;
    mapping(uint256=>uint32) public loadedEdges;mapping(uint256=>uint32) public totalEdges;mapping(uint256=>uint32) public loadedBlocks;
    mapping(uint256=>bytes) public inputFrame;
    mapping(uint256=>mapping(uint256=>bytes)) internal states;
    mapping(uint256=>mapping(uint256=>uint8)) internal spikes;
    mapping(uint256=>mapping(uint256=>bytes32)) internal tree;
    mapping(uint256=>Work) internal work;
    mapping(uint256=>WorkNode) internal workTree;
    uint32 public configuredCount;uint32 public assignedCount;uint32 public completeDataSlots;uint32 public chunkCount;uint32 public loadedFrames;uint32 public presentCount;uint32 public completedModules;uint32 public completedSteps;
    uint8 public committedBank;uint64 public assemblyVersion;uint64 public roundNonce;
    bool public isSealed;bool public active;bool public custodyFault;
    uint256 internal entered;bool internal awaiting;address internal incomingFrom;uint256 internal incomingId;
}

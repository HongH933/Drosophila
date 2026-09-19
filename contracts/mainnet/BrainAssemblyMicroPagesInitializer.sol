// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./BrainAssemblyMicroPagesStorage.sol";
import "./StaticMicroData.sol";

/// Constructor-only proxy initializer. It is never retained by the proxy.
contract BrainAssemblyMicroPagesInitializer is BrainAssemblyMicroPagesStorage {
    error CONFIG(); error ROOT();
    uint256 private constant MAX_SLOTS=1048576;
    address public immutable expectedBuilder;
    StaticMicroData public immutable expectedData;
    bytes32 public immutable expectedConfigHash;

    constructor(address builder_,StaticMicroData data_,Config memory expected) {
        if(builder_==address(0)||address(data_).code.length==0||data_.builder()!=builder_)revert CONFIG();
        expectedBuilder=builder_;expectedData=data_;expectedConfigHash=keccak256(abi.encode(expected));
        config.slots=type(uint32).max;
    }

    function initialize(Config memory c) external {
        if(msg.sender!=expectedBuilder||config.slots!=0||keccak256(abi.encode(c))!=expectedConfigHash)revert CONFIG();
        if(c.chunks!=(expectedData.metadataBytes()+8191)/8192)revert CONFIG();
        if(!(c.slots>0&&c.slots<=MAX_SLOTS&&c.neurons>=c.slots&&c.neurons<0x80000000&&c.externalInputs<=65536&&c.frames>0&&c.frames<=MAX_SLOTS&&c.chunks>0&&c.chunks<=MAX_SLOTS&&c.maxCycles>0&&c.maxCycles<=64))revert CONFIG();
        if(c.slotRoot==0||c.dataRoot==0||c.frameRoot==0)revert ROOT();
        config=c;assemblyVersion=1;entered=1;
    }
}

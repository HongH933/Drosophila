// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProjectBeacon { function implementation() external view returns(address); }

/// Minimal EIP-1967 beacon proxy. Administration lives only in the beacon.
contract ProjectBeaconProxy {
    error INVALID_BEACON();
    error INVALID_IMPLEMENTATION();
    error INITIALIZATION_FAILED(bytes reason);

    // bytes32(uint256(keccak256("eip1967.proxy.beacon"))-1)
    bytes32 private constant BEACON_SLOT=0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;

    constructor(address beacon_,address initializer_,bytes memory initialization) payable {
        if(beacon_.code.length==0) revert INVALID_BEACON();
        address target=IProjectBeacon(beacon_).implementation();
        if(target.code.length==0||initializer_.code.length==0) revert INVALID_IMPLEMENTATION();
        if(initialization.length==0)revert INITIALIZATION_FAILED(initialization);
        (bool ok,bytes memory reason)=initializer_.delegatecall(initialization);if(!ok)revert INITIALIZATION_FAILED(reason);
        assembly { sstore(BEACON_SLOT,beacon_) }
    }

    fallback() external payable { _fallback(); }
    receive() external payable { _fallback(); }

    function _fallback() private {
        address b;assembly { b:=sload(BEACON_SLOT) }
        address target=IProjectBeacon(b).implementation();
        if(target.code.length==0) revert INVALID_IMPLEMENTATION();
        assembly {
            calldatacopy(0,0,calldatasize())
            let result:=delegatecall(gas(),target,0,calldatasize(),0,0)
            returndatacopy(0,0,returndatasize())
            switch result case 0 { revert(0,returndatasize()) } default { return(0,returndatasize()) }
        }
    }
}

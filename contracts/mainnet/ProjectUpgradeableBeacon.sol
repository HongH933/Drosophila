// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Project-owned EIP-1967 beacon. The owner can replace the implementation and
/// therefore has complete authority over every proxy using this beacon.
contract ProjectUpgradeableBeacon {
    error NOT_OWNER();
    error INVALID_IMPLEMENTATION();
    error ZERO_OWNER();

    address public owner;
    address public pendingOwner;
    address public implementation;

    event Upgraded(address indexed implementation);
    event OwnershipTransferStarted(address indexed previousOwner,address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner,address indexed newOwner);

    constructor(address implementation_,address owner_) {
        if(owner_==address(0)) revert ZERO_OWNER();
        owner=owner_;
        _upgradeTo(implementation_);
        emit OwnershipTransferred(address(0),owner_);
    }

    function upgradeTo(address implementation_) external {
        if(msg.sender!=owner) revert NOT_OWNER();
        _upgradeTo(implementation_);
    }

    function transferOwnership(address newOwner) external {
        if(msg.sender!=owner) revert NOT_OWNER();
        if(newOwner==address(0)) revert ZERO_OWNER();
        pendingOwner=newOwner;emit OwnershipTransferStarted(owner,newOwner);
    }

    function acceptOwnership() external {
        if(msg.sender!=pendingOwner) revert NOT_OWNER();
        address previous=owner;owner=msg.sender;pendingOwner=address(0);
        emit OwnershipTransferred(previous,msg.sender);
    }

    function _upgradeTo(address implementation_) private {
        if(implementation_.code.length==0) revert INVALID_IMPLEMENTATION();
        implementation=implementation_;
        emit Upgraded(implementation_);
    }
}

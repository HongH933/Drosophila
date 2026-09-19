// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Original project implementation. STOP-prefixed immutable bytecode, no callable data logic.
contract MicroDataPage {
    constructor(bytes memory payload) {
        bytes memory runtime=bytes.concat(hex"00",payload);
        assembly { return(add(runtime,32),mload(runtime)) }
    }
}

/// Only authenticates and reads bytes. No neural arithmetic, results or administrator seal flag.
contract StaticMicroData {
    error CONFIG(); error BUILDER(); error ORDER(); error LENGTH(); error HASH(); error PROOF(); error RANGE(); error MISSING();
    struct Config {uint32 pageBytes;uint64 connectionBytes;uint64 metadataBytes;bytes32 binding;bytes32 pageRoot;}
    struct PageSpec {uint8 kind;uint64 offset;uint32 length;bytes32 contentHash;bytes32 codeHash;}
    struct Page {address pointer;uint32 length;bytes32 codeHash;}
    Config public config;
    address public immutable builder;
    uint256 public immutable payloadBytes;
    uint256 public immutable connectionPages;
    uint256 public immutable pageCount;
    uint256 public registered;
    mapping(uint256=>Page) public pages;
    event Registered(uint256 indexed index,address indexed pointer,uint8 kind,uint64 offset,uint32 length,bytes32 contentHash,bytes32 codeHash);
    constructor(Config memory c,address owner) {
        if((c.pageBytes!=4096&&c.pageBytes!=8192&&c.pageBytes!=16384)||c.connectionBytes%8!=0||c.connectionBytes>400000000||c.metadataBytes==0||c.metadataBytes>1073741824||c.binding==0||c.pageRoot==0||owner==address(0))revert CONFIG();
        config=c;builder=owner;payloadBytes=c.pageBytes-1;
        connectionPages=(c.connectionBytes+payloadBytes-1)/payloadBytes;
        pageCount=connectionPages+(c.metadataBytes+payloadBytes-1)/payloadBytes;
    }
    function complete() external view returns(bool){return registered==pageCount;}
    function createPage(uint256 index,PageSpec calldata s,bytes calldata data,bytes32[] calldata proof) external returns(address pointer) {
        if(msg.sender!=builder)revert BUILDER();
        _checkSpec(index,s,proof);
        if(data.length!=s.length)revert LENGTH();if(keccak256(data)!=s.contentHash)revert HASH();
        pointer=address(new MicroDataPage(data));_register(index,s,pointer);
    }
    function registerPage(uint256 index,PageSpec calldata s,address pointer,bytes32[] calldata proof) external {
        if(msg.sender!=builder)revert BUILDER();_checkSpec(index,s,proof);_register(index,s,pointer);
    }
    function _checkSpec(uint256 index,PageSpec calldata s,bytes32[] calldata proof) private view {
        if(index!=registered||index>=pageCount)revert ORDER();
        uint256 local=index<connectionPages?index:index-connectionPages;
        uint256 total=index<connectionPages?config.connectionBytes:config.metadataBytes;
        uint256 offset=local*payloadBytes;uint256 length=total-offset;if(length>payloadBytes)length=payloadBytes;
        if(s.kind!=(index<connectionPages?0:1)||s.offset!=offset||s.length!=length)revert LENGTH();
        bytes32 h=keccak256(abi.encode(config.binding,index,s));uint256 size=1;uint256 depth;while(size<pageCount){size*=2;depth++;}if(proof.length!=depth)revert PROOF();
        for(uint256 j;j<depth;j++){h=index&1==0?keccak256(abi.encodePacked(h,proof[j])):keccak256(abi.encodePacked(proof[j],h));index>>=1;}if(h!=config.pageRoot)revert PROOF();
    }
    function _register(uint256 index,PageSpec calldata s,address pointer) private {
        if(pointer.code.length!=uint256(s.length)+1)revert LENGTH();if(pointer.codehash!=s.codeHash)revert HASH();
        bytes memory data=new bytes(s.length);bytes1 first;
        assembly { extcodecopy(pointer,0,0,1) first:=mload(0) extcodecopy(pointer,add(data,32),1,mload(data)) }
        if(first!=0||keccak256(data)!=s.contentHash)revert HASH();
        pages[index]=Page(pointer,s.length,s.codeHash);registered++;
        emit Registered(index,pointer,s.kind,s.offset,s.length,s.contentHash,s.codeHash);
    }
    function readConnections(uint256 offset,uint256 length) external view returns(bytes memory){return _read(0,config.connectionBytes,offset,length);}
    function readMetadata(uint256 offset,uint256 length) external view returns(bytes memory){return _read(connectionPages,config.metadataBytes,offset,length);}
    function metadataChunk(uint256 index) external view returns(bytes memory){uint256 offset=index*8192;uint256 total=config.metadataBytes;if(offset>=total)revert RANGE();uint256 count=total-offset;if(count>8192)count=8192;return _read(connectionPages,total,offset,count);}
    function edgeChunk(uint256 recordBase,uint256 records,uint256 index) external view returns(bytes memory){uint256 start=index*64;if(start>=records)revert RANGE();uint256 count=records-start;if(count>64)count=64;return _read(0,config.connectionBytes,(recordBase+start)*8,count*8);}
    function checkProof(bytes32 root,bytes32 leaf,uint256 index,uint256 count,bytes32[] calldata siblings) external pure {
        if(index>=count)revert RANGE();uint256 depth;uint256 size=1;while(size<count){size*=2;depth++;}if(siblings.length!=depth)revert PROOF();for(uint256 i;i<depth;i++){leaf=index&1==0?keccak256(abi.encodePacked(leaf,siblings[i])):keccak256(abi.encodePacked(siblings[i],leaf));index>>=1;}if(leaf!=root)revert PROOF();
    }
    function metadataBytes() external view returns(uint256){return config.metadataBytes;}
    function connectionBytes() external view returns(uint256){return config.connectionBytes;}
    function commitment() external view returns(bytes32){return keccak256(abi.encode(config));}
    /// <=8192 bytes: at most four bounded EXTCODECOPY operations including an unaligned start.
    function _read(uint256 base,uint256 total,uint256 offset,uint256 length) private view returns(bytes memory data){
        if(length>8192||offset>total||length>total-offset)revert RANGE();data=new bytes(length);uint256 done;
        while(done<length){uint256 at=offset+done;uint256 index=base+at/payloadBytes;if(index>=registered)revert MISSING();Page memory p=pages[index];if(p.pointer.codehash!=p.codeHash)revert HASH();uint256 inner=at%payloadBytes;uint256 count=p.length-inner;if(count>length-done)count=length-done;
            address pointer=p.pointer;assembly { extcodecopy(pointer,add(add(data,32),done),add(inner,1),count) }done+=count;
        }
    }
}

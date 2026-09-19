// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./BrainAssembly.sol";
import "./StaticMicroData.sol";
import "./BrainAssemblyMicroPagesStorage.sol";

/// M4 immutable-code data adapter: fixed authenticated records + actual streamed Circuit.step calls.
/// This contract routes bits and schedules phases. It does not compute neural currents or voltages.
contract BrainAssemblyMicroPagesUpgradeable is BrainAssemblyMicroPagesStorage {
    error ACCUMULATOR_BOUND();error AFTER_COMPLETION();error BATCH_LIMIT();error CHUNK();error COLLECTION();error CONFIG();error CURSOR();error CUSTODY();error CUSTODY_OR_CIRCUIT();error DEPOSITOR();error EDGE_BINDING();error EDGE_BUDGET();error EDGE_COMPLETE();error EDGE_COVERAGE();error EDGE_LENGTH();error EDGE_ORDER();error FACTORY();error FRAME_ORDER();error FROZEN();error IMPLEMENTATION();error INCOMPLETE_CONFIG();error INCOMPLETE_OR_STALE();error INDEX();error INVALID_CIRCUIT();error MICROCYCLE_LIMIT();error NOT_READY();error OCCUPIED();error PARTITION_OR_THRESHOLD();error PROOF();error PROOF_LENGTH();error REENTRANCY();error RESULT_LENGTH();error RESULT_PADDING();error ROOT();error SLOT_CORE();error SLOT_SIZE();error STALE_OR_MISSING();error UNEXPECTED_NFT();error WORK_OUTPUT();
    uint256 private constant MAX_SLOTS=1048576;
    uint256 private constant MAX_NEURONS_PER_SLOT=16;
    uint256 private constant MAX_EDGES_PER_SLOT=65536;
    uint256 private constant EDGES_PER_BLOCK=64;
    uint256 private constant MAX_CHUNK_BYTES=8192;
    bytes32 public constant IMPLEMENTATION_VERSION=keccak256("lif-int16-bitserial-assembly-codepages-beacon-v1");
    ICircuits public immutable collection;
    address public immutable factory;address public immutable beacon;address public immutable implementation;
    bytes32 public immutable collectionHash;bytes32 public immutable implementationHash;
    address public immutable builder;uint256 public immutable treeBase;
    StaticMicroData public immutable staticData;
    bytes32 private constant CORE_HASH=0x9154f39bf44799901a82a9621e3b0c9b11369c1455eecf845d3e53915baf3304;
    event Deposited(uint256 indexed slot,uint256 indexed token,address indexed depositor);
    event Withdrawn(uint256 indexed slot,uint256 indexed token,address indexed depositor);
    event MicroOperation(uint256 indexed slot,uint32 cycle,uint32 neuron,uint32 cursor,uint8 bitIndex,uint8 phase,uint32 bits,bytes inputs,bytes outputs);
    event Committed(uint32 indexed step,bytes32 checkpoint);
    modifier nonReentrant(){if(!(entered==1)) revert REENTRANCY();entered=2;_;entered=1;}
    modifier building(){if(!(msg.sender==builder&&!isSealed)) revert FROZEN();_;}
    constructor(address cpu,Config memory c,StaticMicroData data,address owner){
        if(!(cpu.code.length>0&&address(data).code.length>0&&owner!=address(0)&&data.builder()==owner))revert CONFIG();
        if(c.chunks!=(data.metadataBytes()+8191)/8192)revert CONFIG();
        if(!(c.slots>0&&c.slots<=MAX_SLOTS&&c.neurons>=c.slots&&c.neurons<0x80000000&&c.externalInputs<=65536&&c.frames>0&&c.frames<=MAX_SLOTS&&c.chunks>0&&c.chunks<=MAX_SLOTS&&c.maxCycles>0&&c.maxCycles<=64))revert CONFIG();
        if(!(c.slotRoot!=0&&c.dataRoot!=0&&c.frameRoot!=0))revert ROOT();
        collection=ICircuits(cpu);collectionHash=cpu.codehash;factory=ICircuits(cpu).factory();if(!(IFactory(factory).isCPU(cpu)))revert FACTORY();beacon=IFactory(factory).circuitBeacon();implementation=IBeacon(beacon).implementation();if(!(implementation.code.length>0))revert IMPLEMENTATION();implementationHash=implementation.codehash;builder=owner;staticData=data;uint256 base=1;while(base<c.slots)base*=2;treeBase=base;
    }
    function _proof(bytes32 root,bytes32 leaf,uint256 index,uint256 count,bytes32[] calldata siblings) private view {staticData.checkProof(root,leaf,index,count,siblings);}
    function configureSlot(uint256 slot,SlotSpec calldata s,bytes32[] calldata proof) external building {
        if(!(slot==configuredCount&&!configured[slot]&&s.width==1&&s.gateCount==59&&s.netlistBytes==404&&s.netlistHash==CORE_HASH)) revert SLOT_CORE();
        uint256 n=s.neurons.length;if(!(n>0&&n<=MAX_NEURONS_PER_SLOT&&s.edgeCounts.length==n&&s.thresholds.length==n)) revert SLOT_SIZE();
        _proof(config.slotRoot,keccak256(abi.encode(slot,keccak256(abi.encode(s)))),slot,config.slots,proof);_packed(s.initialState,uint32(n*17));
        uint32 edges;for(uint256 i;i<n;i++){uint32 neuron=s.neurons[i];if(!(neuron<config.neurons&&!assignedNeuron[neuron]&&s.thresholds[i]>0&&s.thresholds[i]<=32767)) revert PARTITION_OR_THRESHOLD();assignedNeuron[neuron]=true;assignedCount++;edgeOffset[slot][i]=edges;edges+=s.edgeCounts[i];spikes[0][neuron]=_bit(s.initialState,i*17+16);}
        if(!(edges<=MAX_EDGES_PER_SLOT&&(edges==0?s.edgeRoot==0:s.edgeRoot!=0))) revert EDGE_BUDGET();if(edges==0)completeDataSlots++;slotEdgeBase[slot]=configuredRecords;configuredRecords+=edges;totalEdges[slot]=edges;specs[slot]=s;states[0][slot]=s.initialState;configured[slot]=true;configuredCount++;_update(0,slot,s.initialState);
    }
    function validateEdges(uint256 slot,uint256 index,bytes32[] calldata proof) external building {
        bytes memory data=edgeChunk(slot,index);
        if(!(configured[slot]&&index==loadedBlocks[slot])) revert EDGE_ORDER();uint256 total=totalEdges[slot];uint256 start=index*64;if(!(start<total)) revert EDGE_COMPLETE();uint256 count=total-start;if(count>64)count=64;if(!(data.length==count*8)) revert EDGE_LENGTH();
        _proof(specs[slot].edgeRoot,keccak256(abi.encode(index,keccak256(data))),index,(total+63)/64,proof);
        SlotSpec storage s=specs[slot];uint256 target;uint256 end=s.edgeCounts[0];
        for(uint256 i;i<count;i++){
            while(start+i>=end){target++;if(!(target<s.neurons.length)) revert EDGE_COVERAGE();end+=s.edgeCounts[target];}
            uint256 at=i*8;uint32 source=uint32(uint8(data[at]))|uint32(uint8(data[at+1]))<<8|uint32(uint8(data[at+2]))<<16|uint32(uint8(data[at+3]))<<24;
            uint16 to=uint16(uint8(data[at+4]))|uint16(uint8(data[at+5]))<<8;
            int256 weight=int16(uint16(uint8(data[at+6]))|uint16(uint8(data[at+7]))<<8);absoluteWeightSum[slot][target]+=uint32(uint256(weight<0?-weight:weight));if(!(absoluteWeightSum[slot][target]<=507903)) revert ACCUMULATOR_BOUND();
            if(!(to==target&&(source<config.neurons||(source>=0x80000000&&(source&0x7fffffff)<config.externalInputs)))) revert EDGE_BINDING();
        }
        loadedBlocks[slot]++;loadedEdges[slot]+=uint32(count);if(loadedEdges[slot]==total)completeDataSlots++;
    }
    function edgeChunk(uint256 slot,uint256 index) public view returns(bytes memory) {
        if(!configured[slot])revert EDGE_ORDER();return staticData.edgeChunk(slotEdgeBase[slot],totalEdges[slot],index);
    }
    function dataChunk(uint256 index) public view returns(bytes memory) {return staticData.metadataChunk(index);}
    function validateChunk(uint256 index,bytes32[] calldata proof) external building {
        if(index!=chunkCount)revert CHUNK();bytes memory data=dataChunk(index);_proof(config.dataRoot,keccak256(abi.encode(index,keccak256(data))),index,config.chunks,proof);chunkCount++;
    }
    function configureFrame(uint256 index,bytes calldata bits,bytes32[] calldata proof) external building {
        if(!(index==loadedFrames&&index<config.frames)) revert FRAME_ORDER();_packed(bits,config.externalInputs);_proof(config.frameRoot,keccak256(abi.encode(index,keccak256(bits))),index,config.frames,proof);inputFrame[index]=bits;loadedFrames++;
    }
    function seal() external building {if(!(staticData.complete()&&configuredRecords*8==staticData.connectionBytes()&&configuredCount==config.slots&&assignedCount==config.neurons&&completeDataSlots==config.slots&&chunkCount==config.chunks&&loadedFrames==config.frames)) revert INCOMPLETE_CONFIG();isSealed=true;}
    function slotSpec(uint256 slot) external view returns(SlotSpec memory){if(!(slot<config.slots)) revert INDEX();return specs[slot];}
    function holding(uint256 slot) external view returns(Holding memory){return holdings[slot];}
    function committedState(uint256 slot) external view returns(bytes memory){if(!(slot<config.slots)) revert INDEX();return states[committedBank][slot];}
    function pendingState(uint256 slot) external view returns(bytes memory){if(!(slot<config.slots)) revert INDEX();return active&&work[slot].round==roundNonce?states[1-committedBank][slot]:new bytes(specs[slot].neurons.length*17/8+((specs[slot].neurons.length*17)%8>0?1:0));}
    function currentWork(uint256 slot) public view returns(Work memory w){if(!(slot<config.slots)) revert INDEX();w=work[slot];if(w.round!=roundNonce)w=Work(roundNonce,0,0,0,0,0,0);}
    function stateRoot() public view returns(bytes32){return tree[committedBank][1];}
    function workRoot() public view returns(bytes32){return _workNode(1);}
    function checkpointHash() public view returns(bytes32){return keccak256(abi.encode(IMPLEMENTATION_VERSION,staticData.commitment(),config.slotRoot,config.dataRoot,config.frameRoot,completedSteps,stateRoot()));}
    function microcheckpointHash() external view returns(bytes32){return keccak256(abi.encode(checkpointHash(),assemblyVersion,roundNonce,active,completedModules,workRoot()));}
    function implementationValid() public view returns(bool){return address(collection).codehash==collectionHash&&collection.factory()==factory&&IFactory(factory).circuitBeacon()==beacon&&IBeacon(beacon).implementation()==implementation&&implementation.codehash==implementationHash;}
    function ready() public view returns(bool){return isSealed&&!custodyFault&&presentCount==config.slots&&implementationValid();}
    function valid(uint256 slot,uint256 token) public view returns(bool){SlotSpec storage s=specs[slot];(uint32 ni,uint32 no,uint32 ns,uint32 gc)=collection.circuitInfo(token);if(ni!=12||no!=3||ns!=3||gc!=59)return false;bytes memory nl=collection.netlist(token);return nl.length==s.netlistBytes&&keccak256(nl)==s.netlistHash;}
    function deposit(uint256 slot,address cpu,uint256 token) external nonReentrant {
        if(!(isSealed&&slot<config.slots&&cpu==address(collection)&&implementationValid()&&!custodyFault)) revert COLLECTION();if(!(holdings[slot].depositor==address(0)&&occupiedToken[token]==0)) revert OCCUPIED();if(!(collection.ownerOf(token)==msg.sender&&valid(slot,token))) revert INVALID_CIRCUIT();awaiting=true;incomingFrom=msg.sender;incomingId=token;collection.safeTransferFrom(msg.sender,address(this),token);if(!(!awaiting&&collection.ownerOf(token)==address(this))) revert CUSTODY();holdings[slot]=Holding(token,msg.sender);occupiedToken[token]=slot+1;presentCount++;_invalidate();emit Deposited(slot,token,msg.sender);
    }
    function onERC721Received(address operator,address from,uint256 token,bytes calldata) external returns(bytes4){if(!(msg.sender==address(collection)&&entered==2&&awaiting&&operator==address(this)&&from==incomingFrom&&token==incomingId)) revert UNEXPECTED_NFT();awaiting=false;return this.onERC721Received.selector;}
    function withdraw(uint256 slot,address recipient) external nonReentrant {Holding memory h=holdings[slot];if(!(h.depositor==msg.sender&&recipient!=address(0)&&recipient!=address(this))) revert DEPOSITOR();delete holdings[slot];delete occupiedToken[h.tokenId];presentCount--;_invalidate();collection.safeTransferFrom(address(this),recipient,h.tokenId);emit Withdrawn(slot,h.tokenId,msg.sender);}
    function _invalidate() private {assemblyVersion++;active=false;completedModules=0;}
    function auditCustody(uint256[] calldata slots) external nonReentrant {if(!(slots.length>0&&slots.length<=8)) revert BATCH_LIMIT();for(uint256 j;j<slots.length;j++){uint256 i=slots[j];if(!(i<config.slots)) revert INDEX();Holding memory h=holdings[i];if(h.depositor!=address(0)&&collection.ownerOf(h.tokenId)!=address(this)){custodyFault=true;_invalidate();}}}
    function begin(uint64 version) external nonReentrant {if(!(version==assemblyVersion&&!active&&ready()&&completedSteps<config.frames)) revert NOT_READY();roundNonce++;active=true;completedModules=0;}
    function advance(uint64 version,uint64 round,uint256 slot,uint32 neuron,uint32 cursor,uint8 bitIndex,uint8 phase,uint32 cyclesDone,uint8 count) external nonReentrant {
        if(!(active&&version==assemblyVersion&&round==roundNonce&&ready())) revert STALE_OR_MISSING();if(!(slot<config.slots&&count>0&&count<=config.maxCycles)) revert MICROCYCLE_LIMIT();Work memory w=currentWork(slot);if(!(w.neuron==neuron&&w.cursor==cursor&&w.bitIndex==bitIndex&&w.phase==phase&&w.cycles==cyclesDone&&phase!=5)) revert CURSOR();uint256 token=holdings[slot].tokenId;if(!(collection.ownerOf(token)==address(this)&&valid(slot,token))) revert CUSTODY_OR_CIRCUIT();
        if(work[slot].round!=round)states[1-committedBank][slot]=new bytes((specs[slot].neurons.length*17+7)/8);
        for(uint256 j;j<count;j++){if(!(w.phase!=5)) revert AFTER_COMPLETION();w=_cycle(slot,token,w);}
        work[slot]=w;_updateWork(slot,w);
    }
    function _cycle(uint256 slot,uint256 token,Work memory w) private returns(Work memory){
        SlotSpec storage s=specs[slot];uint256 b=w.bitIndex;uint32 acc=w.bits>>3;bytes memory input=new bytes(2);
        _put(input,6,uint8(acc>>15)&1);_put(input,7,uint8(acc>>19)&1);_put(input,11,b==15?1:0);
        if(w.phase==0){_put(input,0,_bit(states[committedBank][slot],uint256(w.neuron)*17+(b+1>15?15:b+1)));_put(input,3,1);}
        else if(w.phase==1){uint256 index=edgeOffset[slot][w.neuron]+w.cursor;bytes memory data=staticData.readConnections((slotEdgeBase[slot]+index)*8,8);uint256 at=0;uint32 source;for(uint256 k;k<4;k++)source|=uint32(uint8(data[at+k]))<<uint32(k*8);uint256 wb=b>15?15:b;
            _put(input,0,uint8(acc>>b)&1);_put(input,1,(uint8(data[at+6+wb/8])>>uint8(wb%8))&1);
            _put(input,2,source<0x80000000?spikes[committedBank][source]:_bit(inputFrame[completedSteps],source&0x7fffffff));_put(input,3,b==0?1:0);
        }else if(w.phase==2){_put(input,0,uint8(acc>>(16+b))&1);_put(input,4,1);_put(input,5,b==0?1:0);}
        else {_put(input,0,uint8(acc>>b)&1);if(w.phase==3){_put(input,8,1);_put(input,9,b==0?1:0);_put(input,10,uint8(s.thresholds[w.neuron]>>b)&1);}}
        (bytes memory next,bytes memory output)=collection.step(token,abi.encodePacked(uint8(w.bits)&7),input);_packed(next,3);_packed(output,3);
        if(w.phase<=1)acc=(acc&~(uint32(1)<<b))|(uint32(_bit(output,0))<<b);
        else if(w.phase==4){bytes memory pending=states[1-committedBank][slot];_put(pending,uint256(w.neuron)*17+b,_bit(output,1));_put(pending,uint256(w.neuron)*17+16,_bit(output,2));states[1-committedBank][slot]=pending;if(b==15)spikes[1-committedBank][s.neurons[w.neuron]]=_bit(output,2);}
        w.bits=(acc<<3)|uint8(next[0]);w.cycles++;w.bitIndex++;
        if(w.phase==0&&w.bitIndex==20){w.bitIndex=0;w.phase=s.edgeCounts[w.neuron]==0?2:1;}
        else if(w.phase==1&&w.bitIndex==20){w.bitIndex=0;w.cursor++;if(w.cursor==s.edgeCounts[w.neuron])w.phase=2;}
        else if(w.phase==2&&w.bitIndex==4){w.bitIndex=0;w.phase=3;}
        else if(w.phase==3&&w.bitIndex==15){w.bitIndex=0;w.phase=4;}
        else if(w.phase==4&&w.bitIndex==16){w.bitIndex=0;w.cursor=0;w.neuron++;w.phase=w.neuron==s.neurons.length?5:0;if(w.phase==5){completedModules++;_update(1-committedBank,slot,states[1-committedBank][slot]);}}
        emit MicroOperation(slot,w.cycles,w.neuron,w.cursor,w.bitIndex,w.phase,w.bits,input,output);return w;
    }
    function commit(uint64 version,uint64 round) external nonReentrant {if(!(active&&version==assemblyVersion&&round==roundNonce&&ready()&&completedModules==config.slots)) revert INCOMPLETE_OR_STALE();committedBank=1-committedBank;completedSteps++;active=false;completedModules=0;emit Committed(completedSteps,checkpointHash());}
    function _update(uint256 bank,uint256 slot,bytes memory state) private {uint256 node=treeBase+slot;tree[bank][node]=keccak256(abi.encode(slot,keccak256(state)));while(node>1){node>>=1;tree[bank][node]=keccak256(abi.encodePacked(tree[bank][node*2],tree[bank][node*2+1]));}}
    function _workNode(uint256 node) private view returns(bytes32){return workTree[node].round==roundNonce?workTree[node].value:bytes32(0);}
    function _updateWork(uint256 slot,Work memory w) private {uint256 node=treeBase+slot;workTree[node]=WorkNode(roundNonce,keccak256(abi.encode(slot,w.round,w.neuron,w.cursor,w.cycles,w.bitIndex,w.phase,w.bits,keccak256(states[1-committedBank][slot]))));while(node>1){node>>=1;workTree[node]=WorkNode(roundNonce,keccak256(abi.encodePacked(_workNode(node*2),_workNode(node*2+1))));}}
    function _bit(bytes memory data,uint256 bit) private pure returns(uint8){return(uint8(data[bit/8])>>uint8(bit%8))&1;}
    function _put(bytes memory data,uint256 bit,uint8 value) private pure {uint8 mask=uint8(1<<uint8(bit%8));data[bit/8]=bytes1((uint8(data[bit/8])&~mask)|(value==0?0:mask));}
    function _packed(bytes memory data,uint32 bits) private pure {if(!(data.length==(bits+7)/8)) revert RESULT_LENGTH();if(bits%8!=0)if(!(uint8(data[data.length-1])>>(bits%8)==0)) revert RESULT_PADDING();}
}

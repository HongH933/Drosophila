// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICircuits {
    function factory() external view returns (address);
    function ownerOf(uint256 id) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 id) external;
    function netlist(uint256 id) external view returns (bytes memory);
    function circuitInfo(uint256 id) external view returns (uint32,uint32,uint32,uint32);
    function step(uint256 id, bytes calldata state, bytes calldata inputs) external view returns (bytes memory,bytes memory);
}
interface IFactory { function isCPU(address) external view returns(bool); function circuitBeacon() external view returns(address); }
interface IBeacon { function implementation() external view returns(address); }

/// P1 prototype. Neuron arithmetic executes ONLY inside the held Circuit NFT's step().
contract BrainAssembly {
    struct SlotSpec { uint32 nIn; uint32 nOut; uint32 nState; uint32 gateCount; bytes netlist; uint32[] sources; uint32[] neurons; bytes initialState; }
    struct Holding { uint256 tokenId; address depositor; }
    ICircuits public immutable collection;
    address public immutable beacon;
    address public immutable implementation;
    bytes32 public immutable implementationHash;
    address public immutable builder;
    uint32 public immutable neuronCount;
    uint32 public immutable externalCount;
    uint32 public immutable maxBatch;
    uint32 public immutable frameCount;
    bytes32[] public expectedSlotHashes;
    bytes public metadata;
    bytes public inputSequence;
    SlotSpec[] private specs;
    Holding[] private holdings;
    bytes[] private committed;
    bytes[] private pendingStates;
    bytes[] private pendingOutputs;
    uint64[] private doneRound;
    bool[] private configured;
    bool[] private assignedNeuron;
    mapping(uint256=>uint256) public occupiedToken;
    bytes public spikes;
    uint256 public configuredCount;
    uint256 public presentCount;
    uint256 public completedSteps;
    uint256 public batchProgress;
    uint64 public assemblyVersion=1;
    uint64 public roundNonce;
    bool public isSealed;
    bool public active;
    uint256 private entered=1;
    bool private awaiting;
    address private incomingFrom;
    uint256 private incomingId;

    event Deposited(uint256 indexed slot,uint256 indexed tokenId,address indexed depositor,uint64 version);
    event Withdrawn(uint256 indexed slot,uint256 indexed tokenId,address indexed depositor,uint64 version);
    event RoundStarted(uint64 indexed version,uint64 indexed round,uint256 step);
    event ModuleExecuted(uint64 indexed round,uint256 indexed slot,bytes state,bytes output);
    event Committed(uint64 indexed round,uint256 step,bytes32 checkpointHash);
    modifier nonReentrant(){require(entered==1,"REENTRANCY");entered=2;_;entered=1;}
    constructor(address cpu,bytes32[] memory slotHashes,bytes memory metadata_,bytes memory sequence,uint32 neurons,uint32 externalInputs,uint32 batchLimit) {
        require(cpu.code.length>0&&slotHashes.length>0&&neurons>0&&externalInputs>0&&batchLimit>0,"CONFIG");
        require(sequence.length>0&&sequence.length%externalInputs==0,"INPUTS");
        for(uint256 i;i<sequence.length;i++)require(uint8(sequence[i])<2,"INPUT_BIT");
        collection=ICircuits(cpu);address factory=ICircuits(cpu).factory();require(IFactory(factory).isCPU(cpu),"FACTORY");
        beacon=IFactory(factory).circuitBeacon();implementation=IBeacon(beacon).implementation();require(implementation.code.length>0,"IMPLEMENTATION");implementationHash=implementation.codehash;
        builder=msg.sender;neuronCount=neurons;externalCount=externalInputs;maxBatch=batchLimit;frameCount=uint32(sequence.length/externalInputs);
        expectedSlotHashes=slotHashes;metadata=metadata_;inputSequence=sequence;spikes=new bytes(neurons);
        assignedNeuron=new bool[](neurons);
        for(uint256 i;i<slotHashes.length;i++){specs.push();holdings.push();committed.push();pendingStates.push();pendingOutputs.push();doneRound.push();configured.push();}
    }
    function slotCount() external view returns(uint256){return specs.length;}
    function slotSpec(uint256 slot) external view returns(SlotSpec memory){return specs[slot];}
    function holding(uint256 slot) external view returns(Holding memory){return holdings[slot];}
    function committedState(uint256 slot) external view returns(bytes memory){return committed[slot];}
    function pendingState(uint256 slot) external view returns(bytes memory,bytes memory,uint64){return(pendingStates[slot],pendingOutputs[slot],doneRound[slot]);}
    function configureSlot(uint256 slot,SlotSpec calldata spec) external {
        require(msg.sender==builder&&!isSealed&&!configured[slot],"FROZEN");
        require(keccak256(abi.encode(spec))==expectedSlotHashes[slot],"SPEC_HASH");
        require(spec.netlist.length>0&&spec.nIn==spec.sources.length&&spec.nOut==spec.neurons.length&&spec.nOut>0&&spec.nState==spec.nOut*17,"LAYOUT");
        require(spec.initialState.length==(spec.nState+7)/8,"STATE_LENGTH");
        for(uint256 i;i<spec.initialState.length;i++)require(spec.initialState[i]==0,"INITIAL_ZERO");
        for(uint256 i;i<spec.neurons.length;i++){uint256 id=spec.neurons[i];require(id<neuronCount&&!assignedNeuron[id],"PARTITION");assignedNeuron[id]=true;}
        for(uint256 i;i<spec.sources.length;i++){uint32 src=spec.sources[i];require(src<neuronCount||(src>=0x80000000&&(src&0x7fffffff)<externalCount),"SOURCE");}
        specs[slot]=spec;committed[slot]=spec.initialState;configured[slot]=true;configuredCount++;
    }
    function seal() external {
        require(msg.sender==builder&&!isSealed&&configuredCount==specs.length,"NOT_CONFIGURED");
        for(uint256 i;i<neuronCount;i++)require(assignedNeuron[i],"MISSING_NEURON");isSealed=true;
    }
    function valid(uint256 slot,uint256 token) public view returns(bool){
        SlotSpec storage s=specs[slot];
        (uint32 ni,uint32 no,uint32 ns,uint32 gc)=collection.circuitInfo(token);
        return ni==s.nIn&&no==s.nOut&&ns==s.nState&&gc==s.gateCount&&keccak256(collection.netlist(token))==keccak256(s.netlist);
    }
    function implementationValid() public view returns(bool){return IBeacon(beacon).implementation()==implementation&&implementation.codehash==implementationHash;}
    function ready() public view returns(bool){
        if(!isSealed||presentCount!=specs.length||!implementationValid())return false;
        for(uint256 i;i<specs.length;i++)if(holdings[i].depositor==address(0)||collection.ownerOf(holdings[i].tokenId)!=address(this))return false;
        return true;
    }
    function deposit(uint256 slot,address cpu,uint256 token) external nonReentrant {
        require(isSealed&&cpu==address(collection)&&implementationValid(),"COLLECTION");
        require(holdings[slot].depositor==address(0)&&occupiedToken[token]==0,"OCCUPIED");
        require(collection.ownerOf(token)==msg.sender&&valid(slot,token),"INVALID_CIRCUIT");
        awaiting=true;incomingFrom=msg.sender;incomingId=token;
        collection.safeTransferFrom(msg.sender,address(this),token);
        require(!awaiting&&collection.ownerOf(token)==address(this),"CUSTODY");
        holdings[slot]=Holding(token,msg.sender);occupiedToken[token]=slot+1;presentCount++;_invalidate();
        emit Deposited(slot,token,msg.sender,assemblyVersion);
    }
    function onERC721Received(address operator,address from,uint256 token,bytes calldata) external returns(bytes4){
        require(msg.sender==address(collection)&&entered==2&&awaiting&&operator==address(this)&&from==incomingFrom&&token==incomingId,"UNEXPECTED_NFT");awaiting=false;return this.onERC721Received.selector;
    }
    function withdraw(uint256 slot,address recipient) external nonReentrant {
        Holding memory h=holdings[slot];require(h.depositor==msg.sender&&recipient!=address(0)&&recipient!=address(this),"DEPOSITOR");
        delete holdings[slot];delete occupiedToken[h.tokenId];presentCount--;_invalidate();
        collection.safeTransferFrom(address(this),recipient,h.tokenId);emit Withdrawn(slot,h.tokenId,msg.sender,assemblyVersion);
    }
    function _invalidate() private {assemblyVersion++;active=false;batchProgress=0;}
    function begin(uint64 version) external nonReentrant {
        require(version==assemblyVersion&&!active&&ready()&&completedSteps<frameCount,"NOT_READY");
        roundNonce++;active=true;batchProgress=0;emit RoundStarted(assemblyVersion,roundNonce,completedSteps);
    }
    function execute(uint64 version,uint64 round,uint256[] calldata slots) external nonReentrant {
        require(active&&version==assemblyVersion&&round==roundNonce&&ready(),"STALE_OR_MISSING");
        require(slots.length>0&&slots.length<=maxBatch,"BATCH_LIMIT");
        for(uint256 j;j<slots.length;j++){
            uint256 i=slots[j];require(i<specs.length&&doneRound[i]!=round,"DUPLICATE");
            SlotSpec storage s=specs[i];uint256 token=holdings[i].tokenId;require(valid(i,token),"CHANGED_CIRCUIT");
            bytes memory inputs=new bytes((s.nIn+7)/8);
            for(uint256 k;k<s.sources.length;k++){
                uint32 src=s.sources[k];uint8 bit=src<0x80000000?uint8(spikes[src]):uint8(inputSequence[completedSteps*externalCount+(src&0x7fffffff)]);
                if(bit==1)inputs[k/8]|=bytes1(uint8(1<<(k%8)));
            }
            (bytes memory state,bytes memory output)=collection.step(token,committed[i],inputs);
            _packed(state,s.nState);_packed(output,s.nOut);
            for(uint256 k;k<s.neurons.length;k++)require(_bit(state,k*17+16)==_bit(output,k),"SPIKE_STATE_MISMATCH");
            pendingStates[i]=state;pendingOutputs[i]=output;doneRound[i]=round;batchProgress++;
            emit ModuleExecuted(round,i,state,output);
        }
        // Every module reads committed[] and spikes until this barrier is reached.
        if(batchProgress==specs.length){
            for(uint256 i;i<specs.length;i++){
                require(doneRound[i]==round,"INCOMPLETE");committed[i]=pendingStates[i];
                for(uint256 k;k<specs[i].neurons.length;k++)spikes[specs[i].neurons[k]]=bytes1(_bit(pendingOutputs[i],k));
            }
            completedSteps++;active=false;batchProgress=0;emit Committed(round,completedSteps,checkpointHash());
        }
    }
    function _bit(bytes memory data,uint256 bit) private pure returns(uint8){return (uint8(data[bit/8])>>uint8(bit%8))&1;}
    function _packed(bytes memory data,uint32 bits) private pure {require(data.length==(bits+7)/8,"RESULT_LENGTH");if(bits%8!=0)require(uint8(data[data.length-1])>>(bits%8)==0,"RESULT_PADDING");}
    function checkpointHash() public view returns(bytes32){return keccak256(abi.encode(completedSteps,committed,spikes));}
}

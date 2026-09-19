# BSC 主网合约部署资料

## 范围与来源

这是 chainId **56** 的 **CONTRACTS_ONLY_DEPLOYED** 资料同步。来源提交 `118213c66bc36c085cd9bda7ad2afc59054bc8b3`；公开工程基于后续提交 `119a9fe` 整理。不是重新部署或主网全脑运行。

- [派生部署摘要](../deployments/bsc-mainnet/deployment.json) / [角色地址清单](../deployments/bsc-mainnet/addresses.json) / [原文件 SHA256](../deployments/bsc-mainnet/source-hashes.json)。
- [历史部署状态](../deployments/bsc-mainnet/status-at-deployment.json) 保留原锚点；[新只读观察](../deployments/bsc-mainnet/current-observation.json) 单独记录，不覆盖历史。
- 公开摘要只提取实际部署记录与回执；并非原签名证明，不包含完整计划、账户余额、私密授权、签名交易或运行目录。旧仓库只作为来源标识，运行和编译不依赖其可访问性。

## 两条不同的依赖链

```text
公开 Assembly Proxy → 项目 ProjectUpgradeableBeacon → 组装 implementation
既有 Processor / Circuits → 绑定的 protocolFactory → TapeOut Circuit Beacon → Circuit implementation
```

| 角色 | 主网地址 / BscScan |
| --- | --- |
| Assembly Proxy：对外组装入口 | [0xFc970a468649261324DD11A38Cc532b717bDf1eE](https://bscscan.com/address/0xFc970a468649261324DD11A38Cc532b717bDf1eE) |
| 既有 Processor / Circuits | [0xD72Cfc1D2F8B659ce1Ae441Ae18c3c0f9A3710C5](https://bscscan.com/address/0xD72Cfc1D2F8B659ce1Ae441Ae18c3c0f9A3710C5) |
| 该 Processor 实际绑定的 Factory | [0x68224F668083c29e9800Be2a646d42d18cedF7e2](https://bscscan.com/address/0x68224F668083c29e9800Be2a646d42d18cedF7e2) |
| StaticMicroData：数据页目录 | [0x9EC103817da8642339315F21e721aB289B47fC2f](https://bscscan.com/address/0x9EC103817da8642339315F21e721aB289B47fC2f) |
| 项目 Beacon：组装器升级指针 | [0xeecF62291a624Edbe6e3324F9b73A2afa91C3581](https://bscscan.com/address/0xeecF62291a624Edbe6e3324F9b73A2afa91C3581) |
| 组装逻辑 implementation | [0x5dc8d01DA5517fCe1C9e127DBa32ae7118B17B0c](https://bscscan.com/address/0x5dc8d01DA5517fCe1C9e127DBa32ae7118B17B0c) |
| Proxy 一次性存储初始化器 | [0x7b3b7992586E452B7f2c8b42901A472710B86635](https://bscscan.com/address/0x7b3b7992586E452B7f2c8b42901A472710B86635) |


其他依赖与权限：

- protocolCircuitBeacon：[0xf8D6d8EB894d6971c8976Ad8b4971cbEFE028156](https://bscscan.com/address/0xf8D6d8EB894d6971c8976Ad8b4971cbEFE028156)。
- protocolCircuitImplementation：[0x8E1D125Def6d3826C278299273a0760D47626068](https://bscscan.com/address/0x8E1D125Def6d3826C278299273a0760D47626068)。
- transistors：[0x8CF6C8c2472136c85e4b89fd6996C2cc54BCA23e](https://bscscan.com/address/0x8CF6C8c2472136c85e4b89fd6996C2cc54BCA23e)。
- projectBeaconOwner：[0xd5E2af7fFde4E16b98284C12e0b6d5E09cC515fE](https://bscscan.com/address/0xd5E2af7fFde4E16b98284C12e0b6d5E09cC515fE)。

`brain`、`assembly` 和 `proxy` 别名均由地址清单指向 `assemblyProxy`，不是实现或初始化器。该 Factory 是指定 Processor 当前绑定的实例，不代表协议唯一 Factory。Processor 为既有依赖，本次五笔交易没有创建 Processor。

项目升级指针从 Proxy 的 EIP-1967 Beacon 槽 `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` 解析。组装 ABI 中的 `beacon()` / `implementation()` 是锁定的 **TapeOut 协议**依赖，不能当作项目升级指针。组装状态始终经 Proxy 读取，实现合约自身的 storage 不代表项目状态。

Transistors 原部署摘要未收录。本轮从实际 Processor 的 `transistors()` 接口在区块 122755113 读得上述地址，并记录非空 runtime 及 hash。证据见只读观察；这是接口与代码身份核对，不代表已经完成底层权限审查。

## 升级与信任边界

当前记录的项目 Beacon owner 是 `0xd5E2af7fFde4E16b98284C12e0b6d5E09cC515fE`，本次观察 `pendingOwner` 为零。owner 可调用 `upgradeTo`，替换 Proxy 的全部组装行为，包括 NFT 托管与取回规则。两步 ownership transfer 不等于多签、权限放弃或时间锁；尚未独立安全审计。

Proxy 构造时通过独立 initializer 以 delegatecall 初始化自身状态，运行时由项目 Beacon 指定实现。项目实现仍核对 TapeOut Circuit 依赖的固定身份，`implementationValid()` 与项目 Beacon 管理权限是不同层次。未来升级必须独立审查 storage layout 和权限，不能仅凭接口相同判断安全。

数据页字节不可变不代表可升级组装规则不可变。目前仅数据目录已部署，**还未上传完整连接字节**。协议匹配源码缺口保持 `BLOCKED_SOURCE`；现有 ABI、代码 hash 和行为核对不能替代源码权限审查。

## 五笔真实部署

| 创建角色 | 交易 / 主网浏览器 | 区块 | Gas used |
| --- | --- | --- | --- |
| staticData | [0x53a9ebdf78345e8b0eff7e6513f85641a1b3cdc422058bc8009509d14ce71cdd](https://bscscan.com/tx/0x53a9ebdf78345e8b0eff7e6513f85641a1b3cdc422058bc8009509d14ce71cdd) | 122749762 | 1387572 |
| initializer | [0x4e2f108c7ec8a287391bc5d188f9a2b58deeeb706af0b07d1e7bfda9f9ded775](https://bscscan.com/tx/0x4e2f108c7ec8a287391bc5d188f9a2b58deeeb706af0b07d1e7bfda9f9ded775) | 122749791 | 750370 |
| assemblyImplementation | [0x4e3dbf98fec20565e524df858d19c182f7a9b91e4840dfb5356f282e119a61e6](https://bscscan.com/tx/0x4e3dbf98fec20565e524df858d19c182f7a9b91e4840dfb5356f282e119a61e6) | 122749820 | 5414604 |
| projectBeacon | [0x8f19a832e7715030a87b441b56838fd3091eae0e477c27ec8070656349624666](https://bscscan.com/tx/0x8f19a832e7715030a87b441b56838fd3091eae0e477c27ec8070656349624666) | 122749851 | 252779 |
| assemblyProxy | [0xda20c403b01f86d8f6ba50d2ae6d53801ec91060f4b1cf0a0aa7a996f7633111](https://bscscan.com/tx/0xda20c403b01f86d8f6ba50d2ae6d53801ec91060f4b1cf0a0aa7a996f7633111) | 122749879 | 372863 |

合计 **0.0004089094 BNB**。准确区块 hash、地址、runtime hash/大小及每笔费用见 [receipts-index.json](../deployments/bsc-mainnet/receipts-index.json)。不包含既有 Processor、后续数据写入、制造、托管与计算；不与 tBNB 相加。

历史及本轮观察均为配置未完成、未封存、未 ready。目标 10,419 枚 NFT 与本部署报告的制造完成记录 0 分开；后者不代表合集总供应。

## 精确源码与构建

- [contracts/mainnet](../contracts/mainnet)：五个新增源码与真实依赖 `BrainAssembly.sol`、`StaticMicroData.sol`，共七个源文件，原字节复制。
- [compiler-input.json](../build/mainnet/compiler-input.json) 保留原标准 JSON 源文件名；[manifest.json](../build/mainnet/manifest.json) 保存编译器、优化和源 hash。
- [build/mainnet](../build/mainnet) 保存 ABI、创建 bytecode、runtime 模板、immutable references 和 storage layout；[abi/mainnet](../abi/mainnet) 可单独使用。协议 ABI 仅为接口，不冒充其匹配源码。
- solc `0.8.24+commit.e11b9ed9.Emscripten.clang`，optimizer runs=200，viaIR=true，EVM Shanghai。组装实现 runtime **24,512 bytes**，仍在 24,576 字节限制内。

```sh
npm ci
npm run build:mainnet
```

本地重编译逐项比较全部七个构建产物的 ABI、创建 bytecode、runtime 模板、immutable references 和 storage layout；[本轮重编译证据](../evidence/mainnet-sync/recompile.json)。runtime 模板中的 immutable 占位和实际部署后 code hash 不相同；链上身份按部署记录中的 hash 比较。编译核对不是安全审计。

## 只读状态命令

```sh
# 在本工程 .env 中仅填写 BSC_MAINNET_RPC_URL；不需要钱包或私钥
npm run status:mainnet
npm run status:mainnet -- --verify-deployment
```

只允许六种只读 RPC 方法，最多 128 次、180 秒总请求准入预算，每次请求超时 15 秒，不自动重试。先确认 chain56，选择最新块并将所有状态读取固定到同一块号，末尾重查该 hash 和网络。不是多次 latest 拼接状态，也不宣称不可逆最终性。异常或不可解码返回 UNAVAILABLE，不输出上游错误中的端点凭据，不回退97。

输出包括项目 Beacon 的 owner/pendingOwner/实现、协议指针、实际 code hash、Proxy 的配置/托管/计算进度和 data registered。与原记录不一致时列出 changes；即使新实现无法解码，已发现的变化仍放在未完成 partial 中，不当作有效当前快照。`ready=false` 是正常阶段值，不是查询失败。

本轮实测区块 **122755113**，hash `0xbf82c86d78cc9f728be6026b9d16a2e9969f27a39078f6811de04a7abc81e27e`，60 次只读 RPC。五笔部署回执、创建地址、费用和 canonical 区块均核对；当前代码与原部署记录一致。registered=0、configuredCount=0、presentCount=0、isSealed=false、ready=false、active=false、completedSteps=0。每次执行另写 results，不修改部署快照。

## 测试网与模型仍独立

`verify:chain`、`status:chain`、`reproduce` 保持 chain97/测试网历史快照入口。31 个分片、区块 131798986/hash、原摘要、核心、参数、固定期望及两个历史签名 payload 均未改。主网无完整复现快照。两步复现仍是测试网 step0 数据在电脑上执行，publicNeuralSteps=0。

当前工程压力 profile、3468 个未决符号与生物学边界见 [模型说明](MODEL_AND_DATA.md)。资料公开不批准主网制造、托管或经费；本工程不包含公共交易发送器。

## 本轮验证文件

[验证汇总](../evidence/mainnet-sync/validation.json) 包含测试、只读边界与源码摘要；[保留原件核对](../evidence/mainnet-sync/preservation.json) 对比同步前已提交文件清单。相关测试和 typecheck 通过，不重复运行完整模型。公开文件清单已更新；本轮主网/测试网发送均为 0，未 commit、push、tag 或 Release。

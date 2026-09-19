# droso

**这是社会实验和工程模型，不是真实果蝇行为、意识、糖响应或论文功能模型的复刻证明。**

我们把 MaleCNS v1.0 的一个明确神经元内部连接图映射为整数神经模型，用实际 **56 NAND + 3 LATCH** 网表执行。每个模块对应一枚独立 Circuit NFT；本版本有 **10,419 枚 NFT、166,700 个神经元、25,582,938 条连接**。数据及电路已部署并托管在 BSC Testnet。电脑是主要计算端。

公开包独立包含复现载荷，不需要原研发仓库、钱包、私钥、tBNB 或 Anvil。依赖安装后，普通复现不访问网络。只读链核对需要你自己的 RPC，是单独的可选步骤。

## 快速离线复现

要求 Node.js >=22.18，建议64位系统、至少数GiB可用内存与约2GiB可用磁盘；这是工程建议，不是所有机器上的最低配置保证。

```sh
npm ci
npm run snapshot:verify
npm run reproduce -- --steps 2 --out results/my-first-run
```

`results/my-first-run/report.json` 给出结果、耗时、内存、机器环境和检查点；`step1.states.txt` / `step2.states.txt` 给出每个bodyId的电位和脉冲。输出目录必须尚不存在。再次运行请选择新目录。

程序校验31个分片、历史签名与固定摘要，从历史区块实际数据重建step0，解释执行真实网表；每步与独立整数参考逐神经元比较，最后检查固定预期摘要。预存结果不参与计算。

### 独立进程的部分恢复

```sh
npm run reproduce -- --save-partial-and-exit --out results/partial
npm run reproduce -- --resume results/partial/report.json --out results/resumed
```

第一条在非时间步边界保存后退出，第二条为独立进程。每次检查点使用不可变代次，输入快照和原代次不覆盖。按每进程10分钟/约1.5GiB RSS预算保存PARTIAL，不当作PASS。

## 历史区块与当前状态分开核对

```sh
cp .env.example .env
# 在 .env 中填写自己的 BSC_TESTNET_RPC_URL；无需任何钱包字段。
npm run verify:chain -- --mode sample --out results/history-sample.json
npm run verify:chain -- --mode full --out results/history-full.json
npm run status:chain
```

历史RPC必须提供区块 **131798986** 的状态。优先使用blockHash+requireCanonical；节点明确拒绝该参数时固定区块号，并在每组前后核对hash；历史状态不可用时报告UNAVAILABLE，绝不改读latest冒充通过。sample为公开固定种子选择32槽/32页；full覆盖全部10419槽/51567页。每次最多10分钟，PARTIAL原地恢复：

```sh
npm run verify:chain -- --mode full --resume results/history-full.json.checkpoint.json --out results/history-full-next.json
```

本地续查检查点是你本机保存的进度；摘要检测文件损坏，不是第三方信任证明。需要独立重新审计时不用 `--resume`。RPC读取加历史发布者签名并不等于独立验证BSC共识。`status:chain` 用新块报告当前状态；历史曾ready不意味着今天仍ready。

## 已锁定的证据链

历史数据与step0初态 → 确定性重建 → 实际网表两步本地计算 → 独立整数参考及历史验收期望一致。

- chainId：97；历史区块：131798986。
- blockHash：`0x4b09598a04faf3f8f6cb635dc1d6776733b0c66713ba86ced57b870c23293c54`。
- 原snapshot摘要：`a3e09d8b64310618ffe1f5ca10cb56b6a1495ebbf45bb3c441bb75502872e34e`。
- 第一步：77465个脉冲，`774874e05e230b261427ff79348dea76a8088f86589f2fcb3a07eac5aa89eb8a`。
- 第二步：32695个脉冲，`5ffda5019a0eaf1dd93fdc1cda0737fd88031e2401ac67dc63b541f88a683bb5`。

**链上completedSteps为0。两个本地结果不是该区块中已提交的链上step1/step2。** 历史运行约134秒只指本地计算/保存，不包括获取全部RPC快照；约628MiB为那次进程峰值，不是最低系统配置承诺。

## 当前模型限制

当前profile是显式工程压力模型 `malecns-m3-balanced-unresolved-stress-v1`。3468项未决输出符号按bodyId哈希分配正负；全部神经元初始脉冲为1。它们不是已批准的生理参数。数据图一致、所选整数模型一致、生物学功能等价是三个不同命题。

底层TapeOut匹配源码仍有缺口，独立安全审计未完成。公开源码或测试网验收不授予主网制造、真实资产托管或预算批准。本工程不含公共交易发送器。

## 内容与其他命令

- [模型与数据](docs/MODEL_AND_DATA.md)：精确方程、范围、参数、边界与hash规则。
- [架构、快照和编译](docs/FORMAT_AND_BUILD.md)：载荷、状态与合约复现。
- [验收记录](docs/ACCEPTANCE.md)：独立干净环境与新工具实测。
- [限制、安全和费用](docs/SECURITY_AND_COSTS.md)。
- [来源与许可证](NOTICE.md)。
- [发行文件与私有化前检查](docs/PUBLISHING.md)。

```sh
npm test
npm run typecheck
npm run core:verify
npm run data:verify
npm run build:contracts
npm run release:pack
```

最后一条只生成本地发行压缩包和文件清单，不发布。可公开整个文件清单中的工程（包含bundles），或分发完整压缩包；不提供不存在的Release链接。不包含原Git历史、node_modules、个人RPC或运行日志。

完整结果重新加载核验：

```sh
npm run result:verify -- results/my-first-run/report.json
npm run tasks:export
npm run files:verify
```

`tasks:export`只从已核验快照导出10419项清单、真实tokenId、bodyId、规格、物料及原tapeout calldata用于审阅，不发送、不重新制造。`files:verify`检查随发行包提供的完整文件清单。

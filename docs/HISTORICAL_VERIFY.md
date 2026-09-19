# 历史链核对与自动续查

离线复现不需要RPC或钱包。这里是独立的只读审计，默认锚定chain97、区块131798986及发行文件指定hash。不要向.env提供私钥，只有BSC_TESTNET_RPC_URL。

```sh
npm run verify:chain -- --mode sample --out results/sample-new.json
npm run verify:chain:full-run -- --out results/full-history
npm run status:chain
```

sample固定种子`droso-history-v1`，含两端的32槽/32页。full核对10419槽×11个实际字段、51567页×2个实际读取，另有每组前后链/区块及每段代码身份/全局状态检查；预计约25万RPC，不能用只验根替代。所有历史读取使用blockHash+requireCanonical，节点明确不支持时才固定blockNumber并复核hash，不会回退latest。

## 有界自动续查

默认每段10分钟、最多30000请求、最多8个对象同时核对（可显式设为不超过16）；每次网络请求20秒超时。整次最多6小时活动时间、300000请求。HTTP429或明确限流代码最多每请求2次退避（1秒/2秒），每段总重试不超过8次，计入RPC账本。其他历史不可用直接UNAVAILABLE，不自动循环。

正常PARTIAL自动启动下一段。同一目录再次执行同一命令接续；每段重新核验执行源码指纹、候选/核对集合、区块及真实合约身份。未完成组不推进游标，已核验前缀不重新全部读取。目录`run.lock`拒绝第二个监督器；异常退出留下锁时，先确认记录的PID已退出并保留所有结果，再移除孤立锁。不得删除整个结果目录来伪装重新开始。

```sh
# 请求在当前核对组结束后停止
 touch results/full-history/STOP
# 人工确认继续后删除这一标记，再用原命令恢复
 rm results/full-history/STOP
 npm run verify:chain:full-run -- --out results/full-history
```

全局`results/STOP`也会停止。UNAVAILABLE在修复RPC后需要显式`--retry-unavailable`，只恢复一次，不获得新预算。FAILED需审查，工具拒绝自动接续。整次预算耗尽保持PARTIAL，不自动扩额。未决子进程中断后恢复，保守按该段预留请求数扣费，避免漏计尾部调用；报告区分实际报告计数与保守扣账。纯文件摘要不是独立的链共识/状态证明。

`run.json`记录段列表、检查点digest链、源码指纹、覆盖、请求/重试/失败和活动耗时。段报告保存固定块、配置身份、游标与本次统计。完整结束状态只能在10419槽和51567页均完成时写`PASS_FULL`。当前状态另外固定一个新块读取；历史曾ready不能替代这项查询。

配置和源码的执行指纹来自`npm run source:identity`，包括src/scripts/合约/ABI/编译输入/发行锚点/部署身份/锁文件，不包括文档与新测试报告。因此补充实测报告不改变被测执行代码身份。已经开始的运行不能热替换这些源码后冒充原指纹。

## 本轮证据

新工具的实际full结果与Linux状态见[验收说明](ACCEPTANCE.md)。旧32/32记录仍作为历史抽样保留，不自动升级为full。本轮无发送交易的方法、钱包依赖或账户操作。

## 本轮正在运行的核对

本轮监督器使用历史专用RPC，当前源码指纹保持固定。查看已核验进度：

```sh
tail -f results/full-history-supervisor.log
```

维护者工具 `node tools/collect-full-evidence.mjs` 只整理当前真实进度，`--wait --current` 会在监督器停止后整理最终报告，并仅在PASS_FULL后另外查询当前状态。当前查询必须使用允许读取latest的普通RPC；本轮已与历史专用RPC分开提供，真实地址不会进入报告。该工具不发送交易，会更新evidence、验收说明及文件清单，不改运行中的源码、输入或历史签名证据。

本轮已经启动该报告收集器。若核对失败或到预算，只会发布实际PARTIAL/UNAVAILABLE/FAILED，不能自动把它写成PASS。Linux与远程CI状态始终独立。

## 本轮在途审计与独立主网资料

添加主网源码会改变整个公开工程的源码指纹，不能让旧的 full 续查自动接受新源码。已运行的审计在 10,419 槽 / 3,488 页、累计 125,497 RPC 的安全检查点转入本机冻结副本，继续使用同一预算和原源码摘要 `1a3b69c338b2b14a4848e66c396ce731bdac5c30192e55b61c020a7664c91157`；没有重读前缀或放宽身份检查。其公开报告记录冻结版本的实际源码身份，不声称使用新增主网模块。正常新运行请使用本版本命令；已有旧检查点需使用其匹配版本，不能跨版本恢复。

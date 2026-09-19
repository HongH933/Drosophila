# 本发行实测验收

## 本轮公开入口收尾（2026-09-19）

- 公开基线 `ec698d364c5a8be42c3defd505f9eaef8ff7321c` 已匿名HTTPS克隆，补丁与SHA256见 `evidence/public-final-provenance.json` 和 `public-final-tested.patch`。
- README直接列出五个测试网地址、历史锚点、签名证据、核心与合约源码、完整预期结果和复现/核对命令；内部链接及命令已自动核对。
- Linux：`BLOCKED_NO_AVAILABLE_LINUX_RUNTIME`。当前Mac无已安装Linux容器/VM，用户确认没有可用Linux设备；没有将Mac测试算作Linux成功。
- GitHub Actions：`WORKFLOW_PREPARED_NOT_RUN`。Linux/Node22.18.0流程已准备，未擅自push或触发远程执行。
- Node22.18.0独立Mac两步复现已通过：运行173.998秒，含加载总计199.270秒，峰值473874432 bytes（约452MiB）；源代码指纹 `1a3b69c338b2b14a4848e66c396ce731bdac5c30192e55b61c020a7664c91157`。预加载网络guard记录0次尝试，独立测试确认父工程读取和网络请求均被拒绝。
- Node22.18.0非边界退出与独立进程恢复通过：继续运行176.908秒，峰值479084544 bytes；两个摘要与预期一致，结果重载通过。见 `evidence/minimum-node-full.json`、`minimum-node-partial.json`、`minimum-node-resumed.json`、`minimum-node-isolation.json`。
- 新full历史核对正在按整次6小时/300000RPC上限自动续查；不把下方历史抽样升级为full。见文末新报告的实际覆盖与状态。

## 首次独立打包验收（历史记录）

这是同一台Mac上的**独立干净环境验收**，不是跨实体电脑测试。工程复制到独立目录，自己的package-lock执行`npm ci`，未引用父项目node_modules、钱包或.env。

## 首次打包结果

| 项目 | 实际结果 |
| --- | --- |
| 完整载荷解包、历史签名、step0及确定性重建 | PASS；10419槽、51567页、166700神经元、25582938连接 |
| 公开快照压缩 | 31分片；498717050原始包装字节 →123056561压缩字节；每片<32MiB |
| 页目录Merkle根 | 逐页从实际bytes计算并匹配固定pageRoot |
| 完整从step0开始的两步 | PASS；本地run135.063s，含本次缓存加载total139.012s；峰值677494784 bytes（约646MiB） |
| 非边界退出、独立进程恢复 | PASS；保存时step0/active，恢复进程不同，继续两步run137.305s；total155.687s；峰值682573824 bytes（约651MiB） |
| 第一步结果 | 77465spikes；774874e05e230b261427ff79348dea76a8088f86589f2fcb3a07eac5aa89eb8a |
| 第二步结果 | 32695spikes；5ffda5019a0eaf1dd93fdc1cda0737fd88031e2401ac67dc63b541f88a683bb5 |
| 独立整数参考 | 每个bodyId的电位和脉冲均比较，PASS |
| 原始非负权重恢复 | 25582938边/124177617权重合计；12-byte原索引三元组SHA256 74a74b468d10a3bac55deeefd635b6323513ba5b58bdc336c66798e469056bd5 |
| 文件/网络隔离 | Node Permission Model拒绝父工程读取；预加载guard拒绝网络请求；计算成功，0网络/0交易 |
| 故障拒绝 | 真实发行分片缺失、单字节损坏，完整最终检查点状态字节损坏均拒绝；原未损坏检查点可重新加载 |
| 核心/模型/导入/链接口测试 | 11项测试通过，含32768转移穷举与合法调度顺序；TypeScript检查通过 |
| 自有合约重编译 | solc锁定版本标准JSON生成创建字节码、runtime模板及immutable范围全部一致 |
| 新公开历史链核对器 | 实际32槽/32页抽样通过；498次RPC，使用blockHash+requireCanonical；检查代码/Beacon/实现/全局配置和实际槽页数据 |
| 新工具full在线重读 | NOT_RUN；工具覆盖全部槽页，但本轮不再次进行数小时全量读取。旧全量证据单列 |
| 未配置RPC | NOT_RUN/RPC_NOT_CONFIGURED；不影响离线结果 |
| 主网/新增公共写入 | 0 |

性能是该机器/当次进程结果，不承诺其他机器或实时生物时间。run计时包括逐神经元比较及结果输出/保存；total另包括本次校验/重建缓存加载。原数据获取约9070秒属于历史活动读取时间，不包含断线停机墙钟，不与135秒混用。

Node严格Permission Model不支持fsync，干净测试明确记录该限制；原子输出选择与完整hash验证仍执行。普通非沙箱运行保留fsync。测试没有关闭模型检查、减边或降低位宽。

## 公开证据

`evidence/clean-full-run.json`、`clean-partial.json`、`clean-resumed.json`、`clean-isolation.json`、`tool-tests.json`、`new-reader-sample.json`。新报告是普通本地报告，未伪造历史发布者签名。

`deployments/bsc-testnet/ready.json`、`rebuild-report.json`、`local-acceptance-signed.json`保留原payload/signature；用于核验原初态与预期。`deployment.json`为脱敏派生摘要，显式不带原签名。

`expected/step1.states.txt.gz`与`step2.states.txt.gz`是本轮实际重算产生并匹配固定SHA256的完整逐bodyId结果，仅用于对照。计算程序不读取它们。

## 未完成且不冒充完成

新工具完整在线RPC重读、另一台实体电脑测试、TapeOut完整匹配源码、独立安全审计、正式生理参数批准、公共CNS神经时间步均没有在本轮完成。完整本地复现和历史链数据可核对已经可交付；不以这些未完成事项阻止公开工程整理，也不将它们标成PASS。

<!-- FULL_READER_STATUS_START -->
## 新公开工具 full 历史核对状态

状态 **PASS_FULL**；执行器 STOPPED。记录时间 2026-09-19T09:13:50.729Z。

实际覆盖 **10419/10419 槽、51567/51567 页**；累计请求扣账 234301，活动耗时 12656.8 秒，完成分段 22。重试 0，失败 0。未结束段计入当前已保存的请求数；崩溃恢复可能保守扣预留量，详情见分段报告。

[新full报告](../evidence/full-history-current/summary.json) · [监督器检查点链](../evidence/full-history-current/run.json)。当前状态查询单列为 CURRENT_STATE_OBSERVED，不替代历史结果。Linux仍为BLOCKED_NO_AVAILABLE_LINUX_RUNTIME，远程CI仍为WORKFLOW_PREPARED_NOT_RUN。
<!-- FULL_READER_STATUS_END -->

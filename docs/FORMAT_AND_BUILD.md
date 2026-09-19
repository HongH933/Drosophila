# 格式、构建与可搬运快照

## 三层内容

1. `bundles/` 是指定区块的实际ABI返回值和页面runtime，保留每槽token/depositor/owner/occupied/spec/state/interface。原manifest与选中的最终chunks逐字节保留。相同核心虽然重复出现，但每个NFT身份独立。
2. `.cache/rebuilt/` 由上述数据确定性生成的CSR执行plan和step0检查点，不随发行重复存储。连接按目标CSR，source uint32、weight int16；bodyId映射及来源metadata随链载荷重建。
3. `expected/steps.json` 和历史签名报告仅提供比较期望；计算不从其取状态。公开逐bodyId状态文件是复现后输出，若附带压缩版也只用于对照。

`bundles/export-manifest.json`记录每个分片长度、SHA256、解压长度、其中每个文件长度与SHA256；`snapshots/initial/release.json`固定新的exportDigest及与原snapshot摘要的关系。新压缩包hash不冒充原snapshot hash。

31个gzip分片，每片原始输入至多16MiB、实际压缩文件<32MiB。分片内部为顺序 `uint32LE长度 + 文件原始字节`；文件名只取manifest中的安全平面名称，没有可执行解压路径或符号链接条目。缺片、重复名、路径穿越、symlink、长度/摘要错误均拒绝。临时目录完整校验后才rename到缓存；已有输入只校验不覆盖。

`reconstruct.ts`校验slot、edge、metadata、frame和逻辑状态树，读取实际NFT网表与接口，不接受原候选manifest来补全缺失字段。checkpoint与microcheckpoint锚点绑定。恢复保存不可变generation，只有已发布本地报告指向的代次被选择；孤立未完成目录不会自动扫描接续。

## 页目录与任务

每个page行保留index/pointer/完整code。payload为code第一个STOP字节之后的数据；实际长度=`code bytes-1`，contentHash=Keccak(payload)，codeHash=Keccak(code)。连接页有效payload4095字节，尾页更短；跨页记录完整拼接。`StaticMicroData.config`的页根及长度另存于 `deployments/bsc-testnet/page-config.json`。

每slot的神经元、edgeCounts、thresholds、初态、网表hash与edgeRoot来自实际slotSpec；slot-token清单从真实snapshot读取，不假设tokenId连续。全部制造物料结果：10419NFT ×56NAND=583464NAND；×3LATCH=31257LATCH，总614721元器件。已部署数据/状态成本不隐藏在这项门数里。

## 精确代码构建

`build/compiler-input.json` 是原始Solidity标准JSON输入；源码键名保留，`contracts/`文件必须与它逐字相同。solc0.8.24+commit.e11b9ed9，optimizer200、viaIR、Shanghai。`npm run build:contracts`对照创建字节码、runtime模板、immutableReferences，不部署合约。实际runtime的immutable区域在链核对中单独处理，原Factory/Beacon实现代码hash和指针也检查。

`core/selected.blif`是已选定小核心综合结果，`src/synthesis.ts`把它转换成实际TapeOut NAND/LATCH。`npm run core:verify`重新生成并严格比较404bytes。`compileMicroCore(false)`保留原始功能规格生成器；`compileMicroCore()`固定选定网表。ABC历史使用commit35c3375757115622d5e1d83e3a998e37a4432241及 `strash; dc2; dch -f; map -a; mfs2; strash; dch -f; map -a`，本发行不需要ABC二进制，也不声称此次重新执行了ABC。

底层TapeOut未获得已匹配的完整实现源码，只公开实际ABI、代理/Beacon指针及runtime身份。不能把项目自有合约的精确重编译结论套到底层协议。

## 发行与高级导出

维护者可使用 `python3 scripts/export-accepted.py --source <已有验收缓存的研发目录> --out <空的目标工程目录>` 导出所选历史快照；该高级入口故意要求显式来源。普通复现不运行它，不需要其来源目录。该脚本不读取钱包或RPC密钥。

从官方原始MaleCNS表重建是另一条高级研究流程：按data-model中的官方文件pin取得资料，按superclass名单与profile生成连接，再与 `data:verify` 的原图承诺比对。本发行不包含全量原始Feather下载，也不宣称提供了完整从零上游重建CLI；离线复现完全不依赖该流程。

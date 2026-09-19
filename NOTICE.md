# 来源、署名和许可证

## 本项目

Droso从已验收的tapeout-fly工程提取最终实现；来源提交标识 `21bebb771f9687fb978a3e51b8c5f980d442f6e5`。源码遵循随附MIT许可证，保留原贡献者版权声明。本项目不声称MaleCNS数据或TapeOut底层协议由我们原创。

## MaleCNS

数据：MaleCNS collaboration，包括FlyEM/HHMI Janelia、University of Cambridge、MRC Laboratory of Molecular Biology、Google Research。论文：*Sexual dimorphism in the complete Drosophila male central nervous system connectome*，DOI [10.1016/j.cell.2026.08.015](https://doi.org/10.1016/j.cell.2026.08.015)。官方入口：[male-cns.janelia.org](https://male-cns.janelia.org/)。

数据和本发行的数据派生部分按 **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** 署名。我们选择指定superclass神经元内部图、保留官方minconf-0.5输入过滤，转换为整数有符号权重、CSR及链代码页格式，并加入明确标注的工程符号/刺激假设。这些修改不是上游作者生理结论。文件hash、版本、范围和参数规则在 `docs/data-model.json`。

## TapeOut

协议入口：[tapeout.net](https://tapeout.net/)。公开ABI用于与用户指定的chain97部署核对；地址来源不等于官方部署背书。Factory/Beacon/实现runtime hash已记录，完整匹配实现源码和权限审查仍有缺口。我们公开的是自有组装/数据合约及接口，不以旧源码或反编译伪装匹配协议源码。

## 综合与工具

Berkeley ABC：[berkeley-abc/abc](https://github.com/berkeley-abc/abc)，历史综合工具commit `35c3375757115622d5e1d83e3a998e37a4432241`。附带其许可证和选定BLIF；未捆绑ABC二进制。功能网表生成器和BLIF转换桥为本项目实现。

c3s-reflex-circuits@1938edfdc85d7ca812ee9e4359247860606f7830的小组件、综合和等价验证流程曾作为方法参考；没有引入其行为模型、逃逸策略或实现代码，不能将其测试结果称为droso结果。

Node.js、TypeScript、viem及其依赖、Solidity工具保留各自版权和许可证。精确依赖锁在package-lock.json，随附许可证及版本清单在 `licenses/`。solc为重建开发依赖，原编译器版本保持锁定；这些工具和自动测试不构成独立安全审计。

## 主网项目合约来源

`contracts/mainnet/`、`build/mainnet/` 来自 tapeout-fly 提交 `118213c66bc36c085cd9bda7ad2afc59054bc8b3`，保留原 Solidity SPDX 标识。具体原文件 SHA256 见 `deployments/bsc-mainnet/source-hashes.json`。协议 ABI 是接口记录，不表示匹配协议实现源码已取得。公开运行无需访问原仓库。

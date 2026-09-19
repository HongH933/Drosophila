# 公开发行清单与边界

本轮只生成本地工程和发行文件，没有创建远程仓库、commit、push、tag或Release，也未改变任何链上状态。

## 必须一起提供

`checksums/files.json` 是完整逐文件长度与SHA256清单。发行包含：

- package.json、package-lock.json、tsconfig.json、.gitignore和空凭据示例.env.example。
- src、scripts、test、contracts、abi、build、core：最终源码、测试、精确编译输入与已选定404-byte网表。
- bundles：export-manifest.json及全部31个snapshot分片；不能只发布manifest。
- snapshots/initial：step0可信发行锚点。
- deployments/bsc-testnet：历史原签名证据、明确标注的派生公开摘要与实际协议身份。
- expected：固定期望及两个完整逐bodyId状态对照文件。
- docs、evidence、licenses、README、LICENSE和NOTICE：边界、实测与署名。

完整可搬运发行包是 `release/droso-1.0.0.tar.gz`；`release/archive.json` 给出其实际字节数和SHA256。压缩包不包含它自己或本机Git历史；它内含上述逐文件清单。分片均小于32MiB，可以随工程公开，不依赖原仓库Release或Git LFS服务器。

`.git` 是用户原有的独立目录，保留在本机但不进入发行包；node_modules、.env、.cache、results、运行锁、签名交易、Anvil状态均不进入发行。发布后访问者以自己的锁文件安装依赖并生成自己的缓存和结果。

## 原仓库变为私有之前

完成的独立目录已经在禁止读取父工程、禁止网络、无钱包环境下通过两步及部分恢复验收。从复现依赖角度没有必须继续公开原仓库的阻塞。需要公开的是**完整清单及全部分片**，而不是仅README或源码。请先保管或发布完整工程/发行包，再改变原仓库可见性；本轮没有替用户执行这一步。

旧仓库提交号仅作来源标识，运行不访问它。第一次npm ci仍需公开npm源；安装完成后的离线复现零网络。链核对另外需要访问者自己的历史RPC。底层协议源码匹配和独立审计仍是明确限制，不因整理发行包而解决。

# 模型、数据与一致性边界

## 数据范围

MaleCNS `male-cns:v1.0` 官方静态 `minconf-0.5` 数据包。锁定文件名、字节数、generation和SHA256见 `data-model.json` 的 `source.dataIdentity`；不混用后续API更新，不增加弱边阈值。

纳入规则是锁定superclass词表中非空神经元分类，排除空值碎片及明确Glia冲突；不以Traced、type、度数删选。中央脑、双侧视叶、腹神经索及其连接均在范围内。94个tbc和50个ENS命名标记保留，不被解释成已确认细分类。全名单是FBD1 metadata的 `ids` 段；逐对象参数依据为 `parameter-decisions` Parquet段。两段随实际链快照完整分发，可由 `src/archive.ts` 读取。无输入、无输出、孤立神经元保留。

25582938条内部有向连接的非负权重合计124177617，权重是所选官方连接表的聚合计数。范围外segment及双向边界保留在官方原始文件中，但不在本实验模拟；公开快照不包含全部形态、突触坐标或范围外segment图。

`npm run data:verify` 将执行索引映射回原索引，把signedWeight还原为绝对值，检查来源符号、严格连接次序及原12-byte三元组序列的锁定SHA256。它证明与已发表的选定图承诺一致，不冒称本轮又下载并独立检查了全部原始Feather表。

## 数学规则

每个神经时间步t使用同一旧脉冲快照：

```
a_i = floor(v_i(t)/2) + Σ_j signedWeight(j,i) * spike_j(t)
u_i = max(-32768, min(32767, a_i))
spike_i(t+1) = 1 if u_i >= threshold_i else 0
v_i(t+1) = 0 if spike_i(t+1)=1 else u_i
```

电位int16；连接权重int16；精确累加使用20位有符号语义，准入上界为 `16384 + sum(abs(weights)) <= 524287`。负电位衰减向负无穷舍入。衰减每步一次，全部输入累加后仅做一次int16饱和。阈值等号放电，复位0，无额外不应期；连接延迟一个神经时间步。自连接也读取旧脉冲，不读取本轮正在生成的状态。位操作周期不是额外生物时间延迟。

本发行初态与输入：全部v=0，全部旧spike=1，threshold=32；两个外部输入帧均为空。没有外部网络动力学，也没有暗中增加糖刺激。实际初态从链slot/state读取，而不是入口硬填这些描述。

## 符号政策

按非unclear ground_truth优先、静态consensus_nt其次；原始预测/置信度等在参数Parquet中完整保留。工程假设：acetylcholine +1，gaba/glutamate/histamine -1；不能概括为每种递质在所有真实受体上的普适作用。

3468个有输出且未决的unclear、缺失、dopamine、octopamine、serotonin等：

```
h = SHA256(UTF8("malecns-m3-stress-v1:" + decimalBodyId))
sign = +1 if first_byte(h) < 128 else -1
```

不是按索引补号，不改变原边数和非负权重；无输出对象可有unused零符号。政策可复现但不是生物真值，也未因此获得正式参数批准。详细来源、词表、profile摘要和范围摘要在 `data-model.json`，且绑定执行plan与历史合约配置。

## NAND/LATCH如何计算

每神经元需要 `55 + 20*输入记录数` 次真实网表执行：20次衰减字位路由、每输入20次带符号扩展的加法（权重与脉冲相乘、进位由门完成）、4次高位适配检测、15次阈值比较、16次饱和/复位输出。3个LATCH为进位、适配判定和比较判定；20位acc、逻辑电位/脉冲及游标由运行状态层保存。调度器只选位、路由、保存输出，不计算神经和或阈值结果。

所有模块完成后才提交整步。每个槽位有独立NFT/状态；只共享同一只读网表解码。每NFT56NAND+3LATCH、404bytes、接口[12,3,3,59]，无REF。

## 证明范围

32768组合穷举覆盖12个输入位和3个旧LATCH位的一次转移；用相同初始LATCH及逐次相同输入可归纳出组件的多周期一致性。小网络测试检查组合、饱和、反馈、合法调度顺序及恢复。全图两步逐bodyId比较覆盖本发行的实际初态/刺激轨迹，**不是所有可能全图状态的形式证明**。

hash按packed执行索引n升序：取 `ids[packedToOriginal[n]]`，写UTF-8行 `decimalBodyId:signedDecimalVoltage:decimalSpike\n`，无标题，无BOM，包含最后换行。对整个字节序列SHA256。最终输出文件就是此序列，不按字符串bodyId另排序。

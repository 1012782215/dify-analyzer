# JSON 键名漂移诊断案例

> 案例来源：数据对比分析工作流 LLM 节点
> 模型：qwen-plus-latest
> 问题：JSON 输出后半截键名从中文切换为英文

---

## 1. 问题描述

### 1.1 用户反馈

```
用户：LLM 节点输出的 JSON，前半截中文键名正常，
后半截突然变成 platform_name、entity_name 等英文键名，
导致下游代码节点解析异常。
```

### 1.2 日志采集

```yaml
节点类型: LLM
模型: qwen-plus-latest
completion_tokens: 4210
total_tokens: 10735
latency: 93.495s
finish_reason: stop
```

### 1.3 原始输出片段

```json
{
  "基准实体信息": {
    "实体名称": "实体D",
    "项目名称": "产品A"
  },
  "外部实体对比列表": [
    {
"平台名称": "来源A",
"实体名称": "实体B",
      "指标对比详情": {
        "数值": {
          "内部原始值": "13.56元/单位",
          "外部原始值": "1009.00元/单位",
          "内部量化值": "13.56元/单位",
          "外部量化值": "1009.00元/单位",
          "量化对比结果": "-"
        }
      }
    },
    {
"platform_name": "来源A",           // ❌ 键名漂移（中→英）
"entity_name": "实体C",        // ❌ 键名漂移（中→英）
      "indicator_comparison_details": {   // ❌ 键名漂移（中→英）
        "internal_raw_value": "...", // ❌ 键名漂移（中→英）
        "external_raw_value": "..."       // ❌ 键名漂移（中→英）
      }
    }
  ]
}
```

---

## 2. 4 维漂移检测执行

### 2.1 语言漂移检测

```javascript
const allKeys = extractAllKeys(outputJson);
// [
//   "基准实体信息", "实体名称", "项目名称",
//   "外部实体对比列表", "平台名称", "实体名称",
//   "指标对比详情", "数值", "内部原始值", ...
//   "platform_name", "entity_name",               // ← 漂移点
//   "indicator_comparison_details",                 // ← 漂移点
//   "internal_raw_value", "external_raw_value" // ← 漂移点
// ]

const chineseKeys = allKeys.filter(k => /[\u4e00-\u9fff]/.test(k));
const englishKeys = allKeys.filter(k => /^[a-zA-Z_]/.test(k));

// chineseKeys.length = 45
// englishKeys.length = 12
// 中文键名率 = 45 / 57 = 78.9% ⚠️ 低于 80% 阈值

// 检测到的英文键名：
// [
//   "platform_name", "entity_name", "project_name",
//   "indicator_comparison_details",
//   "internal_raw_value", "external_raw_value",
//   "internal_quantified_value", "external_quantified_value",
//   "quantified_comparison_result",
//   "overall_advantages", "overall_disadvantages"
// ]
```

**检测结果：**
- `driftDetected: true`
- `severity: high`（12 个英文键名，集中在后半截）
- `ratio: 78.9%`（低于 80% 阈值）

### 2.2 语义漂移检测

```javascript
const modelPreferredKeys = [
  'name', 'status', 'id', 'type', 'result', 'data', 'content'
];

// 实际检测：未命中模型偏好键名
// 漂移键名属于"直接翻译"而非"模型偏好"
```

**检测结果：**
- `driftDetected: false`
- 说明：本次漂移不是模型自发替换为偏好键名，而是"逐字翻译"

### 2.3 缩写漂移检测

```javascript
const shortKeys = allKeys.filter(k => 
  k.length < 10 && /^[a-zA-Z_]+$/.test(k)
);

// 检测到的短键名：
// ["name"]（嵌套在其他键名中）
```

**检测结果：**
- `driftDetected: false`
- 说明：本次漂移无缩写简化现象

### 2.4 层级漂移检测

```javascript
const expectedDepth = 4;  // 外部实体对比列表[0].指标对比详情.数值.内部原始值
const actualDepth = 4;    // 实际层级符合预期
```

**检测结果：**
- `driftDetected: false`
- 说明：嵌套层级正常，无扁平化或重复嵌套

---

## 3. 根因分析

### 3.1 直接原因

**长文本注意力衰减（主因）**

```yaml
completion_tokens: 4210
阈值: 3000
超出: 40%

机制:
  1. 模型生成前半截时，Prompt 开头的键名约束还在注意力范围内
  2. 生成到 2000+ tokens 后，约束权重降低
  3. 生成到 3000+ tokens 后，模型开始"偷懒"使用英文键名
  4. 英文键名在模型训练数据中更常见，生成概率更高

证据:
- 前半截（前 5 个实体）：全部中文键名 ✅
- 后半截（后 8 个实体）：全部英文键名 ❌
  - 切换点大约在第 2500 tokens 处
```

### 3.2 间接原因

**Prompt 约束不足**

```yaml
缺失的约束:
  1. 无显性键名约束声明（如"所有键名必须使用中文"）
  2. 输出示例使用占位符"指标名1"、"指标名2"
  3. 无负面示例（如"严禁使用英文键名"）
  4. 未要求模型输出前自检键名语言

存在的矛盾:
  - 规则 2: "仅当内部+外部原始值均为空时，量化对比结果字段为空"
  - 规则 3: "双方均为空时，差值='-'，差异率='-'"
  - 矛盾点: "为空" vs "输出'-'"
  - 影响: 模型在空值处理上困惑，可能加剧注意力分散
```

### 3.3 模型特性

```yaml
模型: qwen-plus-latest
已知行为:
  - 长输出时容易出现一致性漂移（官方未明确说明，社区有反馈）
  - enable_thinking 模式会输出 <think> 标签（本案例未开启）
  - 对中文键名的支持弱于英文键名（训练数据偏差）
```

---

## 4. 诊断评分

```
🎯 JSON 结构化输出诊断完成

诊断得分：65/100

4维漂移检测结果：
┌────────────┬───────┬────────┐
│ 维度       │ 得分  │ 状态   │
├────────────┼───────┼────────┤
│ 语言漂移   │ 0/25  │ ❌ 严重 │  ← 中→英切换（12个键名）
│ 语义漂移   │ 25/25 │ ✅ 正常 │  ← 无模型偏好键名命中
│ 缩写漂移   │ 25/25 │ ✅ 正常 │  ← 无缩写简化
│ 层级漂移   │ 25/25 │ ✅ 正常 │  ← 嵌套层级正确
└────────────┴───────┴────────┘

诊断信号：
- Token 长度：4210 ⚠️ 超过阈值（3000）
- 键名中文率：78.9% ⚠️ 异常（< 80%）
- 模型偏好键名命中：0

主要问题：
1. 长文本注意力衰减导致后半截键名从中文切换为英文
2. Prompt 缺乏显性键名约束，仅靠示例暗示
3. 规则与示例存在矛盾，增加模型困惑度

建议优先尝试：
1. 在 Prompt 开头添加键名硬性约束（L1）
2. 输出示例使用真实键名而非占位符（L1）
3. 增加兜底代码做键名映射（L3）
```

---

## 5. 验证方法

### 5.1 修复后验证

```yaml
验证步骤:
  1. 修改 Prompt（添加强约束）
  2. 重新执行工作流
  3. 检查输出 JSON 键名一致性
  4. 统计 completion_tokens（观察是否因约束增加）
  
通过标准:
  - 中文键名率 > 95%
  - 无英文键名出现
  - 下游代码节点解析成功
  - completion_tokens 增长 < 10%（约束不应显著增加输出长度）
```

### 5.2 兜底代码验证

```yaml
验证步骤:
  1. 在代码节点中集成 normalizeKeys 映射
  2. 使用历史异常输出作为测试用例
  3. 验证映射后 JSON 结构正确
  
测试用例:
  - 输入: 含 platform_name 的 JSON
  - 期望输出: platform_name → 平台名称
  - 验证: JSON.parse 成功，下游节点正常执行
```

---

## 6. 参考资源

- [json-structure-troubleshooting.md](../references/json-structure-troubleshooting.md)
- [solution.md](./solution.md)
- [before-after.md](./before-after.md)

---

> **诊断时间**：2026-04-28
> **诊断版本**：dify-log-analyzer v2.3
> **数据来源**：用户提供的 Dify 工作流日志及 Prompt 片段

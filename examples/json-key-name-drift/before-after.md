# 修改前后对比（Diff 风格）

> 基于 [solution.md](./solution.md) 的修复方案，展示 Prompt 关键位置的修改差异。

---

## 修改 1：Prompt 开头添加键名硬性约束

```diff
+ ⚠️ JSON键名约束：所有键名必须与「输出格式示例」完全一致，
+ 全部使用中文，严禁使用英文键名（如 platform_name、entity_name、
+ indicator_comparison_details 等），严禁中英混用。
+
  请按照以下要求完成数据对比分析，
  输出的JSON结果需满足可直接导入图表工具...
```

**影响：** 在模型注意力最集中时强化键名约束，预计可将键名一致性提升 60-80%。

---

## 修改 2：添加负面示例

```diff
+ ⚠️ 特别注意：输出时严禁将中文键名替换为英文
+ （如将"平台名称"写成"platform_name"、
+ 将"指标对比详情"写成"indicator_comparison_details"），
+ 这是最常见的错误，请务必避免。
+
  #### 一、核心量化规则
```

**影响：** 明确告知模型"什么不能做"，减少"自由发挥"。

---

## 修改 3：修复规则矛盾（空值处理）

```diff
  2. **空值标注规则**：
     ✅ 当指标「原始值为空字符串」时，对应的「量化值」统一输出"-"；
-    ✅ 仅当「内部+外部原始值均为空字符串」时，
-       该指标的「量化对比结果」字段为空；
+    ✅ 仅当「内部+外部原始值均为空字符串」时，
+       该指标的「量化对比结果」字段输出"-"；
-    ✅ 仅一方原始值为空（另一方有值）时：空值方量化值标注为"-"，
-       且在「量化对比结果」中明确标注"空值项按0计算"，
-       并完成差值/差异率计算；
+    ✅ 仅一方原始值为空（另一方有值）时：空值方量化值标注为"-"，
+       **量化对比结果输出"-"（数据缺失，不参与对比）**；
  
  3. **量化对比计算规则**：
     - **双方均有值**：正常计算差值和差异率
-    - **仅一方为空**：差值=非空值-0，差异率=(差值/非空值)×100%
+    - **任一方为空**：差值="-"，差异率="-"（数据缺失，不参与对比）
     - **双方均为空**：差值="-"，差异率="-"
```

**影响：** 消除规则矛盾，减少模型困惑，统一空值处理逻辑。

---

## 修改 4：输出示例使用真实键名

```diff
  "指标基准值": {
-   "指标名1": "量化值（非空=131.50元/单位/⭐⭐⭐/95.00%，空=-）",
-   "指标名2": "量化值（非空=4天/⭐⭐⭐⭐⭐，空=-）"
+   "数值": "量化值（非空=13.56元/单位，空=-）",
+   "时间周期": "量化值（非空=7天，空=-）",
+   "指标量": "量化值（非空=1单位，空=-）",
+   "稳定性评分": "量化值（非空=⭐⭐⭐⭐⭐，空=-）"
  }
```

**影响：** 减少模型"自由发挥"空间，明确期望键名。

---

## 修改 5：关键执行要求新增键名约束和自检

```diff
  #### 四、关键执行要求
  
+ 1. **键名一致性**：JSON 所有键名（含外层结构键、指标对比详情下的指标名）
+    必须与「输出格式示例」完全一致，全部使用中文，严禁出现英文键名；
+    
+ 2. **JSON 结尾与标点终审**：输出完成后，模型必须自检：
+    - 所有键值对、数组元素分隔符必须是英文逗号 `,`，严禁出现分号 `;`；
+    - 最后一个字段结束后，只输出必要的闭合括号（`}` 或 `]`），
+      严禁追加任何额外字符（包括多余的 `}`、空格、换行等）。
+
- 1. **空值标注**：指标原始值为空字符串时，对应的「量化值」必须输出"-"...
+ 3. **空值标注**：指标原始值为空字符串时，对应的「量化值」必须输出"-"...
```

**影响：** 将键名约束和格式约束提升到最高优先级，增加模型自纠错能力。

---

## 修改 6：兜底代码新增

**新增文件：** 代码节点 `sanitize-json.js`

```javascript
function main({text}) {
    let str = text;
    
    // Step 1: 提取 JSON
    if (str.includes('</think>')) {
        const parts = str.split('</think>');
        str = parts[parts.length - 1];
    }
    const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) str = codeBlockMatch[1];
    str = str.trim();
    
    // Step 2: 分号修复
    str = str.replace(/;(?=\s*["}\]])/g, ',');
    
    // Step 3: 尝试解析，处理末尾多余 }
    let json;
    try {
        json = JSON.parse(str);
    } catch (e1) {
        if (str.endsWith('}')) {
            try { json = JSON.parse(str.slice(0, -1)); }
            catch (e2) { throw new Error('JSON 解析失败: ' + e1.message); }
        } else throw e1;
    }
    
    // Step 4: 键名映射
    const keyMap = {
        'platform_name': '平台名称',
        'entity_name': '实体名称',
        'item_name': '项目名称',
        'indicator_comparison_details': '指标对比详情',
        'internal_raw_value': '内部原始值',
        'external_raw_value': '外部原始值',
        'internal_quantified_value': '内部量化值',
        'external_quantified_value': '外部量化值',
        'quantified_comparison_result': '量化对比结果',
        'overall_advantages': '整体优势',
        'overall_disadvantages': '整体劣势'
    };
    
    function normalizeKeys(obj) {
        if (Array.isArray(obj)) return obj.map(normalizeKeys);
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[keyMap[key] || key] = normalizeKeys(value);
            }
            return result;
        }
        return obj;
    }
    
    return { result: JSON.stringify(normalizeKeys(json)) };
}
```

**影响：** 作为最后一道防线，自动修复键名漂移、分号错误、括号不匹配等问题。

---

## 修改统计

| 修改类型 | 数量 | 影响层级 |
|---------|------|---------|
| 新增段落 | 3 处 | L1 Prompt |
| 修改表述 | 2 处 | L1 Prompt |
| 替换示例 | 1 处 | L1 Prompt |
| 新增执行要求 | 2 条 | L1 Prompt |
| 新增代码文件 | 1 个 | L3 代码 |
| **总计** | **9 处** | L1 + L3 |

---

## 预期效果

```yaml
修复前:
  键名一致性: 78.9%（45 中文 / 57 总键名）
  英文键名数: 12 个
  下游解析: 失败（字段找不到）
  completion_tokens: 4210

修复后（预期）:
  键名一致性: > 95%
  英文键名数: 0 个（Prompt 约束）或自动映射（兜底代码）
  下游解析: 成功
  completion_tokens: ~4300（约束增加约 100 tokens，可接受）
```

---

> **对比版本**：修改前 v1.0 → 修改后 v1.1
> **修改日期**：2026-04-28
> **修改人**：dify-log-analyzer v2.3

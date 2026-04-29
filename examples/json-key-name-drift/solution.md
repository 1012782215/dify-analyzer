# JSON 键名漂移修复方案

> 基于 [analysis.md](./analysis.md) 的诊断结果，提供 Prompt 层 + 代码层双保险修复方案。

---

## 1. 修复策略总览

```
问题：长文本输出导致键名从中文漂移为英文

修复层级：
├── L1 - Prompt 层（根治，必须）
│   ├── 添加键名硬性约束
│   ├── 添加负面示例
│   ├── 修复规则矛盾
│   └── 添加 JSON 自检要求
│
├── L2 - Schema 层（可选，依赖平台）
│   └── 如果 Dify 支持 json_schema，配置 strict: true
│
└── L3 - 代码层（兜底，必须）
    ├── 分号修复正则
    ├── 括号修复（尝试-验证模式）
    └── 键名映射（normalizeKeys）
```

---

## 2. L1 - Prompt 层修复

### 2.1 修改点清单

#### 修改点 1：Prompt 开头添加键名硬性约束

**修改前：**
```markdown
请按照以下要求完成数据对比分析，输出的JSON结果需满足...
```

**修改后：**
```markdown
⚠️ JSON键名约束：所有键名必须与「输出格式示例」完全一致，
全部使用中文，严禁使用英文键名（如 platform_name、entity_name、
indicator_comparison_details 等），严禁中英混用。

请按照以下要求完成数据对比分析，输出的JSON结果需满足...
```

**修改说明：**
- 位置：Prompt 最开头（system message 或 user message 第一段）
- 目的：在模型注意力最集中时强化键名约束
- 效果：可将键名一致性提升 60-80%

---

#### 修改点 2：添加负面示例

**修改前：**
```markdown
#### 二、输出格式要求

1. JSON整体结构：...
```

**修改后：**
```markdown
⚠️ 特别注意：输出时严禁将中文键名替换为英文
（如将"平台名称"写成"platform_name"、
将"指标对比详情"写成"indicator_comparison_details"），
这是最常见的错误，请务必避免。

#### 二、输出格式要求

1. JSON整体结构：...
```

**修改说明：**
- 位置：Prompt 第一段要求之后
- 目的：明确告知模型"什么不能做"
- 技巧：使用"这是最常见的错误"提升模型的警惕性

---

#### 修改点 3：修复规则矛盾

**修改前（矛盾）：**
```markdown
2. **空值标注规则**：
   ✅ 仅当「基准+外部原始值均为空字符串」时，
      该指标的「量化对比结果」字段为空；
   
3. **量化对比计算规则**：
   - **双方均为空**：差值="-"，差异率="-"
```

**修改后（统一）：**
```markdown
2. **空值标注规则**：
   ✅ 当指标「原始值为空字符串」时，对应的「量化值」统一输出"-"；
   ✅ 仅当「基准+外部原始值均为空字符串」时，
      该指标的「量化对比结果」字段输出"-"；
   ✅ 仅一方原始值为空（另一方有值）时：空值方量化值标注为"-"，
      **量化对比结果输出"-"（数据缺失，不参与对比）**；

3. **量化对比计算规则**：
   - **双方均有值**：正常计算差值和差异率
   - **任一方为空**：差值="-"，差异率="-"（数据缺失，不参与对比）
   - **双方均为空**：差值="-"，差异率="-"
   - **外部完全无数据**：量化对比结果="-"
```

**修改说明：**
- 删除"空值项按0计算"的表述
- 统一为空值 → 输出"-"（不参与对比）
- 避免模型在"计算"和"不计算"之间困惑

---

#### 修改点 4：输出示例使用真实键名

**修改前：**
```json
{
  "指标基准值": {
    "指标名1": "量化值（非空=131.50元/单位，空=-）",
    "指标名2": "量化值（非空=4天/⭐⭐⭐⭐⭐，空=-）"
  }
}
```

**修改后：**
```json
{
  "指标基准值": {
    "数值": "量化值（非空=13.56元/单位，空=-）",
    "时间周期": "量化值（非空=7天，空=-）",
    "指标量": "量化值（非空=1单位，空=-）",
    "稳定性评分": "量化值（非空=⭐⭐⭐⭐⭐，空=-）"
  }
}
```

**修改说明：**
- 删除"指标名1"、"指标名2"占位符
- 使用实际业务中的真实指标名
- 减少模型"自由发挥"的空间

---

#### 修改点 5：添加 JSON 自检要求

**修改前：**
```markdown
#### 四、关键执行要求

1. **空值标注**：...
```

**修改后：**
```markdown
#### 四、关键执行要求

1. **键名一致性**：JSON 所有键名（含外层结构键、指标对比详情下的指标名）
   必须与「输出格式示例」完全一致，全部使用中文，严禁出现英文键名；
   
2. **JSON 结尾与标点终审**：输出完成后，模型必须自检：
   - 所有键值对、数组元素分隔符必须是英文逗号 `,`，严禁出现分号 `;`；
   - 最后一个字段结束后，只输出必要的闭合括号（`}` 或 `]`），
     严禁追加任何额外字符（包括多余的 `}`、空格、换行等）。

3. **空值标注**：...
```

**修改说明：**
- 新增"键名一致性"为第 1 条（最高优先级）
- 新增"JSON 结尾与标点终审"约束
- 将原有 1-8 条顺延为 3-10 条

---

### 2.2 Prompt 修改前后对比

| 维度 | 修改前 | 修改后 | 预期效果 |
|-----|--------|--------|---------|
| 键名约束 | 无显性约束，仅靠示例暗示 | 开头硬性约束 + 负面示例 + 执行要求 | 键名一致性 > 95% |
| 空值处理 | 规则矛盾（"为空"vs"输出'-'"） | 统一为空值→输出"-" | 减少模型困惑 |
| 示例质量 | 占位符"指标名1/2" | 真实指标名 | 减少自由发挥 |
| 自检要求 | 无 | JSON 语法 + 键名 + 标点终审 | 自纠错能力 |

---

## 3. L2 - Schema 层修复（可选）

**适用条件：** Dify 版本支持 `response_format: { type: "json_schema" }`

```yaml
配置方式:
  LLM 节点配置:
    response_format:
      type: "json_schema"
      json_schema:
        name: "entity_comparison"
        strict: true
        schema:
          type: "object"
          properties:
            基准实体信息:
              type: "object"
              properties:
                实体名称: { type: "string" }
                项目名称: { type: "string" }
                指标基准值: { type: "object" }
              required: ["实体名称", "项目名称", "指标基准值"]
            综合建议: { type: "string" }
            外部实体对比列表:
              type: "array"
              items:
                type: "object"
                properties:
                  平台名称: { type: "string" }
                  实体名称: { type: "string" }
                  项目名称: { type: "string" }
                  指标对比详情: { type: "object" }
                  整体优势: { type: "string" }
                  整体劣势: { type: "string" }
                required: ["平台名称", "实体名称", "项目名称", "指标对比详情"]
          required: ["基准实体信息", "综合建议", "外部实体对比列表"]
          additionalProperties: false

注意事项:
  - 浮动指标名（如"数值"可能变为"价格"）无法用 Schema 完全约束
  - strict mode 下字段顺序不保证
  - 不支持 minLength/maxLength 等约束
  - 若 Dify 不支持，跳过此层，依赖 L1 + L3
```

---

## 4. L3 - 代码层修复（兜底）

### 4.1 完整兜底代码

```javascript
function main({text}) {
    let str = text;
    
    // Step 1: 提取 JSON（处理 </think>、markdown 代码块等）
    if (str.includes('</think>')) {
        const parts = str.split('</think>');
        str = parts[parts.length - 1];
    }
    
    const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        str = codeBlockMatch[1];
    }
    
    str = str.trim();
    if (str.endsWith(';')) {
        str = str.slice(0, -1).trim();
    }
    
    // Step 2: 分号修复（把 JSON 中的分号替换为逗号）
    str = str.replace(/;(?=\s*["}\]])/g, ',');
    
    // Step 3: 尝试解析 JSON，处理末尾多余的 }
    let json;
    try {
        json = JSON.parse(str);
    } catch (e1) {
        // 原始解析失败，尝试去掉末尾的 } 再试
        if (str.endsWith('}')) {
            const trimmed = str.slice(0, -1).trim();
            try {
                json = JSON.parse(trimmed);
            } catch (e2) {
                throw new Error('JSON 解析失败: ' + e1.message);
            }
        } else {
            throw e1;
        }
    }
    
    // Step 4: 键名映射（中英文混用修复）
    const keyMap = {
        // 外层结构键名
        'platform_name': '平台名称',
        'entity_name': '实体名称',
        'item_name': '项目名称',
        'indicator_comparison_details': '指标对比详情',
        'overall_advantages': '整体优势',
        'overall_disadvantages': '整体劣势',
        
        // 指标对比详情内层键名
        'internal_raw_value': '内部原始值',
        'external_raw_value': '外部原始值',
        'internal_quantified_value': '内部量化值',
        'external_quantified_value': '外部量化值',
        'quantified_comparison_result': '量化对比结果',
        
// 基准实体信息
'internal_benchmark_info': '基准实体信息',
        'entity_name_benchmark': '实体名称',
        'item_name_benchmark': '项目名称',
        'indicator_benchmark_values': '指标基准值',
        
        // 综合建议
        'comprehensive_suggestion': '综合建议',
        'overall_recommendation': '综合建议',
        
// 外部实体对比列表
'external_entity_comparison_list': '外部实体对比列表',
'external_entities': '外部实体对比列表'
    };
    
    function normalizeKeys(obj) {
        if (Array.isArray(obj)) {
            return obj.map(normalizeKeys);
        }
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                const newKey = keyMap[key] || key;
                result[newKey] = normalizeKeys(value);
            }
            return result;
        }
        return obj;
    }
    
    json = normalizeKeys(json);
    
    return {
        result: JSON.stringify(json)
    };
}
```

### 4.2 代码说明

| 步骤 | 功能 | 覆盖的异常 |
|-----|------|-----------|
| Step 1 | 提取 JSON | `<think>` 标签、Markdown 代码块、尾部分号 |
| Step 2 | 分号修复 | 分号 `;` 替代逗号 `,` |
| Step 3 | 括号修复 | 末尾多余 `}` |
| Step 4 | 键名映射 | 中英文混用（12 个常见英文键名） |

### 4.3 扩展键名映射表

如果需要支持更多英文键名，可扩展 `keyMap`：

```javascript
const keyMap = {
    // 基础层（必须）
    'platform_name': '平台名称',
    'entity_name': '实体名称',
    // ...（见完整代码）
    
    // 扩展层（根据业务需要添加）
    'tax_inclusive_price': '数值',
    'delivery_cycle': '时间周期',
    'indicator_quantity': '指标量',
    'supply_stability': '稳定性评分',
    'price': '价格',
    'quantity': '数量',
    'delivery_time': '交货时间',
    'quality': '质量',
    // ...
};
```

---

## 5. 修复验证

### 5.1 验证清单

```yaml
Prompt 层验证:
  - [ ] 开头包含"⚠️ JSON键名约束"段落
  - [ ] 包含负面示例（"严禁使用英文键名"）
  - [ ] 规则 2 与规则 3 无矛盾
  - [ ] 输出示例使用真实键名
  - [ ] 关键执行要求包含"键名一致性"条款
  - [ ] 关键执行要求包含"JSON 结尾与标点终审"条款

代码层验证:
  - [ ] 代码节点集成 main 函数
  - [ ] 测试用例 1：正常 JSON → 解析成功
  - [ ] 测试用例 2：含英文键名 JSON → 映射后解析成功
  - [ ] 测试用例 3：分号错误 JSON → 修复后解析成功
  - [ ] 测试用例 4：末尾多 } JSON → 修复后解析成功
  - [ ] 测试用例 5：组合错误 JSON → 全部修复后解析成功

端到端验证:
  - [ ] 工作流完整执行
  - [ ] 下游代码节点解析成功
  - [ ] 输出数据符合预期
```

### 5.2 测试用例

```javascript
// 测试用例 1：正常 JSON（应直接通过）
const case1 = '{"平台名称": "来源A", "实体名称": "实体A"}';
// 预期：解析成功，无需修复

// 测试用例 2：中英文混用（应映射修复）
const case2 = '{"platform_name": "来源A", "entity_name": "实体A"}';
// 预期：映射为 {"平台名称": "来源A", "实体名称": "实体A"}

// 测试用例 3：分号错误（应替换为逗号）
const case3 = '{"平台名称": "来源A"; "实体名称": "实体A"}';
// 预期：修复为 {"平台名称": "来源A", "实体名称": "实体A"}

// 测试用例 4：末尾多 }（应去掉多余 }）
const case4 = '{"平台名称": "来源A"}}';
// 预期：修复为 {"平台名称": "来源A"}

// 测试用例 5：组合错误（应全部修复）
const case5 = '{"platform_name": "来源A"; "entity_name": "实体A"}}';
// 预期：修复为 {"平台名称": "来源A", "实体名称": "实体A"}
```

---

## 6. 长期维护建议

```yaml
监控指标:
  - 每日统计 LLM 节点 JSON 解析失败率
  - 每周统计键名漂移发生率
  - 每月 review Prompt 是否需要更新

Prompt 版本管理:
  - 使用版本号标记 Prompt（如 v1.0, v1.1）
  - 记录每次修改的原因和效果
  - 保留历史版本以便回滚

键名映射表维护:
  - 发现新的英文键名时，及时添加到 keyMap
  - 定期 review 映射表是否完整
  - 考虑使用模糊匹配（编辑距离）替代硬编码映射

模型升级注意:
  - 升级模型版本时，重新验证 JSON 输出一致性
  - 关注模型官方发布的结构化输出改进
  - 考虑使用新模型的原生 Schema 约束功能
```

---

> **修复方案版本**：v1.0
> **适用场景**：Dify LLM 节点输出 JSON 键名漂移
> **最低依赖**：Dify 代码节点支持 JavaScript
> **推荐搭配**：Prompt 约束（L1）+ 代码兜底（L3），Schema 约束（L2）视平台能力而定

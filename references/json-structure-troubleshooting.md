# JSON 结构化输出诊断手册

> 系统化诊断 LLM 节点 JSON 输出中的键名漂移、格式错误和一致性衰减问题。

---

## 1. 问题概述

### 1.1 现象描述

LLM 节点在输出 JSON 结构化数据时，常见以下异常：

| 异常类型 | 示例 | 影响 |
|---------|------|------|
| 键名语言漂移 | `平台名称` → `platform_name` | 下游解析失败或数据错位 |
| 语义漂移 | `量化对比结果` → `comparison_result` | 字段含义偏离预期 |
| 缩写漂移 | `实体名称` → `sup_name` | 可读性下降，映射困难 |
| 层级漂移 | 嵌套字段出现在顶层 | 数据结构错乱 |
| 标点错误 | 分号 `;` 替代逗号 `,` | JSON.parse 失败 |
| 括号不匹配 | 末尾多余 `}` 或缺失闭合 | JSON.parse 失败 |
| 截断输出 | 长 JSON 被截断 | 数据不完整 |

### 1.2 根因分析

```yaml
根本原因:
  1. 长文本注意力衰减:
     触发条件: completion_tokens > 3000
     机制: 模型生成长文本时，前面的约束在注意力机制中权重降低
     表现: 前半截正常，后半截漂移
     
  2. 模型隐式先验:
     机制: 模型训练数据中英文 JSON 键名占主导
     表现: 中文 Prompt 下仍可能输出英文键名
     影响字段: name, status, id, type, result, data, content 等
     
  3. Prompt 约束缺失:
     机制: 仅通过示例暗示键名，无显性约束
     表现: 模型"自由发挥"键名
     
  4. 代码生成习惯迁移:
     机制: 模型在代码训练中学到分号作为语句结束符
     表现: JSON 中分号替代逗号
     
  5. 嵌套层级记忆丢失:
     机制: 深层嵌套时模型忘记当前括号层级
     表现: 括号不匹配或嵌套错乱
```

---

## 2. 4 维漂移检测法

### 2.1 语言漂移检测

**检测逻辑：**
```javascript
function checkLanguageDrift(outputJson) {
  const allKeys = extractAllKeys(outputJson);
  const chineseKeys = allKeys.filter(k => /[\u4e00-\u9fff]/.test(k));
  const englishKeys = allKeys.filter(k => /^[a-zA-Z_]/.test(k));
  
  const ratio = chineseKeys.length / allKeys.length;
  
  return {
    driftDetected: englishKeys.length > 0,
    severity: englishKeys.length > 5 ? 'high' : englishKeys.length > 0 ? 'medium' : 'none',
    evidence: englishKeys,
    ratio: ratio,
    threshold: 0.8  // 中文键名率低于 80% 视为异常
  };
}
```

**典型场景：**
- 前半截中文键名，后半截突然切英文
- 同一对象内中英文键名混用
- 所有键名均为英文（中文 Prompt 下）

### 2.2 语义漂移检测

**检测逻辑：**
```javascript
function checkSemanticDrift(outputJson, expectedSchema) {
  const modelPreferredKeys = [
    'name', 'status', 'id', 'type', 'result', 'data', 'content',
    'output', 'input', 'response', 'message', 'text'
  ];
  
  const actualKeys = extractAllKeys(outputJson);
  const hits = actualKeys.filter(k => 
    modelPreferredKeys.includes(k.toLowerCase()) &&
    !expectedSchema.includes(k)
  );
  
  return {
    driftDetected: hits.length > 0,
    severity: hits.length > 3 ? 'high' : hits.length > 0 ? 'medium' : 'none',
    evidence: hits,
    explanation: '模型使用训练数据中的偏好键名，而非用户定义的键名'
  };
}
```

**典型场景：**
- `status` 替代 `实体状态`
- `result` 替代 `量化对比结果`
- `data` 替代 `实体数据`

### 2.3 缩写漂移检测

**检测逻辑：**
```javascript
function checkAbbreviationDrift(outputJson, expectedSchema) {
  const actualKeys = extractAllKeys(outputJson);
  const shortKeys = actualKeys.filter(k => 
    k.length < 10 && 
    /^[a-zA-Z_]+$/.test(k) &&
    !expectedSchema.includes(k)
  );
  
  return {
    driftDetected: shortKeys.length > 0,
    severity: shortKeys.length > 3 ? 'high' : shortKeys.length > 0 ? 'medium' : 'none',
    evidence: shortKeys,
    explanation: '模型自发简化键名，类似代码变量命名习惯'
  };
}
```

**典型场景：**
- `entity_name` → `sup_name`
- `platform_name` → `plat_name`
- `indicator_comparison` → `ind_comp`

### 2.4 层级漂移检测

**检测逻辑：**
```javascript
function checkHierarchyDrift(outputJson, expectedSchema) {
  const expectedDepth = calculateMaxDepth(expectedSchema);
  const actualDepth = calculateMaxDepth(outputJson);
  
  return {
    driftDetected: Math.abs(expectedDepth - actualDepth) > 1,
    severity: Math.abs(expectedDepth - actualDepth) > 2 ? 'high' : 'medium',
    evidence: { expected: expectedDepth, actual: actualDepth },
    explanation: expectedDepth > actualDepth ? 
      '嵌套层级减少，字段可能被扁平化' : 
      '嵌套层级增加，可能出现重复嵌套'
  };
}
```

**典型场景：**
- 嵌套对象字段出现在顶层
- 深层嵌套对象被错误地多包一层
- 数组元素结构不一致（有的有嵌套，有的没有）

---

## 3. 诊断信号库

### 3.1 Token 长度信号

| 阈值 | 风险等级 | 说明 |
|-----|---------|------|
| < 1000 | 低 | 短输出，一致性通常良好 |
| 1000-3000 | 中 | 中长度输出，需关注后半截 |
| 3000-5000 | 高 | 长输出，键名漂移概率显著增加 |
| > 5000 | 极高 | 超长输出，多项一致性风险 |

**关联性：**
- `completion_tokens > 3000` 时，语言漂移概率增加 3-5 倍
- `completion_tokens > 5000` 时，标点错误和括号不匹配概率急剧上升

### 3.2 键名一致性信号

```javascript
const consistencySignals = {
  // 信号 1：中文键名率异常
  chineseKeyRatio: {
    calculate: (keys) => keys.filter(k => /[\u4e00-\u9fff]/.test(k)).length / keys.length,
    warning: ratio < 0.8,
    critical: ratio < 0.5
  },
  
  // 信号 2：键名风格不一致
  mixedNaming: {
    detect: (keys) => {
      const hasChinese = keys.some(k => /[\u4e00-\u9fff]/.test(k));
      const hasEnglish = keys.some(k => /^[a-zA-Z_]/.test(k));
      return hasChinese && hasEnglish;
    },
    warning: true,
    critical: false
  },
  
  // 信号 3：模型偏好键名命中
  modelPreferredHits: {
    keywords: ['name', 'status', 'id', 'type', 'result', 'data', 'content'],
    warning: hits => hits.length > 0,
    critical: hits => hits.length > 3
  },
  
  // 信号 4：Schema 合规性（如果配置了）
  schemaMismatch: {
    detect: (output, schema) => {
      if (!schema) return null;
      return validateAgainstSchema(output, schema);
    },
    warning: errors => errors && errors.length > 0,
    critical: errors => errors && errors.length > 5
  }
};
```

### 3.3 模型特性库

```yaml
模型特性库:
  qwen-plus-latest:
    长输出阈值: 3000
    已知漂移:
      - 中→英键名切换（后半截）
      - 分号代替逗号
      - enable_thinking 模式下 JSON 输出被 <think> 标签包裹
    修复建议:
      - Prompt 开头加强键名约束
      - 禁用 enable_thinking（如不需要推理过程）
      - 使用 qwen-flash 做 JSON 修复（快速、低成本）
      
  qwen-max:
    长输出阈值: 5000
    已知漂移: 待补充
    
  gpt-4o:
    strict_mode:
      支持: 是
      限制:
        - 字段顺序不保证
        - additionalProperties 必须为 false
        - 不支持 minLength/maxLength/minItems/maxItems
    已知漂移:
      - 拒绝回答时输出 refusal 字段（不符合 Schema）
      
  claude-sonnet-4:
    已知漂移:
      - JSON 前常带自然语言前缀（"Sure, here's..."）
      - Markdown 代码块包裹
    修复建议:
      - 加强 "仅输出 JSON" 约束
      - 使用正则剥离前缀和代码块标记
```

---

## 4. 修复策略分级

### 4.1 L1 - Prompt 层（零成本，首选）

**核心原则：** 显性约束 > 暗示约束

```markdown
#### 必须添加的约束（按优先级）

1. **键名硬性约束**（Prompt 最开头）
   ```
   ⚠️ JSON键名约束：所有键名必须与「输出格式示例」完全一致，
   全部使用中文，严禁使用英文键名（如 platform_name、entity_name 等），
   严禁中英混用。
   ```

2. **负面示例**（Prompt 第一段后）
   ```
   ⚠️ 特别注意：输出时严禁将中文键名替换为英文
   （如将"平台名称"写成"platform_name"、将"指标对比详情"写成"indicator_comparison_details"），
   这是最常见的错误，请务必避免。
   ```

3. **字段语义描述**（每个字段）
   ```
   "平台名称"：实体所在平台名称，如'来源A'、'来源B'
   "数值"：数值，格式为"数字+单位"，如"13.56元/单位"
   ```
   *说明：模型依赖字段名理解意图，描述性字段名可减少漂移*

4. **JSON 语法自检要求**（Prompt 末尾）
   ```
   输出完成后，请自检 JSON 格式：
   1. 所有分隔符必须是英文逗号 ','，严禁出现分号 ';'
   2. 最后一个字段结束后，只输出必要的闭合括号，严禁追加额外字符
   3. 所有键名必须为中文，检查是否存在英文键名
   ```

5. **输出示例用真实键名**（不要用占位符）
   ```json
   {
     "数值": "...",  // ✅ 用真实键名
     "指标名1": "..."   // ❌ 不要用占位符
   }
   ```
```

### 4.2 L2 - Schema 层（依赖平台能力）

**适用条件：** Dify 支持 `response_format` + `json_schema`

```yaml
配置建议:
  response_format:
    type: "json_schema"
    json_schema:
      name: "entity_comparison"
      strict: true              # 强制 Schema 合规
      schema:
        type: "object"
        properties:
          平台名称: { type: "string" }
          实体名称: { type: "string" }
          # ... 其他字段
        required: ["平台名称", "实体名称"]
        additionalProperties: false  # 禁止额外字段
        
注意事项:
  - 浮动指标名无法用 Schema 完全约束（指标名动态变化）
  - strict mode 下不支持 minLength/maxLength/minItems/maxItems
  - 字段顺序不保证（JSON Schema 不约束顺序）
```

### 4.3 L3 - 代码层（兜底，必须）

**核心原则：** 永远不信任 LLM 原始输出，必须经过清洗和验证

```javascript
// 完整兜底代码模板
function sanitizeLLMOutput(rawText) {
  let str = rawText;
  
  // Step 1: 提取 JSON（处理各种包装情况）
  if (str.includes('</think>')) {
    const parts = str.split('</think>');
    str = parts[parts.length - 1];
  }
  
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    str = codeBlockMatch[1];
  }
  
  str = str.trim();
  
  // Step 2: 分号修复
  str = str.replace(/;(?=\s*["}\]])/g, ',');
  
  // Step 3: 尝试解析，处理末尾多余 }
  let json;
  try {
    json = JSON.parse(str);
  } catch (e1) {
    // 如果末尾是 }，尝试去掉最后一个再试
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
  
  return normalizeKeys(json);
}
```

---

## 5. 生产环境监控指标

```yaml
监控指标:
  基础指标:
    - 重试率: 0.5% - 2% 为正常，> 5% 需排查
    - 解析失败率: < 1% 为正常，> 3% 需紧急处理
    - Token 消耗趋势: 突增可能预示输出膨胀
    
  键名漂移指标:
    - 中文键名率: 应 > 95%，< 80% 触发告警
    - 英文键名出现频率: 连续 3 次出现需告警
    - Schema 合规率: 应 > 98%
    
  语义漂移指标:
    - 模型偏好键名命中数: 单次输出 > 3 个需告警
    - 字段缺失率: 必填字段缺失 > 1% 需告警
    
  格式错误指标:
    - 分号错误率: 应 = 0%
    - 括号不匹配率: 应 = 0%
    - 截断率: 应 < 0.1%
```

---

## 6. 快速决策树

```
LLM 节点 JSON 输出异常
    |
    ├─ 能否解析？
    |   ├─ 否 → 格式错误（分号/括号/截断）→ L3 兜底代码修复
    |   └─ 是 → 继续检查
    |
    ├─ 键名是否一致？
    |   ├─ 否 → 键名漂移
    |   |   ├─ 中英文混用 → L1 Prompt 约束 + L3 normalizeKeys
    |   |   ├─ 语义替换 → L1 字段描述 + L2 Schema 强制
    |   |   └─ 缩写简化 → L1 明确键名 + L2 Schema 强制
    |   └─ 是 → 继续检查
    |
    ├─ 嵌套层级是否正确？
    |   ├─ 否 → L1 输出示例明确层级 + L2 Schema 定义
    |   └─ 是 → 继续检查
    |
    ├─ 字段值是否正确？
    |   ├─ 否 → 语义漂移（超出本手册范围，参考 diagnostic-framework.md）
    |   └─ 是 → 无异常
    |
    └─ completion_tokens > 3000？
        ├─ 是 → 长输出风险，建议拆分输出或加强约束
        └─ 否 → 正常
```

---

## 7. 参考资源

- [OpenAI Structured Outputs 文档](https://developers.openai.com/docs/guides/structured-outputs)
- [阿里云百炼 JSON Mode 文档](https://www.alibabacloud.com/help/zh/model-studio/json-mode)
- [Outlines 约束解码框架](https://github.com/dottxt-ai/outlines)
- [XGrammar 结构化生成](https://github.com/mlc-ai/xgrammar)

---

> **诚实边界**：本手册基于 Qwen3 系列、GPT-4o、Claude Sonnet 的行为特征总结。不同模型版本可能存在差异，建议结合实际测试调整阈值和策略。

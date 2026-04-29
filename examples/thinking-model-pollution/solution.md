# 解决方案：Qwen3 Thinking 模型输出污染

> 针对 Qwen3 + enable_thinking=True 导致的代码节点 JSON.parse 报错

---

## 快速修复（5分钟）

### 1. 在提示词末尾追加格式约束

```markdown
#### 输出格式强制要求（必须严格遵守）

⚠️ 直接输出纯 JSON，不要输出任何思考过程、分析说明或 markdown 代码块标记。
⚠️ 不要添加 ```json 或 ``` 标记，直接输出 JSON 文本。
⚠️ 确保 JSON 完整、可解析，不要截断。
⚠️ 输出必须同时包含「外部实体」和「内部实体」两个字段。
```

### 2. 在代码节点中清理 think 标签

```javascript
function main({text, compareResult}) {
  // 移除 think 标签
  let str = text;
  if (str.includes("<think>")) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // 清理 markdown 和换行
  str = str.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, "").trim();
  
  // 解析 JSON
  const textObj = JSON.parse(str);
  
  // ... 原有业务逻辑
}
```

---

## 深度修复（30分钟）

### 方案 A：调试节点方案（推荐，保留报错能力）

在 LLM 节点和代码节点之间插入调试节点：

```javascript
function debugLLMOutput({text}) {
  const hasThink = text ? text.includes("<think>") : false;
  const hasCloseThink = text ? text.includes("</think>") : false;
  const afterThink = hasCloseThink ? text.split("</think>").pop() : text;
  
  return {
    rawLength: text ? text.length : 0,
    hasThink,
    hasCloseThink,
    afterThinkLength: afterThink ? afterThink.length : 0,
    afterThinkPreview: afterThink ? afterThink.substring(0, 100) : "N/A",
    emptyType: !text ? "A_COMPLETELY_EMPTY" :
               hasThink && (!afterThink || afterThink.trim() === "") ? "B_THINK_THEN_EMPTY" :
               text.trim().startsWith("{") && !text.trim().endsWith("}") ? "C_JSON_TRUNCATED" :
               "UNKNOWN"
  };
}
```

**优点**：
- 保留原始报错，方便排查
- 可以精确看到空输出类型
- 不影响生产流程

---

### 方案 B：正则清理方案（生产环境）

如果确定需要自动处理 think 标签：

```javascript
function main({text, compareResult}) {
  // 第 1 层：空值检查
  if (!text) {
    throw new Error("LLM 输出为空");
  }
  
  // 第 2 层：移除 think 标签
  let str = text;
  if (str.includes("<think>")) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // 第 3 层：清理格式
  str = str.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, "").trim();
  
  // 第 4 层：空值检查（清理后）
  if (!str) {
    throw new Error("清理 think 标签后内容为空，原始内容长度：" + text.length);
  }
  
  // 第 5 层：解析 JSON（保留原始报错）
  const textObj = JSON.parse(str);
  
  // ... 原有业务逻辑
}
```

**优点**：
- 自动处理 think 标签
- 保留有意义的错误信息（不是简单的 SyntaxError）
- 可以追踪原始内容长度

---

## 不同场景的选择建议

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| 开发调试阶段 | 方案 A（调试节点） | 保留完整信息，方便排查 |
| 生产环境 | 方案 B（正则清理） | 自动处理，减少人工干预 |
| Qwen3 + Structured Output | 不建议 | 已知不兼容，改用 Prompt + 代码 |
| DeepSeek R1 + Agent | 不建议 | 已知问题，避免使用 |

---

## 预防措施

### 1. 模型选择

| 需求 | 推荐模型 | 不推荐 |
|------|----------|--------|
| 需要 JSON 输出 + 无 Thinking | GPT-4o, Claude 3.5 | Qwen3（有兼容性问题） |
| 需要 JSON 输出 + 有 Thinking | Qwen3 + Prompt + 代码清理 | DeepSeek R1（Agent 模式有问题） |

### 2. 提示词设计

- 始终在提示词末尾追加格式约束（利用 recency bias）
- 明确禁止输出 thinking 过程（虽然不能完全禁止，但可以减少）
- 提供完整的输出示例

### 3. 监控告警

在调试节点中增加监控：

```javascript
function monitorLLMOutput({text}) {
  const hasThink = text ? text.includes("<think>") : false;
  const afterThink = hasThink ? text.split("</think>").pop() : text;
  const isEmptyAfterThink = !afterThink || afterThink.trim() === "";
  
  // 如果检测到 think 后空输出，记录告警
  if (hasThink && isEmptyAfterThink) {
    console.warn("[ALERT] Think tag pollution detected. Loop index: " + loopIndex);
  }
  
  return { hasThink, isEmptyAfterThink };
}
```

---

## 参考文档

- [诊断手册：Thinking 模型输出污染](../../references/thinking-model-troubleshooting.md)
- [案例分析：完整诊断过程](./analysis.md)
- [Dify Issue #2495](https://github.com/langgenius/dify-official-plugins/issues/2495)
- [SGLang Issue #9282](https://github.com/sgl-project/sglang/issues/9282)

---

> **更新日期**：2026-04-28
> **适用版本**：Dify v1.x, Qwen3 系列
> **验证状态**：已验证

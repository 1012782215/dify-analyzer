# Thinking/Reasoning 模型输出污染诊断手册

> 系统化诊断 Dify 工作流中 Thinking/Reasoning 模型导致的输出污染问题。
> 覆盖 Qwen3、DeepSeek 等模型的 known issues 和兼容性限制。

---

## 1. 问题概述

### 1.1 什么是 Thinking 模型输出污染？

当 LLM 节点使用了支持 thinking/reasoning 的模型（如 Qwen3、DeepSeek-R1）时，模型可能在输出中生成 `<think>...</think>` 标签包裹的思考过程。如果处理不当，这些标签会污染下游节点（尤其是代码节点）的输入，导致解析失败。

### 1.2 常见症状

| 症状 | 说明 |
|------|------|
| 代码节点 `JSON.parse` 报错 | `SyntaxError: Unexpected end of JSON input` |
| LLM 节点 succeeded，下游节点 failed | 错误向上游冒泡 |
| Loop 中某次迭代失败 | 其他迭代正常，说明不是代码逻辑问题 |
| 输出包含 `<think>` 标签 | 模型输出了思考过程 |
| `</think>` 后无内容 | 模型思考后未生成正式回答 |

---

## 2. 四种空输出类型

### 类型 A：完全空输出

**症状**：模型返回空字符串或 null

**判断方法**：
```javascript
function isCompletelyEmpty(text) {
  return !text || text.trim() === '';
}
```

**常见原因**：
- 模型崩溃或 API 超时
- Stream 解析失败
- max_tokens 设置过小或为零
- 模型配置错误

**排查步骤**：
1. 检查模型状态（是否可用）
2. 检查网络连接
3. 检查 max_tokens 配置
4. 查看后端日志（vLLM/SGLang 是否有报错）

---

### 类型 B：Think 标签后空输出（最常见）

**症状**：输出包含 `<think>...</think>`，但 `</think>` 后没有任何 JSON 内容

**判断方法**：
```javascript
function isThinkThenEmpty(text) {
  if (!text || !text.includes('</think>')) return false;
  const afterThink = text.split('</think>').pop();
  return !afterThink || afterThink.trim() === '';
}
```

**真实案例**：
```
<think>
...（数千字的思考过程）
</think>

← 后面什么都没有！
```

**常见原因**：
1. **模型 thinking 后未生成正式回答**
   - 模型"以为"只要思考完就够了
   - 提示词没有明确要求"思考后必须输出 JSON"
   
2. **enable_thinking=True + Structured Output 冲突**
   - Qwen3 的 Grammar Backend 在 thinking 模式下工作异常
   - Structured Output 约束失效

3. **Qwen3 enable_thinking=False 时 Schema 约束失效**
   - SGLang 的 ReasoningGrammarBackend 依赖 `<think>` 标签触发约束解码
   - 关闭 thinking 后，约束解码不生效
   - 这是已知的底层限制（SGLang Issue #9282）

4. **max_tokens 被 thinking 过程耗尽**
   - thinking 和正式回答共享 Token 配额
   - thinking 过程过长，导致 JSON 输出被截断为空

**排查步骤**：
1. 检查 LLM 节点的 enable_thinking 配置
2. 检查 max_tokens 是否充足（建议 ≥ 8192）
3. 检查提示词是否有格式约束
4. 如果是 Qwen3，检查是否同时使用了 Structured Output

---

### 类型 C：JSON 被截断

**症状**：输出有 JSON 开头，但没有结尾（如 `{"key": "val`）

**判断方法**：
```javascript
function isJsonTruncated(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('{') && !trimmed.endsWith('}');
}
```

**常见原因**：
- max_tokens 不足
- 输出长度超过模型限制
- 模型生成被中途截断

**解决方案**：
- 增加 max_tokens（考虑 thinking 过程 + JSON 输出 + 缓冲）
- 简化提示词，减少输出复杂度

---

### 类型 D：JSON 被包裹在 think 标签内部

**症状**：JSON 内容在 `<think>` 标签内部，而不是外部

**判断方法**：
```javascript
function isJsonInsideThink(text) {
  if (!text || !text.includes('<think>')) return false;
  const thinkMatch = text.match(/<think>[\s\S]*?<\/think>/);
  if (!thinkMatch) return false;
  return thinkMatch[0].includes('{') && thinkMatch[0].includes('}');
}
```

**常见原因**：
- 模型把正式回答放进了 thinking 过程
- reasoning_format=tagged 时解析错误
- 模型逻辑混乱

**解决方案**：
- 使用 reasoning_format=separated（如果 Dify 版本支持）
- 代码提取 think 标签内的 JSON
- 调整提示词，明确要求"JSON 在 think 标签外"

---

## 3. 模型特定限制库

### 3.1 Qwen3 系列

| 配置组合 | 兼容性 | 说明 | 推荐方案 |
|----------|--------|------|----------|
| enable_thinking=True + Structured Output | ⚠️ 有风险 | 可能正常工作，也可能失效 | 测试验证 |
| enable_thinking=True + Prompt 解析 | ✅ 推荐 | 最可靠的组合 | **首选方案** |
| enable_thinking=False + Structured Output | ❌ 不兼容 | SGLang Grammar Backend 限制 | 避免使用 |
| enable_thinking=False + Prompt 解析 | ⚠️ 有问题 | 插件 0.0.28-0.0.31 可能仍然输出 thinking | 升级插件或接受并处理 |

**关键发现**（来自 SGLang Issue #9282 和 PR #6743）：
> "The current ReasoningGrammarBackend doesn't support generation with enable_thinking=False. When this argument is passed in Qwen3 models no reasoning content is produced, and think tokens <think> and </think> are absent. The grammar backend assumes ReasoningGrammarObject.is_in_reasoning=True and expects <think> to start constrained decoding. However, the token never appears, hence structured outputs are not enforced."

**vLLM 配置建议**：
- 如果使用 `--reasoning-parser qwen3`，reasoning 字段不被 Dify 解析
- 建议移除 `--reasoning-parser`，让模型原生输出 `<think>` 标签
- Dify 可以解析原生 `<think>` 标签，但无法解析单独的 reasoning 字段

---

### 3.2 DeepSeek R1

| 场景 | 兼容性 | 说明 |
|------|--------|------|
| Agent 模式 | ❌ 不建议 | Thinking 过程嵌套，timer 不停止 |
| Function Calling | ⚠️ V3.2 有问题 | 需要 reasoning_content 字段 |
| 普通对话 | ✅ 正常 | 无特殊限制 |

**问题描述**（来自 Dify Issue #25492）：
> "In Agent mode, multiple model calls can become nested. Each subsequent deep thinking process is nested within the previous one, and the duration of this deep thinking keeps increasing without stopping, even after all results have been output."

**推荐方案**：
- 避免在 Agent 节点使用 DeepSeek R1
- 如需使用，考虑升级 Dify 到支持 reasoning_format 的版本

---

### 3.3 DeepSeek V3

| 配置 | 兼容性 | 说明 |
|------|--------|------|
| enable_thinking=True | ⚠️ 有风险 | 可能只返回 reasoning_content，final content 为空 |
| enable_thinking=False | ✅ 正常 | 无特殊限制 |

**问题描述**（来自 Dify Issue #34010）：
> "If you're using a model with reasoning_format='separated', the reasoning extraction logic strips <think> tags from output. If the LLM's entire response is wrapped in <think> tags, the final output will be empty."

**推荐方案**：
- 检查 max_tokens 是否充足（thinking + 正式回答共享配额）
- 如果不需要 thinking，建议关闭

---

## 4. 诊断流程

### 4.1 快速判断流程

```
用户报告：代码节点 JSON.parse 报错
    ↓
检查报错节点上游是否有 LLM 节点
    ↓
是 → 检查 LLM 输出是否包含 <think> 标签
    ↓
    包含 → 进入 Thinking 模型污染诊断
    不包含 → 进入常规 JSON 解析诊断
    ↓
判断空输出类型（A/B/C/D）
    ↓
检查模型特定限制
    ↓
输出诊断报告
```

### 4.2 与 Token 耗尽的区分

| 特征 | Think 标签污染 | Token 耗尽 |
|------|----------------|------------|
| 错误信息 | `Unexpected end of JSON input` | 可能是同样的错误 |
| LLM 输出 | 有 `<think>` 标签，但 `</think>` 后为空 | JSON 有开头但无结尾 |
| max_tokens | 通常充足（如 32768） | 通常较小（如 2048） |
| 发生位置 | 可能在 Loop 某次迭代 | 通常在长输出时 |
| 模型 | Thinking 模型（Qwen3/DeepSeek） | 任何模型 |

**关键区分方法**：
```javascript
function diagnoseEmptyOutput(text) {
  if (!text) return 'TYPE_A_COMPLETELY_EMPTY';
  if (text.includes('<think>')) {
    const afterThink = text.split('</think>').pop();
    if (!afterThink || afterThink.trim() === '') return 'TYPE_B_THINK_THEN_EMPTY';
    const thinkMatch = text.match(/<think>[\s\S]*?<\/think>/);
    if (thinkMatch && thinkMatch[0].includes('{')) return 'TYPE_D_JSON_INSIDE_THINK';
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && !trimmed.endsWith('}')) return 'TYPE_C_JSON_TRUNCATED';
  return 'UNKNOWN';
}
```

---

## 5. 解决方案

### 5.1 通用方案（所有模型适用）

**Prompt 层（辅助）**：
在提示词末尾追加格式约束：
```markdown
⚠️ 格式强制要求：
- 直接输出纯 JSON，不要输出任何思考过程、分析说明
- 不要添加 ```json 或 ``` 标记
- 确保 JSON 完整、可解析，不要截断
```

**注意**：提示词约束不可靠，只能作为辅助手段。

---

### 5.2 Qwen3 推荐方案

**方案 1：enable_thinking=True + Prompt 约束 + 代码清理（推荐）**

1. 保持 `enable_thinking=True`
2. 在提示词中约束输出格式
3. 在代码节点清理 think 标签：

```javascript
function main({text}) {
  // 移除 think 标签
  let cleaned = text;
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  }
  // 清理 markdown 和换行
  cleaned = cleaned.replace(/```json/g, '').replace(/```/g, '').replace(/\n/g, '').trim();
  // 解析 JSON
  const result = JSON.parse(cleaned);
  return { result };
}
```

**方案 2：使用 `/no_think` 特殊 Token**

在 System Prompt 或 User Prompt 末尾添加 `/no_think`：
> "Adding '/no_think' to system prompt can disable the process of thinking." —— Issue #19051

**注意**：`/no_think` 是 Qwen3 的特殊控制 Token，告诉模型"思考完成后不要输出思考内容"，但模型仍然会走 thinking 流程。

---

### 5.3 DeepSeek 推荐方案

**DeepSeek R1**：
- 避免在 Agent 节点使用
- 如需 thinking 过程，使用 reasoning_format=separated（Dify v1.9+）

**DeepSeek V3**：
- 确保 max_tokens 充足（thinking + 正式回答）
- 如果不需要 thinking，建议关闭

---

## 6. 调试技巧

### 6.1 Dify API 排查工具链

当用户提供了 conversation_id 时，可以使用以下 API 精准定位：

| API | 用途 | 示例 |
|-----|------|------|
| `/chat-messages?conversation_id=xxx` | 获取 message.error | 查看完整错误堆栈 |
| `/workflow-runs/{run_id}` | 获取工作流状态 | 确认整体执行情况 |
| `/workflow-runs/{run_id}/node-executions` | 获取节点级详情 | 查看每个节点的 inputs/outputs |

**完整调用示例（Playwright/Browser 环境）**：

```javascript
// Step 1: 获取 CSRF token
const csrfToken = await page.evaluate(() => {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
});

// Step 2: 获取 workflow node executions
const response = await page.evaluate(async (token) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-csrf-token'] = token;
  
  const res = await fetch(
    `https://your-dify-instance/console/api/apps/{app_id}/workflow-runs/{run_id}/node-executions`,
    { headers, credentials: 'include' }
  );
  return await res.json();
}, csrfToken);

// Step 3: 提取失败节点
const nodes = response.data || [];
const failedNodes = nodes
  .filter(n => n.status === 'failed' || n.status === 'error')
  .map(n => ({
    title: n.title,
    node_type: n.node_type,
    node_id: n.node_id,
    status: n.status,
    error: n.error,
    inputs: n.inputs,
    outputs: n.outputs,
    loop_index: n.execution_metadata?.loop_index,
    predecessor_node_id: n.predecessor_node_id
  }));

// Step 4: 获取上游节点输出
const predecessorDetails = nodes
  .filter(n => failedNodes.some(f => f.predecessor_node_id === n.node_id))
  .map(n => ({
    title: n.title,
    node_id: n.node_id,
    outputs: n.outputs,
    status: n.status
  }));
```

**关键字段**：
- `node_execution.status`: `failed` 或 `error`
- `node_execution.error`: 错误信息
- `node_execution.inputs`: 上游传递的数据
- `node_execution.execution_metadata.loop_index`: Loop 中的迭代次数
- `node_execution.predecessor_node_id`: 上游节点 ID（用于追溯）

**排查技巧**：
1. 先过滤 `status=failed` 的节点，快速定位问题
2. 查看 `execution_metadata.loop_index` 确定 Loop 中的具体迭代
3. 通过 `predecessor_node_id` 追溯上游 LLM 节点的输出
4. 检查 `inputs.text` 是否包含 `<think>` 标签

### 6.2 自助排查方法

在代码节点中添加调试逻辑，输出原始内容：

```javascript
function debugLLMOutput({text}) {
  return {
    rawLength: text ? text.length : 0,
    hasThink: text ? text.includes('<think>') : false,
    hasCloseThink: text ? text.includes('</think>') : false,
    afterThinkPreview: text && text.includes('</think>') 
      ? text.split('</think>').pop().substring(0, 100) 
      : 'N/A',
    first200Chars: text ? text.substring(0, 200) : 'null',
    emptyType: diagnoseEmptyOutput(text)
  };
}
```

---

## 7. 已知 Issue 汇总

| Issue | 描述 | 状态 |
|-------|------|------|
| SGLang #9282 | Qwen3 enable_thinking=False 时 Structured Output 不支持 | 已修复（PR #6743） |
| Dify #2495 | Qwen3 enable_thinking=False 后仍然输出 thinking 内容 | 已知限制 |
| Dify #22377 | Qwen3 参数提取节点无法提取参数 | 已知限制 |
| Dify #24118 | Qwen3-4b 选择 no think 后仍然 think | 已知限制 |
| Dify #25492 | DeepSeek R1 Agent 模式下 thinking 嵌套 | 已知限制 |
| Dify #34010 | reasoning_format=separated 时整个响应被包裹在 think 中导致空输出 | 已知问题 |

---

## 8. 认知修正

### ❌ 常见误区

1. **"关闭 enable_thinking 就能解决问题"**
   - 实际情况：Qwen3 某些插件版本即使关闭也会输出 thinking 内容
   - 根本原因：插件层面的参数传递问题

2. **"提示词可以禁止模型输出 thinking"**
   - 实际情况：thinking 是模型架构层面的行为，提示词无法完全控制
   - 正确做法：接受 thinking 存在，在代码层处理

3. **"max_tokens 越大越好"**
   - 实际情况：对于 Qwen3，max_tokens=32768 仍然可能出现 Think 后空输出
   - 根本原因：不是 Token 不够，而是模型 thinking 后没生成正式回答

4. **"Structured Output 比 Prompt 约束更可靠"**
   - 实际情况：Qwen3 + enable_thinking=False + Structured Output = 不兼容
   - 正确做法：对于 Qwen3，Prompt + 代码解析比 Structured Output 更可靠

---

> **诚实边界**：本手册基于 Dify v1.x、SGLang 和 Qwen3/DeepSeek 的行为特征设计。如使用新版本，部分诊断建议可能需调整。始终优先参考最新官方文档和 GitHub Issue。

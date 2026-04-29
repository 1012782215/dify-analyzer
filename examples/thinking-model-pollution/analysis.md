# 案例分析：Qwen3 + enable_thinking=True 导致代码节点 JSON.parse 报错

> 实际案例来源：Dify 工作流「数据整和」→「数据整和处理」链路故障
> 排查时间：2026-04-28
> 涉及模型：Qwen3（enable_thinking=True）

---

## 1. 问题描述

### 1.1 用户报告

用户反馈 Dify 工作流执行失败，报错信息：
```
Run failed: undefined:1
SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at main (eval at <anonymous> (...test.js:14:1), <anonymous>:5:22)
```

### 1.2 工作流结构

```
[开始] → [Loop 循环] → [数据整和 LLM] → [数据整和处理 Code] → [结束]
                              ↑
                        enable_thinking=True
                        max_tokens=32768
```

### 1.3 关键现象

- **Loop 前 5 次迭代正常**，第 6 次迭代失败
- **LLM 节点 status=succeeded**，但下游代码节点 failed
- 错误发生在 `JSON.parse()` 第 5 行

---

## 2. 诊断过程

### 2.1 Phase 1：日志采集

通过 Dify API 获取 workflow node executions：

```bash
GET /console/api/apps/{app_id}/workflow-runs/{run_id}/node-executions
```

**关键发现**：
- 失败节点：`数据整和处理`（code 类型）
- 错误：`SyntaxError: Unexpected end of JSON input`
- 上游节点：`数据整和`（llm 类型），status=succeeded
- Loop 索引：`execution_metadata.loop_index: 6`

### 2.2 Phase 2：节点分析

#### 2.2.1 分析 LLM 节点输出

通过 API 获取 LLM 节点的 `inputs`：

```json
{
  "text": "<think>\n...（超长的思考过程，约数千字）\n</think>\n\n",
  "compareResult": "{\"基准实体信息\":{...}}"
}
```

**关键发现**：
- `text` 的值包含完整的 `<think>...</think>` 思考过程
- `</think>` 后面只有 `\n\n`，**没有任何 JSON 内容**

#### 2.2.2 分析代码节点逻辑

代码节点「数据整和处理」的代码：

```javascript
function main({text, compareResult}) {
    let strs = text.split("</think>");
    let str = strs[strs.length - 1];      // 取 </think> 之后的内容
    str = str.replaceAll('\n', '');        // 去掉换行
    let textObj = JSON.parse(             // ❌ 这里报错
        str.replace("```json", "").replace("```", "")
    );
    // ...
}
```

**问题定位**：
1. `text.split("</think>")` 取最后一部分
2. 去除换行符后，`str` 变成空字符串 `""`
3. `JSON.parse("")` → `SyntaxError: Unexpected end of JSON input`

### 2.3 Phase 3：根因分析

#### 2.3.1 空输出类型判断

使用 4 种空输出类型检测：

| 类型 | 检查 | 结果 |
|------|------|------|
| A. 完全空输出 | `!text` | ❌ text 有内容 |
| B. Think 后空输出 | `split("</think>").pop().trim() === ""` | ✅ **符合** |
| C. JSON 截断 | `startsWith('{') && !endsWith('}')` | ❌ 不是 |
| D. JSON 在 think 内 | `think标签内包含{和}` | ❌ 不是 |

**结论**：类型 B（Think 标签后空输出）

#### 2.3.2 模型配置检查

| 配置项 | 值 | 分析 |
|--------|-----|------|
| enable_thinking | **True** | 模型进入 thinking 模式 |
| max_tokens | **32768** | 非常充足，排除 Token 耗尽 |
| temperature | 0.1 | 合适 |

**关键判断**：
- max_tokens=32768 排除了 Token 耗尽
- 问题不是"Token 不够"，而是"模型 thinking 后没有生成正式回答"

#### 2.3.3 模型特定限制检查

模型：Qwen3

根据 `references/thinking-model-troubleshooting.md` 模型限制库：
- Qwen3 + enable_thinking=False + Structured Output → ❌ 不兼容
- Qwen3 + enable_thinking=True + Prompt 解析 → ✅ 推荐

**当前配置**：enable_thinking=True + Prompt 解析 → 理论上应该工作

**实际现象**：模型 thinking 后没有输出 JSON

**根本原因**：
1. 提示词没有明确要求"思考完成后必须输出 JSON"
2. 模型"以为"只要思考完就够了
3. 这是 thinking 模型的常见行为，不是 bug

---

## 3. 解决方案

### 3.1 方案选择

| 方案 | 说明 | 可行性 |
|------|------|--------|
| A. 关闭 enable_thinking | ❌ 不推荐 | Qwen3 关闭后 Structured Output 不兼容，且某些插件版本仍然输出 thinking |
| B. 使用 Structured Output | ❌ 不推荐 | Qwen3 与 Structured Output 兼容性差 |
| C. Prompt 约束 + 代码清理 | ✅ **推荐** | 最可靠的组合 |

### 3.2 具体实施

#### 步骤 1：提示词优化（辅助）

在提示词末尾追加格式约束：

```markdown
#### 五、输出格式强制要求（必须严格遵守）

⚠️ 直接输出纯 JSON，不要输出任何思考过程、分析说明或 markdown 代码块标记。
⚠️ 不要添加 ```json 或 ``` 标记，直接输出 JSON 文本。
⚠️ 确保 JSON 完整、可解析，不要截断。
⚠️ 输出必须同时包含「外部实体」和「内部实体」两个字段。
```

**注意**：这只能作为辅助手段，不能替代代码容错。

#### 步骤 2：代码节点优化

由于用户需要保留报错以便排查，不提供 try-catch 模板，而是提供**调试节点**：

```javascript
// 调试节点：插入在 LLM 节点和代码节点之间
function debugLLMOutput({text}) {
  return {
    rawLength: text ? text.length : 0,
    hasThink: text ? text.includes("<think>") : false,
    hasCloseThink: text ? text.includes("</think>") : false,
    afterThinkPreview: text && text.includes("</think>") 
      ? text.split("</think>").pop().substring(0, 100) 
      : "N/A",
    first200Chars: text ? text.substring(0, 200) : "null"
  };
}
```

#### 步骤 3：代码节点清理逻辑（生产环境）

```javascript
function main({text, compareResult}) {
  // 移除 think 标签
  let str = text;
  if (str.includes("<think>")) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // 清理 markdown 和换行
  str = str.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, "").trim();
  
  // 解析 JSON（保留原始报错，不 try-catch）
  const textObj = JSON.parse(str);
  
  // ... 原有业务逻辑
}
```

---

## 4. 验证结果

实施后重新运行工作流：
- ✅ Loop 第 6 次迭代不再报错
- ✅ LLM 节点正常输出 JSON
- ✅ 代码节点正常解析
- ✅ 工作流完整执行成功

---

## 5. 经验总结

### 5.1 关键认知

1. **不要假设"关闭 thinking 就能解决问题"**
   - Qwen3 某些版本即使关闭 enable_thinking 也会输出 thinking 内容
   - 根本解决方法是接受 thinking 存在，在代码层处理

2. **不要过度依赖提示词约束**
   - thinking 是模型架构层面的行为
   - 提示词只能辅助，不能强制禁止

3. **max_tokens 充足≠不会有问题**
   - 32768 足够大，但问题不是 Token 不够
   - 问题核心是模型 thinking 后没有生成正式回答

### 5.2 排查技巧

1. **使用 API 精准定位**
   - `/workflow-runs/{run_id}/node-executions` 比前端日志更详细
   - 可以查看每个节点的 inputs/outputs

2. **区分空输出类型**
   - 类型 B（Think 后空输出）是最常见的 thinking 模型问题
   - 与类型 C（JSON 截断）的区分关键是看 max_tokens 是否充足

3. **检查 Loop 迭代**
   - 如果只有某次迭代失败，说明不是代码逻辑问题
   - 可能是该次迭代的输入数据触发了模型的特殊行为

---

> **参考文档**：references/thinking-model-troubleshooting.md
> **相关 Issue**：SGLang #9282, Dify #2495, Dify #22377

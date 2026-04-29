# ReAct Agent 输出解析失败诊断案例

> **问题类型**: Agent 输出格式异常 → 下游代码节点 JSON 解析失败  
> **关键词**: ReAct, JSON解析失败, Final Answer, action_input, 代码执行节点, 输出清洗  
> **复杂度**: ⭐⭐⭐⭐  
> **涉及模型**: Qwen3-max, qwen-plus-latest 等  
> **全网相关 Issue**: #30966, #23895, #29026, #1949, #23442, #35401, #31034

---

## 症状描述

### 典型错误日志

```
Expected non-whitespace character after JSON at position 5
```

或

```
is not valid JSON at JSON.parse
```

或

```
Unexpected token '从', "从搜索结果来看..." is not valid JSON
```

### 发生位置

- **上游节点**: ReAct (Support MCP Tools) Agent 节点
- **下游节点**: 代码执行节点（尝试 JSON.parse() 解析 Agent 输出）
- **触发时机**: Agent 执行完成后，下游代码节点解析 Agent 的 text 输出变量

---

## 根因分析

### 核心矛盾

**ReAct Agent 的输出格式 ≠ 下游节点期望的纯净 JSON**

### 第一层：ReAct 协议本身的输出结构

ReAct 框架要求模型按以下格式输出：

```
Thought: 我需要搜索产品信息
Action: baidu_mcp_search("产品 实体")
Observation: 搜索结果显示...

Thought: 已经找到3个，再搜索一下
Action: baidu_mcp_search("产品 实体 更多")
Observation: 又找到2个

Thought: 够了，给出最终答案
Action: Final Answer
Action Input: ["实体A", "实体B", "实体C"]
```

**问题**：模型输出的 text 变量包含完整的 Thought + Action + Observation 链。

### 第二层：模型输出的 8 种变异格式

根据全网 Issue 统计：

| 格式类型 | 示例 | 出现频率 |
|---------|------|---------|
| **标准 ReAct** | `{"action": "Final Answer", "action_input": [...]}` | 30% |
| **Final Answer 前缀** | `Final Answer: ["A", "B"]` | 15% |
| **Markdown 包裹** | 代码块包裹的 JSON | 20% |
| **自然语言+JSON** | `实体清单为空。\n\n[...]` | 20% |
| **Think 标签包裹** | `<think>...</think>\n[...]` | 10% |
| **Thought 泄漏** | `Thought: 从搜索结果来看... [...]` | 3% |
| **Standalone JSON** | `[{"name": "A"}]` | 1% |
| **Cohere List** | `[{"action": "Final Answer", ...}]` | 1% |

### 第三层：用户代码常见错误

#### 错误 1：直接 JSON.parse(text)

```javascript
// 错误：直接解析完整 ReAct 输出
let result = JSON.parse(text);
```

#### 错误 2：replaceAll('\n', '')

```javascript
// 错误：移除所有换行
str = str.replaceAll('\n', '');
let result = JSON.parse(str);
```

**结果**：自然语言和 JSON 粘在一起，如：`实体清单为空。[{"name": "A"}]`

#### 错误 3：没有 try-catch

```javascript
// 错误：没有容错处理
let result = JSON.parse(str);
return { result: JSON.stringify(result) };
```

**结果**：任何解析失败都导致整个工作流崩溃。

---

## 诊断流程

```
输出内容分析
    │
    ├─ 包含 <think>...</think>?
    │   ├─ 是 → 分割 think 标签
    │   └─ 否 → 继续
    │
    ├─ 包含 "action": "Final Answer"?
    │   ├─ 是 → 提取 action_input
    │   └─ 否 → 继续
    │
    ├─ 包含 Final Answer:?
    │   ├─ 是 → 提取冒号后面内容
    │   └─ 否 → 继续
    │
    ├─ 包含 ```json ?
    │   ├─ 是 → 清理 markdown
    │   └─ 否 → 继续
    │
    └─ 兜底 → 正则提取 [ ... ]
```

---

## 关键发现（全网搜索）

### Dify 官方解析器逻辑

```python
# api/core/rag/retrieval/output_parser/structured_chat.py
action_match = re.search(r"```(\w*)\n?({.*?)```", text, re.DOTALL)
if action_match is not None:
    response = json.loads(action_match.group(2).strip(), strict=False)
    if isinstance(response, list):
        response = response[0]
    if response["action"] == "Final Answer":
        return ReactFinish({"output": response["action_input"]}, text)
```

**关键**：官方解析器只找代码块包裹的 JSON 格式，且只取第一个 JSON 对象！

### 第三方 MCP 插件解析逻辑

```python
# 提取 code block
code_blocks = re.findall(r"```(.*?)```", code_block, re.DOTALL)

# 清理语言标记
json_text = re.sub(r"^[a-zA-Z]+\n", "", block.strip(), flags=re.MULTILINE)

# 解析 JSON，strict=False
action = json.loads(json_str, strict=False)

# 处理 cohere 返回 list
if isinstance(action, list) and len(action) == 1:
    action = action[0]
```

### 已修复的 ReAct 插件 Bug（PR #2752）

- Fixed FinalAnswer: content being silently discarded
- Fixed standalone JSON not being recognized as tool calls
- Fixed extra model output after Action: leaking into the answer
- Removed misleading "I am thinking about how to help you" fallback

---

## 相关资源

### Dify 官方 Issue
- [#30966](https://github.com/langgenius/dify/issues/30966) - ReAct 返回 JSON 但不调用工具
- [#23895](https://github.com/langgenius/dify/issues/23895) - 最终步骤输出原始 action_input JSON
- [#29026](https://github.com/langgenius/dify/issues/29026) - Agent 停滞，无 Final Answer
- [#1949](https://github.com/langgenius/dify-official-plugins/issues/1949) - JSONDecodeError
- [#31034](https://github.com/langgenius/dify/issues/31034) - ReAct 策略执行异常

### 官方源码参考
- `api/core/agent/strategy/react.py` - ReAct 策略实现
- `api/core/agent/output_parser/react.py` - ReAct 输出解析器
- `api/core/rag/retrieval/output_parser/structured_chat.py` - 结构化输出解析

### 第三方参考
- `junjiem/dify-plugin-agent-mcp_sse/output_parser/cot_output_parser.py` - MCP Agent 输出解析

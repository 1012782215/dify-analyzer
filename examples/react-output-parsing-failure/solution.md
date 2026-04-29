# ReAct Agent 输出解析失败 - 解决方案

> 提供多级降级提取策略，处理 ReAct Agent 的各种输出变异格式。

---

## 方案 1：多级降级提取（推荐）

```javascript
function main({text, oldResult}) {
    let result = [];
    
    // 1. 处理 oldResult（循环累加场景）
    if (oldResult) {
        try {
            const oldArr = JSON.parse(oldResult);
            if (Array.isArray(oldArr)) {
                oldArr.forEach(item => item && result.push(item));
            }
        } catch (e) {
            console.error("oldResult parse error:", e.message);
        }
    }
    
    // 2. 处理 text（ReAct 输出）
    if (text) {
        try {
            let str = text;
            
            // 2.1 移除 think 标签（Qwen3 thinking 模式）
            str = str.replace(/<think>[\s\S]*?<\/think>/g, '');
            
            // 2.2 提取标准 ReAct JSON 格式
            // {"action": "Final Answer", "action_input": [...]}
            const actionInputMatch = str.match(/"action_input"\s*:\s*(\[[\s\S]*?\])/);
            if (actionInputMatch) {
                str = actionInputMatch[1];
            } else {
                // 2.3 提取 Final Answer 前缀格式
                // Final Answer: [...]
                const finalAnswerMatch = str.match(/Final Answer[:\s]*([\s\S]*)/i);
                if (finalAnswerMatch) {
                    str = finalAnswerMatch[1].trim();
                }
                
                // 2.4 清理 markdown 代码块
                str = str.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
                
                // 2.5 兜底：正则提取 JSON 数组
                if (!str.trim().startsWith('[')) {
                    const arrayMatch = str.match(/\[[\s\S]*?\]/);
                    if (arrayMatch) {
                        str = arrayMatch[0];
                    }
                }
            }
            
            // 2.6 解析 JSON
            const parsed = JSON.parse(str.trim());
            
            // 2.7 统一处理为数组
            if (Array.isArray(parsed)) {
                parsed.forEach(item => item && result.push(item));
            }
            
        } catch (e) {
            console.error("text parse error:", e.message);
            console.error("problematic text:", text.substring(0, 300));
        }
    }
    
    // 3. 去重
    result = [...new Set(result)];
    
    return {
        result: JSON.stringify(result)
    };
}
```

---

## 方案 2：极简暴力版

适用于只处理单个 JSON 数组的场景：

```javascript
function main({text}) {
    let result = [];
    
    if (!text) return { result: JSON.stringify(result) };
    
    try {
        // 移除 think 标签
        let str = text.replace(/<think>[\s\S]*?<\/think>/g, '');
        
        // 暴力提取方括号内容（最短的 [...] 匹配）
        const match = str.match(/"action_input"\s*:\s*(\[[\s\S]*?\])/) || 
                     str.match(/\[[\s\S]*?\]/);
        
        if (match) {
            result = JSON.parse(match[1] || match[0]);
        }
    } catch (e) {
        console.error("Parse failed:", text.substring(0, 200));
    }
    
    return { result: JSON.stringify(Array.isArray(result) ? result : []) };
}
```

---

## 关键代码要点

### 绝对不能做的事情

| 操作 | 后果 | 原因 |
|------|------|------|
| `JSON.parse(text)` | 崩溃 | text 包含 Thought/Action/Observation |
| `str.replaceAll('\n', '')` | 崩溃 | 自然语言和 JSON 粘在一起 |
| `str.replace("```json", "")` | 可能残留 | 只替换第一个匹配 |
| 没有 `try-catch` | 工作流崩溃 | ReAct 输出不稳定 |

### 必须做的事情

| 操作 | 原因 |
|------|------|
| 先移除 `<think>...</think>` | Qwen3 会输出 thinking 过程 |
| 尝试提取 `"action_input"` | 标准 ReAct JSON 格式 |
| 尝试提取 `Final Answer:` | 旧版 ReAct 简化格式 |
| 清理 ` ```json ` 和 ` ``` ` | 模型可能加 markdown |
| 兜底正则提取 `\[[\s\S]*?\]` | 处理纯文本+JSON混合 |
| 使用 `JSON.parse(str.trim())` | 移除首尾空白 |
| 全程 `try-catch` | 防止偶发格式错误崩溃 |

### 正则表达式参考

```javascript
// 提取 action_input（非贪婪匹配）
/"action_input"\s*:\s*(\[[\s\S]*?\])/

// 提取 Final Answer 后的内容
/Final Answer[:\s]*([\s\S]*)/i

// 提取 JSON 数组（非贪婪）
/\[[\s\S]*?\]/

// 清理 markdown 代码块（全局+忽略大小写）
str.replace(/```json\s*/gi, '').replace(/```\s*/g, '')

// 移除 think 标签
str.replace(/<think>[\s\S]*?<\/think>/g, '')
```

---

## 最佳实践

### 1. 上游 Agent 节点优化

在 Agent 的系统提示词中明确输出格式：

```markdown
【最终输出要求】
在 Final Answer 中，只输出纯 JSON 数组，不要加 markdown 标记。
正确格式：[{"key": "value"}]
错误格式：从搜索结果来看... 或 ```json[...]```
```

### 2. 模型选择建议

| 模型 | ReAct 稳定性 | 建议 |
|------|-------------|------|
| GPT-4o | ⭐⭐⭐⭐⭐ | 推荐，输出格式稳定 |
| DeepSeek-V3 | ⭐⭐⭐⭐ | 推荐 |
| Claude 3.5 | ⭐⭐⭐⭐ | 推荐 |
| Qwen3-max | ⭐⭐ | 可用，但需下游清洗 |
| qwen-plus | ⭐⭐⭐ | 需关闭 thinking |

### 3. 架构建议

```
ReAct Agent 节点
    ↓
[输出变量: text]
    ↓
代码执行节点（清洗/提取）
    ↓
[输出变量: result]
    ↓
下游节点使用 result
```

**永远不要**让下游节点直接解析 Agent 的原始 `text` 输出。

### 4. 调试技巧

在代码执行节点中添加日志：

```javascript
function main({text}) {
    console.log("=== Agent Raw Output ===");
    console.log(text);
    console.log("=== Contains Think ===");
    console.log(text ? text.includes('<think>') : false);
    console.log("=== Contains Final Answer ===");
    console.log(text ? /Final Answer/i.test(text) : false);
    console.log("=== Contains action_input ===");
    console.log(text ? text.includes('"action_input"') : false);
    
    // ... 处理逻辑
}
```

### 5. 版本兼容性

| Dify 版本 | ReAct 插件版本 | 已知问题 |
|-----------|---------------|---------|
| < 1.7.1 | - | Agent 提前停止，不输出 Final Answer |
| 1.9.2 | - | JSONDecodeError，解析器脆弱 |
| 1.11.2 | - | ReAct 返回 JSON 但不调用工具 |
| 1.11.3 | - | ReAct 只输出单步，不迭代 |
| >= 1.12 | >= 0.0.27 | 修复了 FinalAnswer 被丢弃问题 |

**建议**：升级到最新版本，或至少 >= 1.12。

---

## 总结

ReAct Agent 输出解析失败是 **Dify 工作流中的高频问题**，根因在于：

1. **ReAct 协议本身**要求输出 Thought/Action/Observation 链
2. **模型行为不稳定**，输出格式存在 8 种以上变异
3. **Dify 后端解析器**对格式敏感，版本差异大
4. **用户代码**常犯 `replaceAll('\n', '')` 和缺少 try-catch 的错误

**核心解决思路**：
- 下游必须加**清洗/提取**代码节点
- 使用**多级降级提取**策略（action_input → Final Answer → 正则兜底）
- **全程 try-catch**，失败返回空数组
- **永远不要**直接 `JSON.parse(Agent原始输出)`

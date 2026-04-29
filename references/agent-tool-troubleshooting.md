# Agent 工具调用故障诊断手册

> 当 Dify Agent 节点配置 function_calling 策略但数据处理为空 `{}` 时，参考本手册。
> 
> 基于全网 15+ 个 Dify/Qwen 相关 Issue 的系统性总结。

---

## 快速决策树

```
Agent 数据处理为空
    │
    ├─ 检查 L1: Agent 策略
    │   ├─ 无策略 → 配置 function_calling 或 ReAct
    │   └─ 有策略 → 继续
    │
    ├─ 检查 L3: enable_thinking 参数 [高优先级]
    │   ├─ true → 设置为 false 或移除
    │   └─ false/未设置 → 继续
    │
    ├─ 检查 L5: 模型兼容性 [高优先级]  
    │   ├─ Qwen3 系列 → 已知问题，建议换模型
    │   └─ GPT-4o/DeepSeek → 继续
    │
    ├─ 检查 L4: 提示词要求
    │   └─ 添加"必须使用工具"指令
    │
    └─ 检查 L2/L6: 工具绑定/架构限制
        └─ 查看工作流编排确认
```

---

## 诊断评估 Rubric（6层 + 实测，总分 100）

| 层级 | 维度 | 权重 | 检查项 | 评分标准 |
|-----|-----|------|--------|---------|
| **L1** | 配置层 | 15 | Agent 策略配置 | 15分：策略正确且模型支持；5分：策略正确但模型支持存疑；0分：无策略或策略错误 |
| **L2** | 绑定层 | 10 | 工具绑定状态 | 10分：绑定具体工具，schema 正确；5分：显示"工具箱"但未绑定实例；0分：未绑定工具 |
| **L3** | 参数层 | 15 | completion_params | 15分：无 enable_thinking 或设置为 false；**0分：enable_thinking: true** |
| **L4** | 提示词层 | 10 | 系统提示词要求 | 10分：明确强制要求使用工具；5分：提及工具但未强制；0分：未提及工具使用要求 |
| **L5** | 模型层 | 20 | 模型兼容性 | 20分：GPT-4o, GPT-4, DeepSeek-V3 等稳定支持；10分：Claude 3.5, 其他主流模型；**0分：Qwen3 系列（已知有系统性问题）** |
| **L6** | 架构层 | 10 | ChatFlow 限制 | 10分：独立 Agent 应用（无限制）；5分：ChatFlow Agent 节点（有中间步骤不可见限制）；0分：版本过旧，存在已知 bug |
| **-** | 实测层 | 20 | 日志证据 | 20分：有明确证据（如 enable_thinking: true）；10分：有部分证据（如模型直接输出 SQL）；0分：无日志证据，纯推测 |

**总分 = Σ(维度分)**，满分 100 分。

**诊断等级**：
- 90-100 分：问题明确，解决方案清晰
- 70-89 分：问题基本明确，需进一步验证
- 50-69 分：问题部分明确，需补充信息
- <50 分：信息不足，需手动验证

---

## L1: 配置层（15分）

### 检查项
- Agent 策略是否设置为 `function_calling` 或 `ReAct`？
- 模型是否支持该策略？

### 评分
- **15分**：策略正确且模型支持
- **5分**：策略正确但模型支持存疑
- **0分**：无策略或策略错误

### 诊断方法
查看日志 → Agent 节点 → Agent 策略

### 常见错误
```yaml
# 错误：未设置策略
agent_strategy: ""  # 空字符串

# 正确
agent_strategy: "function_calling"
# 或
agent_strategy: "ReAct"
```

### 模型策略兼容性
| 模型 | function_calling | ReAct | 备注 |
|-----|-----------------|-------|------|
| GPT-4o | ✅ 优秀 | ✅ 良好 | 推荐 |
| GPT-4 | ✅ 优秀 | ✅ 良好 | 推荐 |
| DeepSeek-V3 | ✅ 良好 | ✅ 良好 | 推荐 |
| Claude 3.5 | ✅ 良好 | ✅ 优秀 | 推荐 ReAct |
| Qwen3 系列 | ⚠️ 有问题 | ✅ 可用 | 推荐 ReAct |
| Qwen-plus | ⚠️ 中等 | ✅ 良好 | 需关闭 thinking |

---

## L2: 绑定层（10分）

### 检查项
- 是否绑定了具体工具实例？
- 工具 schema 是否正确？

### 评分
- **10分**：绑定具体工具，schema 正确
- **5分**：显示"工具箱"但未绑定实例
- **0分**：未绑定工具

### 诊断方法
查看工作流编排 → Agent 节点 → 工具配置区域

### 常见错误

#### 错误 1：工具箱占位符
**症状**：显示 🤖 图标但没有具体工具名称
**原因**：前端显示问题，工具未正确实例化
**解决**：重新绑定工具或刷新页面

#### 错误 2：toolbox is not installed
**症状**：错误消息 "toolbox is not installed"
**原因**：Dify v1.0.0+ 的已知前端显示问题
**影响**：不影响实际功能，仅显示问题
**来源**：Issue #16436

#### 错误 3：工具未找到
**症状**：日志显示 SQL 查询 tool_installations 表为空
```sql
SELECT * FROM "tool_installations" WHERE tenant_id = '...' AND plugin_id = '...'
```
**原因**：
- Plugin ID 不匹配
- 工具未正确安装
- 多租户 ID 混淆
**解决**：
1. 检查 Plugin ID 是否完全匹配（包括大小写）
2. 重新安装工具
3. 确认 tenant_id 正确
**来源**：Issue #16014

---

## L3: 参数层（15分）⭐ 高频问题

### 检查项
- `completion_params` 中是否有 `enable_thinking`？
- 值为 `true` 还是 `false`？

### 评分
- **15分**：无 `enable_thinking` 或设置为 `false`
- **0分**：`enable_thinking: true`

### 原理详解

**Qwen3 系列的 thinking 模式与 function calling 存在冲突。**

当 `enable_thinking: true` 时：
1. 模型优先进入"思考模式"
2. 输出 `<think>...</think>` 包裹的推理过程
3. **绕过 function call 格式**
4. 工具调用被跳过

**关键发现**（来源：Issue #1817）：
> "When thinking mode is enabled, the model frequently plans a tool call in its reasoning block, then continues generating a response without actually emitting the tool call."
> 
> 模型在 thinking 块中计划工具调用，但从不实际触发。

### 症状识别
- 日志显示 `completion_params.enable_thinking: true`
- 模型输出包含 `<think>...</think>` 标签
- 数据处理为 `{}`（空对象）
- 模型直接生成答案而非调用工具

### 解决方案

#### 方案 1：移除参数（推荐）
```json
{
  "completion_params": {
    "max_tokens": 32768
    // 不设置 enable_thinking，让模型自适应
  }
}
```

#### 方案 2：明确关闭
```json
{
  "completion_params": {
    "max_tokens": 32768,
    "enable_thinking": false
  }
}
```

#### 方案 3：强制提示词（备选）
在系统提示词中添加：
```
你必须使用工具来获取数据，不要直接生成答案。
即使需要思考分析，也要先调用工具获取必要信息。
```

### 验证方法
查看日志 → Agent 节点 → 输入 → completion_params

### 已知限制
**Thinking mode 与 tool_choice 的兼容性**（来源：Qwen Cloud 文档）：
- `enable_thinking: true` 时，`tool_choice` 只支持 `"auto"` 或 `"none"`
- 强制特定工具（`tool_choice: {"type": "function", ...}`）需要关闭 thinking

---

## L4: 提示词层（10分）

### 检查项
- 系统提示词是否明确要求"必须使用工具"？
- 是否描述了工具用途和调用时机？

### 评分
- **10分**：明确强制要求使用工具
- **5分**：提及工具但未强制
- **0分**：未提及工具使用要求

### 优化建议

#### 强制工具调用模板
```markdown
你是 SQL 生成助手。你的工作流程必须遵循：

1. **先使用工具**：调用【query_database】工具获取数据
2. **基于结果回答**：根据工具返回生成最终回答  
3. **禁止直接生成**：不要直接生成 SQL，必须通过工具执行

工具调用格式：
- 工具名称：query_database
- 参数：{"sql": "SELECT ..."}

违反以上流程的回答是无效的。
```

#### 工具用途描述模板
```markdown
【数据库查询工具】用途：
- 执行 SQL 查询获取实时数据
- 验证查询语法正确性
- 返回结构化查询结果

何时使用：
- 用户问题涉及具体数据时
- 需要验证数据存在性时
- 生成答案前需要数据支撑时
```

### 常见错误
**提示词仅描述能力，未强制要求**：
```markdown
❌ 错误：你可以使用工具来查询数据库。
    （模型可能判断不需要工具）

✅ 正确：你必须使用工具查询数据库，禁止直接回答。
    （强制触发工具调用）
```

---

## L5: 模型层（20分）⭐ 高频问题

### 检查项
- 模型是否支持稳定的 function calling？
- 是否有已知兼容性问题？

### 评分
- **20分**：GPT-4o, GPT-4, DeepSeek-V3 等稳定支持
- **10分**：Claude 3.5, 其他主流模型
- **0分**：Qwen3 系列（已知有系统性问题）

### 已知问题模型详解

#### Qwen3 系列问题汇总

**问题 1：Function Calling 幻觉**（来源：Issue #35401）
> "Qwen models are known to have systematic JSON parsing failures and hallucinations in Function Calling mode."
> 
> Qwen 模型在 Function Calling 模式下存在系统性 JSON 解析失败和幻觉。

**问题 2：Tool Call 解析失败**（来源：vLLM Issue #20611）
- Stream 模式下 tool_calls 字段解析失败
- Tool call tag 出现在 content 中而非 tool_calls 字段
- 已修复于 vLLM 0.9.1，但 Qwen3-Next 系列仍有随机问题

**问题 3：Thinking 模式冲突**（来源：Qwen3 Issue #1817）
- `enable_thinking: true` 时工具调用率下降 ~60%
- 模型在 thinking 块中计划工具调用但不执行
- 甚至出现"幻觉调用"（声称调用了工具但实际没有）

**问题 4：XML Tool Call 解析**（来源：vLLM Issue #39056）
- Tool call 以 XML 格式嵌入在 `<think>` 标签内
- vLLM 的 `qwen3_reasoning_parser` 无法提取
- 需要升级 vLLM 版本或切换 parser

### 解决方案

#### 方案 1：换用稳定模型（推荐）
| 推荐模型 | 稳定性 | 备注 |
|---------|-------|------|
| GPT-4o | ⭐⭐⭐⭐⭐ | 最佳选择 |
| GPT-4 | ⭐⭐⭐⭐⭐ | 稳定可靠 |
| DeepSeek-V3 | ⭐⭐⭐⭐ | 性价比高 |
| Claude 3.5 | ⭐⭐⭐⭐ | ReAct 优秀 |

#### 方案 2：改用 ReAct 策略
如果使用 Qwen 系列：
```yaml
# 将
agent_strategy: "function_calling"

# 改为
agent_strategy: "ReAct"
```

**原因**：Qwen 在 ReAct 模式下表现更稳定。
**来源**：Dify Issue #35401 维护者建议

#### 方案 3：升级 vLLM（自托管场景）
```bash
# 升级到修复版本
pip install vllm>=0.9.1

# 使用 qwen3_xml parser
vllm serve Qwen/Qwen3-8B \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --reasoning-parser qwen3
```

### 快速测试方案
```
1. 将模型临时切换为 GPT-4o
2. 保持其他配置不变，重新执行
3. 观察是否调用工具：
   - 是 → 确认是模型兼容性问题
   - 否 → 问题在其他层（提示词、绑定等）
```

---

## L6: 架构层（10分）

### 检查项
- ChatFlow Agent 节点 vs 独立 Agent 应用？
- Dify 版本是否有已知问题？

### 评分
- **10分**：独立 Agent 应用（无限制）
- **5分**：ChatFlow Agent 节点（有中间步骤不可见限制）
- **0分**：版本过旧，存在已知 bug

### 已知架构限制

#### ChatFlow Agent 节点限制
**来源**：Issue #35401

> "Agent nodes in ChatFlow store logs in workflow execution metadata (AGENT_LOG) rather than the MessageAgentThought table used by standalone agents, so intermediate reasoning steps aren't streamed to the UI during execution."

**影响**：
- ChatFlow 中的 Agent **不显示**中间工具执行步骤
- 这是**设计如此**，不是 bug
- 工具实际可能已调用，但 UI 不显示过程

**验证方法**：
```
1. 查看最终输出是否基于工具结果
2. 检查后端日志（非 UI）
3. 使用 API 访问 agent_log 事件
```

**解决方案**：
- 如需查看完整过程，改用**独立 Agent 应用**
- 如只需最终结果，ChatFlow Agent 节点可用

#### Agent Plugin 版本问题
**来源**：Issue #2375

| 版本 | 状态 | 备注 |
|-----|------|------|
| v0.0.26 | ✅ 正常 | 推荐版本 |
| v0.0.27+ | ❌ 回归 | ReAct 工具不执行 |

**解决**：降级到 v0.0.26 或等待修复

---

## 实测层（20分）

### 检查项
- 日志中是否有工具调用记录？
- 模型输出是否包含 `<think>` 标签？
- 错误信息是否明确？

### 评分
- **20分**：有明确证据（如 `enable_thinking: true`）
- **10分**：有部分证据（如模型直接输出 SQL）
- **0分**：无日志证据，纯推测

### 关键日志字段

#### Agent 节点输入
```json
{
  "model": {
    "provider": "langgenius/tongyi/tongyi",
    "model": "qwen-plus-latest",
    "completion_params": {
      "max_tokens": 32768,
      "enable_thinking": true  // ← 问题线索！
    }
  },
  "tools": [...],
  "messages": [...]
}
```

#### Agent 节点输出
```json
{
  "data_processing": {},  // ← 为空表示工具未调用
  "output": {
    "text": "<think>\n分析用户问题...\n</think>\n\n最终答案..."  // ← thinking 模式证据
  }
}
```

### 证据分级

| 证据等级 | 说明 | 示例 |
|---------|------|------|
| **A级** | 直接证据 | `enable_thinking: true` + 数据处理为空 |
| **B级** | 强间接证据 | 模型输出含 `<think>` + 直接生成答案 |
| **C级** | 弱间接证据 | 仅数据处理为空，无其他线索 |
| **D级** | 无证据 | 日志读取不完整，纯推测 |

---

## 解决方案优先级

按投入产出比排序：

### P0: 立即尝试（5分钟验证）

#### 1. 关闭 enable_thinking
**适用**：使用 Qwen 系列模型
**操作**：
```json
// 移除或设置为 false
{
  "completion_params": {
    "enable_thinking": false
  }
}
```
**验证**：重新执行，观察数据处理是否仍为空

#### 2. 换用 GPT-4o 测试
**适用**：所有场景
**操作**：临时切换模型为 GPT-4o，保持其他配置不变
**验证**：
- 工具调用正常 → 确认是模型兼容性问题
- 仍不调用 → 问题在其他层

### P1: 提示词优化（10分钟）

#### 1. 强制工具调用声明
在系统提示词中添加：
```markdown
你必须使用【工具名称】来获取数据，不要直接生成答案。
分析完成后，先调用工具，再基于返回结果整理输出。
```

#### 2. 明确工具用途
描述工具功能、参数、调用时机

### P2: 架构调整（30分钟+）

#### 1. 改用 ReAct 策略
**适用**：必须使用 Qwen 系列
**操作**：Agent 策略从 `function_calling` 改为 `ReAct`

#### 2. 改用独立 Agent 应用
**适用**：需要查看完整工具调用过程
**操作**：创建独立 Agent 应用，而非 ChatFlow Agent 节点

#### 3. 升级 Dify/插件版本
**适用**：版本过旧，存在已知 bug
**操作**：
```bash
# 升级 Dify
docker pull langgenius/dify-api:latest

# 降级 Agent Plugin（如 v0.0.27+ 有问题）
# 手动安装 v0.0.26
```

### P3: 工具检查（视情况）

#### 1. 重新绑定工具
- 删除现有工具绑定
- 重新选择工具
- 确认 schema 正确

#### 2. 重新安装工具
```bash
# 在 Dify 插件管理页面
# 1. 卸载问题工具
# 2. 重新安装
# 3. 确认 plugin_id 匹配
```

---

## 验证清单

修复后，按以下清单验证：

- [ ] **数据处理不为空**：日志显示 `data_processing` 包含工具调用记录
- [ ] **工具调用记录可见**：日志显示工具名称、参数、返回结果
- [ ] **输出基于工具结果**：Agent 回答引用了工具返回的数据
- [ ] **无 thinking 标签干扰**（如关闭 thinking）：输出不含 `<think>...</think>`
- [ ] **执行时间合理**：工具调用增加的时间在预期范围内

---

## 典型案例

### 案例 1：enable_thinking 冲突（本次案例）

**症状**：
- 模型：qwen-plus-latest
- 策略：function_calling
- 数据处理：`{}`
- 参数：`enable_thinking: true`（未设置，默认开启）

**诊断**：
- L3 参数层：0 分（enable_thinking 为 true）
- L5 模型层：0 分（Qwen3 已知问题）
- 实测层：20 分（明确证据）
- **总分：35 分**（问题明确）

**解决方案**：
1. 移除 `enable_thinking` 参数（让模型自适应）
2. 或换用 GPT-4o

**验证**：
- 修改后数据处理不再为空
- 工具调用正常触发

### 案例 2：工具绑定问题

**症状**：
- 错误消息："toolbox is not installed"
- 工具显示 🤖 但无具体名称

**诊断**：
- L2 绑定层：5 分（显示占位符）
- 其他层：正常
- **总分：75 分**（问题基本明确）

**解决方案**：
1. 重新绑定工具
2. 或忽略（Dify v1.0.0+ 前端显示问题，不影响功能）

### 案例 3：模型兼容性问题

**症状**：
- 模型：Qwen3-235B
- 策略：function_calling
- 输出：完全幻觉，不相关数据

**诊断**：
- L5 模型层：0 分（Qwen3 已知问题）
- **总分：50 分**（问题部分明确）

**解决方案**：
1. 改用 ReAct 策略
2. 或换用 GPT-4o

---

## 参考 Issue 清单

本手册基于以下 GitHub Issue 总结：

### Dify 官方 Issue
- #35401 - Qwen Function Calling 幻觉
- #2375 - ReAct 工具不执行（v0.0.27+ 回归）
- #16014 - 工具安装记录找不到
- #16436 - toolbox is not installed 前端问题
- #15118 - Agent 节点 404 错误
- #27987 - 本地模型工具不执行
- #13469 - 自定义模型 Function Calling 支持

### Qwen 官方 Issue
- #1817 - Thinking 模式工具调用失败

### vLLM Issue
- #20611 - Qwen3 Tool Call 解析失败
- #39056 - XML Tool Call 在 think 标签内

---

## 更新记录

- 2026-04-24: 初始版本，整合全网 15+ Issue 经验

---

> **诚实边界**：本手册基于公开 Issue 和实际案例总结，但 Dify/Qwen 持续更新，部分信息可能过时。如遇新版本问题，请参考最新官方文档。

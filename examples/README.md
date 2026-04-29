# 案例分析库索引

> dify-log-analyzer 典型案例集合

---

## 案例列表

### 1. Agent 空数据处理问题
**目录**: `agent-empty-data-processing/`  
**问题类型**: Agent 工具调用  
**症状**: Agent 节点 data_processing 为空 `{}`  
**关键词**: enable_thinking, function_calling, 工具未触发  
**诊断方法**: 6层诊断法  
**复杂度**: ⭐⭐⭐⭐

---

### 2. 提示词迭代中的边界情况处理
**目录**: `prompt-iteration-boundary-analysis/`  
**问题类型**: 提示词逻辑缺陷  
**症状**: 
- 负数输出（无数据按0计算）
- 无意义前缀（空值参与字符串拼接）
**关键词**: 提示词版本演进、数据状态分类、条件化输出  
**诊断方法**: 
- 数据状态三层分类法
- 提示词逻辑验证四问
- S.V.E.R.调试流程  
**复杂度**: ⭐⭐⭐  
**特色**: 
- 展示了从"全加→全不加→条件化"的典型演进轨迹
- 包含完整的3轮迭代分析
- 提供了通用的边界情况处理模式

**适用场景**:
- 数据转换类节点（LLM/代码执行/模板）
- 多数据源合并场景
- 字符串拼接/格式化输出
- 条件分支逻辑优化

---

### 3. ReAct Agent 输出解析失败
**目录**: `react-output-parsing-failure/`  
**问题类型**: Agent 输出格式异常 → 下游代码节点 JSON 解析失败  
**症状**: 
- 代码执行节点 `JSON.parse` 崩溃
- 错误信息：`is not valid JSON` 或 `Expected non-whitespace character`
- 偶发性失败（有时成功有时失败）
**关键词**: ReAct, JSON解析失败, Final Answer, action_input, 输出清洗, 代码执行节点  
**诊断方法**: 
- 输出格式变异分析（8种格式识别）
- 多级降级提取策略
- 正则表达式提取  
**复杂度**: ⭐⭐⭐⭐  
**特色**: 
- 基于全网 9 个相关 Issue 的系统性总结
- 包含 Dify 官方和第三方解析器源码分析
- 提供了可直接复用的兜底代码（3种方案）
- 覆盖了 ReAct 输出的所有变异格式

**适用场景**:
- ReAct Agent 节点下游接代码执行节点
- 需要解析 Agent 输出为 JSON 的场景
- 使用 Qwen3 系列模型的 Agent 节点
- MCP 工具调用的结果处理

**全网相关 Issue**: #30966, #23895, #29026, #1949, #23442, #35401, #31034

---

### 4. JSON 键名漂移（中英文混用）
**目录**: `json-key-name-drift/`  
**问题类型**: LLM 节点 JSON 结构化输出一致性衰减  
**症状**: 
- 前半截中文键名正常，后半截突然变成英文（如 `platform_name`）
- 同一 JSON 内中英文键名混用
- 分号 `;` 替代逗号 `,`
- 末尾多余 `}`
**关键词**: 键名漂移, platform_name, 中英文混用, completion_tokens, 长输出格式错乱, 分号错误, 括号不匹配  
**诊断方法**: 
- 4维漂移检测法（语言/语义/缩写/层级）
- Token 长度与一致性关联分析
- 模型特性匹配（Qwen/GPT/Claude）  
**复杂度**: ⭐⭐⭐  
**特色**: 
- 基于真实生产环境案例（数据对比分析工作流）
- 提供 Prompt 层 + 代码层双保险修复方案
- 包含完整的修改前后 diff 对比
- 覆盖 12 个常见英文键名的映射表

**适用场景**:
- LLM 节点直接输出 JSON 结构化数据
- 长文本输出（completion_tokens > 3000）
- 使用 Qwen-plus 等中文模型的场景
- 下游代码节点需要解析 JSON 的工作流

**参考文档**: `references/json-structure-troubleshooting.md`

---

### 5. Thinking 模型输出污染（Qwen3 + enable_thinking）
**目录**: `thinking-model-pollution/`  
**问题类型**: Thinking/Reasoning 模型输出污染  
**症状**: 
- LLM 节点 succeeded，下游代码节点 `JSON.parse` 报错
- 错误信息：`SyntaxError: Unexpected end of JSON input`
- Loop 中某次迭代失败（其他迭代正常）
- LLM 输出包含 `<think>` 标签，但 `</think>` 后无内容
**关键词**: enable_thinking, thinking, reasoning, <think>, JSON.parse, Unexpected end of JSON, Qwen3, DeepSeek, 循环迭代失败, 代码节点报错  
**诊断方法**: 
- 4种空输出类型检测法（A/B/C/D）
- 模型特定限制检查（Qwen3/DeepSeek 兼容性矩阵）
- API 级精准定位（workflow-runs/node-executions）
- 区分"Token耗尽"与"Think标签污染"  
**复杂度**: ⭐⭐⭐⭐  
**特色**: 
- 基于真实排查案例（数据整和→数据整和处理链路）
- 揭示 Qwen3 enable_thinking=False + Structured Output 不兼容的底层原因
- 提供调试节点方案（保留报错能力）和生产环境方案（自动清理）
- 覆盖模型特定限制库（Qwen3/DeepSeek 已知问题）

**适用场景**:
- 使用 Qwen3/DeepSeek 等 thinking 模型的 Dify 工作流
- LLM 节点 succeeded 但下游代码节点 JSON 解析失败
- Loop/迭代节点中偶发性失败
- 需要理解 thinking 模型与结构化输出的兼容性限制

**参考文档**: `references/thinking-model-troubleshooting.md`
**相关 Issue**: SGLang #9282, Dify #2495, Dify #22377, Dify #24118, Dify #25492, Dify #34010

---

## 按问题类型索引

| 问题类型 | 相关案例 | 诊断方法 |
|---------|---------|---------|
| **Agent 不调用工具** | agent-empty-data-processing | 6层诊断法 |
| **Agent 输出解析失败** | react-output-parsing-failure | 多级降级提取策略 |
| **提示词逻辑缺陷** | prompt-iteration-boundary-analysis | 数据状态分类法 + 验证四问 |
| **数据转换异常** | prompt-iteration-boundary-analysis | 条件化输出设计模式 |
| **输出格式错误** | prompt-iteration-boundary-analysis, react-output-parsing-failure | S.V.E.R.调试流程, 正则提取 |
| **负数/异常计算** | prompt-iteration-boundary-analysis | 数据状态三层分类 |
| **空值处理问题** | prompt-iteration-boundary-analysis | 条件化拼接模式 |
| **JSON 解析崩溃** | react-output-parsing-failure | 多级降级提取 + try-catch |
| **JSON 键名漂移** | json-key-name-drift | 4维漂移检测 + 键名映射 |
| **中英文混用** | json-key-name-drift | 语言漂移检测 + Prompt约束 |
| **分号/括号错误** | json-key-name-drift | 正则修复 + 尝试-验证模式 |
| **长输出格式错乱** | json-key-name-drift | Token阈值监控 + 输出拆分 |
| **Thinking 模型污染** | thinking-model-pollution | 4种空输出检测 + 模型限制检查 |
| **Think 标签后空输出** | thinking-model-pollution | 类型 B 检测 + Prompt 约束 |
| **JSON 在 think 内** | thinking-model-pollution | 类型 D 检测 + reasoning_format |
| **模型兼容性问题** | thinking-model-pollution | 模型限制库匹配 |

---

## 按诊断方法索引

### 数据状态三层分类法
- **定义**: 区分无数据(L1)、空数据(L2)、部分数据(L3)、完整数据(L4)
- **适用案例**: prompt-iteration-boundary-analysis
- **典型症状**: 负数输出、无意义前缀、数据丢失
- **参考文档**: `references/diagnostic-framework.md`

### 提示词逻辑验证四问
- **Q1**: 边界覆盖（空值/最小/最大/异常）
- **Q2**: 条件完备（if/else覆盖）
- **Q3**: 一致性（规则与示例）
- **Q4**: 可验证（测试用例）
- **适用案例**: prompt-iteration-boundary-analysis
- **参考文档**: `references/diagnostic-framework.md`

### S.V.E.R.调试流程
- **S**: Step Run（单步执行定位）
- **V**: Variable Inspection（变量检查）
- **E**: Execution History（历史对比）
- **R**: Root Cause Analysis（根因分析）
- **适用案例**: prompt-iteration-boundary-analysis
- **参考文档**: `references/diagnostic-framework.md`

### 6层诊断法
- **L1**: 配置层
- **L2**: 绑定层
- **L3**: 参数层
- **L4**: 提示词层
- **L5**: 模型层
- **L6**: 架构层
- **适用案例**: agent-empty-data-processing
- **参考文档**: `references/agent-tool-troubleshooting.md`

### 4维漂移检测法
- **语言漂移**: 检测中英文键名混用（中文键名率 < 80% 告警）
- **语义漂移**: 检测模型偏好键名（status/result/data 等）
- **缩写漂移**: 检测自发简化键名（entity_name → ent_name）
- **层级漂移**: 检测嵌套层级异常（扁平化或重复嵌套）
- **适用案例**: json-key-name-drift
- **参考文档**: `references/json-structure-troubleshooting.md`

### 4种空输出类型检测法
- **类型 A**: 完全空输出（模型什么都没返回）
- **类型 B**: Think 标签后空输出（有 `<think>` 但 `</think>` 后为空）→ 最常见
- **类型 C**: JSON 被截断（有开头无结尾）
- **类型 D**: JSON 被包裹在 think 标签内部
- **适用案例**: thinking-model-pollution
- **参考文档**: `references/thinking-model-troubleshooting.md`

---

## 快速导航

**我是新手，从哪开始？**
→ 阅读 `prompt-iteration-boundary-analysis/analysis.md` 了解完整诊断流程

**遇到Agent不调用工具？**
→ 查看 `agent-empty-data-processing/`  
→ 阅读 `references/agent-tool-troubleshooting.md`

**遇到Agent输出解析失败（JSON.parse崩溃）？**
→ 查看 `react-output-parsing-failure/`  
→ 阅读 `references/agent-tool-troubleshooting.md` 中的输出解析章节

**遇到数据转换/输出格式问题？**
→ 查看 `prompt-iteration-boundary-analysis/`  
→ 使用 `references/report-templates.md` 中的"模板D：提示词边界情况诊断报告"

**遇到 JSON 键名漂移（中英文混用）？**
→ 查看 `json-key-name-drift/`  
→ 阅读 `references/json-structure-troubleshooting.md`

**遇到 JSON 格式错误（分号/括号/截断）？**
→ 查看 `json-key-name-drift/solution.md` 中的兜底代码  
→ 阅读 `references/json-structure-troubleshooting.md` 中的修复策略分级

**遇到 Thinking 模型输出污染（LLM 输出 think 标签导致下游报错）？**
→ 查看 `thinking-model-pollution/`  
→ 阅读 `references/thinking-model-troubleshooting.md`

**需要通用诊断方法？**
→ 阅读 `references/diagnostic-framework.md`  
→ 重点关注"【新增】"章节

---

## 贡献案例

如果你有新的典型案例，请按以下结构提交：

```markdown
### N. 案例名称
**目录**: `case-directory-name/`
**问题类型**: [Agent/提示词/数据/性能/其他]
**症状**: 
- 症状1
- 症状2
**关键词**: keyword1, keyword2, keyword3
**诊断方法**: [使用的方法]
**复杂度**: ⭐(简单) / ⭐⭐(中等) / ⭐⭐⭐(复杂) / ⭐⭐⭐⭐(困难)
**特色**: 本案例的独特价值
**适用场景**: 什么时候参考这个案例
```

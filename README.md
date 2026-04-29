# Dify Log Analyzer Skill

> 系统化诊断 Dify 工作流执行问题，支持基于日志的精确诊断和基于描述的经验诊断。

---

## 快速开始

### 安装

将本仓库克隆到 OpenCode 的 skill 目录：

```bash
# 全局安装（推荐）
git clone https://github.com/your-username/dify-analyzer.git ~/.config/opencode/skills/dify-analyzer

# 或项目级安装
git clone https://github.com/your-username/dify-analyzer.git .opencode/skills/dify-analyzer
```

安装完成后，OpenCode 会自动识别并加载本 skill。

### 使用

直接描述你的 Dify 问题，skill 会自动匹配诊断模式：

```
用户：Agent 工具为什么不调用？
→ 自动进入 Agent 专项诊断

用户：JSON 输出键名中英文混用
→ 自动进入 JSON 结构化输出诊断

用户：帮我修一下这个代码节点
→ 自动进入 Phase 5 代码节点修改流程
```

---

## 功能概述

本 Skill 专注于 **Dify 工作流的诊断与排查**，覆盖从日志采集到修复验证的完整闭环。

### 核心能力

| 能力 | 说明 |
|------|------|
| **多模式诊断** | 5 种诊断模式自动匹配（通用/Agent/JSON/Prompt/Thinking） |
| **量化评分** | Agent 6 层 / JSON 4 维 / Thinking 4 种空输出，均有打分 |
| **日志采集** | 浏览器自动化登录 Dify，提取追踪日志 |
| **代码节点修复** | 假设验证 → 方案勾选 → 兜底保护 → 单节点测试 |
| **能力边界管理** | 自动识别超出能力的需求，提示用户选择 |

### 5 种诊断模式

| 模式 | 触发场景 | 诊断维度 |
|------|---------|---------|
| **通用日志分析** | 日志链接 | 全面扫描所有节点 |
| **Agent 专项** | 工具不调用、function calling 失败 | 6 层诊断（配置/绑定/参数/提示词/模型/架构） |
| **JSON 结构化输出** | 键名漂移、中英文混用 | 4 维漂移检测（语言/语义/缩写/层级） |
| **Prompt 逻辑** | 空值处理、负数输出、规则矛盾 | 逻辑验证四问 |
| **Thinking 模型污染** | enable_thinking、JSON.parse 崩溃 | 4 种空输出类型检测 |

---

## 触发词

### 主要触发词

- `Dify日志`、`分析Dify`、`工作流执行`、`追踪日志`
- `Agent工具不调用`、`enable_thinking`、`function calling失败`
- `数据处理为空`、`工具没触发`、`键名漂移`
- `中英文混用`、`platform_name`、`JSON格式异常`
- `completion_tokens过高`、`提示词逻辑问题`、`空值处理`

### 复合条件触发

| 场景 | 必须同时包含 |
|------|-------------|
| Agent 诊断 | `Dify/Agent` + `工具/调用/enable_thinking` |
| JSON 结构 | `Dify/LLM/JSON` + `键名/格式/漂移` |
| Thinking 污染 | `Dify/LLM/代码节点` + `JSON.parse/报错/think` |

---

## 使用示例

### 典型场景

```
用户：Agent 工具为什么不调用？
→ 进入 Agent 专项诊断
→ 执行 6 层诊断检查清单
→ 输出评分卡 + 修复建议

用户：JSON 输出键名中英文混用
→ 进入 JSON 结构化输出诊断
→ 执行 4 维漂移检测
→ 输出修复策略（L1 Prompt → L2 Schema → L3 代码）

用户：帮我修一下这个代码节点
→ 进入 Phase 5 代码节点修改流程
→ 阶段一：假设验证（症状→直接原因→根因）
→ 阶段二：方案勾选（P0/P1/P1+/P2/P2+）
```

### 能力边界

```
✅ dify-analyzer 可处理：
   - 代码语法错误（JSON.parse 失败、变量未定义）
   - Prompt 逻辑修正（约束条件、输出格式）
   - 参数配置调整（temperature、max_tokens）
   - 代码节点内的文本处理（正则修复）

❌ 超出能力（会提示用户）：
   - 增删改节点、调整节点连接
   - 开发新的自定义工具或插件
   - 从零重建工作流架构
```

---

## 文件结构

```
dify-analyzer/
├── SKILL.md                              # 主文档（流程 + 原则 + 检查点）
├── README.md                             # 本文件（功能概述 + 快速入门）
├── CHANGELOG.md                          # 版本变更历史
├── references/
│   ├── agent-tool-troubleshooting.md     # Agent 专项诊断手册
│   ├── json-structure-troubleshooting.md # JSON 结构化输出诊断手册
│   │                                     # 4维漂移检测法（语言/语义/缩写/层级）
│   │                                     # 键名漂移修复策略（L1 Prompt / L2 Schema / L3 代码）
│   │                                     # 模型特性库（Qwen/GPT/Claude 键名行为差异）
│   │                                     # 兜底代码模板（normalizeKeys / 分号修复 / 括号修复）
│   ├── diagnostic-framework.md           # 通用诊断方法论
│   │                                     # 数据状态三层分类法
│   │                                     # 条件化输出设计模式
│   │                                     # 提示词逻辑验证四问
│   │                                     # S.V.E.R.调试流程
│   │                                     # 渐进式输出原则（L1-L3）
│   ├── thinking-model-troubleshooting.md # Thinking 模型输出污染诊断手册
│   │                                     # 4种空输出类型检测法
│   │                                     # 模型特定限制库（Qwen3/DeepSeek）
│   │                                     # 调试技巧与 API 排查工具链
│   ├── report-templates.md               # 诊断报告模板
│   ├── code-node-error-patterns.md       # 代码节点故障模式库
│   │                                     # 14种常见错误模式（症状/根因/修复）
│   │                                     # 按症状快速定位流程
│   │                                     # 修复策略选择指南
│   ├── nodejs-env-check.md               # Node.js 环境可用性检查
│   │                                     # 5层检测逻辑（L1-L5）
│   │                                     # 版本管理器识别（nvm/n/fnm/Volta）
│   │                                     # 诊断报告生成
│   └── usage-examples.md                 # 使用示例（10个场景）
│                                           # 通用日志分析、Agent专项、JSON漂移
│                                           # Thinking污染、根因区分等
│                                           # 模板D：提示词边界情况诊断
│                                           # 模板E：JSON 结构化输出诊断报告
│                                           # 模板F：Thinking 模型输出污染诊断报告
├── scripts/                                # 实用脚本工具（Dify 代码节点用）
│   ├── think-tag-cleaner.js                # Think 标签清理代码（2种方案：基础/调试）
│   │                                       # ⚠️ 纯文本处理，无网络访问，低风险
│   │                                       # 用途：清理 Qwen3/DeepSeek think 标签污染
│   │                                       # 方案1: 基础清理（生产环境，失败返回 error 不 throw）
│   │                                       # 方案2: 调试版（开发环境，返回 4 种空输出类型诊断）
│   └── json-repair-snippets.js             # JSON 修复代码片段（6种修复+组合函数）
│                                             # ⚠️ 纯文本处理，无网络访问，低风险
│                                             # 用途：修复常见 JSON 格式异常（分号/逗号/单引号等）
│                                             # 支持 safeMode（只做清理不做正则修复）
│                                             # 支持自定义键名映射表（参数化，不硬编码）
├── examples/
│   ├── README.md                         # 案例索引与导航
│   ├── agent-empty-data-processing/      # 案例1：Agent空数据处理
│   │   ├── analysis.md
│   │   └── solution.md
│   ├── prompt-iteration-boundary-analysis/  # 案例2：提示词迭代边界处理
│   │   ├── analysis.md                   # 完整诊断过程（含3轮迭代分析）
│   │   └── solution.md                   # 修复方案（数据状态分类+条件化输出）
│   ├── react-output-parsing-failure/     # 案例3：ReAct输出解析失败
│   │   ├── analysis.md                   # 完整诊断（含8种输出变异格式分析）
│   │   └── solution.md                   # 修复方案（多级降级提取策略+兜底代码）
│   ├── json-key-name-drift/              # 案例4：JSON键名漂移
│   │   ├── analysis.md                   # 完整诊断（含4维漂移检测过程）
│   │   ├── solution.md                   # 修复方案（Prompt约束+兜底代码）
│   │   └── before-after.md               # 修改前后对比（diff风格）
│   └── thinking-model-pollution/         # 案例5：Thinking 模型污染
└── test-prompts.json                     # 达尔文评估用测试 Prompt
```

### Scripts 安全使用指南

> 基于 OpenAI/Microsoft/Anthropic Skill 安全最佳实践，本 skill 的 scripts 遵循以下原则：

**✅ 保留的脚本（低风险）**

| 脚本 | 风险等级 | 理由 |
|------|---------|------|
| `think-tag-cleaner.js` | 🟢 低 | 纯文本处理，无网络访问，无外部依赖 |
| `json-repair-snippets.js` | 🟢 低 | 纯文本处理，支持 safeMode，参数化配置 |

**🔒 使用原则**

1. **生产环境**：启用 `safeMode=true`，只做清理不做正则修复
2. **测试验证**：任何修复脚本先在测试工作流验证后再用于生产
3. **失败处理**：脚本返回 `error` 字段而非抛出异常，避免工作流中断
4. **不隐藏逻辑**：核心诊断逻辑保留在 SKILL.md 中，scripts 只做机械性处理

---

## 与其他 Skill 的关系

```
Dify 生态 Skill 协作：

诊断          建设
  │            │
  ▼            ▼
dify-analyzer  dify-workflow-writer（修改 DSL）
     │         dify-workflow-builder（生成 DSL）
     │         dify-tool-developer（开发插件）
     │
     └── 诊断完成后：
         - 能力范围内 → 直接修复
         - 超出能力 → 提示用户调用其他 Skill（/skill-name）
```

---

## 核心原则

1. **诚实原则**：有证据才下结论，绝不瞎编
2. **分层诊断**：配置层 → 绑定层 → 参数层 → 提示词层 → 模型层 → 架构层
3. **苏格拉底式排查**：不直接说根因，先呈现假设树请用户验证
4. **渐进式输出**：P1(修改点清单) → P2(完整配置需确认) → P3(破坏性变更拒绝)
5. **兜底逻辑保护**：严禁删除 catch/else/endsWith 等防御性代码

---

## 版本

- **当前版本**：v3.0
- **变更历史**：[CHANGELOG.md](CHANGELOG.md)

## 优化记录

本 skill 使用 [darwin-skill](https://github.com/your-username/darwin-skill) 进行系统性评估和优化。详细记录见 `.darwin/RESULT_CARD.md`。

> **诚实边界**：本 skill 基于 Dify v1.x 和 Qwen3 系列的行为特征设计。如使用新版本，部分诊断建议可能需调整。始终优先参考最新官方文档。
>
> **能力边界**：数据状态分类法和条件化设计模式经过实际案例验证，但具体阈值和判断逻辑需根据业务场景调整。建议结合实际数据测试后再应用。

---

## 贡献

如有新的典型案例，欢迎提交到 `examples/` 目录。

案例提交格式见：`examples/README.md` → "贡献案例" 章节。

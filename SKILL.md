---
name: dify-analyzer
description: |
  系统化诊断 Dify 工作流问题，支持基于日志的精确诊断和基于描述的经验诊断。
  覆盖 Agent 工具调用、JSON 结构化输出一致性、Prompt 逻辑一致性、数据转换等多类问题。
  触发词：Dify日志、分析Dify、工作流执行、追踪日志、Agent工具不调用、enable_thinking、
  function calling失败、数据处理为空、工具没触发、键名漂移、中英文混用、platform_name、
  JSON格式异常、completion_tokens过高、提示词逻辑问题、空值处理、规则矛盾
---

# Dify Log Analyzer

---

## 核心原则

### 1. 诚实原则
- ✅ 有证据才下结论
- ⚠️ 读取不完整时明确说明
- ❌ 绝不瞎编、绝不推测

### 2. 分层诊断
从外到内逐层排查：配置层 → 绑定层 → 参数层 → 提示词层 → 模型层 → 架构层

### 3. 止损机制
```yaml
最大尝试次数: 3次
操作间隔: ≥2秒
单次会话超时: 60秒
连续失败停止: 是
```

### 4. 配置隔离与渐进式输出（P1/P2/P3 级别）
- **P1 - 默认行为（强制）**：仅输出修改点清单（diff 风格），不输出完整 Prompt/配置/代码块
- **P2 - 用户明确要求后（可选）**：用户确认后才输出完整配置，且必须前置风险告警
- **P3 - 破坏性变更识别（强制）**：当用户要求"固定化动态字段""删除条件分支""合并差异化逻辑"时，拒绝直接执行，输出风险告警 + 替代方案
- **禁止行为**：严禁未经用户确认直接输出完整的 Dify Prompt JSON、工作流配置或代码块让用户复制替换

### 5. 苏格拉底式排查原则
- ❌ 不直接说"根因是 X"
- ✅ 先呈现假设树（症状层 → 直接原因层 → 根因层），请用户逐层验证
- ✅ 用户确认"对"之后才进入方案勾选；用户说"不对"则提供诊断性问题继续深挖
- ✅ 每次深挖后回到假设树，修正后重新请用户验证

### 6. 修改前备份原则
- **修改任何代码/Prompt/配置前**：提醒用户先"发布版本"（Dify 版本控制），改坏了能一键回滚
- **优先使用单节点测试**：修改后只测该节点，不用跑完整工作流
- **利用 Last run 记录**：查看节点实际输入输出，快速复现问题

### 7. 兜底逻辑保护原则
- **严禁删除**：catch 块、else 分支、endsWith 检查、try-catch 嵌套等防御性代码
- **判断标准**："我没看到它触发" ≠ "它没用"
- **正确做法**：保留所有兜底逻辑，只在旁边追加新处理

### 8. 检查点（Iteration Gate）原则
每个关键步骤后必须暂停，等用户确认后再继续：
```
读完代码 → "我理解对吗？"
找到假设 → "这个方向对吗？"
深挖后 → "还要继续吗？"
给方案前 → "准备开始修复，确认吗？"
修复后 → "测试通过了吗？"
```

---

## Phase 0: 前置检查与分流

### 检查点 1: 输入确认

**系统内部检查：**
```javascript
const checks = {
  hasUrl: extractUrl(userInput) !== null,
  hasContext: extractProblemDescription(userInput) !== null,
  hasNodeDescription: extractNodeType(userInput) !== null,
  hasModelInfo: extractModelInfo(userInput) !== null,
  hasPromptSnippet: extractPromptSnippet(userInput) !== null,
  hasErrorPattern: extractErrorPattern(userInput) !== null
};
```

**输入类型判断：**
```javascript
const inputType = {
  A_logUrl: checks.hasUrl,                                    // 日志链接（精确诊断）
  B_nodeDescription: checks.hasNodeDescription,               // 节点描述+症状（经验诊断）
  C_modelSymptom: checks.hasModelInfo,                        // 模型+症状（特性诊断）
  D_promptSnippet: checks.hasPromptSnippet,                   // Prompt片段（逻辑诊断）
  E_errorPattern: checks.hasErrorPattern,                     // 报错信息（模式匹配）
  F_construction: checkConstructionNeed(userInput)            // 建设性需求（新增，早期拦截）
};

// 建设性需求早期拦截
function checkConstructionNeed(input) {
  const lower = input.toLowerCase();
  const constructionKeywords = [
    '创建', '新建', '添加', '删除', '移除', '重建', '重写',
    'create', 'add', 'delete', 'remove', 'rebuild', 'rewrite',
    '帮我做一个', '帮我写个', '给我建个'
  ];
  return constructionKeywords.some(kw => lower.includes(kw));
}

// 注意：当用户同时提供多种输入时，按优先级 A > E > B > C > D 处理
// A（日志链接）优先级最高，因为精确诊断最可靠
// F（建设性需求）优先级最低，但会在早期单独拦截提示
```

**如果只有 URL（原有流程）：**
```
✅ 收到日志链接，执行精确诊断模式

- 目标链接：{{url}}
- 预计时间：60-90秒

开始分析？ [开始] [切换手动模式]
```

**如果缺少 URL 但有其他信息（新增降级诊断）：**
```
📋 无日志链接诊断模式

⚠️ 限制说明：缺少日志链接，以下诊断基于通用经验规则，可能存在偏差。
   建议提供日志链接以获得精确诊断（Token消耗、真实输入输出、节点耗时）。

当前可诊断范围：
✅ 模型特性问题（基于公开已知行为）
✅ Prompt 逻辑矛盾（基于您提供的片段）
✅ 常见错误模式匹配
❌ 实际执行数据（需日志支持）

请选择：
[提供日志链接进行精确诊断] [继续基于描述诊断] [上传Prompt片段]
```

### 检查点 1.5: Node.js 环境可用性检查

在执行自动化操作前，检查底层工具（如 skill 加载器、浏览器自动化等）依赖的 Node.js 环境是否正常。

> ⚠️ **强制要求**：Playwright MCP 需要 **Node.js >= 18**，低于此版本将阻断自动化流程（非手动模式）。
> 
> 完整检测逻辑（含 5 层检测、版本管理器识别、诊断报告生成）见：
> **`references/nodejs-env-check.md`**

**覆盖范围：**
- 版本管理器：nvm / nvm-windows / n / fnm / Volta
- 平台差异：Windows / macOS / Linux
- 项目声明：.nvmrc / .node-version / package.json engines.node

**版本要求：**
```javascript
const MIN_NODE_VERSION = 18;

// L1 检测逻辑（节选）
const major = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
if (major >= MIN_NODE_VERSION) {
  result.nodeAvailable = true;
} else {
  result.errors.push({
    level: 'L1',
    msg: `Node.js 版本过低：${nodeVersion}（需要 >= ${MIN_NODE_VERSION}）`,
    detail: 'Playwright MCP 要求 Node.js 18 或更高版本'
  });
}
```

**触发条件：**
```javascript
const envCheck = checkNodeEnvironment();
if (!envCheck.nodeAvailable || isToolUnavailable()) {
  const report = generateEnvReport(envCheck);
  
  // 版本过低时强制阻断（非手动模式）
  const versionError = envCheck.errors.find(e => e.msg.includes('版本过低'));
  if (versionError && !isManualMode) {
    return { 
      type: 'nodejs_env_error', 
      report,
      blocking: true,  // 阻断后续自动化流程
      suggestion: '请升级 Node.js 到 18+，或切换到手动模式（复制日志内容分析）'
    };
  }
  
  return { type: 'nodejs_env_error', report };
}
```

### 检查点 1.6: Dify 原生工具检查

**排查任何代码节点问题前，优先使用 Dify 原生工具：**

| 工具 | 用途 | 操作路径 |
|------|------|---------|
| **单节点测试** | 只测问题节点，不用跑完整工作流 | 点击节点 → 点"运行" |
| **Last run 记录** | 查看节点实际输入/输出/报错 | 点击节点上的"上次运行" |
| **逐步执行** | 一步步运行，看数据流向 | 工作流编辑器的"逐步执行"按钮 |
| **节点重跑** | 从该节点重新运行，不用从头 | 追踪视图 → "从该节点重新运行" |
| **版本发布** | 修改前备份，改坏了能恢复 | 右上角"发布"按钮 |
| **版本恢复** | 回滚到之前版本 | 版本历史 → 恢复 |
| **版本对比** | 看节点级变更差异 | 版本历史 → 对比 |

**如果用户要修改代码/Prompt/配置：**
```
⚠️ 修改前提醒

建议操作：
1. 先"发布"当前版本（免费备份）
2. 用"单节点测试"复现问题
3. 修改后再次"单节点测试"验证
4. 确认没问题后再发布新版本

需要我指导如何使用这些工具吗？
[已发布，继续] [不用发布，直接改] [教我单节点测试]
```

### 检查点 1.7: 修改前备份提醒

**如果用户要求修改代码节点、Prompt 或工作流配置：**

```
📋 修改前检查清单

□ 是否已发布当前版本？（改坏了可恢复）
□ 是否已用单节点测试复现问题？
□ 是否知道修改后如何验证？

修改范围确认：
- 只修明确报错的位置？
- 还是可以顺带优化其他逻辑？
- 是否有不能动的兜底逻辑需要保留？

请确认后我继续。
```

### 检查点 2: 配置文件确认

**检查 `.opencode/dify_analyzer.yaml`：**
```yaml
必须包含：
  dify:
    base_url: "https://your-dify-instance.com/"
    account: "你的邮箱"
    password: "YOUR_PASSWORD"
```

**如果配置缺失：**
```
⚠️ 配置文件不完整

当前状态：
- base_url: {{status}}
- account: {{status}}
- password: {{status}}

📋 解决方案：
方案1：创建配置文件（推荐）
方案2：手动登录Dify后复制日志内容给我

请选择方案1或方案2？
```

### 检查点 3: 分析模式确认

**模式判断：**
```javascript
const analysisMode = {
  type: determineAnalysisType(userInput),
  targetNode: extractTargetNode(userInput),
  expectedIssues: extractExpectedIssues(userInput)
};

function determineAnalysisType(input) {
  const lower = input.toLowerCase();
  
  // Agent 专项
  const agentKeywords = [
    'agent', '工具', '调用', 'function calling',
    'enable_thinking', '数据处理为空', '没进工具',
    'tool', 'calling', 'not triggered'
  ];
  if (agentKeywords.some(kw => lower.includes(kw))) return 'agent_specialist';
  
  // JSON 结构化输出诊断
  const jsonDriftKeywords = [
    '键名漂移', '中英文混用', 'platform_name', 'entity_name',
    'indicator_comparison_details', '字段名不一致', '长输出格式错乱',
    'json 键名', 'json 格式', '输出格式异常', 'completion_tokens'
  ];
  if (jsonDriftKeywords.some(kw => lower.includes(kw))) return 'json_structure_specialist';
  
  // Prompt 逻辑诊断
  const promptLogicKeywords = [
    '提示词逻辑', '空值处理', '负数输出', '边界情况',
    '规则矛盾', '示例不一致', '条件分支', '多项目场景'
  ];
  if (promptLogicKeywords.some(kw => lower.includes(kw))) return 'prompt_logic_specialist';
  
  // Thinking 模型输出污染诊断
  const thinkingPollutionKeywords = [
    'enable_thinking', 'thinking', 'reasoning', 'think tag', '<think>', '</think>',
    'json.parse', 'unexpected end of json', 'syntaxerror', '思考模式',
    '思考过程', '推理过程', '循环迭代失败', 'loop 失败'
  ];
  if (thinkingPollutionKeywords.some(kw => lower.includes(kw))) return 'thinking_pollution_specialist';
  
  return 'general';
}
```

**模式 A: 通用日志分析**
```
✅ 分析模式：通用日志分析

- 目标链接：{{url}}
- 问题描述：未提供（全面扫描所有节点）
- 预计时间：60-90秒

💡 如果发现 Agent 相关问题，会自动切换为专项诊断。

开始分析？ [开始] [切换手动模式]
```

**模式 B: Agent 专项诊断**
```
✅ 分析模式：Agent 工具调用专项诊断

- 目标链接：{{url}}
- 问题位置：{{targetNode || 'Agent节点（自动检测）'}}
- 诊断框架：6层检查清单
- 预计时间：2-3分钟

📚 将引用：references/agent-tool-troubleshooting.md

开始分析？ [开始] [切换通用模式]
```

**模式 C: JSON 结构化输出诊断**
```
✅ 分析模式：JSON 结构化输出一致性诊断

- 目标链接：{{url || '无（基于描述诊断）'}}
- 诊断维度：语言漂移 / 语义漂移 / 缩写漂移 / 层级漂移
- 诊断框架：4维检查清单
- 预计时间：2-3分钟

📚 将引用：references/json-structure-troubleshooting.md

开始分析？ [开始] [切换通用模式]
```

**模式 D: Prompt 逻辑诊断**
```
✅ 分析模式：Prompt 逻辑一致性诊断

- 目标链接：{{url || '无（基于片段诊断）'}}
- 诊断框架：提示词逻辑验证四问（Q1-Q4）
- 预计时间：1-2分钟

📚 将引用：references/diagnostic-framework.md

开始分析？ [开始] [切换通用模式]
```

**模式 E: Thinking 模型输出污染诊断**
```
✅ 分析模式：Thinking/Reasoning 模型输出污染诊断

- 目标链接：{{url || '无（基于描述诊断）'}}
- 诊断维度：空输出类型 / Think 标签污染 / 模型特定限制
- 诊断框架：4 种空输出分类 + 模型兼容性检查
- 预计时间：2-3分钟

📚 将引用：references/thinking-model-troubleshooting.md

开始分析？ [开始] [切换通用模式]
```

**模式 F: 建设性需求早期拦截**

> 当用户输入包含"创建/新建/添加/删除/重建"等建设性关键词时触发。
> 这是 **Phase 0 的早期拦截**，在正式诊断前确认用户意图。

```
⚠️ 检测到建设性需求

你的输入包含建设性关键词（如"创建"、"添加"、"删除"等）。

📋 dify-analyzer 的定位：
   ✅ 诊断已有工作流的问题
   ❌ 创建新节点 / 删除节点 / 重建工作流

请选择：

□ A. 我其实是想诊断已有问题（比如"创建了但报错"）
   → 继续诊断流程

□ B. 我确实是建设工作流（新建/删除/重建）
   → dify-analyzer 不适合，建议：
     • 用 /skill-name 显式调用你拥有的建设型 skill（如有）
     • 或手动操作后，用 dify-analyzer 做诊断验证

□ C. 我不确定，先试试诊断
   → dify-analyzer 会继续，但会在 Phase 5 再次确认能力边界

[选 A，继续诊断]  [选 B，暂停]  [选 C，先试试]
```

**处理逻辑：**

```javascript
if (inputType.F_construction) {
  // 早期拦截，但不强制阻断
  showConstructionWarning();
  
  if (userChoice === 'A' || userChoice === 'C') {
    // 用户坚持继续，记录状态，后续 Phase 5 再次确认
    sessionContext.constructionWarningAcknowledged = true;
    gotoPhase('1');  // 继续正常诊断流程
  } else if (userChoice === 'B') {
    // 用户接受建议，暂停
    return {
      status: 'paused',
      message: '已暂停。如需建设型 skill，请用 /skill-name 显式调用。'
    };
  }
}
```

---

## Phase 1: 日志采集

### Step 1: 导航登录
```javascript
await browser_navigate({ url });
await wait(3000);

// 检查是否需要登录
if (needLogin) {
  await fillForm({ account, password });
  await click("登录");
  await wait(3000);
  
  if (!checkLoginSuccess()) {
    return {
      success: false,
      message: "登录失败，请检查账号密码"
    };
  }
}
```

**失败处理：**
- 登录失败 → 切换到手动模式："请手动登录后复制日志内容"

### Step 2: 展开日志详情
```javascript
// 点击最新日志
const rows = await page.locator('table tbody tr').all();
if (rows.length > 0) {
  await rows[0].click();
  await wait(2000);
}

// 切换到追踪视图
await click("追踪");
await wait(2000);
```

**失败处理（最多重试2次）：**
```
尝试 {{attempt}}/2：无法展开日志详情...
等待 2 秒后重试
```

### Step 3: 提取节点列表
```javascript
const nodes = await extractNodeList();
const agentNodes = nodes.filter(n => n.type === 'agent');

return {
  totalNodes: nodes.length,
  agentNodes: agentNodes.length,
  nodeNames: nodes.map(n => n.name)
};
```

---

## 检查点 4: 采集结果确认

```
📊 日志采集完成

执行概览：
- 总节点数：{{totalNodes}}
- Agent节点：{{agentNodes}}
- 执行状态：{{status}}
- 总耗时：{{duration}}s
- Token消耗：{{tokens}}

节点列表：
{{nodeList}}

{{#if agentNodes > 0 && analysisMode === 'general'}}
⚠️ 检测到 Agent 节点。是否切换到 Agent 专项诊断？
[保持通用分析] [切换到Agent诊断]
{{/if}}

{{#if analysisMode === 'agent_specialist'}}
是否深入分析 Agent 节点？
[开始分析] [查看其他节点]
{{/if}}
```

---

## Phase 2: 节点分析

### 2.1 通用节点分析（所有模式）

**对每个节点执行：**
```javascript
const analysis = {
  name: node.name,
  type: node.type,
  duration: node.duration,
  tokens: node.tokens,
  status: node.status,
  issues: []
};

// 检查执行时间异常
if (node.duration > 60) {
  analysis.issues.push({
    type: 'warning',
    message: '执行时间过长（>60s），可能存在性能问题'
  });
}

// 检查错误状态
if (node.status === 'failed') {
  analysis.issues.push({
    type: 'error',
    message: '节点执行失败',
    detail: node.error_message
  });
}

// 检查 Token 异常
if (node.tokens > 20000) {
  analysis.issues.push({
    type: 'warning',
    message: 'Token 消耗过高'
  });
}
```

### 2.2 Agent 专项分析（模式 B 时触发）

**触发条件：**
```javascript
  if (node.type === 'agent' && 
    (node.data_processing === '{}' || 
     node.data_processing === '' ||
     userQuery.includes('工具'))) {
   return analyzeAgentNode(node);
 }
```

**分析流程：**
```
Agent 节点异常检测
    ↓
读取 references/agent-tool-troubleshooting.md
    ↓
执行 6 层诊断检查清单
    ↓
生成量化评分
    ↓
输出专项诊断报告
```

**6 层诊断执行：**
```javascript
const diagnosis = {
  l1_config: checkAgentStrategy(node),      // 15分
  l2_binding: checkToolBinding(node),       // 10分
  l3_params: checkCompletionParams(node),   // 15分
  l4_prompt: checkSystemPrompt(node),       // 10分
  l5_model: checkModelCompatibility(node),  // 20分
  l6_architecture: checkArchitecture(node), // 10分
  test_evidence: checkLogEvidence(node)     // 20分
};

const totalScore = Object.values(diagnosis).reduce((a, b) => a + b, 0);
```

**诊断评分标准：**
- 90-100分：问题明确，解决方案清晰
- 70-89分：问题基本明确，需进一步验证
- 50-69分：问题部分明确，需补充信息
- <50分：信息不足，需手动验证

### 2.3 JSON 结构化输出专项分析（模式 C 时触发）

**触发条件：**
```javascript
if (node.type === 'llm' && 
    (userQuery.includes('键名') || 
     userQuery.includes('json') ||
     userQuery.includes('格式') ||
     node.output?.includes('platform_name') ||
     node.output?.includes('entity_name'))) {
  return analyzeJsonStructureNode(node);
}
```

**4 维漂移检测：**
```javascript
const driftDiagnosis = {
  language_drift: checkLanguageDrift(node),      // 语言漂移（中→英）
  semantic_drift: checkSemanticDrift(node),      // 语义漂移（status→current_state）
  abbreviation_drift: checkAbbreviation(node),   // 缩写漂移（entity_name→sup_name）
  hierarchy_drift: checkHierarchyDrift(node)     // 层级漂移（嵌套错乱）
};

function checkLanguageDrift(node) {
  const outputKeys = extractAllKeys(node.output);
  const chineseKeys = outputKeys.filter(k => /[\u4e00-\u9fff]/.test(k));
  const englishKeys = outputKeys.filter(k => /^[a-zA-Z_]/.test(k));
  
  return {
    score: englishKeys.length > 0 ? 0 : 25,
    issue: englishKeys.length > 0 ? 
      `检测到 ${englishKeys.length} 个英文键名：${englishKeys.join(', ')}` : null,
    evidence: englishKeys
  };
}

function checkSemanticDrift(node) {
  const modelPreferredKeys = ['name', 'status', 'id', 'type', 'result', 'data', 'content'];
  const outputKeys = extractAllKeys(node.output);
  const hits = outputKeys.filter(k => modelPreferredKeys.includes(k.toLowerCase()));
  
  return {
    score: hits.length > 0 ? 0 : 25,
    issue: hits.length > 0 ?
      `检测到模型偏好键名：${hits.join(', ')}（与用户定义 Schema 不符）` : null,
    evidence: hits
  };
}

function checkAbbreviationDrift(node) {
  const outputKeys = extractAllKeys(node.output);
  const shortKeys = outputKeys.filter(k => k.length < 10 && /^[a-zA-Z_]+$/.test(k));
  
  return {
    score: shortKeys.length > 0 ? 10 : 25,
    issue: shortKeys.length > 0 ?
      `检测到疑似缩写键名：${shortKeys.join(', ')}` : null,
    evidence: shortKeys
  };
}

function checkHierarchyDrift(node) {
  const expectedDepth = getExpectedDepth(node.config?.schema);
  const actualDepth = getActualDepth(node.output);
  
  return {
    score: Math.abs(expectedDepth - actualDepth) > 1 ? 5 : 25,
    issue: Math.abs(expectedDepth - actualDepth) > 1 ?
      `嵌套层级异常：预期 ${expectedDepth} 层，实际 ${actualDepth} 层` : null,
    evidence: { expected: expectedDepth, actual: actualDepth }
  };
}

const totalScore = Object.values(driftDiagnosis).reduce((sum, d) => sum + d.score, 0);
```

**诊断信号库：**
```javascript
const driftSignals = {
  // 信号 1：Token 长度预警
  tokenThreshold: node.tokens > 3000,
  
  // 信号 2：键名语言不一致率
  chineseKeyRatio: chineseKeys / totalKeys,
  anomaly: chineseKeyRatio < 0.8 && totalKeys > 10,
  
  // 信号 3：出现模型"偏好键名"
  hitModelPreferred: modelPreferredKeys.some(k => outputKeys.includes(k)),
  
  // 信号 4：同一对象内键名风格不一致
  mixedNaming: hasBothChineseAndEnglishKeys(outputKeys),
  
  // 信号 5：Schema 合规性（如果配置了 JSON Schema）
  schemaMismatch: node.config?.response_format?.type === 'json_schema' ? 
    validateSchema(node.output, node.config.response_format.schema).errors : null
};
```

**修复策略分级：**
```yaml
L1 - Prompt 层（零成本）:
  - 显性约束: "⚠️ JSON所有键名必须使用中文，严禁英文键名"
  - 负面示例: "严禁使用 platform_name、entity_name 等英文键名"
  - 语义描述: 每个字段加 description（模型依赖字段名理解意图）
  - 自检要求: "输出完成后请检查是否存在英文键名"

L2 - Schema 层（依赖 Dify 版本）:
  - 如果 Dify 支持 response_format + json_schema:
    - 配置 strict: true
    - 设置 additionalProperties: false
  - 注意: 浮动指标名无法用 Schema 完全约束

L3 - 代码层（兜底）:
  - normalizeKeys: 参数化映射表（中→英），支持自定义 keyMap
  - 模糊匹配: 编辑距离 < 2 时自动映射
  - 分号修复: 正则替换 /;(?=\s*["}\]])/g → ','
  - 括号修复: 尝试-验证模式处理末尾多余 }
  - safeMode: 生产环境建议启用（只做清理不做正则修复）
```

### 2.4 Thinking 模型输出污染专项分析（模式 E 时触发）

**触发条件：**
```javascript
if ((node.type === 'llm' || node.type === 'code') && 
    (userQuery.includes('think') || 
     userQuery.includes('reasoning') ||
     userQuery.includes('enable_thinking') ||
     userQuery.includes('json.parse') ||
     node.output?.includes('<think>') ||
     node.error?.includes('Unexpected end of JSON'))) {
  return analyzeThinkingPollutionNode(node);
}
```

**4 种空输出类型检测：**
```javascript
const emptyOutputDiagnosis = {
  // 类型 A: 完全空输出（模型什么都没返回）
  completely_empty: {
    check: (text) => !text || text.trim() === '',
    causes: ['模型崩溃', 'API 超时', 'Stream 解析失败', 'max_tokens=0'],
    solution: '检查模型状态、网络连接、max_tokens 配置'
  },
  
  // 类型 B: Think 标签后空输出（有 <think> 但 </think> 后无内容）
  think_then_empty: {
    check: (text) => {
      if (!text || !text.includes('</think>')) return false;
      const afterThink = text.split('</think>').pop();
      return !afterThink || afterThink.trim() === '';
    },
    causes: [
      '模型 thinking 后未生成正式回答',
      'enable_thinking=True + Structured Output 冲突',
      'Qwen3 enable_thinking=False 时 Schema 约束失效',
      'max_tokens 被 thinking 过程耗尽'
    ],
    solution: '保持 enable_thinking=True + Prompt 约束 + 代码清理 think 标签'
  },
  
  // 类型 C: JSON 被截断（有开头无结尾）
  json_truncated: {
    check: (text) => {
      if (!text) return false;
      const trimmed = text.trim();
      return trimmed.startsWith('{') && !trimmed.endsWith('}');
    },
    causes: ['max_tokens 不足', '输出长度超过限制', '模型生成被截断'],
    solution: '增加 max_tokens（建议 ≥ 8192）'
  },
  
  // 类型 D: JSON 被包裹在 think 标签内部
  json_inside_think: {
    check: (text) => {
      if (!text || !text.includes('<think>')) return false;
      const thinkMatch = text.match(/<think>[\s\S]*?<\/think>/);
      if (!thinkMatch) return false;
      return thinkMatch[0].includes('{') && thinkMatch[0].includes('}');
    },
    causes: ['模型把正式回答放进了 thinking 过程', 'reasoning_format=tagged 时解析错误'],
    solution: '使用 reasoning_format=separated 或代码提取 think 标签内的 JSON'
  }
};
```

**快速判断流程（执行示例）：**

```javascript
// Step 1: 获取 LLM 节点原始输出
const llmOutput = node.inputs?.text || node.output || '';

// Step 2: 按优先级检测空输出类型（B 最常见，优先检查）
function diagnoseEmptyOutput(text) {
  // 优先级 1: 类型 B（Think 后空输出）- 最常见
  if (text.includes('</think>')) {
    const afterThink = text.split('</think>').pop();
    if (!afterThink || afterThink.trim() === '') {
      return {
        type: 'B_THINK_THEN_EMPTY',
        confidence: 'high',
        evidence: `</think> 后内容长度: ${afterThink ? afterThink.length : 0}`,
        nextStep: '检查 enable_thinking 配置和 max_tokens'
      };
    }
  }
  
  // 优先级 2: 类型 D（JSON 在 think 内）
  if (text.includes('<think>')) {
    const thinkMatch = text.match(/<think>[\s\S]*?<\/think>/);
    if (thinkMatch && thinkMatch[0].includes('{')) {
      return {
        type: 'D_JSON_INSIDE_THINK',
        confidence: 'high',
        evidence: 'think 标签内包含 JSON 字符',
        nextStep: '使用 reasoning_format=separated 或提取 think 内 JSON'
      };
    }
  }
  
  // 优先级 3: 类型 C（JSON 截断）
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
    return {
      type: 'C_JSON_TRUNCATED',
      confidence: 'high',
      evidence: `开头: "{" 结尾: "${trimmed.slice(-10)}"`,
      nextStep: '增加 max_tokens'
    };
  }
  
  // 优先级 4: 类型 A（完全空输出）
  if (!text || text.trim() === '') {
    return {
      type: 'A_COMPLETELY_EMPTY',
      confidence: 'high',
      evidence: '输出为空字符串或 null',
      nextStep: '检查模型状态和 API 连接'
    };
  }
  
  return {
    type: 'UNKNOWN',
    confidence: 'low',
    evidence: `输出长度: ${text.length}, 包含 think: ${text.includes('<think>')}`,
    nextStep: '人工检查原始输出'
  };
}

// Step 3: 执行诊断
const result = diagnoseEmptyOutput(llmOutput);

// Step 4: 根据类型输出诊断报告
console.log(`空输出类型: ${result.type}`);
console.log(`置信度: ${result.confidence}`);
console.log(`证据: ${result.evidence}`);
console.log(`下一步: ${result.nextStep}`);
```

**模型特定限制检查：**
```javascript
const modelLimitations = {
  'qwen3': {
    'enable_thinking=False + Structured Output': '❌ 不兼容（SGLang Grammar Backend 依赖 <think> 触发约束解码）',
    'enable_thinking=False 后仍然输出 thinking': '⚠️ 插件 0.0.28-0.0.31 已知回归',
    'vLLM --reasoning-parser qwen3': '⚠️ reasoning 字段不被 Dify 解析，建议使用原生 <think> 标签',
    '推荐方案': 'enable_thinking=True + Prompt 约束 + 代码清理 think 标签'
  },
  'deepseek-r1': {
    'Agent 模式': '⚠️ thinking 过程嵌套，timer 不停止',
    'function calling': '⚠️ V3.2 需要 reasoning_content 字段',
    '推荐方案': '避免在 Agent 节点使用，或升级 Dify 版本'
  },
  'deepseek-v3': {
    'enable_thinking=True': '⚠️ 可能只返回 reasoning_content，final content 为空',
    '推荐方案': '检查 max_tokens 是否充足（thinking + 正式回答共享配额）'
  }
};
```

**诊断评分标准：**
```javascript
const thinkingDiagnosisScore = {
  empty_type_identification: 25,    // 正确识别空输出类型
  model_limitation_check: 25,       // 检查模型特定限制
  root_cause_analysis: 25,          // 根因分析准确性
  solution_feasibility: 25          // 方案可行性
};
```

---

## 检查点 5: 诊断结果确认

**通用分析结果：**
```
📊 节点分析完成

问题汇总：
{{#each issues}}
- [{{type}}] {{message}}
{{/each}}

是否生成完整报告？
[生成报告] [深入某个节点]
```

**Agent 专项诊断结果：**
```
🎯 Agent 诊断完成

诊断得分：{{score}}/100

6层诊断结果：
┌──────────┬───────┬────────┐
│ 层级     │ 得分  │ 状态   │
├──────────┼───────┼────────┤
│ L1 配置层 │ {{l1}}/15 │ {{l1_status}} │
│ L2 绑定层 │ {{l2}}/10 │ {{l2_status}} │
│ L3 参数层 │ {{l3}}/15 │ {{l3_status}} │  ← 重点关注
│ L4 提示词层│ {{l4}}/10 │ {{l4_status}} │
│ L5 模型层 │ {{l5}}/20 │ {{l5_status}} │  ← 重点关注
│ L6 架构层 │ {{l6}}/10 │ {{l6_status}} │
│ 实测层   │ {{test}}/20 │ {{test_status}} │
└──────────┴───────┴────────┘

主要问题：{{primary_issue}}
建议优先尝试：{{top_solution}}

是否查看详细解决方案？
[查看方案] [导出诊断报告]
```

**JSON 结构化输出诊断结果：**
```
🎯 JSON 结构化输出诊断完成

诊断得分：{{score}}/100

4维漂移检测结果：
┌────────────┬───────┬────────┐
│ 维度       │ 得分  │ 状态   │
├────────────┼───────┼────────┤
│ 语言漂移   │ {{lang}}/25 │ {{lang_status}} │  ← 中→英切换
│ 语义漂移   │ {{sem}}/25 │ {{sem_status}} │  ← status→current_state
│ 缩写漂移   │ {{abbr}}/25 │ {{abbr_status}} │  ← 自发简化
│ 层级漂移   │ {{hier}}/25 │ {{hier_status}} │  ← 嵌套错乱
└────────────┴───────┴────────┘

诊断信号：
- Token 长度：{{tokens}} {{#if tokens > 3000}}⚠️ 超过阈值{{/if}}
- 键名中文率：{{chineseRatio}}% {{#if chineseRatio < 80}}⚠️ 异常{{/if}}
- 模型偏好键名命中：{{modelPreferredHits}}

主要问题：{{primary_issue}}
建议优先尝试：{{top_solution}}

修复策略：
L1 Prompt 层：{{l1_fix}}
L2 Schema 层：{{l2_fix}}
L3 代码层：{{l3_fix}}

是否查看详细解决方案？
[查看方案] [导出诊断报告]
```

---

## Phase 3: 报告生成

### 报告模板选择

```javascript
const score = calculateDiagnosisScore();

if (score >= 90) {
  return generateFullReport();           // 完整诊断
} else if (score >= 70) {
  return generateReportWithSuggestions(); // 诊断+建议
} else if (score >= 50) {
  return generatePartialReport();         // 部分诊断
} else {
  return generateManualReport();          // 需手动验证
}
```

### Agent 专项诊断报告模板

```markdown
## Agent 工具调用故障诊断报告 🎯

### 诊断摘要
- **Agent 节点**: {{node_name}}
- **策略**: {{agent_strategy}}
- **模型**: {{model}}
- **诊断得分**: {{score}}/100
- **问题等级**: {{severity}}

### 6层诊断结果
{{diagnosis_table}}

### 主要问题
{{primary_issue}}

### 解决方案（按优先级）

#### P0: 立即尝试（5分钟）
{{p0_solution}}

#### P1: 提示词优化（10分钟）
{{p1_solution}}

#### P2: 架构调整（30分钟+）
{{p2_solution}}

### 验证方法
{{verification_method}}

### 参考文档
- 诊断手册: references/agent-tool-troubleshooting.md
- 相关 Issue: {{related_issues}}

---

```

---

## Phase 4: 质量验证（可选）

### 4.1 诊断准确性自检
- [ ] 诊断结论是否有日志证据支持？
- [ ] 建议是否可操作？
- [ ] 评分是否合理？

### 4.2 完整性检查
- [ ] 通用分析是否覆盖所有节点？
- [ ] Agent 诊断是否覆盖 6 个层级？
- [ ] 是否提供了验证方法？

### 通过标准
- **Agent 专项**：总分 ≥ 70 分，实测层 ≥ 15 分（必须有证据）
- **JSON 结构化输出**：总分 ≥ 70 分，语言漂移 + 语义漂移 ≥ 35 分
- **Thinking 污染诊断**：总分 ≥ 70 分，空输出类型识别正确
- **通用分析**：所有节点已扫描，关键问题已识别
- **建议可操作性**：所有建议均可直接执行或明确需要补充的信息

---

## Phase 5: 代码节点修改专项流程

> 当用户要求修改代码节点（修复 bug 或优化逻辑）时触发。
> 本流程遵循"先验证假设，再给方案"的两阶段原则。

### 5.1 阶段一：探索（假设验证）

**Step 1: 读取并理解代码**
```
[检查点 1] 我已读完代码，当前理解：
- 代码功能：_______________
- 输入来源：_______________
- 处理逻辑：_______________
- 输出格式：_______________

请确认我的理解是否正确？
[正确，继续] [有偏差，请指出]
```

**Step 2: 构建假设树**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 阶段一：假设验证（我不一定找对了）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

我目前的三层假设：

├─ 📍 症状层（我观察到的）
│   └─ 报错信息 / 异常现象：_______________
│   [ ] 正确  [ ] 不对  [ ] 不确定

├─ 🔧 直接原因层（我推断的）
│   └─ 触发问题的代码位置：_______________
│   [ ] 正确  [ ] 不对  [ ] 不确定

└─ 🔬 根因层（我最不确定的）
│   └─ 为什么会导致这个问题：_______________
│   [ ] 正确  [ ] 不对  [ ] 不确定

请选择：
□ A. 以上全部正确 → 进入阶段二（勾选修复方案）
□ B. 某层不对 → 请指出哪层：_______，我继续深挖
□ C. 我发现了其他现象 → 请补充：_______
□ D. 我不确定 → 我提议先用单节点测试缩小范围
□ E. 快速模式：我信你，直接给方案 → ⚠️ 跳过验证，但会标注"未经验证"，风险自担
```

**Step 3: 如果假设不成立 → 诊断性提问**

| 哪层不对 | 深挖问题 |
|---------|---------|
| **症状层** | "实际的报错/现象是什么？能贴完整信息吗？" |
| **位置层** | "问题实际出在哪个节点/哪次迭代？能对比成功和失败的执行吗？" |
| **直接原因层** | "代码的实际表现是什么？和预期有什么不同？" |
| **根因层** | "上游节点实际输出了什么？输入到这个节点的数据格式正常吗？" |
| **都不确定** | "你观察到的其他异常现象是什么？（耗时、输出内容、页面表现等）" |

**深挖后回到 Step 2，重新呈现修正后的假设树。**

**边界情况处理：**

| 情况 | 处理 |
|------|------|
| 用户不回复 | 暂停等待，不自动推进。提示："等你确认后我再继续" |
| 深挖 3 轮仍无果 | 建议用户提供日志链接或人工介入："信息不足，建议提供 Dify 日志链接做精确诊断" |
| 用户坚持删除兜底逻辑 | 明确记录："⚠️ 用户知情并承担风险，已要求删除防御性代码" |
| 用户选择快速模式（E） | 直接给方案，但每条建议标注 "[未经验证]"，提醒用户自行承担风险 |

### 5.2 阶段二：确认（方案勾选）

**仅在阶段一全部通过后进入。**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 阶段二：修复方案（假设已确认，请勾选）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

已确认根因：_______________

□ P0 - 最小修复（只修明确报错的位置，无风险）
  └─ 例如：变量名修正（e1 → e）、语法错误修复

□ P1 - 保守优化（保留所有原有逻辑，增加处理/兜底）
  └─ 例如：增加尾随逗号清理、统一分号处理、增加 safeMode
  └─ 风险：低，不改变现有代码路径

□ P1+ - 替换处理逻辑（用更精确的方式替代原有方式）
  └─ 例如：replaceAll 改为正则精确替换
  └─ 风险：中，需测试确认没有遗漏边界情况
  └─ ⚠️ 必须保留原有兜底逻辑（catch/else/endsWith）

□ P2 - 架构调整（增加 Fail Branch、错误处理、重试机制）
  └─ 风险：中，增加流程复杂度

□ P2+ - 引入外部依赖（如容错 JSON 解析器 Jaison）
  └─ 风险：高，增加依赖和维护成本

执行顺序：
1. 先执行所有勾选的 P0
2. 再逐条执行勾选的 P1/P1+（每条独立可回滚）
3. P2/P2+ 需单独评估后执行

[确认执行]  [只执行P0]  [返回阶段一重新验证]
```

### 5.2.5 检查点：能力边界确认

> dify-analyzer 的专精是**诊断**，修复能力仅限于当前节点内的代码/Prompt/配置调整。
> 工作流结构变更、插件开发、流程重建等建设性工作不在本 skill 范围内。

**诊断完成，根因已确认。评估修复范围：**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 检查点：能力边界确认
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

已确认根因：_______________

【dify-analyzer 可处理的范围】
✅ 当前节点的代码语法错误（JSON.parse 失败、变量未定义等）
✅ Prompt 逻辑修正（约束条件、输出格式、示例优化）
✅ 参数配置调整（temperature、max_tokens、模型切换）
✅ 代码节点内的文本处理（正则修复、格式转换）

【超出 dify-analyzer 能力的范围】
❌ 增删改节点、调整节点连接关系
❌ 变更工作流变量作用域或数据流
❌ 开发新的自定义工具或插件
❌ 从零重建工作流架构

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请确认：

□ A. 问题在 dify-analyzer 能力范围内 → 继续修复（进入 5.3）

□ B. 问题涉及工作流结构/插件开发/流程重建
   → dify-analyzer 在此暂停
   → 你可以用 `/skill-name` 显式调用其他 skill 继续
   → 或手动修改后回来验证

[确认 A，继续修复]  [确认 B，暂停并提示]
```

**处理逻辑：**

```javascript
if (repairScope === 'within_capability') {
  // 进入 5.3 兜底逻辑保护，继续修复
  gotoPhase('5.3');
} 
else if (repairScope === 'beyond_capability') {
  // 超出能力范围，但给用户选择权
  const userDecision = askUserChoice({
    message: '诊断已完成，但修复涉及工作流结构/插件开发，超出 dify-analyzer 能力范围。',
    options: [
      'A. 我没有其他 skill，dify-analyzer 继续尝试基础修复（有限能力）',
      'B. 我有其他 skill，但我懒得切换，dify-analyzer 继续尝试',
      'C. 暂停，我用 /skill-name 显式调用其他 skill',
      'D. 暂停，我手动修改后回来验证'
    ]
  });
  
  if (userDecision === 'A' || userDecision === 'B') {
    // 用户坚持继续，dify-analyzer 在能力范围内做最大努力
    return {
      status: 'continue_with_limitation',
      message: '用户选择继续。dify-analyzer 将在能力范围内做最大努力修复，但明确告知局限性。',
      limitationNote: '⚠️ 以下修复超出能力，已跳过：节点增删/连接调整/插件开发/流程重建',
      action: gotoPhase('5.3')  // 继续修复，但在修复中标记超出能力的部分
    };
  } else if (userDecision === 'C' || userDecision === 'D') {
    // 用户选择暂停
    return {
      status: 'paused',
      diagnosisComplete: true,
      rootCause: confirmedRootCause,
      context: {
        diagnosisResult: diagnosisSummary,
        rootCause: confirmedRootCause,
        note: '诊断上下文已保留。可随时重新调用 dify-analyzer 继续。'
      }
    };
  }
}
```

**核心原则：**

| 原则 | 说明 |
|------|------|
| **不假设其他 skill 存在** | 不检测、不推荐、不列出具体 skill 名称 |
| **不主动路由** | OpenCode 的 skill description 机制会自动处理 skill 选择 |
| **用户显式控制** | 用户用 `/skill-name` 主动调用，或手动修改 |
| **诊断上下文保留** | 已确认的根因和诊断结果不会丢失 |

### 5.3 兜底逻辑保护清单

**修改代码节点前，检查以下逻辑是否存在，严禁删除：**

| 逻辑类型 | 示例 | 为什么保护 |
|---------|------|-----------|
| `catch` 块 | `catch(e) { ... }` | 错误处理，防止工作流中断 |
| `else` / `else if` | `if (x) { ... } else { ... }` | 分支覆盖，处理边界情况 |
| `endsWith` 检查 | `if (str.endsWith('x'))` | 末尾异常清理 |
| `try-catch` 嵌套 | `try { try { ... } catch { ... } }` | 多层降级策略 |
| 注释标注的兜底 | `// 兜底/降级/容错` | 开发者有意设计的防御 |
| 条件分支的默认路径 | `default: ...` / `else: ...` | 未命中条件时的安全网 |

**判断原则：**
- ❌ "我没看到它触发过" ≠ "可以删掉"
- ❌ "这段代码看起来冗余" ≠ "可以删掉"
- ✅ "只修明确报错的位置，其余不动"

### 5.4 代码节点故障模式库

> 完整故障模式速查表已移至 `references/code-node-error-patterns.md`
> 包含：14种错误模式、按症状快速定位流程、修复策略选择指南

**常用故障模式（摘要）：**

| 错误模式 | 症状 | 最小修复 |
|---------|------|---------|
| `ReferenceError` | 变量未定义 | 修变量名 |
| `SyntaxError: Unexpected token` | JSON.parse 失败 | 检查尾随逗号/分号 |
| Markdown 代码块污染 | 被 ` ```json ` 包裹 | 剥离代码块 |
| 中文全角标点 | `："，"` | 替换为英文标点 |
| JSON 截断 | `{ "a": 1` | 增加 max_tokens |
| 分号代替逗号 | `};\n"key"` | 精确正则替换 |

**完整版详见：** `references/code-node-error-patterns.md`

### 5.5 修改后验证流程

```
□ 1. 单节点测试：修改后只测该节点，确认通过
□ 2. 对比测试：输入和修改前相同的数据，对比输出差异
□ 3. 边界测试：输入极端情况（空值/超长/特殊字符），确认不崩溃
□ 4. 用户确认：你验证通过了吗？

如果测试不通过：
→ 回滚到修改前版本（版本控制恢复）
→ 重新分析，修正假设
```

---

## 异常处理

| 场景 | 处理动作 |
|-----|---------|
| 登录失败 | 切换到手动模式，指导用户复制日志 |
| 页面加载超时 | 重试 1 次，仍失败则切换手动模式 |
| 无法展开日志详情 | 尝试其他选择器，2 次失败后切换 |
| Agent 节点未找到 | 确认是否为目标节点，或执行通用分析 |
| 日志读取不完整 | 明确告知"部分数据无法自动读取" |
| 60秒超时 | 停止分析，输出已获取的部分结果 |
| 工具初始化失败（skill/浏览器等） | 检查 Node.js/nvm 版本，提示用户切换正确版本后重试 |
| **用户否定假设** | **回到 Phase 5.1，重新构建假设树，不强行推进** |
| **用户要求跳过验证** | **明确告知风险："跳过验证可能改错位置，确认继续？"** |

---

## 使用示例

> 完整场景示例（含 10 个典型场景）见：
> **`references/usage-examples.md`**

**场景速览：**

| 场景 | 关键词 | 诊断模式 |
|------|--------|---------|
| 通用日志分析 | 日志链接 | Phase 0-3 通用分析 |
| Agent 专项诊断 | Agent/工具/enable_thinking | 6层诊断检查清单 |
| 已知问题快速诊断 | qwen/deepseek/怎么关 | 直接引用诊断手册 |
| 提示词边界情况 | 负数/空值/多项目 | 数据状态三层分类法 |
| 多轮迭代优化 | 改了三版/又出问题 | 提示词版本演进追踪 |
| ReAct 解析失败 | JSON.parse 崩溃 | 输出变异分析 |
| JSON 键名漂移 | platform_name/中英文混用 | 4维漂移检测 |
| 破坏性变更拦截 | 固定化/删除分支 | L3 拦截 + 替代方案 |
| Thinking 污染 | enable_thinking/JSON.parse | 4种空输出类型检测 |
| 根因区分 | Token不够/模型问题 | max_tokens + 输出特征分析 |

---

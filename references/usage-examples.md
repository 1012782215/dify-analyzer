# 使用示例

> dify-analyzer 典型使用场景速查。

---

### 场景 1: 通用日志分析
```
用户: 看看这个Dify日志 https://your-dify-instance.com/app/xxx/logs
系统: [执行 Phase 0-3 通用分析流程]
      [生成执行概览和节点分析]
```

### 场景 2: Agent 专项诊断
```
用户: Agent 没进工具，日志在这 https://...
系统: [检测到 Agent 关键词]
      [切换到 Agent 专项诊断模式]
      [执行 6 层诊断检查清单]
      [生成诊断报告：得分 75/100，主要问题 enable_thinking]
```

### 场景 3: 已知问题快速诊断
```
用户: 用的是 qwen-plus-latest，enable_thinking 怎么关？
系统: [直接引用 references/agent-tool-troubleshooting.md L3 章节]
      [给出关闭 enable_thinking 的具体步骤]
```

### 场景 4: 提示词边界情况诊断
```
用户: 对比分析节点输出负数，外部实体明明没数据
系统: [执行 Phase 0-3 通用分析流程]
      [识别为数据状态分类问题]
      [执行诊断框架中的"数据状态三层分类法"]
        - 检查L1无数据（对象不存在/null）
        - 检查L2空数据（对象存在但全为空）
        - 检查L3部分数据（部分有值部分空）
      [分析提示词逻辑：是否区分了L1和L2的处理？]
      [使用模板D生成诊断报告]
      [给出修复方案：添加L1判定，L1输出"-"不参与计算]
      [参考案例：examples/prompt-iteration-boundary-analysis/]
```

### 场景 5: 多轮迭代提示词优化
```
用户: 改了三版提示词，空值问题修了但多项目场景又出问题了
系统: [执行 Phase 0-3 通用分析流程]
      [识别为提示词版本演进问题]
      [启动提示词版本演进追踪模式]
        - 收集v1/v2/v3版本提示词
        - 分析每轮修改的意图和副作用
      [使用"提示词逻辑验证四问"检查一致性]
        - Q1: 边界覆盖（空值/有值/差异/无差异）
        - Q2: 条件完备（if/else分支覆盖）
        - Q3: 一致性（规则与示例是否一致）
        - Q4: 可验证（是否有测试用例）
      [识别"补丁叠补丁"导致的逻辑冲突]
      [给出条件化处理方案：单项目不加/多项目有差异才加]
      [参考案例：examples/prompt-iteration-boundary-analysis/solution.md]
```

### 场景 6: ReAct Agent 输出解析失败
```
用户: Agent节点执行成功了，但下游代码节点JSON.parse崩溃
系统: [执行 Phase 0-3 通用分析流程]
      [识别为ReAct输出解析问题]
      [启动ReAct输出变异分析]
        - 检查输出是否包含<think>标签（Qwen3 thinking模式）
        - 检查输出是否包含Final Answer前缀
        - 检查输出是否为{"action": "Final Answer", "action_input": [...]}格式
        - 检查输出是否被markdown代码块包裹
        - 检查是否包含Thought/Action/Observation泄漏
      [使用多级降级提取策略]
        - 策略1: 提取action_input字段
        - 策略2: 提取Final Answer后缀
        - 策略3: 清理markdown标记
        - 策略4: 正则兜底提取[...]
      [提供3种可复用的兜底代码方案]
        - 方案1: 多级降级提取（完整版）
        - 方案2: 极简暴力版
        - 方案3: json5风格宽松解析
      [给出架构建议：永远不要直接JSON.parse(Agent原始输出)]
      [参考案例：examples/react-output-parsing-failure/]
      [参考源码：Dify官方解析器逻辑分析]
```

### 场景 7: JSON 键名漂移诊断
```
用户: LLM节点输出JSON，前半截中文键名正常，后半截突然变成platform_name
系统: [检测到 JSON 键名漂移关键词]
      [切换到 JSON 结构化输出诊断模式]
      [执行 4 维漂移检测]
        - 语言漂移：检测到 5 个英文键名（platform_name, entity_name...）
        - 语义漂移：未检测到
        - 缩写漂移：未检测到
        - 层级漂移：未检测到
      [Token 分析：completion_tokens=4210，超过阈值]
      [根因定位：长文本注意力衰减 + Prompt 缺乏键名显性约束]
      [输出修改点清单（diff 风格）]
        1. Prompt 开头添加："⚠️ JSON键名约束：所有键名必须使用中文..."
        2. 关键执行要求新增："键名一致性"条款
        3. 输出示例中的占位符替换为真实键名
      [询问用户]
        以上是诊断发现的 3 处修改点。是否需要我输出完整的修改后 Prompt？
        [输出完整 Prompt] [仅保留修改点] [导出 diff 文件]
      [参考案例：examples/json-key-name-drift/]
```

### 场景 8: 渐进式输出与破坏性变更拦截
```
用户: 帮我把提示词里的浮动指标改成固定的，这样输出稳定
系统: [识别为"固定化动态字段"请求]
      [触发 L3 破坏性变更拦截]
      [拒绝直接执行]
      [输出风险告警]
        ⚠️ 检测到您要求将浮动指标固化为静态字段。
        
        潜在风险：
        - 破坏工作流的项目通用性
        - 后续新增项目时需重新修改 Prompt
        - 与现有数据转换节点产生冲突
        
        建议替代方案：
        - 方案 A：在 Prompt 中增加"以输入数据中的实际指标为准"的声明
        - 方案 B：使用条件化输出（单项目不加前缀 / 多项目有差异才加前缀）
        
        仍坚持固化？请确认您已了解风险
        [确认固化] [采用替代方案 A] [采用替代方案 B]
      [如果用户确认固化]
        [输出修改点清单]
        [询问是否需要完整 Prompt]
```

### 场景 9: Thinking 模型输出污染诊断
```
用户: 分析下这个 Dify 日志，代码节点 JSON.parse 报错了 https://your-dify-instance.com/app/xxx/logs
系统: [执行 Phase 0-3 通用分析流程]
      [识别为 Thinking 模型输出污染问题]
      [切换到 Thinking 模型输出污染诊断模式]
      [执行 4 种空输出类型检测]
        - 检查类型 A（完全空输出）：LLM 输出不为空，排除
        - 检查类型 B（Think 后空输出）：检测到 <think>...</think>\n\n，符合
        - 检查类型 C（JSON 截断）：不符合
        - 检查类型 D（JSON 在 think 内）：不符合
      [检查模型特定限制]
        - 模型：Qwen3
        - enable_thinking=True
        - max_tokens=32768（充足，排除 Token 耗尽）
      [根因定位]
        - 模型 thinking 后未输出正式 JSON 回答
        - 提示词缺乏对 thinking 后必须输出 JSON 的强制约束
      [输出诊断报告]
        - 空输出类型：B（Think 标签后空输出）
        - 根因：模型"以为"思考完就够了，未被明确要求输出 JSON
        - 解决方案：
          1. Prompt 追加格式强制要求（辅助）
          2. 代码节点增加 think 标签清理逻辑（必要）
        - 不推荐：关闭 enable_thinking（Qwen3 与 Structured Output 不兼容）
      [参考案例：examples/thinking-model-pollution/]
```

### 场景 10: Thinking 污染与 Token 耗尽的区分诊断
```
用户: 我的代码节点 JSON.parse 报错，但我不确定是 Token 不够还是模型问题
系统: [执行 Phase 0-3 通用分析流程]
      [识别为 JSON 解析失败，需要区分根因]
      [启动根因区分诊断]
        Step 1: 检查 max_tokens 配置
          - 当前值：32768 → 充足（排除 Token 耗尽）
          - 如果是 2048 或更小 → 可能是 Token 耗尽
        
        Step 2: 检查 LLM 输出特征
          - 如果输出包含 <think> 标签且 </think> 后为空 → 类型 B（Think 污染）
          - 如果输出有 JSON 开头但无结尾 → 类型 C（Token 耗尽/截断）
          - 如果输出完全为空 → 类型 A（模型崩溃）
        
        Step 3: 检查模型类型
          - Qwen3/DeepSeek + enable_thinking=True → 大概率是 Think 污染
          - GPT-4o/Claude → 大概率不是 Think 污染
        
        Step 4: 输出区分结论
          - 情况 A：max_tokens 小 + JSON 截断 → Token 耗尽
            解决方案：增加 max_tokens
          - 情况 B：max_tokens 大 + Think 后空 → Think 污染
            解决方案：Prompt 约束 + 代码清理
          - 情况 C：max_tokens 大 + 完全空输出 → 模型/API 问题
            解决方案：检查模型状态和连接
      [参考文档：references/thinking-model-troubleshooting.md 第 4.2 节]
```

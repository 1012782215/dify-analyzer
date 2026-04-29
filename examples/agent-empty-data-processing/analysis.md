# 案例分析：Agent 数据处理为空

## 案例信息

- **时间**: 2026-04-24
- **Dify 版本**: QA 环境
- **应用**: 动态查询内部数据
- **问题**: Agent——sql生成与数据获取 节点未调用工具

## 症状

1. Agent 配置了 `function_calling` 策略
2. 数据处理为 `{}`（空对象）
3. 模型直接生成 SQL 而非调用工具

## 诊断过程

### Step 1: 检查 Agent 策略
- ✅ 策略: function_calling
- ✅ 模型: qwen-plus-latest

### Step 2: 检查 completion_params
```json
{
  "completion_params": {
    "temperature": 0.1,
    "top_p": 0.1
    // enable_thinking 未设置
  }
}
```

**发现**: `enable_thinking` 未显式设置，但 Qwen3 默认开启。

### Step 3: 检查模型输出
模型输出包含 `<think>...</think>` 思考过程，直接生成了 SQL。

## 诊断得分

| 层级 | 得分 | 说明 |
|-----|------|------|
| L1 配置层 | 15/15 | 策略正确 |
| L2 绑定层 | 10/10 | 工具绑定正常 |
| L3 参数层 | 0/15 | enable_thinking 未关闭 |
| L4 提示词层 | 5/10 | 未强制要求使用工具 |
| L5 模型层 | 0/20 | Qwen3 已知问题 |
| L6 架构层 | 10/10 | 无架构限制 |
| 实测层 | 20/20 | 有明确证据 |
| **总分** | **60/100** | 问题明确 |

## 根因分析

**主要原因**: `enable_thinking` 与 `function_calling` 冲突

**次要原因**: 
- 提示词未强制要求使用工具
- Qwen3 系列 Function Calling 稳定性问题

## 解决方案

### 方案 1: 移除 enable_thinking（采用）
修改模型参数，移除 `enable_thinking` 或设置为 `false`。

### 方案 2: 换用 GPT-4o（备选）
如方案 1 无效，换用 GPT-4o 测试。

### 方案 3: 改用 ReAct（备选）
如必须使用 Qwen，改用 ReAct 策略。

## 验证结果

**修改后**: 数据处理不再是 `{}`，工具调用正常触发。

**结论**: 问题已解决，根因确认为 `enable_thinking` 参数冲突。

## 参考

- 诊断手册: `references/agent-tool-troubleshooting.md` L3 章节
- 相关 Issue: QwenLM/Qwen3 #1817

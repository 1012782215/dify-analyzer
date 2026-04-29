# 解决方案：Agent 工具不调用

## 问题
Agent 节点配置 function_calling 策略，但数据处理为空 `{}`，工具未被调用。

## 最终解决方案

### 立即执行

1. **关闭 enable_thinking**
   - 进入 Agent 节点配置
   - 找到模型参数设置
   - 移除 `enable_thinking` 或设置为 `false`

2. **验证修复**
   - 重新执行工作流
   - 查看日志确认数据处理不再为空

### 备选方案

如问题未解决，依次尝试：

1. **换用 GPT-4o 测试**
   - 临时切换模型
   - 验证是否为模型兼容性问题

2. **改用 ReAct 策略**
   - 将策略从 function_calling 改为 ReAct
   - 适用于必须使用 Qwen 的场景

3. **优化提示词**
   - 添加强制工具调用声明
   ```
   你必须使用【query_database】工具来执行 SQL 查询，
   不要直接生成 SQL 语句。
   ```

## 预防措施

1. 使用 Qwen3 系列时，默认关闭 enable_thinking
2. Agent 提示词中明确声明必须使用工具
3. 测试阶段先用 GPT-4o 验证流程，再切换到目标模型

## 验证清单

修复后确认：
- [ ] 数据处理不再是 `{}`
- [ ] 日志显示工具调用记录
- [ ] Agent 输出基于工具返回结果
- [ ] 执行时间合理

## 参考文档

- [Agent 工具调用故障诊断手册](../../references/agent-tool-troubleshooting.md)

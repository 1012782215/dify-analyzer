# Dify 日志分析报告模板

## 模板 A：完整诊断报告（90-100分）

```markdown
## Dify 日志分析报告 ✅

### 执行概览
- 对话 ID: {{conversation_id}}
- 执行时间: {{total_duration}} 秒
- Token 消耗: {{total_tokens}}
- 触发方式: {{trigger}}

### 问题定位
**问题节点**: {{node_name}}
**问题类型**: {{issue_type}}
**诊断得分**: {{score}}/100

### 诊断详情
{{diagnosis_details}}

### 解决方案
#### 立即执行（P0）
{{p0_solutions}}

#### 建议优化（P1）
{{p1_suggestions}}

### 验证步骤
{{verification_steps}}

### 参考文档
- {{troubleshooting_ref}}
- 相关 Issue: {{related_issues}}
```

## 模板 B：部分诊断 + 手动验证（<50分）

```markdown
## Dify 日志分析（部分自动化）⚠️

### 已获取信息
- ✅ 执行概览（时间、Token、状态）
- ⚠️ {{node_name}} 基础信息
- ❌ 详细参数（需要手动查看）

### 需要你手动确认
请打开 Dify 日志页面，进入 "{{node_name}} → 输入/详情"，确认：
1. {{check_item_1}}
2. {{check_item_2}}
3. {{check_item_3}}

### 基于已有信息的初步分析
{{preliminary_analysis}}

### 可能的原因（按优先级）
1. {{possible_cause_1}}
2. {{possible_cause_2}}
3. {{possible_cause_3}}

请提供上述信息后，我会给出完整诊断。
```

## 模板 C：Agent 专项诊断报告

```markdown
## Agent 工具调用故障诊断报告 🎯

### 诊断摘要
**Agent 节点**: {{agent_node_name}}
**策略**: {{agent_strategy}}
**模型**: {{model}}
**诊断得分**: {{score}}/100
**问题等级**: {{severity}}

### 6层诊断结果

| 层级 | 维度 | 得分 | 状态 |
|-----|-----|------|------|
| L1 | 配置层 | {{l1_score}}/15 | {{l1_status}} |
| L2 | 绑定层 | {{l2_score}}/10 | {{l2_status}} |
| L3 | 参数层 | {{l3_score}}/15 | {{l3_status}} |
| L4 | 提示词层 | {{l4_score}}/10 | {{l4_status}} |
| L5 | 模型层 | {{l5_score}}/20 | {{l5_status}} |
| L6 | 架构层 | {{l6_score}}/10 | {{l6_status}} |
| 实测 | 日志证据 | {{test_score}}/20 | {{test_status}} |

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

### 参考信息
- 诊断手册: `references/agent-tool-troubleshooting.md`
- 相关 Issue: {{related_issues}}
- 模型兼容性: {{model_compatibility_doc}}
```

---

## 【新增】模板 D：提示词边界情况诊断报告

> 适用于：数据转换类节点、提示词逻辑缺陷、输出格式异常

```markdown
## 提示词边界情况诊断报告 📝

### 诊断摘要
**问题节点**: {{node_name}}
**节点类型**: {{node_type}} (LLM/代码执行/模板转换)
**问题症状**: {{symptom_summary}}
**数据状态分类**: {{data_state_classification}}
**诊断得分**: {{score}}/100

### 问题现象

#### 症状描述
{{symptom_description}}

#### 预期输出 vs 实际输出
| 场景 | 预期输出 | 实际输出 | 差异类型 |
|-----|---------|---------|---------|
| {{scenario_1}} | {{expected_1}} | {{actual_1}} | {{diff_type_1}} |
| {{scenario_2}} | {{expected_2}} | {{actual_2}} | {{diff_type_2}} |

### 数据状态分析

使用**数据状态三层分类法**分析：

| 数据层级 | 定义 | 当前处理 | 应处理 |
|---------|------|----------|--------|
| **L1: 无数据** | 对象不存在/null | {{l1_current}} | {{l1_should}} |
| **L2: 空数据** | 对象存在但全为空 | {{l2_current}} | {{l2_should}} |
| **L3: 部分数据** | 部分有值部分为空 | {{l3_current}} | {{l3_should}} |
| **L4: 完整数据** | 所有字段有值 | {{l4_current}} | {{l4_should}} |

**根因判定**: {{root_cause}}

### 提示词逻辑分析

#### 当前规则
```markdown
{{current_rule}}
```

#### 规则缺陷（使用"提示词逻辑验证四问"）

| 检查项 | 问题 | 严重程度 |
|--------|------|----------|
| **Q1: 边界覆盖** | {{q1_issue}} | {{q1_severity}} |
| **Q2: 条件完备** | {{q2_issue}} | {{q2_severity}} |
| **Q3: 一致性** | {{q3_issue}} | {{q3_severity}} |
| **Q4: 可验证** | {{q4_issue}} | {{q4_severity}} |

### 迭代轨迹分析（如适用）

**版本演进**: {{iteration_path}}

**当前版本问题**: {{current_version_issue}}

**建议演进方向**: {{recommended_direction}}

### 修复方案

#### 方案A：条件化处理（推荐）
```markdown
{{conditional_solution}}
```

**优点**: {{solution_a_pros}}
**缺点**: {{solution_a_cons}}
**适用场景**: {{solution_a_applicable}}

#### 方案B：分层处理
```markdown
{{layered_solution}}
```

**优点**: {{solution_b_pros}}
**缺点**: {{solution_b_cons}}
**适用场景**: {{solution_b_applicable}}

### 验证测试用例

| 测试场景 | 输入 | 预期输出 | 验证状态 |
|---------|------|----------|---------|
| 场景1: L1无数据 | {{test_input_1}} | {{test_expected_1}} | [ ] |
| 场景2: L2空数据 | {{test_input_2}} | {{test_expected_2}} | [ ] |
| 场景3: L3部分数据 | {{test_input_3}} | {{test_expected_3}} | [ ] |
| 场景4: L4完整数据 | {{test_input_4}} | {{test_expected_4}} | [ ] |

### 实施步骤

#### 立即执行（P0 - 5分钟）
1. {{p0_step_1}}
2. {{p0_step_2}}

#### 短期优化（P1 - 30分钟）
1. {{p1_step_1}}
2. {{p1_step_2}}
3. {{p1_step_3}}

#### 长期改进（P2 - 2小时+）
1. {{p2_step_1}}
2. {{p2_step_2}}

### 预防措施

**避免类似问题的最佳实践**:
1. {{prevention_1}}
2. {{prevention_2}}
3. {{prevention_3}}

### 参考资源

- **诊断方法**: `references/diagnostic-framework.md`
  - 数据状态三层分类法
  - 条件化输出设计模式
  - 提示词逻辑验证四问
  - S.V.E.R.调试流程

- **相似案例**: `examples/prompt-iteration-boundary-analysis/`
  - 负数输出问题
  - 无意义前缀问题
  - 多轮迭代管理

- **通用检查清单**:
  ```markdown
  □ 数据源对象是否存在？（null/undefined检查）
  □ 字段值是否为空？（""/null/undefined区分）
  □ 多数据源是否合并？（差异检测机制）
  □ 字符串拼接前是否判空？
  □ 默认值是否合理？（避免0/-1歧义）
  □ 条件分支是否覆盖所有场景？
  □ 示例输出是否包含边界情况？
  □ 兜底规则是否被后续规则覆盖？
  ```

---

## 【新增】快速诊断卡片

### 卡片1：负数输出
**症状**: 对比计算结果为负数  
**快速检查**: 是否将"无数据"按0处理？  
**修复**: 区分L1（无数据）和L2/L3（空/部分数据）

### 卡片2：无意义前缀
**症状**: 输出"字段名："（无值）  
**快速检查**: 字符串拼接前是否判空？  
**修复**: 条件化拼接，空值不加前缀

### 卡片3：数据丢失
**症状**: 多数据源合并后信息不全  
**快速检查**: 是否做了差异检测？  
**修复**: 相同值去重，不同值标识

### 卡片4：格式不一致
**症状**: 相同场景输出格式不同  
**快速检查**: 条件分支是否完备？  
**修复**: 补充遗漏分支，统一处理逻辑

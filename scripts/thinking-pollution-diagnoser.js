/**
 * Thinking Pollution Diagnoser - Dify 代码节点用
 *
 * 用途：诊断 Thinking/Reasoning 模型导致的输出污染问题
 * 适用场景：Qwen3、DeepSeek 等 thinking 模型的兼容性检查和限制诊断
 * 兼容性：Dify v1.x 代码节点
 *
 * 使用说明：
 * 1. 配合 think-tag-cleaner.js 使用（think-tag-cleaner 负责清理，本脚本负责诊断）
 * 2. 在 Dify 代码节点中调用 checkModelLimitations(modelName) 获取模型限制
 * 3. 使用 getDiagnosisScore() 获取评分标准
 *
 * 安全提示：
 * - 本脚本仅返回配置数据，不做文本处理
 * - 无网络访问，无外部依赖
 */

// ========== 4 种空输出类型定义 ==========

/**
 * 空输出类型检测配置
 * 与 think-tag-cleaner.js 的 mainDebug() 对应
 */
const emptyOutputTypes = {
  // 类型 A: 完全空输出（模型什么都没返回）
  A_COMPLETELY_EMPTY: {
    check: (text) => !text || text.trim() === "",
    causes: ["模型崩溃", "API 超时", "Stream 解析失败", "max_tokens=0"],
    solution: "检查模型状态、网络连接、max_tokens 配置",
  },

  // 类型 B: Think 标签后空输出（有 <think> 但 </think> 后无内容）
  B_THINK_THEN_EMPTY: {
    check: (text) => {
      if (!text || !text.includes("</think>")) return false;
      const afterThink = text.split("</think>").pop();
      return !afterThink || afterThink.trim() === "";
    },
    causes: [
      "模型 thinking 后未生成正式回答",
      "enable_thinking=True + Structured Output 冲突",
      "Qwen3 enable_thinking=False 时 Schema 约束失效",
      "max_tokens 被 thinking 过程耗尽",
    ],
    solution: "保持 enable_thinking=True + Prompt 约束 + 代码清理 think 标签",
  },

  // 类型 C: JSON 被截断（有开头无结尾）
  C_JSON_TRUNCATED: {
    check: (text) => {
      if (!text) return false;
      const trimmed = text.trim();
      return trimmed.startsWith("{") && !trimmed.endsWith("}");
    },
    causes: ["max_tokens 不足", "输出长度超过限制", "模型生成被截断"],
    solution: "增加 max_tokens（建议 ≥ 8192）",
  },

  // 类型 D: JSON 被包裹在 think 标签内部
  D_JSON_INSIDE_THINK: {
    check: (text) => {
      if (!text || !text.includes("<think>")) return false;
      const thinkMatch = text.match(/<think>[\s\S]*?<\/think>/);
      if (!thinkMatch) return false;
      return thinkMatch[0].includes("{") && thinkMatch[0].includes("}");
    },
    causes: [
      "模型把正式回答放进了 thinking 过程",
      "reasoning_format=tagged 时解析错误",
    ],
    solution: "使用 reasoning_format=separated 或代码提取 think 标签内的 JSON",
  },
};

// ========== 模型特定限制库 ==========

/**
 * 模型兼容性限制检查表
 * 基于 Dify v1.x + Qwen3/DeepSeek 实测行为
 */
const modelLimitations = {
  qwen3: {
    "enable_thinking=False + Structured Output":
      "❌ 不兼容（SGLang Grammar Backend 依赖 <think> 触发约束解码）",
    "enable_thinking=False 后仍然输出 thinking":
      "⚠️ 插件 0.0.28-0.0.31 已知回归",
    "vLLM --reasoning-parser qwen3":
      "⚠️ reasoning 字段不被 Dify 解析，建议使用原生 <think> 标签",
    推荐方案: "enable_thinking=True + Prompt 约束 + 代码清理 think 标签",
  },
  "deepseek-r1": {
    "Agent 模式": "⚠️ thinking 过程嵌套，timer 不停止",
    "function calling": "⚠️ V3.2 需要 reasoning_content 字段",
    推荐方案: "避免在 Agent 节点使用，或升级 Dify 版本",
  },
  "deepseek-v3": {
    "enable_thinking=True":
      "⚠️ 可能只返回 reasoning_content，final content 为空",
    推荐方案: "检查 max_tokens 是否充足（thinking + 正式回答共享配额）",
  },
};

// ========== 诊断评分标准 ==========

/**
 * Thinking 污染诊断评分配置
 */
const thinkingDiagnosisScore = {
  empty_type_identification: 25, // 正确识别空输出类型
  model_limitation_check: 25, // 检查模型特定限制
  root_cause_analysis: 25, // 根因分析准确性
  solution_feasibility: 25, // 方案可行性
};

// ========== 查询函数 ==========

/**
 * 检查指定模型的限制
 *
 * @param {string} modelName - 模型名称（如 'qwen3', 'deepseek-r1'）
 * @returns {Object|null} 模型限制信息，未找到返回 null
 */
function checkModelLimitations(modelName) {
  if (!modelName) return null;

  const normalized = modelName.toLowerCase().replace(/[\s-_]+/g, "-");

  // 模糊匹配
  for (const [key, value] of Object.entries(modelLimitations)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return {
        model: key,
        limitations: value,
      };
    }
  }

  return null;
}

/**
 * 获取诊断评分标准
 */
function getDiagnosisScore() {
  return {
    ...thinkingDiagnosisScore,
    total: Object.values(thinkingDiagnosisScore).reduce((a, b) => a + b, 0),
  };
}

/**
 * 获取空输出类型定义
 */
function getEmptyOutputTypes() {
  return emptyOutputTypes;
}

/**
 * 获取所有受限制的模型列表
 */
function getRestrictedModels() {
  return Object.keys(modelLimitations);
}

// ========== Dify 代码节点入口函数 ==========

/**
 * Dify 代码节点入口函数
 *
 * 输入参数：
 *   - modelName: string (optional) - 模型名称
 *
 * 输出参数：
 *   - modelLimitations: Object - 模型限制（如果有）
 *   - scoreConfig: Object - 评分标准
 *   - restrictedModels: Array - 受限制模型列表
 *   - emptyOutputTypes: Object - 空输出类型定义
 */
function main({ modelName }) {
  return {
    modelLimitations: checkModelLimitations(modelName),
    scoreConfig: getDiagnosisScore(),
    restrictedModels: getRestrictedModels(),
    emptyOutputTypes: getEmptyOutputTypes(),
  };
}

// ========== 导出（如果在模块化环境中使用）==========
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    emptyOutputTypes,
    modelLimitations,
    thinkingDiagnosisScore,
    checkModelLimitations,
    getDiagnosisScore,
    getEmptyOutputTypes,
    getRestrictedModels,
  };
}

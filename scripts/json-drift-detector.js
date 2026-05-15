/**
 * JSON Drift Detector - Dify 代码节点用
 *
 * 用途：检测 LLM 节点 JSON 输出中的键名漂移问题
 * 适用场景：JSON 结构化输出一致性诊断（语言/语义/缩写/层级漂移）
 * 兼容性：Dify v1.x 代码节点
 *
 * 使用说明：
 * 1. 按需复制对应函数到 Dify 代码节点
 * 2. 或使用 runDriftDetection 进行完整检测
 * 3. 配合 json-repair-snippets.js 使用（检测 → 修复闭环）
 *
 * 安全提示：
 * - 本脚本仅做文本分析，不发起网络请求
 * - 所有检测均为只读，不会修改原始数据
 */

// ========== 辅助函数 ==========

/**
 * 递归提取对象中的所有键名
 */
function extractAllKeys(obj, prefix = "") {
  const keys = [];
  if (typeof obj === "object" && obj !== null) {
    for (const key of Object.keys(obj)) {
      keys.push(prefix + key);
      if (typeof obj[key] === "object" && obj[key] !== null) {
        keys.push(...extractAllKeys(obj[key], prefix + key + "."));
      }
    }
  }
  return keys;
}

/**
 * 计算对象的嵌套深度
 */
function getActualDepth(obj, currentDepth = 0) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return currentDepth;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return currentDepth;
  return Math.max(
    ...keys.map((k) => getActualDepth(obj[k], currentDepth + 1))
  );
}

/**
 * 从 Schema 获取预期深度（简化版）
 * 实际使用时建议传入业务定义的 Schema 深度
 */
function getExpectedDepth(schema) {
  if (!schema) return 2; // 默认预期 2 层
  return getActualDepth(schema);
}

/**
 * 检查同一对象内是否同时存在中英文键名
 */
function hasBothChineseAndEnglishKeys(keys) {
  const hasChinese = keys.some((k) => /[\u4e00-\u9fff]/.test(k));
  const hasEnglish = keys.some(
    (k) => /^[a-zA-Z_]/.test(k) && !/[\u4e00-\u9fff]/.test(k)
  );
  return hasChinese && hasEnglish;
}

// ========== 4 维漂移检测函数 ==========

/**
 * 检测语言漂移（中→英）
 */
function checkLanguageDrift(node) {
  const outputKeys = extractAllKeys(node.output);
  const chineseKeys = outputKeys.filter((k) => /[\u4e00-\u9fff]/.test(k));
  const englishKeys = outputKeys.filter(
    (k) => /^[a-zA-Z_]/.test(k) && !/[\u4e00-\u9fff]/.test(k)
  );

  return {
    score: englishKeys.length > 0 ? 0 : 25,
    issue:
      englishKeys.length > 0
        ? `检测到 ${englishKeys.length} 个英文键名：${englishKeys.join(", ")}`
        : null,
    evidence: englishKeys,
  };
}

/**
 * 检测语义漂移（模型偏好键名）
 */
function checkSemanticDrift(node) {
  const modelPreferredKeys = [
    "name",
    "status",
    "id",
    "type",
    "result",
    "data",
    "content",
  ];
  const outputKeys = extractAllKeys(node.output);
  const hits = outputKeys.filter((k) =>
    modelPreferredKeys.includes(k.toLowerCase())
  );

  return {
    score: hits.length > 0 ? 0 : 25,
    issue:
      hits.length > 0
        ? `检测到模型偏好键名：${hits.join(", ")}（与用户定义 Schema 不符）`
        : null,
    evidence: hits,
  };
}

/**
 * 检测缩写漂移
 */
function checkAbbreviationDrift(node) {
  const outputKeys = extractAllKeys(node.output);
  const shortKeys = outputKeys.filter(
    (k) => k.length < 10 && /^[a-zA-Z_]+$/.test(k)
  );

  return {
    score: shortKeys.length > 0 ? 10 : 25,
    issue:
      shortKeys.length > 0
        ? `检测到疑似缩写键名：${shortKeys.join(", ")}`
        : null,
    evidence: shortKeys,
  };
}

/**
 * 检测层级漂移
 */
function checkHierarchyDrift(node) {
  const expectedDepth = getExpectedDepth(node.config?.schema);
  const actualDepth = getActualDepth(node.output);

  return {
    score: Math.abs(expectedDepth - actualDepth) > 1 ? 5 : 25,
    issue:
      Math.abs(expectedDepth - actualDepth) > 1
        ? `嵌套层级异常：预期 ${expectedDepth} 层，实际 ${actualDepth} 层`
        : null,
    evidence: { expected: expectedDepth, actual: actualDepth },
  };
}

// ========== 诊断信号库 ==========

/**
 * 获取诊断信号
 */
function getDriftSignals(node) {
  const outputKeys = extractAllKeys(node.output);
  const chineseKeys = outputKeys.filter((k) => /[\u4e00-\u9fff]/.test(k));
  const totalKeys = outputKeys.length;
  const chineseKeyRatio = totalKeys > 0 ? chineseKeys.length / totalKeys : 0;

  const modelPreferredKeys = [
    "name",
    "status",
    "id",
    "type",
    "result",
    "data",
    "content",
  ];

  return {
    // 信号 1：Token 长度预警
    tokenThreshold: (node.tokens || 0) > 3000,

    // 信号 2：键名语言不一致率
    chineseKeyRatio: chineseKeyRatio,
    anomaly: chineseKeyRatio < 0.8 && totalKeys > 10,

    // 信号 3：出现模型"偏好键名"
    hitModelPreferred: modelPreferredKeys.some((k) =>
      outputKeys.map((ok) => ok.toLowerCase()).includes(k)
    ),

    // 信号 4：同一对象内键名风格不一致
    mixedNaming: hasBothChineseAndEnglishKeys(outputKeys),

    // 信号 5：Schema 合规性（如果配置了 JSON Schema）
    schemaMismatch:
      node.config?.response_format?.type === "json_schema"
        ? "需要 Schema 验证"
        : null,
  };
}

// ========== 组合检测函数 ==========

/**
 * 执行完整漂移检测
 *
 * @param {Object} node - Dify 节点对象（需包含 output 字段）
 * @returns {Object} 检测结果
 */
function runDriftDetection(node) {
  if (!node || !node.output) {
    return {
      error: "输入节点缺少 output 字段",
      totalScore: 0,
    };
  }

  const driftDiagnosis = {
    language_drift: checkLanguageDrift(node),
    semantic_drift: checkSemanticDrift(node),
    abbreviation_drift: checkAbbreviationDrift(node),
    hierarchy_drift: checkHierarchyDrift(node),
  };

  const totalScore = Object.values(driftDiagnosis).reduce(
    (sum, d) => sum + d.score,
    0
  );

  const signals = getDriftSignals(node);

  return {
    totalScore,
    maxScore: 100,
    diagnosis: driftDiagnosis,
    signals,
    primaryIssue: getPrimaryIssue(driftDiagnosis),
  };
}

/**
 * 获取主要问题描述
 */
function getPrimaryIssue(diagnosis) {
  const issues = Object.values(diagnosis)
    .filter((d) => d.issue)
    .map((d) => d.issue);
  return issues.length > 0 ? issues[0] : "未检测到明显漂移";
}

// ========== Dify 代码节点入口函数 ==========

/**
 * Dify 代码节点入口函数
 *
 * 输入参数：
 *   - node: Object (required) - 包含 output 和可选 config 的节点对象
 *
 * 输出参数：
 *   - totalScore: number - 总分（0-100）
 *   - diagnosis: Object - 4维检测结果
 *   - signals: Object - 诊断信号
 *   - primaryIssue: string - 主要问题
 *   - error: string - 错误信息（失败时）
 */
function main({ node }) {
  const result = runDriftDetection(node);

  if (result.error) {
    return { error: result.error };
  }

  return {
    totalScore: result.totalScore,
    maxScore: result.maxScore,
    diagnosis: result.diagnosis,
    signals: result.signals,
    primaryIssue: result.primaryIssue,
  };
}

// ========== 导出（如果在模块化环境中使用）==========
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    extractAllKeys,
    getActualDepth,
    getExpectedDepth,
    hasBothChineseAndEnglishKeys,
    checkLanguageDrift,
    checkSemanticDrift,
    checkAbbreviationDrift,
    checkHierarchyDrift,
    getDriftSignals,
    runDriftDetection,
    getPrimaryIssue,
  };
}

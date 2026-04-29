/**
 * JSON Repair Snippets - Dify 代码节点用
 * 
 * 用途：处理 Dify 工作流中常见的 JSON 格式问题
 * 适用场景：LLM 输出 JSON 格式异常（分号、尾随逗号、单引号、think 标签污染等）
 * 兼容性：Dify v1.x 代码节点
 * 
 * 使用说明：
 * 1. 按需复制对应函数到 Dify 代码节点
 * 2. 或使用 comprehensiveJsonRepair 进行组合修复
 * 3. 生产环境建议启用 safeMode（只做清理不做修复）
 * 
 * 安全提示：
 * - 本脚本仅做文本处理，不发起网络请求
 * - safeMode=true 时只做清理不做正则修复，降低误修复风险
 * - 正则修复（分号、单引号等）有极小概率误修复字符串内的字符
 * - 建议先在测试环境验证修复效果后再用于生产
 */

// ========== 修复 1: 分号代替逗号 ==========
/**
 * 将 JSON 中的分号替换为逗号
 * 风险：可能误修复字符串内的分号（如 "key: value; more"）
 * 建议：safeMode 为 true 时跳过此修复
 */
function fixSemicolons(jsonStr) {
  return jsonStr.replace(/;(?=\s*["}\]])/g, ",");
}

// ========== 修复 2: 尾随逗号 ==========
/**
 * 去除 JSON 中的尾随逗号
 * 风险：极低，因为正则匹配 }, 或 ] 前的逗号
 */
function fixTrailingCommas(jsonStr) {
  return jsonStr.replace(/,(\s*[}\]])/g, "$1");
}

// ========== 修复 3: 单引号改双引号 ==========
/**
 * 将 JSON 中的单引号替换为双引号
 * 风险：可能误修复字符串内的单引号（如 "It's ok"）
 * 建议：safeMode 为 true 时跳过此修复
 */
function fixSingleQuotes(jsonStr) {
  return jsonStr.replace(/'([^']*)'/g, '"$1"');
}

// ========== 修复 4: 去除注释 ==========
/**
 * 去除 JSON 中的 // 和 /* 注释
 * 风险：极低，注释在标准 JSON 中本来就不应该出现
 */
function removeComments(jsonStr) {
  return jsonStr.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// ========== 修复 5: 提取第一个有效 JSON ==========
/**
 * 从文本中提取第一个 {} 包裹的 JSON 对象
 * 风险：可能提取到不完整或嵌套错误的对象
 * 建议：提取后仍然需要 JSON.parse 验证
 */
function extractFirstJson(text) {
  const match = text.match(/\{[\s\S]*?\}(?=\s*$|\s*[,\]})/);
  return match ? match[0] : null;
}

// ========== 修复 6: 键名规范化 ==========
/**
 * 将英文键名映射为中文键名
 * 
 * @param {Object} obj - 要规范化的对象
 * @param {Object} keyMap - 自定义映射表（可选，默认使用常见字段映射）
 * @returns {Object} 规范化后的对象
 * 
 * 说明：
 * - 默认映射表覆盖常见字段，如 platform_name → 平台名称
 * - 建议传入自定义 keyMap 以匹配业务字段
 * - 未匹配的键名保持原样
 */
function normalizeChineseKeys(obj, keyMap) {
  // 默认映射表（可覆盖）
  const defaultMap = {
    "platform_name": "平台名称",
    "entity_name": "实体名称",
    "indicator_comparison_details": "指标对比详情",
    "external_entity": "外部实体",
    "internal_entity": "内部实体"
  };
  
  const map = keyMap || defaultMap;
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeChineseKeys(item, map));
  }
  
  if (typeof obj === "object" && obj !== null) {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = map[key] || key;
      normalized[normalizedKey] = normalizeChineseKeys(value, map);
    }
    return normalized;
  }
  
  return obj;
}

// ========== 组合修复函数 ==========
/**
 * 综合 JSON 修复函数
 * 
 * @param {string} text - 原始文本（可能包含 think 标签、markdown 等）
 * @param {Object} options - 配置选项
 * @param {boolean} options.safeMode - 安全模式（默认 false）
 *   - true: 只做清理（think 标签、markdown），不做正则修复
 *   - false: 清理 + 所有正则修复
 * @param {Object} options.customKeyMap - 自定义键名映射表（传递给 normalizeChineseKeys）
 * @returns {Object|null} 解析后的对象，或 null（解析失败）
 * 
 * 安全建议：
 * - 生产环境建议 safeMode=true，在 Dify 工作流中增加人工审核节点
 * - 如需自动修复，先测试验证修复效果
 */
function comprehensiveJsonRepair(text, options = {}) {
  const { safeMode = false, customKeyMap = null } = options;
  
  if (!text) return null;
  
  let str = text;
  
  // Step 1: 清理 think 标签（安全，无风险）
  if (str.includes("<think>")) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // Step 2: 清理 markdown（安全，无风险）
  str = str.replace(/```json/g, "").replace(/```/g, "");
  
  // Step 3: 提取 JSON（安全，只是提取）
  const jsonStr = extractFirstJson(str);
  if (!jsonStr) return null;
  
  // Step 4: 应用修复（safeMode=true 时跳过）
  let fixed = jsonStr;
  if (!safeMode) {
    fixed = fixSemicolons(fixed);
    fixed = fixTrailingCommas(fixed);
    fixed = fixSingleQuotes(fixed);
    fixed = removeComments(fixed);
  }
  
  // Step 5: 解析并规范化键名
  try {
    const parsed = JSON.parse(fixed);
    return normalizeChineseKeys(parsed, customKeyMap);
  } catch (e) {
    console.error("JSON 修复后仍无法解析:", e.message);
    return null;
  }
}

// ========== Dify 代码节点入口函数 ==========
/**
 * Dify 代码节点入口函数
 * 
 * 输入参数：
 *   - text: string (required) - LLM 原始输出文本
 *   - safeMode: boolean (optional) - 是否启用安全模式，默认 false
 *   - customKeyMap: Object (optional) - 自定义键名映射表
 * 
 * 输出参数：
 *   - result: Object - 修复后的 JSON 对象（成功时）
 *   - error: string - 错误信息（失败时）
 *   - repairApplied: boolean - 是否应用了修复（调试用）
 */
function main({text, safeMode = false, customKeyMap = null}) {
  const result = comprehensiveJsonRepair(text, { safeMode, customKeyMap });
  
  if (!result) {
    return { 
      error: "无法修复 JSON，原始内容: " + (text ? text.substring(0, 200) : "空"),
      repairApplied: !safeMode
    };
  }
  
  return { result, repairApplied: !safeMode };
}

// ========== 导出（如果在模块化环境中使用）==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fixSemicolons,
    fixTrailingCommas,
    fixSingleQuotes,
    removeComments,
    extractFirstJson,
    normalizeChineseKeys,
    comprehensiveJsonRepair
  };
}
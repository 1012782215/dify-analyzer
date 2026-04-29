/**
 * Think Tag Cleaner - Dify 代码节点用
 * 
 * 用途：清理 LLM 输出的 think 标签，提取有效 JSON
 * 适用场景：Qwen3/DeepSeek 等 thinking 模型输出被 think 标签污染
 * 兼容性：Dify v1.x 代码节点（Python/Node.js 执行环境）
 * 
 * 使用说明：
 * 1. 复制对应 function main({text}) 到 Dify 代码节点
 * 2. 输入参数名：text（LLM 原始输出）
 * 3. 输出参数名：result（解析后的 JSON 对象）或 error（错误信息）
 * 
 * 安全提示：
 * - 本脚本仅做文本清理和 JSON 解析，不发起网络请求
 * - 如 JSON 解析失败，返回 error 字段而非抛出异常，避免工作流中断
 */

// ========== 方案 1: 基础清理（推荐，生产环境使用） ==========
/**
 * 基础清理方案
 * - 移除 think 标签（<think>...</think>）
 * - 清理 markdown 代码块标记
 * - 解析 JSON
 * - 失败时返回 error 字段，不中断工作流
 */
function main({text}) {
  if (!text) {
    return { error: "输入为空" };
  }
  
  let str = text;
  
  // 移除 think 标签（兼容大小写）
  if (str.includes("<think>")) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // 清理 markdown 代码块标记
  str = str.replace(/```json/g, "").replace(/```/g, "");
  
  // 清理换行和首尾空格
  str = str.replace(/\n/g, "").trim();
  
  // 尝试解析 JSON
  try {
    const result = JSON.parse(str);
    return { result };
  } catch (e) {
    // 返回错误信息而非抛出，避免工作流中断
    return { 
      error: "JSON 解析失败: " + e.message,
      cleanedText: str.substring(0, 200)  // 返回清理后的前200字符供调试
    };
  }
}

// ========== 方案 2: 调试版（诊断用，开发环境使用） ==========
/**
 * 调试版方案
 * - 保留诊断信息，便于定位问题
 * - 识别 4 种空输出类型（与 SKILL.md Phase 2.4 一致）
 * - 失败时返回详细的 diagnosis 对象
 */
function mainDebug({text}) {
  const diagnosis = {
    // 输入特征
    rawLength: text ? text.length : 0,
    hasThink: text ? text.includes("<think>") : false,
    hasCloseThink: text ? text.includes("</think>") : false,
    
    // 清理后特征
    afterThinkLength: 0,
    cleanedLength: 0,
    
    // 诊断结论
    emptyType: "UNKNOWN",
    parseSuccess: false,
    error: null
  };
  
  if (!text) {
    diagnosis.emptyType = "A_COMPLETELY_EMPTY";
    diagnosis.error = "输入为空";
    return { diagnosis, error: "输入为空" };
  }
  
  let str = text;
  
  // 检测 think 标签
  if (str.includes("<think>")) {
    const afterThink = str.split("</think>").pop() || "";
    diagnosis.afterThinkLength = afterThink.length;
    
    // 判断空输出类型
    if (!afterThink || afterThink.trim() === "") {
      diagnosis.emptyType = "B_THINK_THEN_EMPTY";
    } else if (afterThink.trim().startsWith("{") && !afterThink.trim().endsWith("}")) {
      diagnosis.emptyType = "C_JSON_TRUNCATED";
    } else if (str.match(/<think>[\s\S]*?<\/think>/)?.[0]?.includes("{")) {
      diagnosis.emptyType = "D_JSON_INSIDE_THINK";
    }
    
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  }
  
  // 清理 markdown
  str = str.replace(/```json/g, "").replace(/```/g, "").replace(/\n/g, "").trim();
  diagnosis.cleanedLength = str.length;
  
  if (!str) {
    diagnosis.emptyType = diagnosis.emptyType === "UNKNOWN" ? "B_THINK_THEN_EMPTY" : diagnosis.emptyType;
    diagnosis.error = "清理后内容为空";
    return { diagnosis, error: "清理后内容为空" };
  }
  
  // 尝试解析 JSON
  try {
    const result = JSON.parse(str);
    diagnosis.emptyType = "OK";
    diagnosis.parseSuccess = true;
    return { diagnosis, result };
  } catch (e) {
    diagnosis.emptyType = "PARSE_ERROR";
    diagnosis.error = e.message;
    return { 
      diagnosis, 
      error: e.message, 
      cleanedText: str.substring(0, 200) 
    };
  }
}

// ========== 使用建议 ==========
/**
 * 如何选择方案：
 * 
 * 生产环境 → 方案 1 (main)
 *   - 简洁，只返回 result 或 error
 *   - 不暴露内部诊断信息
 *   - 失败时工作流可继续（通过判断 error 字段）
 * 
 * 开发调试 → 方案 2 (mainDebug)
 *   - 返回完整的 diagnosis 对象
 *   - 可识别 4 种空输出类型
 *   - 便于定位是哪种 thinking 污染
 * 
 * 注意事项：
 *   1. 如果 LLM 输出被 markdown 代码块包裹（```json ... ```），本脚本会自动清理
 *   2. 如果 JSON 被截断（类型 C），本脚本无法修复，需要增加 max_tokens
 *   3. 对于类型 D（JSON 在 think 内），需要配合 json-repair-snippets.js 的 extractFirstJson
 */
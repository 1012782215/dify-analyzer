# Node.js 环境可用性检查

> 当 skill 工具（如 skill 加载器、浏览器自动化）不可用时执行。
> 覆盖多种版本管理器、平台差异、项目级版本声明。

---

## 检测范围

| 层级 | 检测内容 |
|------|---------|
| L1 | 基础 Node.js 是否可用 |
| L2 | 版本管理器（nvm/nvm-windows/n/fnm/Volta）|
| L3 | 项目级版本声明（.nvmrc/.node-version/package.json）|
| L4 | 相关环境变量 |
| L5 | 平台特定警告（Windows 权限等）|

---

## 分层检测逻辑

```javascript
function checkNodeEnvironment() {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  const platform = os.platform(); // 'win32' | 'darwin' | 'linux'
  
  const result = {
    platform,
    nodeVersion: null,
    nodeAvailable: false,
    versionManager: null,
    projectVersion: null,
    envVars: {},
    errors: [],
    warnings: []
  };
  
  // L1: 基础 Node.js 检测 + 版本要求（Playwright MCP 需要 >= 18）
  try {
    result.nodeVersion = execSync('node -v', { encoding: 'utf8', timeout: 5000 }).trim();
    const major = parseInt(result.nodeVersion.replace(/^v/, '').split('.')[0], 10);
    if (major >= 18) {
      result.nodeAvailable = true;
    } else {
      result.errors.push({
        level: 'L1',
        msg: `Node.js 版本过低：${result.nodeVersion}（需要 >= 18）`,
        detail: 'Playwright MCP 要求 Node.js 18 或更高版本'
      });
    }
  } catch (e) {
    result.errors.push({ level: 'L1', msg: 'node 命令不可用', detail: e.message });
  }
  
  // L2: 版本管理器检测（按优先级）
  const managers = [
    { name: 'nvm-sh', check: () => {
      try { return { current: execSync('nvm current', { encoding: 'utf8' }).trim(), list: execSync('nvm list', { encoding: 'utf8' }) }; }
      catch (e) { return null; }
    }},
    { name: 'nvm-windows', check: () => {
      try { return { current: execSync('nvm current', { encoding: 'utf8' }).trim(), list: execSync('nvm list', { encoding: 'utf8' }) }; }
      catch (e) { return null; }
    }},
    { name: 'fnm', check: () => {
      try { return { current: execSync('fnm current', { encoding: 'utf8' }).trim(), list: execSync('fnm list', { encoding: 'utf8' }) }; }
      catch (e) { return null; }
    }},
    { name: 'n', check: () => {
      try { return { current: execSync('n --version', { encoding: 'utf8' }).trim(), bin: execSync('which n', { encoding: 'utf8' }).trim() }; }
      catch (e) { return null; }
    }},
    { name: 'Volta', check: () => {
      try { return { current: execSync('volta --version', { encoding: 'utf8' }).trim(), node: execSync('volta which node', { encoding: 'utf8' }).trim() }; }
      catch (e) { return null; }
    }}
  ];
  
  for (const mgr of managers) {
    const info = mgr.check();
    if (info) {
      result.versionManager = { name: mgr.name, ...info };
      break;
    }
  }
  
  // L3: 项目级版本声明检测
  const versionFiles = [
    { file: '.nvmrc', read: (p) => fs.readFileSync(p, 'utf8').trim() },
    { file: '.node-version', read: (p) => fs.readFileSync(p, 'utf8').trim() },
    { file: 'package.json', read: (p) => {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      return pkg.engines?.node || null;
    }}
  ];
  
  let searchDir = process.cwd();
  while (searchDir !== path.dirname(searchDir)) {
    for (const vf of versionFiles) {
      const vfPath = path.join(searchDir, vf.file);
      if (fs.existsSync(vfPath)) {
        try {
          result.projectVersion = { source: vf.file, version: vf.read(vfPath), path: vfPath };
          break;
        } catch (e) { /* ignore */ }
      }
    }
    if (result.projectVersion) break;
    searchDir = path.dirname(searchDir);
  }
  
  // L4: 环境变量检测
  const envKeys = ['NODE_VERSION', 'N_PREFIX', 'NVM_DIR', 'FNM_DIR', 'VOLTA_HOME', 'NODIST_NODE_VERSION'];
  for (const key of envKeys) {
    if (process.env[key]) result.envVars[key] = process.env[key];
  }
  
  // L5: 平台特定警告
  if (platform === 'win32' && result.versionManager?.name === 'nvm-windows') {
    result.warnings.push('Windows 下 nvm use 可能需要管理员权限（创建符号链接）');
  }
  
  return result;
}
```

---

## 诊断报告生成

```javascript
function generateEnvReport(checkResult) {
  const lines = [];
  
  lines.push('⚠️ 工具不可用 - Node.js 环境异常');
  lines.push(`运行平台：${checkResult.platform}`);
  
  if (checkResult.nodeAvailable) {
    lines.push(`✅ Node.js 可用：${checkResult.nodeVersion}`);
  } else {
    lines.push(`❌ Node.js 不可用`);
  }
  
  // 检查版本过低错误
  const versionError = checkResult.errors.find(e => e.msg.includes('版本过低'));
  if (versionError) {
    lines.push(`❌ ${versionError.msg}`);
    lines.push(`   说明：${versionError.detail}`);
  }
  
  if (checkResult.versionManager) {
    lines.push(`📦 版本管理器：${checkResult.versionManager.name}`);
    lines.push(`   当前版本：${checkResult.versionManager.current}`);
  } else {
    lines.push(`📦 未检测到版本管理器`);
  }
  
  if (checkResult.projectVersion) {
    lines.push(`📄 项目声明版本：${checkResult.projectVersion.version}（来源：${checkResult.projectVersion.source}）`);
  }
  
  if (Object.keys(checkResult.envVars).length > 0) {
    lines.push(`🔧 环境变量：`);
    for (const [k, v] of Object.entries(checkResult.envVars)) {
      lines.push(`   ${k}=${v}`);
    }
  }
  
  if (checkResult.warnings.length > 0) {
    lines.push(`⚡ 注意：`);
    for (const w of checkResult.warnings) lines.push(`   - ${w}`);
  }
  
  // 针对性建议
  const hasVersionError = checkResult.errors.some(e => e.msg.includes('版本过低'));
  if (hasVersionError) {
    lines.push(`建议操作：`);
    lines.push(`  1. 升级 Node.js 到 18+（推荐 18.x LTS 或 20.x LTS）`);
    if (checkResult.versionManager) {
      lines.push(`  2. 使用版本管理器切换：`);
      lines.push(`     ${checkResult.versionManager.name} install 18`);
      lines.push(`     ${checkResult.versionManager.name} use 18`);
    } else {
      lines.push(`  2. 访问 https://nodejs.org/ 下载最新 LTS 版本`);
    }
    lines.push(`  3. 升级后重新启动终端，验证：node -v`);
    lines.push(`  4. 如无法升级，请切换到手动模式（复制日志内容分析）`);
  } else {
    lines.push(`建议操作：检查 Node.js 安装或切换正确版本后重试`);
  }
  
  return lines.join('\n');
}
```

---

## 触发条件

```javascript
const envCheck = checkNodeEnvironment();
if (!envCheck.nodeAvailable || isToolUnavailable()) {
  const report = generateEnvReport(envCheck);
  return { type: 'nodejs_env_error', report };
}
```

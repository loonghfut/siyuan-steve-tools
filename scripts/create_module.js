/*
 * 新模块模板快速生成脚本
 * 用法示例:
 *   pnpm create-module demo
 *   pnpm create-module demo --displayName "演示" --setting-key demo-enable --log "演示模块加载"
 *
 * 生成内容:
 * 1. src/<name>/module-<name>.ts 模板文件
 * 2. src/settings/<name>.ts 创建默认设置+分组（可用 --no-settings 跳过）
 * 3. 自动修改 src/settings/index.ts: 引入并插入 <name>Group
 * 4. 自动修改 src/setting_data.ts: 引入并合并 <name>Defaults
 * 5. 自动修改 src/modules.config.ts:
 *    - 添加 import { M_<Name> } from "./<name>/module-<name>";
 *    - 在 MODULE_CONFIG 中追加配置
 *    - 在 ModuleClasses 中追加类型声明
 *
 * 注意:
 *  - <Name> 采用首字母大写驼峰, 类名/配置键为 M_<Name>
 *  - settingKey 默认: <name>-enable
 *  - 可选参数:
 *      --no-settings        不生成 settings 模块
 *      --group-name 名称     设置分组显示名称 (默认=displayName)
 *      --setting-default v   默认值 (true/false/数字/字符串)
 */
import fs from 'fs';
import path from 'node:path';
import process from 'node:process';

function exit(msg) {
  console.error(msg);
  process.exit(1);
}

// -------- 参数解析 --------
const args = process.argv.slice(2);
if (args.length === 0 || ["-h", "--help"].includes(args[0])) {
  console.log(`用法: pnpm create-module <name> [--displayName 名称] [--setting-key key] [--log 消息]\n`);
  process.exit(0);
}

function parseKV(argv) {
  const kv = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        kv[key] = val;
        i++;
      } else {
        kv[key] = 'true';
      }
    }
  }
  return kv;
}

const nameRaw = args[0];
const opts = parseKV(args.slice(1));

// 目录名全部小写
const dirName = nameRaw.toLowerCase();
// 模块内部逻辑名: 首字母大写驼峰
const camelName = dirName
  .split(/[-_]/)
  .filter(Boolean)
  .map(s => s.charAt(0).toUpperCase() + s.slice(1))
  .join('');
// 类名/配置键
const className = `M_${camelName}`;

const displayName = opts.displayName || camelName;
const settingKey = opts['setting-key'] || `${dirName}-enable`;
const groupName = opts['group-name'] || displayName;
const settingDefaultRaw = opts['setting-default'];
let settingDefault;
if (settingDefaultRaw === undefined) settingDefault = false; else if (["true","false"].includes(settingDefaultRaw)) settingDefault = settingDefaultRaw === 'true'; else if (!isNaN(Number(settingDefaultRaw))) settingDefault = Number(settingDefaultRaw); else settingDefault = settingDefaultRaw;
const logMessage = opts.log || `${displayName}模块加载`;
const noSettings = !!opts['no-settings'];

// 路径
const root = process.cwd();
const srcDir = path.join(root, 'src');
const moduleDir = path.join(srcDir, dirName);
const moduleFile = path.join(moduleDir, `module-${dirName}.ts`);
const modulesConfigFile = path.join(srcDir, 'modules.config.ts');
const settingsDir = path.join(srcDir, 'settings');
const settingsIndexFile = path.join(settingsDir, 'index.ts');
const settingDataFile = path.join(srcDir, 'setting_data.ts');
const moduleSettingsFile = path.join(settingsDir, `${dirName}.ts`);

if (!fs.existsSync(srcDir)) exit('未找到 src 目录, 请在项目根目录执行。');
if (!fs.existsSync(modulesConfigFile)) exit('未找到 src/modules.config.ts');
if (fs.existsSync(moduleFile)) exit(`目标文件已存在: ${moduleFile}`);
if (!fs.existsSync(settingsDir)) exit('未找到 src/settings 目录');
if (!noSettings && fs.existsSync(moduleSettingsFile)) exit(`settings 已存在: ${moduleSettingsFile}`);

// -------- 1. 创建目录与模板文件 --------
fs.mkdirSync(moduleDir, { recursive: true });

const template = `import steveTools from "@/index";

// ${displayName} 模块
export class ${className} {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("${displayName} 模块初始化");
        // 示例: 根据设置添加一个顶部按钮
        // this.plugin.addTopBar({
        //   icon: "iconInfo",
        //   title: "${displayName}",
        //   position: "left",
        //   callback: () => { console.log("${displayName} clicked"); }
        // });
    }

    onunload() {
        console.log("${className} unloaded");
    }
}
`;
fs.writeFileSync(moduleFile, template, 'utf8');
console.log(`已创建模块模板: ${moduleFile}`);

// -------- 1.1 创建 settings/<name>.ts --------
if (!noSettings) {
  const settingsTemplate = `import type { SettingGroupDefinition, BuildContext } from "./types";

// ${displayName} 设置默认值
export const ${dirName}Defaults: Record<string, any> = {
    "${settingKey}": ${JSON.stringify(settingDefault)},
};

export const ${dirName}Group = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "${groupName}",
    items: [
        { type: "checkbox", title: "启用${displayName}", description: "启用后再进行下面的设置", key: "${settingKey}", value: ctx.settings["${settingKey}"] },
    ]
});
`;
  fs.writeFileSync(moduleSettingsFile, settingsTemplate, 'utf8');
  console.log(`已创建设置模板: ${moduleSettingsFile}`);
}

// -------- 2. 修改 modules.config.ts --------
let content = fs.readFileSync(modulesConfigFile, 'utf8');

// 2.1 添加 import (放在最后一个 import 之后)
const importLine = `import { ${className} } from "./${dirName}/module-${dirName}";`;
if (content.includes(importLine)) {
  console.log('modules.config.ts 已包含对应 import, 跳过。');
} else {
  // 找到最后一个 import 语句的位置
  const importRegex = /^(import .*?;\s*)+/s; // 匹配文件开头连续的 import
  const match = content.match(importRegex);
  if (match) {
    const last = match[0];
    content = content.replace(last, last + importLine + '\n');
  } else {
    content = importLine + '\n' + content;
  }
}

// 2.2 在 MODULE_CONFIG 中插入配置
// 匹配 export const MODULE_CONFIG: ModuleConfig = { ... };
const moduleConfigStart = content.indexOf('export const MODULE_CONFIG');
if (moduleConfigStart === -1) exit('未找到 MODULE_CONFIG 定义');

// 简单寻找对应的结束 `};` (从起始位置往后找第一个以 `};` 结束的行)
let insertPos = -1;
const lines = content.split(/\n/);
let braceDepth = 0;
let inside = false;
for (let i = 0; i < lines.length; i++) {
  if (!inside && lines[i].includes('export const MODULE_CONFIG')) inside = true;
  if (inside) {
    if (lines[i].includes('{')) braceDepth += (lines[i].match(/{/g) || []).length;
    if (lines[i].includes('}')) braceDepth -= (lines[i].match(/}/g) || []).length;
    if (braceDepth === 0 && lines[i].trim().startsWith('};')) { // 找到终点前一行插入
      insertPos = i;
      break;
    }
  }
}
if (insertPos === -1) exit('解析 MODULE_CONFIG 失败');

// 检查是否已存在重复键
if (content.includes(`${className}: {`)) {
  console.log('MODULE_CONFIG 已存在同名配置, 跳过。');
} else {
  const configBlock = `    ${className}: {\n        class: ${className},\n        name: '${className}',\n        settingKey: '${settingKey}',\n        logMessage: '${logMessage}'\n    },\n`;
  lines.splice(insertPos, 0, configBlock);
  content = lines.join('\n');
}

// 2.3 在 ModuleClasses 类型中添加声明
const typeStart = content.indexOf('export type ModuleClasses');
if (typeStart === -1) exit('未找到 ModuleClasses 定义');
let typeInsertPos = -1;
const lines2 = content.split(/\n/);
let typeBrace = 0, typeInside = false;
for (let i = 0; i < lines2.length; i++) {
  if (!typeInside && lines2[i].includes('export type ModuleClasses')) typeInside = true;
  if (typeInside) {
    if (lines2[i].includes('{')) typeBrace += (lines2[i].match(/{/g) || []).length;
    if (lines2[i].includes('}')) typeBrace -= (lines2[i].match(/}/g) || []).length;
    if (typeBrace === 0 && lines2[i].trim().startsWith('};')) {
      typeInsertPos = i;
      break;
    }
  }
}
if (typeInsertPos === -1) exit('解析 ModuleClasses 失败');

if (!content.includes(`${className}?: ${className};`)) {
  lines2.splice(typeInsertPos, 0, `    ${className}?: ${className};`);
  content = lines2.join('\n');
}

fs.writeFileSync(modulesConfigFile, content, 'utf8');
console.log('已更新: src/modules.config.ts');

// -------- 3. 更新 settings/index.ts --------
if (!noSettings) {
  if (!fs.existsSync(settingsIndexFile)) {
    console.warn('跳过: 未找到 settings/index.ts');
  } else {
    let sIndex = fs.readFileSync(settingsIndexFile, 'utf8');
    const groupImport = `import { ${dirName}Group } from "./${dirName}";`;
    if (!sIndex.includes(groupImport)) {
      // 插入 import 在最后一个 import 后
      const importRegex2 = /^(import .*?;\s*)+/s;
      const m2 = sIndex.match(importRegex2);
      if (m2) sIndex = sIndex.replace(m2[0], m2[0] + groupImport + '\n'); else sIndex = groupImport + '\n' + sIndex;
    }
    // 插入 group 调用
    const buildArrRegex = /buildSettingGroups\([^)]*\)\s*:\s*SettingGroupDefinition\[]\s*{\s*return\s*\[([\s\S]*?)\];/;
    const arrMatch = sIndex.match(buildArrRegex);
    if (arrMatch && !arrMatch[1].includes(`${dirName}Group(ctx)`)) {
      if (arrMatch[1].includes('commonGroup(ctx)')) {
        sIndex = sIndex.replace('commonGroup(ctx),', `${dirName}Group(ctx),\n    commonGroup(ctx),`);
      } else {
        sIndex = sIndex.replace(/return \[/, `return [\n    ${dirName}Group(ctx),`);
      }
    }
    fs.writeFileSync(settingsIndexFile, sIndex, 'utf8');
    console.log('已更新: src/settings/index.ts');
  }
}

// -------- 4. 更新 setting_data.ts 合并 defaults --------
if (!noSettings) {
  if (!fs.existsSync(settingDataFile)) {
    console.warn('跳过: 未找到 setting_data.ts');
  } else {
    let sd = fs.readFileSync(settingDataFile, 'utf8');
    const defaultsImport = `import { ${dirName}Defaults } from "./settings/${dirName}";`;
    if (!sd.includes(defaultsImport)) {
      // 在其它 Defaults import 之后追加
      const importBlockRegex = /(import .*Defaults.*;\s*)+/;
      const allImportsRegex = /^(import .*?;\s*)+/s;
      if (importBlockRegex.test(sd)) sd = sd.replace(importBlockRegex, m => m + defaultsImport + '\n');
      else if (allImportsRegex.test(sd)) sd = sd.replace(allImportsRegex, m => m + defaultsImport + '\n');
      else sd = defaultsImport + '\n' + sd;
    }
    if (!sd.includes(`...${dirName}Defaults`)) {
      // 在 defaultSettings 展开末尾（commonDefaults 后）插入
      const spreadTargetRegex = /export const defaultSettings:[^{]*{[\s\S]*?\.\.\.commonDefaults,?/;
      if (spreadTargetRegex.test(sd)) {
        sd = sd.replace(spreadTargetRegex, m => m + `\n    ...${dirName}Defaults,`);
      } else {
        // 退化策略: 在 defaultSettings { 后立即插入
        sd = sd.replace(/export const defaultSettings:[^{]*{/, x => x + `\n    ...${dirName}Defaults,`);
      }
    }
    fs.writeFileSync(settingDataFile, sd, 'utf8');
    console.log('已更新: src/setting_data.ts');
  }
}

console.log('\n创建完成!');
console.log(`类名: ${className}`);
console.log(`目录: src/${dirName}`);
console.log(`settingKey: ${settingKey}`);
if (noSettings) {
  console.log('\n(已使用 --no-settings, 未生成 settings 相关文件及引用)');
  console.log('\n下一步:');
  console.log('1. 如需设置界面, 手动在 src/settings 下创建对应文件并在 index.ts 引入');
} else {
  console.log('\n下一步:');
  console.log('1. 若需更多设置项, 修改: src/settings/${dirName}.ts');
}
console.log('2. 在插件初始化逻辑里根据 settingdata[settingKey] 条件调用模块 init');
console.log('3. 编写模块功能代码');

/*
 * 新模块模板快速生成脚本
 * 用法示例:
 *   pnpm create-module demo
 *   pnpm create-module demo --displayName "演示" --setting-key demo-enable --log "演示模块加载"
 *
 * 生成内容:
 * 1. src/<name>/module-<name>.ts 模板文件
 * 2. 自动修改 src/modules.config.ts:
 *    - 添加 import { M_<Name> } from "./<name>/module-<name>";
 *    - 在 MODULE_CONFIG 中追加配置
 *    - 在 ModuleClasses 中追加类型声明
 *
 * 注意:
 *  - <Name> 采用首字母大写驼峰, 类名/配置键为 M_<Name>
 *  - settingKey 默认: <name>-enable
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
const logMessage = opts.log || `${displayName}模块加载`;

// 路径
const root = process.cwd();
const srcDir = path.join(root, 'src');
const moduleDir = path.join(srcDir, dirName);
const moduleFile = path.join(moduleDir, `module-${dirName}.ts`);
const modulesConfigFile = path.join(srcDir, 'modules.config.ts');

if (!fs.existsSync(srcDir)) exit('未找到 src 目录, 请在项目根目录执行。');
if (!fs.existsSync(modulesConfigFile)) exit('未找到 src/modules.config.ts');
if (fs.existsSync(moduleFile)) exit(`目标文件已存在: ${moduleFile}`);

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

console.log('\n创建完成!');
console.log(`类名: ${className}`);
console.log(`目录: src/${dirName}`);
console.log(`settingKey: ${settingKey}`);
console.log('\n下一步:');
console.log('1. 在设置界面增加对应的开关项 (若需要)');
console.log('2. 在插件初始化逻辑里根据 settingdata[settingKey] 条件调用模块 init');
console.log('3. 编写模块功能代码');

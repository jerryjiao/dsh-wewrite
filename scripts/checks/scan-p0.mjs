#!/usr/bin/env node
/**
 * P0 视觉门禁扫描器（无第三方依赖，Node >= 22）。
 *
 * 规则来源：AGENTS.md P0 视觉门禁 + docs/spec.md AC-14：
 *   R1 禁 emoji 作功能图标（范围 U+1F300-U+1F9FF / U+2600-U+26FF / U+2700-U+27BF）
 *      豁免：行内带 "preview-ugc" 标记（微信预览画布 UGC 内容区的注释标记）
 *   R2 禁紫->粉渐变主视觉（linear-gradient 行内出现 #7C3AED/#A855F7/#EC4899/#6366F1 之一）
 *   R3 禁 AI 模板味占位（Lorem ipsum / "Welcome to" / TODO 占位注释）
 *      豁免：行内带 "p0-allow:rule-quote" 标记（规范文档禁令条文自引用禁词的显式豁免）
 *
 * 用法：
 *   node scripts/checks/scan-p0.mjs                 # 扫 src/**\/*.{ts,tsx,css} + docs/DESIGN.md
 *   node scripts/checks/scan-p0.mjs --paths A B C   # 显式扫描文件或目录（自测/定向扫描）
 *
 * 退出码：0 = 无违规；1 = 存在违规（CI 门禁语义）。
 * 检测器自身文件在本脚本同目录，被显式白名单（规则定义包含被检测字面量）。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = resolve(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');

const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const GRADIENT_PATTERN = /linear-gradient/i;
const PURPLE_PINK_HEX = ['#7C3AED', '#A855F7', '#EC4899', '#6366F1'];
const PLACEHOLDER_PATTERNS = [
  { pattern: /lorem ipsum/i, label: 'AI 模板味占位文案 Lorem ipsum' },
  { pattern: /welcome to/i, label: 'AI 模板味占位文案 Welcome to' },
  { pattern: /\bTODO\b/, label: 'TODO 占位注释' },
];
const UGC_WHITELIST_MARK = 'preview-ugc';
const RULE_QUOTE_WHITELIST_MARK = 'p0-allow:rule-quote';

const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'coverage', '.git']);

function listFiles(target) {
  const absolute = resolve(target);
  if (!existsSync(absolute)) return [];
  const stats = statSync(absolute);
  if (stats.isFile()) return [absolute];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (TARGET_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(full);
      }
    }
  };
  walk(absolute);
  return files;
}

function scanFile(file) {
  const violations = [];
  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const relativePath = relative(PROJECT_ROOT, file);
    const displayPath = relativePath.startsWith('..') ? file : relativePath;
    const where = `${displayPath}:${lineNumber}`;

    const whitelisted = line.includes(UGC_WHITELIST_MARK);
    if (!whitelisted && EMOJI_PATTERN.test(line)) {
      violations.push(`${where}: [R1 emoji] 禁止 emoji 作功能图标（图标统一 lucide-react SVG 库）`);
    }

    if (GRADIENT_PATTERN.test(line)) {
      const lower = line.toLowerCase();
      if (PURPLE_PINK_HEX.some((hex) => lower.includes(hex.toLowerCase()))) {
        violations.push(`${where}: [R2 紫粉渐变] linear-gradient 含紫粉禁色（Indigo/Slate 纯色可用）`);
      }
    }

    for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(line) && !line.includes(RULE_QUOTE_WHITELIST_MARK)) {
        violations.push(`${where}: [R3 模板味] ${label}`);
      }
    }
  });
  return violations;
}

function main() {
  const args = process.argv.slice(2);
  const pathsFlagIndex = args.indexOf('--paths');
  const defaultTargets = [join(PROJECT_ROOT, 'src'), join(PROJECT_ROOT, 'docs', 'DESIGN.md')];
  const targets = pathsFlagIndex !== -1 ? args.slice(pathsFlagIndex + 1) : defaultTargets;
  if (targets.length === 0 && pathsFlagIndex !== -1) {
    console.error('用法: scan-p0.mjs --paths <file-or-dir> [...]');
    process.exit(2);
  }

  const files = [...new Set(targets.flatMap((target) => listFiles(target)))].filter(
    (file) => file !== SCRIPT_PATH,
  );

  const violations = files.flatMap((file) => scanFile(file));

  if (violations.length > 0) {
    console.error(`P0 视觉门禁扫描失败（${violations.length} 处违规，扫描 ${files.length} 个文件）：`);
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
  console.log(`P0 视觉门禁扫描通过（扫描 ${files.length} 个文件，0 违规）`);
  process.exit(0);
}

main();

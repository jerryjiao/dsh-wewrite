/**
 * 质量门禁步（F6）：strict 门禁 + 编号配图一致性。
 * 移植自源管线 quality_validate.mjs --strict 与 validate_numbering.mjs 的判定内核：
 * 禁用词、内部标记、句长方差、信息密度、有序列表编号连续性、配图编号一致。
 * 语义取逻辑（判定阈值同源），CLI/报告排版不搬。
 */

import type { GatesRunner } from '../engine';

/** 禁用词（源管线 BANNED_PATTERNS 同集）。 */
const BANNED_WORDS = [
  '总而言之', '值得一提', '不容忽视', '毋庸置疑', '综上所述', '由此可见', '显而易见', '不言而喻',
  '绝绝子', 'yyds', '破防了', '好家伙', '就一个路径问题', '整挺好', 'DNA动了',
] as const;

/** 内部标记：编辑锚点 / 待填占位（emoji 以转义书写，源码不落字面）。 */
const INTERNAL_MARKER_PATTERNS: readonly RegExp[] = [
  /\u270F\uFE0F\s*编辑(?:建议|提醒)/g,
  /<!--[\s\S]*?编辑(?:建议|提醒)[\s\S]*?-->/g,
  /[\[【]\s*请填写[^\]】]*[\]】]/g,
  /[\[【]\s*待补充[^\]】]*[\]】]/g,
  /^\s*(?:待确认)\s*[：:].*$/gm,
  /(?:事实边界|核验来源)\s*[：:]/g,
];

/** 具体细节特征（数字+单位 / 语义化版本号 / 行内代码 / 金额）。 */
const SPECIFIC_PATTERNS: readonly RegExp[] = [
  /\d+[\.\d]*\s*(?:秒|分钟|小时|天|月|年|%|元|美元|GB|MB|KB|文件|行|次|轮)/g,
  /`[^`]+`/g,
  /\$[\d,]+/g,
  /v?\d+\.\d+(?:\.\d+)?/g,
];

const cpLength = (text: string): number => [...text].length;

function countMatches(text: string, regex: RegExp): number {
  const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  return (text.match(global) ?? []).length;
}

interface SentenceStats {
  count: number;
  mean: number;
  varianceRatio: number;
}

function analyzeSentences(text: string): SentenceStats {
  const sentences = text.split(/[。！？\n]/).map((part) => part.trim()).filter((part) => cpLength(part) > 5);
  if (!sentences.length) return { count: 0, mean: 0, varianceRatio: 0 };
  const lengths = sentences.map(cpLength);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const std =
    lengths.length > 1
      ? Math.sqrt(lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / (lengths.length - 1))
      : 0;
  return { count: lengths.length, mean, varianceRatio: mean > 0 ? std / mean : 0 };
}

/** 有序列表编号连续性：每个有序列表必须从 1 起且逐项 +1（栅栏代码块内不检查）。 */
function auditNumbering(markdown: string): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  let inFence = false;
  let expected = 1;
  let listSeen = false;
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^([ \t]*)(\d+)[.)]\s+\S/);
    if (!match) {
      if (listSeen) {
        listSeen = false;
        expected = 1;
      }
      continue;
    }
    const value = Number(match[2]);
    if (!listSeen) {
      listSeen = true;
      expected = 1;
    }
    if (value !== expected) {
      issues.push(`有序列表编号断裂：期望 ${expected}，实际 ${value}（行：${line.trim().slice(0, 40)}）`);
    }
    expected = value + 1;
  }
  return { passed: issues.length === 0, issues };
}

/** 配图一致性：正文图占位/引用按出现顺序编号时，编号必须连续且与图片计数一致。 */
function auditFigureNumbering(markdown: string, imageCount: number): { passed: boolean; issues: string[] } {
  const references = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)];
  const numbered = references.map((ref) => (ref[1] ?? '').match(/^图\s*(\d+)/));
  const issues: string[] = [];
  const explicit = numbered.filter(Boolean) as RegExpExecArray[];
  for (let index = 0; index < explicit.length; index += 1) {
    if (Number(explicit[index][1]) !== index + 1) {
      issues.push(`配图编号不连续：第 ${index + 1} 张被标为 图${explicit[index][1]}`);
      break;
    }
  }
  if (references.length !== imageCount && imageCount > 0) {
    issues.push(`配图数不一致：正文引用 ${references.length} 处，管线产图 ${imageCount} 张`);
  }
  return { passed: issues.length === 0, issues };
}

export interface GatesReport {
  readonly strict: true;
  readonly bannedWords: readonly { readonly pattern: string; readonly count: number }[];
  readonly internalMarkers: number;
  readonly sentenceCount: number;
  readonly sentenceVariance: number;
  readonly infoDensityPer500: number;
  readonly codeBlocks: number;
  readonly numbering: { readonly passed: boolean; readonly issues: readonly string[] };
  readonly figureNumbering: { readonly passed: boolean; readonly issues: readonly string[] };
  readonly issues: readonly string[];
}

export interface RunGatesInput {
  readonly markdown: string;
  readonly imageCount?: number;
}

/** 门禁判定：任一硬项不过即 passed=false（strict 语义，未过阻断默认推送路径，AC-7）。 */
export function runQualityGates(input: RunGatesInput): { passed: boolean; report: GatesReport } {
  const text = input.markdown;
  const bannedWords = BANNED_WORDS.flatMap((word) => {
    const count = countMatches(text, new RegExp(word, 'g'));
    return count ? [{ pattern: word, count }] : [];
  });
  const internalMarkers = INTERNAL_MARKER_PATTERNS.reduce((acc, regex) => acc + countMatches(text, regex), 0);
  const sentence = analyzeSentences(text);
  const chars = cpLength(text);
  const detailCount = SPECIFIC_PATTERNS.reduce((acc, regex) => acc + countMatches(text, regex), 0);
  const infoDensity = chars > 0 ? detailCount / (chars / 500) : 0;
  const codeBlocks = countMatches(text, /```[\s\S]*?```/g);
  const numbering = auditNumbering(text);
  const figureNumbering = auditFigureNumbering(text, input.imageCount ?? 0);

  const issues: string[] = [];
  if (bannedWords.length) issues.push(`禁用词命中 ${bannedWords.length} 组`);
  if (internalMarkers) issues.push(`内部标记残留 ${internalMarkers} 处`);
  if (sentence.count > 0 && sentence.varianceRatio < 0.3) issues.push('句长方差过低，节奏单调');
  if (chars > 500 && infoDensity < 1) issues.push('信息密度不足（每 500 字具体细节 < 1 处）');
  if (chars > 0 && chars < 300) issues.push('正文过短（< 300 字）');
  if (!numbering.passed) issues.push(...numbering.issues);
  if (!figureNumbering.passed) issues.push(...figureNumbering.issues);

  const report: GatesReport = {
    strict: true,
    bannedWords,
    internalMarkers,
    sentenceCount: sentence.count,
    sentenceVariance: Number(sentence.varianceRatio.toFixed(2)),
    infoDensityPer500: Number(infoDensity.toFixed(1)),
    codeBlocks,
    numbering,
    figureNumbering,
    issues,
  };
  return { passed: issues.length === 0, report };
}

/** engine 装配适配器（GatesRunner 形状）。 */
export const qualityGatesRunner: GatesRunner = {
  async run(input: { markdown: string }) {
    return runQualityGates({ markdown: input.markdown });
  },
};

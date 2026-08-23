/**
 * 热榜逐条 AI 速览（uiux v0.3 §1）：抓原文 → 零依赖启发式抽正文 → LLM 行结构速览。
 * 抓取失败不是错误：静默降级 title 模式（仅凭标题+域名解读），source 由抽取结果判定。
 * 抽取只做字符串/正则处理，禁引 readability 类依赖。
 */

import type { HotspotDigestItem, HotspotItemDigest } from '../shared/contract';
import { streamLlmText, type PipelineLlm } from './pipeline/llm';
import type { HostLogger } from './platform';
import { WewriteServiceError } from './service-errors';

export interface HotspotDigestDeps {
  readonly llm: PipelineLlm;
  /** settings.llmDefault 透传；缺省即 llm-not-configured。 */
  readonly provider?: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly logger: HostLogger;
  /** 单次 LLM 调用超时毫秒（默认 45s；测试注入缩短值验证 abort 分支）。 */
  readonly timeoutMs: number;
  readonly nowIso: () => string;
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_BODY_CHARS = 8_000;
/** 低于该长度视为抽取失败（降级 title 模式），防导航壳文本进提示词。 */
const MIN_BODY_CHARS = 300;

// ── 抓取 + 抽取 ─────────────────────────────────────────────────────────────

/** 从条目 URL 提取来源域名；非 URL 原样返回（热榜源可能给相对串或纯标识）。 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 读响应体，累计到 2MB 即取消下载（截断而非拒收）；无流时退化为整读。 */
async function readBodyCapped(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    if (bytes >= MAX_HTML_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** 解码常见 HTML 实体（命名 + 数字/十六进制）；不识别的实体原样保留。 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string): string => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** 取首个 tag 块的内层 HTML；不存在返回 null（大小写不敏感、惰性到最近闭合）。 */
function matchBlock(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i').exec(html);
  return match ? match[1] : null;
}

/**
 * 浏览器式请求头：部分站点（QA 2026-08-20：casio.com）对无 UA 的裸请求直接 403，
 * 用主流 Chrome UA + HTML accept 模拟浏览器首包治反爬。
 */
const BROWSER_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/** 剥标签 → 解码实体 → 折叠空白，产出候选正文文本。 */
function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 启发式抽正文：剥噪音块与注释 → article/main 优先 → 块文本过短回退整页剥壳文本。 */
export function extractArticleText(html: string): string | null {
  let working = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'svg']) {
    working = working.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  }
  const block = matchBlock(working, 'article') ?? matchBlock(working, 'main');
  if (block !== null) {
    const blockText = stripToText(block);
    if (blockText.length >= MIN_BODY_CHARS) return blockText.slice(0, MAX_BODY_CHARS);
  }
  // 回退整页：社交平台（QA 2026-08-20：grapheneos.social Mastodon 帖）首个 article 块
  // 只装头像/时间戳 <300 字，正文在块外——剥壳整页 9860 字，按块判失败白白降级 title 模式。
  const pageText = stripToText(working);
  if (pageText.length >= MIN_BODY_CHARS) return pageText.slice(0, MAX_BODY_CHARS);
  return null;
}

/**
 * 抓 url 并抽正文：8s 超时、跟随重定向、只收 text/html、2MB 截断。
 * 任何失败（网络/状态码/类型/超时/正文过短）返回 null——降级信号，不抛错。
 */
export async function fetchArticleText(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: BROWSER_REQUEST_HEADERS,
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('text/html')) return null;
    return extractArticleText(await readBodyCapped(response));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 提示词（输出行结构纯文本，不依赖 markdown 解析）────────────────────────────

function digestItemSystemPrompt(): string {
  return [
    '你是一位技术公众号的选题编辑，替作者快速判断一条热榜值不值得写。',
    '只输出中文纯文本，不用任何 Markdown 记号；不复述原文，直接按用户给定的行结构输出。',
    '要点必须落到具体事实、数字或结论，不写套话与空转词。',
  ].join('');
}

/** article 模式：输入=标题+域名+正文节选。 */
function digestItemArticleUserPrompt(title: string, domain: string, body: string): string {
  return [
    `热榜条目标题：${title}`,
    `来源域名：${domain}`,
    '',
    '正文节选：',
    body,
    '',
    '请严格按以下行结构输出纯文本（不加 Markdown 记号、不加额外说明）：',
    '这条在讲什么：一句话概括核心事件',
    '· 要点：具体事实或数字（2 到 4 行，每行一个）',
    '要点只能来自给定正文，不得补充外部信息，不得虚构数字与事实。',
  ].join('\n');
}

/** title 模式（降级）：输入=标题+域名。 */
function digestItemTitleUserPrompt(title: string, domain: string): string {
  return [
    `热榜条目标题：${title}`,
    `来源域名：${domain}`,
    '',
    '请严格按以下行结构输出纯文本（不加 Markdown 记号、不加额外说明）：',
    '标题解读：中文译名，加一句话说明在讲什么',
    '· 角度：从公众号选题视角给一个可写的角度，一行',
    '只有标题与域名可用：不得虚构原文没有的事实；角度只做方向性建议，不提具体功能、数字或参数。',
  ].join('\n');
}

// ── digestItem 服务逻辑 ──────────────────────────────────────────────────────

export async function digestHotspotItem(deps: HotspotDigestDeps, item: HotspotDigestItem): Promise<HotspotItemDigest> {
  const startedAt = Date.now();
  const { provider, model } = deps;
  if (!provider || !model) {
    throw new WewriteServiceError('llm-not-configured', '尚未配置默认模型：请先到「设置」里选择 AI 供应商与模型，再生成速览');
  }
  const articleText = await fetchArticleText(item.url, deps.fetchImpl ?? fetch);
  const domain = hostOf(item.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const outcome = await streamLlmText(
      deps.llm,
      {
        purpose: 'wewrite-hotspot-item-digest',
        system: digestItemSystemPrompt(),
        user:
          articleText !== null
            ? digestItemArticleUserPrompt(item.title, domain, articleText)
            : digestItemTitleUserPrompt(item.title, domain),
        provider,
        model,
        // bigmodel 实测规则：带 thinking 参数的请求（宿主 reasoning≥low 时宿主会注入）
        // max_tokens 必须 >32000，否则 HTTP 400 code 1214——reasoning=off 时 800 可过，
        // 但用户把宿主 reasoning 调高后所有条目必炸。33000 两态都安全：输出长度由
        // 行结构提示词约束，45s 超时兜底。
        maxTokens: 33_000,
      },
      controller.signal,
    );
    if (outcome.status === 'aborted') {
      throw new WewriteServiceError('digest-timeout', `AI 速览生成超时（${Math.round(deps.timeoutMs / 1000)} 秒），已取消，请重试`);
    }
    // digest-item-error 分流：LLM 供应商错误的 code/message 原样透传
    if (outcome.status === 'error') throw new WewriteServiceError(outcome.code, outcome.message);
    if (!outcome.text) throw new WewriteServiceError('digest-empty', '模型未返回任何内容，请重试');
    const source = articleText !== null ? 'article' : 'title';
    deps.logger.info(
      `hotspot item digest ok：rank=${item.rank} source=${source} model=${model} body=${articleText?.length ?? 0} ${Date.now() - startedAt}ms`,
    );
    return { digest: outcome.text, source, model, generatedAtIso: deps.nowIso() };
  } catch (error) {
    const code = error instanceof WewriteServiceError ? error.code : 'unknown';
    deps.logger.warn(`hotspot item digest failed（rank=${item.rank} ${code}）：${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

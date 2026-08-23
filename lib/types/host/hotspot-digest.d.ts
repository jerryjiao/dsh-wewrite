/**
 * 热榜逐条 AI 速览（uiux v0.3 §1）：抓原文 → 零依赖启发式抽正文 → LLM 行结构速览。
 * 抓取失败不是错误：静默降级 title 模式（仅凭标题+域名解读），source 由抽取结果判定。
 * 抽取只做字符串/正则处理，禁引 readability 类依赖。
 */
import type { HotspotDigestItem, HotspotItemDigest } from '../shared/contract';
import { type PipelineLlm } from './pipeline/llm';
import type { HostLogger } from './platform';
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
/** 启发式抽正文：剥噪音块与注释 → article/main 优先 → 块文本过短回退整页剥壳文本。 */
export declare function extractArticleText(html: string): string | null;
/**
 * 抓 url 并抽正文：8s 超时、跟随重定向、只收 text/html、2MB 截断。
 * 任何失败（网络/状态码/类型/超时/正文过短）返回 null——降级信号，不抛错。
 */
export declare function fetchArticleText(url: string, fetchImpl: typeof fetch, timeoutMs?: number): Promise<string | null>;
export declare function digestHotspotItem(deps: HotspotDigestDeps, item: HotspotDigestItem): Promise<HotspotItemDigest>;

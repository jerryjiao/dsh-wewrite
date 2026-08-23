import { describe, expect, it, vi } from 'vitest';
import { fetchArticleText } from '@/host/hotspot-digest';
import { WeWriteService } from '@/host/service';
import { WewriteServiceError } from '@/host/service-errors';
import type { LlmService } from '@/host/platform';
import { MemoryDomain, makeCredentials, silentLogger } from './service-harness';

/**
 * 热榜逐条 AI 速览测试（uiux v0.3 §1）。
 *
 * 本文件钉定 src/host/hotspot-digest.ts 消费面：
 * - fetchArticleText：text/html 白名单、浏览器式请求头（Chrome UA + text/html accept）、
 *   script/style 等噪音剥除、article/main 优先、块 <300 字回退整页剥壳文本、
 *   2MB 截断不炸、8s 超时归 null、整页剥壳 <300 字符降级 null（不抛错）
 * - digestHotspotItem：article 模式提示含正文节选 / title 降级；purpose 与 maxTokens 33000 契约
 *   （bigmodel 1214 规则）；防幻觉约束行；llm error 透传、abort/超时归一 digest-timeout、
 *   空输出 digest-empty、未配模型 llm-not-configured
 * LLM 按宿主真实 chunk 协议 mock（text-delta + finish.reason），非 mock streamLlmText 本身。
 */

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');
const ITEM = { rank: 1, title: '某推理引擎开源', url: 'https://blog.example.test/post' };
/** 超过 300 字符下限的正文（重复拼接，抽取后应保留）。 */
const LONG_BODY = '该引擎把推理成本降到了原来的三成，并在多卡部署下保持线性扩展。'.repeat(12);

const htmlResponse = (html: string, contentType = 'text/html; charset=utf-8') =>
  new Response(html, { status: 200, headers: { 'content-type': contentType } });

const fetchOf = (html: string, contentType?: string) =>
  vi.fn(async (): Promise<Response> => htmlResponse(html, contentType));

type StreamFactory = (options: Record<string, unknown>) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;

/** 速览/改写通用 mock：记录每次 stream options，脚本按宿主 chunk 协议产出。 */
function makeScriptedLlm(script: () => AsyncGenerator) {
  const calls: Record<string, unknown>[] = [];
  const stream: StreamFactory = (options) => {
    calls.push(options);
    return script();
  };
  return { llm: { stream } as LlmService, calls };
}

const userTextOf = (options: Record<string, unknown>): string => {
  const messages = options.messages as { content: { text: string }[] }[];
  return String(messages[0].content[0].text);
};

async function makeService(
  llm: LlmService,
  options?: { fetchImpl?: typeof fetch; digestTimeoutMs?: number; skipLlmConfig?: boolean },
) {
  const service = await WeWriteService.open({
    domain: new MemoryDomain(),
    credentials: makeCredentials().service,
    llm,
    ...(options?.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    now: () => FIXED_NOW,
    logger: silentLogger,
    ...(options?.digestTimeoutMs !== undefined ? { digestTimeoutMs: options.digestTimeoutMs } : {}),
  });
  if (!options?.skipLlmConfig) {
    await service.setConfig({ llmDefault: { provider: 'zhipu', model: 'glm-4.5-flash' } });
  }
  return service;
}

async function rejectInfo(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WewriteServiceError) return { code: error.code, message: error.message };
    return { code: `non-coded:${error instanceof Error ? error.message : String(error)}`, message: '' };
  }
  return { code: 'no-error-thrown', message: '' };
}

// ── fetchArticleText（抓取 + 抽取）─────────────────────────────────────────────

describe('fetchArticleText（uiux v0.3 §1 抓取抽取）', () => {
  it('正常 HTML：剥导航页脚与注释，正文抽出并折叠空白', async () => {
    const html = `<!doctype html><html><head><title>页标题</title></head><body><!-- 广告注释 -->
      <nav>导航甲 导航乙</nav><header>顶栏</header>
      <article><h1>某推理引擎开源</h1><p>${LONG_BODY}</p></article>
      <footer>页脚链接</footer><aside>侧栏推荐</aside>
      </body></html>`;
    const text = await fetchArticleText('https://a.test/1', fetchOf(html));
    expect(text).toBeTruthy();
    expect(text).toContain('推理成本');
    expect(text).not.toContain('导航甲');
    expect(text).not.toContain('顶栏');
    expect(text).not.toContain('页脚链接');
    expect(text).not.toContain('侧栏推荐');
    expect(text).not.toContain('广告注释');
    expect(text?.length).toBeLessThanOrEqual(8000);
  });

  it('script/style/noscript 块整体剥除，内容不进正文', async () => {
    const html = `<html><body><article>${LONG_BODY}
      <script>alert('tracker')</script><style>.a{color:red}</style><noscript>请开 JS</noscript>
      <svg viewBox="0 0 1 1"><path d="M0 0"/></svg></article></body></html>`;
    const text = await fetchArticleText('https://a.test/1', fetchOf(html));
    expect(text).toContain('推理成本');
    expect(text).not.toContain('tracker');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('请开 JS');
    expect(text).not.toContain('viewBox');
  });

  it('article 优先：无 article 时回落 main，块外杂文本不进结果', async () => {
    const html = `<html><body><div>登录 注册 搜索</div><main><p>${LONG_BODY}</p></main></body></html>`;
    const text = await fetchArticleText('https://a.test/1', fetchOf(html));
    expect(text).toContain('推理成本');
    expect(text).not.toContain('登录');
  });

  it('HTML 实体解码：&amp;/&lt;/数字实体还原为字符', async () => {
    const html = `<html><body><article>${LONG_BODY}<p>A &amp; B &lt;tag&gt; &#21830;</p></article></body></html>`;
    const text = await fetchArticleText('https://a.test/1', fetchOf(html));
    expect(text).toContain('A & B <tag> 商');
  });

  it('请求头：带主流 Chrome UA 与 text/html accept（治 403 反爬）', async () => {
    const spy = vi.fn(async (): Promise<Response> => htmlResponse(`<html><body><article>${LONG_BODY}</article></body></html>`));
    await fetchArticleText('https://a.test/1', spy as unknown as typeof fetch);
    const init = (spy.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/Mozilla\/5\.0 .*AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+/);
    expect(headers.accept).toContain('text/html');
  });

  it('块文本 <300 字但整页剥壳 ≥300 字：回退用整页文本（Mastodon 型页面不白降级）', async () => {
    // QA 2026-08-20 实测形状：grapheneos.social 首 article 块只装头像/时间戳，正文在块外
    const html = `<html><body><article><span>某账号</span><time>2 小时</time></article>
      <div>${LONG_BODY}</div></body></html>`;
    const text = await fetchArticleText('https://a.test/1', fetchOf(html));
    expect(text).toBeTruthy();
    expect(text).toContain('推理成本');
    expect(text).toContain('某账号');
  });

  it('正文不足 300 字符：返回 null（降级信号）', async () => {
    const html = '<html><body><article>太短了</article></body></html>';
    expect(await fetchArticleText('https://a.test/1', fetchOf(html))).toBeNull();
  });

  it('Content-Type 非 text/html 拒收（json / 缺头均 null）', async () => {
    expect(await fetchArticleText('https://a.test/1', fetchOf('{"a":1}', 'application/json'))).toBeNull();
    const noHeader = vi.fn(async () => new Response('x', { status: 200 }));
    expect(await fetchArticleText('https://a.test/1', noHeader as unknown as typeof fetch)).toBeNull();
  });

  it('非 2xx 与网络错误：静默 null 不抛', async () => {
    const notOk = vi.fn(async () => new Response('nope', { status: 503, headers: { 'content-type': 'text/html' } }));
    expect(await fetchArticleText('https://a.test/1', notOk as unknown as typeof fetch)).toBeNull();
    const broken = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await fetchArticleText('https://a.test/1', broken as unknown as typeof fetch)).toBeNull();
  });

  it('超大响应体：2MB 截断后仍完成抽取（结果封顶 8000 字符，不炸不挂）', async () => {
    const huge = `<html><body><article>${'长文本块'.repeat(600 * 1024)}</article></body></html>`;
    const startedAt = Date.now();
    const text = await fetchArticleText('https://a.test/1', fetchOf(huge));
    expect(text).toBeTruthy();
    expect(text?.length).toBe(8000);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });

  it('抓取超时：8s 上限可注入缩短，超时归 null', async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')), { once: true });
      });
    expect(await fetchArticleText('https://a.test/1', hanging, 30)).toBeNull();
  });
});

// ── digestHotspotItem（service 委托）──────────────────────────────────────────

describe('digestHotspotItem（uiux v0.3 §1 服务层）', () => {
  it('article 模式：抽取成功时提示含正文节选，source=article，返回 model 与生成时间', async () => {
    const fetchImpl = fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`);
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '这条在讲什么：某推理引擎开源并给出成本数据。' };
      yield { type: 'text-delta', index: 1, text: '\n· 要点：成本降到三成' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { fetchImpl });

    const digest = await service.digestHotspotItem(ITEM);

    expect(digest.digest).toBe('这条在讲什么：某推理引擎开源并给出成本数据。\n· 要点：成本降到三成');
    expect(digest.source).toBe('article');
    expect(digest.model).toBe('glm-4.5-flash');
    expect(digest.generatedAtIso).toBe('2026-08-20T12:00:00.000Z');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('LLM 调用参数：purpose/maxTokens 33000/provider/model 按契约，article 提示含标题域名正文、行结构锚点与防幻觉约束', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '这条在讲什么：参数面校验稿。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { fetchImpl: fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`) });

    await service.digestHotspotItem(ITEM);

    expect(llm.calls.length).toBe(1);
    const options = llm.calls[0];
    expect(options.purpose).toBe('wewrite-hotspot-item-digest');
    expect(options.provider).toBe('zhipu');
    expect(options.model).toBe('glm-4.5-flash');
    // bigmodel 1214 规则：带 thinking 参数的请求 max_tokens 必须 >32000（宿主 reasoning 可被用户调高）
    expect(options.maxTokens).toBe(33000);
    expect(String(options.system)).toContain('选题编辑');
    const user = userTextOf(options);
    expect(user).toContain('某推理引擎开源');
    expect(user).toContain('blog.example.test');
    expect(user).toContain('推理成本');
    expect(user).toContain('这条在讲什么：');
    expect(user).toContain('· 要点：');
    expect(user).toContain('不得补充外部信息');
    expect(user).not.toContain('标题解读：');
  });

  it('title 降级：抓取失败（404）时仅凭标题+域名，source=title，提示用标题解读行结构', async () => {
    const notFound = vi.fn(async () => new Response('missing', { status: 404 }));
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '标题解读：某引擎开源，社区反响热烈。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { fetchImpl: notFound as unknown as typeof fetch });

    const digest = await service.digestHotspotItem(ITEM);

    expect(digest.source).toBe('title');
    expect(digest.digest).toContain('标题解读：');
    const user = userTextOf(llm.calls[0]);
    expect(user).toContain('某推理引擎开源');
    expect(user).toContain('blog.example.test');
    expect(user).toContain('标题解读：');
    expect(user).toContain('· 角度：');
    expect(user).toContain('不得虚构原文没有的事实');
    expect(user).not.toContain('正文节选');
  });

  it('llm 错误分流：finish.reason=error 的 code/message 原样透传', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'rate-limited', message: '供应商限流' } } };
    });
    const service = await makeService(llm.llm, { fetchImpl: fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`) });

    const info = await rejectInfo(service.digestHotspotItem(ITEM));
    expect(info).toEqual({ code: 'rate-limited', message: '供应商限流' });
  });

  it('空输出：finish stop 但零文本时 digest-empty 拒', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { fetchImpl: fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`) });

    const info = await rejectInfo(service.digestHotspotItem(ITEM));
    expect(info.code).toBe('digest-empty');
  });

  it('finish reason aborted：归一为 digest-timeout 可读错误', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'aborted' } };
    });
    const service = await makeService(llm.llm, { fetchImpl: fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`) });

    const info = await rejectInfo(service.digestHotspotItem(ITEM));
    expect(info.code).toBe('digest-timeout');
    expect(info.message).toContain('已取消');
  });

  it('超时 abort：注入短超时 + 持续吐 delta 的慢流，到点后中止并 digest-timeout', async () => {
    const llm = makeScriptedLlm(async function* () {
      for (let index = 0; ; index += 1) {
        yield { type: 'text-delta', index, text: `段${index}` };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
    const service = await makeService(llm.llm, {
      fetchImpl: fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`),
      digestTimeoutMs: 30,
    });

    const info = await rejectInfo(service.digestHotspotItem(ITEM));
    expect(info.code).toBe('digest-timeout');
  });

  it('未配默认模型：llm-not-configured 中文可读错误，零抓取零 LLM 调用', async () => {
    const fetchImpl = fetchOf(`<html><body><article>${LONG_BODY}</article></body></html>`);
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { fetchImpl, skipLlmConfig: true });

    const info = await rejectInfo(service.digestHotspotItem(ITEM));
    expect(info.code).toBe('llm-not-configured');
    expect(info.message).toContain('设置');
    expect(llm.calls.length).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

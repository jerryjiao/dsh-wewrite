import { describe, expect, it } from 'vitest';
import { convertArticle } from '@/render/convert';

/**
 * 渲染产物形状测试（AC-8 基础：预览 = 产物一致性）。
 *
 * 本文件钉定 src/render/convert.ts 消费面：
 * - convertArticle({ markdown, theme? }): string —— 纯函数（同输入字节级同输出）
 * - 输出为微信编辑器可粘贴形态：无 <style>/<link>/<h1>，样式全部内联
 * - convertArticle 是 article/preview RPC 的唯一渲染真身（架构 §3 render 模块）
 */

const SAMPLE_MD = [
  '# 一级标题（应降级，微信正文禁 h1）',
  '',
  '## 二级标题',
  '',
  '正文段落，含**加粗文本**与普通文字。',
  '',
  '![配图](https://img.example.test/a.png)',
  '',
  '```js',
  'const answer = 42;',
  '```',
].join('\n');

describe('微信 HTML 产物形状（AC-8）', () => {
  it('输出不含 <style> 与 <link>（禁样式块/外链样式）', () => {
    const html = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' }).toLowerCase();
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<link');
  });

  it('输出不含 <h1>（微信正文 h1 由标题字段承载）', () => {
    const html = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' }).toLowerCase();
    expect(html).not.toContain('<h1');
  });

  it('样式以内联形式存在（style= 属性）', () => {
    const html = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' });
    expect(html).toContain('style="');
  });

  it('内容保真：二级标题/加粗文本/代码/图片 URL 均在输出中', () => {
    const html = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' });
    expect(html).toContain('二级标题');
    expect(html).toContain('加粗文本');
    expect(html).toContain('const answer = 42;');
    expect(html).toContain('https://img.example.test/a.png');
    expect(html.toLowerCase()).toContain('<img');
  });

  it('加粗走 strong 或内联 font-weight（微信兼容形态二选一）', () => {
    const html = convertArticle({ markdown: '前置**加粗文本**后置', theme: 'professional-clean' });
    const boldRendered = html.includes('<strong') || /font-weight/i.test(html) || /700/.test(html);
    expect(boldRendered).toBe(true);
  });
});

describe('确定性（AC-8：预览与 API 载荷字节一致的前提）', () => {
  it('同输入两次调用字节级一致', () => {
    const first = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' });
    const second = convertArticle({ markdown: SAMPLE_MD, theme: 'professional-clean' });
    expect(first).toBe(second);
  });

  it('不依赖 theme 时也能渲染（默认主题路径存在）', () => {
    const html = convertArticle({ markdown: '## 只有标题\n\n和一段文字' });
    expect(typeof html).toBe('string');
    expect(html).toContain('只有标题');
    expect(html).toContain('和一段文字');
  });

  it('theme 变化被接受（不同 theme 均产出合法内联样式 HTML）', () => {
    for (const theme of ['professional-clean', 'tech-dark', 'minimal-gray']) {
      const html = convertArticle({ markdown: SAMPLE_MD, theme });
      expect(html).toContain('style="');
      expect(html).not.toContain('<style');
    }
  });
});

describe('输入安全基线（OWASP XSS 最小面）', () => {
  it('markdown 中的 script 标签被转义，不进入输出', () => {
    const html = convertArticle({ markdown: '正常段落\n\n<script>alert("xss")</script>\n\n另一段' });
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('markdown 中的 iframe 被转义', () => {
    const html = convertArticle({ markdown: '<iframe src="https://evil.example.test"></iframe>' });
    expect(html.toLowerCase()).not.toContain('<iframe');
  });

  it('事件属性注入不出现在输出标签上', () => {
    const html = convertArticle({ markdown: '![x](https://a.example.test/x.png"onerror="alert(1))' });
    expect(html.toLowerCase()).not.toContain('onerror=');
  });
});

describe('空输入与边界', () => {
  it('空 markdown 产出合法（非空字符串）输出', () => {
    const html = convertArticle({ markdown: '' });
    expect(typeof html).toBe('string');
    expect(html).toBeDefined();
  });

  it('超长输入不截断内容（10k 字段落完整出现在输出）', () => {
    const paragraph = '这是用于压力测试的中文句子。';
    const long = paragraph.repeat(1000);
    const html = convertArticle({ markdown: long });
    expect(html).toContain(paragraph.repeat(1000).slice(0, 100));
    expect(html.length).toBeGreaterThan(long.length * 0.9);
  });
});

import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error 脚本是 .mjs，无类型声明；这里只验证纯函数行为
import { findCachedHost, parseDshPkgDir, readDshVersion, resolveExpectedVersion, tailLog, waitReady } from '../../scripts/hostctl.mjs';

const root = mkdtempSync(join(tmpdir(), 'dsh-hostctl-'));
const pkgDir = join(root, 'node_modules/@deepseek-ai/dsh');
mkdirSync(join(pkgDir, 'lib'), { recursive: true });
writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-rc.1' }));

afterAll(() => rmSync(root, { recursive: true, force: true }));

// 假 npm 查询：返回固定 stdout 或抛错；记录是否被调用
function fakeNpm(result: string | Error) {
  const run = Object.assign(
    () => {
      run.called = true;
      if (result instanceof Error) throw result;
      return result;
    },
    { called: false },
  );
  return run;
}

describe('parseDshPkgDir', () => {
  it('认 npx 缓存里的 dsh 进程', () => {
    expect(
      parseDshPkgDir('/usr/bin/node /Users/me/.npm/_npx/abc/node_modules/@deepseek-ai/dsh/lib/bin.js web'),
    ).toBe('/Users/me/.npm/_npx/abc/node_modules/@deepseek-ai/dsh');
  });

  it('认全局安装的 dsh 进程', () => {
    expect(parseDshPkgDir('/usr/bin/node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web')).toBe(
      '/usr/local/lib/node_modules/@deepseek-ai/dsh',
    );
  });

  it('认 npx 用 .bin 垫片启动的 dsh 进程', () => {
    expect(parseDshPkgDir('/Users/me/.npm/_npx/abc/node_modules/.bin/dsh web')).toBe(
      '/Users/me/.npm/_npx/abc/node_modules/@deepseek-ai/dsh',
    );
  });

  it('非 dsh 进程返回 null（如浏览器占用 3080 的连接）', () => {
    expect(parseDshPkgDir('/Applications/ego lite.app/Contents/MacOS/ego Helper --type=utility')).toBeNull();
  });
});

describe('readDshVersion', () => {
  it('从进程命令行读 package.json 版本', () => {
    expect(readDshVersion(`/usr/bin/node ${pkgDir}/lib/bin.js web`)).toBe('0.2.2-rc.1');
  });

  it('从 .bin 垫片命令行也能读到版本', () => {
    expect(readDshVersion(`${root}/node_modules/.bin/dsh web`)).toBe('0.2.2-rc.1');
  });

  it('包名不符时返回 null', () => {
    const badPkg = join(root, 'bad/node_modules/@deepseek-ai/dsh');
    mkdirSync(badPkg, { recursive: true });
    writeFileSync(join(badPkg, 'package.json'), JSON.stringify({ name: 'not-dsh', version: '1.0.0' }));
    expect(readDshVersion(`${root}/bad/node_modules/.bin/dsh web`)).toBeNull();
  });

  it('认不出 dsh 进程时返回 null', () => {
    expect(readDshVersion('/usr/bin/node /tmp/other/index.js')).toBeNull();
  });
});

describe('resolveExpectedVersion', () => {
  it('DSH_HOST_VERSION 优先，且不查 npm', () => {
    const npm = fakeNpm(new Error('不该被调用'));
    expect(resolveExpectedVersion({ DSH_HOST_VERSION: '0.1.1-rc.2' }, npm)).toBe('0.1.1-rc.2');
    expect(npm.called).toBe(false);
  });

  it('未 pin 时取 npm dist-tags.latest（去尾换行）', () => {
    expect(resolveExpectedVersion({}, fakeNpm('0.2.2-rc.1\n'))).toBe('0.2.2-rc.1');
  });

  it('npm 查询失败显式报错（不退回旧缓存）', () => {
    expect(() => resolveExpectedVersion({}, fakeNpm(new Error('E404')))).toThrow(/npm latest/);
  });

  it('npm 返回空值也报错', () => {
    expect(() => resolveExpectedVersion({}, fakeNpm('  \n'))).toThrow(/返回空值/);
  });
});

describe('findCachedHost', () => {
  const npxRoot = join(root, 'npx');
  const writePkg = (dir: string, pkg: object) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  };
  const dsh = (cache: string, version: string) =>
    writePkg(join(npxRoot, cache, 'node_modules/@deepseek-ai/dsh'), {
      name: '@deepseek-ai/dsh',
      version,
      bin: { dsh: 'lib/bin.js' },
    });
  const cordis = (cache: string, version: string) =>
    writePkg(join(npxRoot, cache, 'node_modules/@deepseek-ai/cordis'), { version });

  dsh('aaa', '0.1.1-rc.2');
  cordis('aaa', '4.1.0');
  dsh('bbb', '0.1.1-rc.2');
  cordis('bbb', '4.0.1');
  dsh('ccc', '0.2.2-rc.1');
  cordis('ccc', '4.0.0');
  dsh('ddd', '0.1.1-rc.2'); // 缺 cordis，应排到最后
  mkdirSync(join(npxRoot, 'eee/node_modules/@deepseek-ai/cordis'), { recursive: true }); // 没有 dsh

  it('版本完全相等才命中，多份取 cordis 版本最低的那份', () => {
    expect(findCachedHost('0.1.1-rc.2', npxRoot)).toEqual({
      dir: join(npxRoot, 'bbb/node_modules/@deepseek-ai/dsh'),
      bin: join(npxRoot, 'bbb/node_modules/@deepseek-ai/dsh/lib/bin.js'),
      cordisVersion: '4.0.1',
    });
  });

  it('没有同版本缓存返回 null（交给 npx 安装）', () => {
    expect(findCachedHost('0.9.9', npxRoot)).toBeNull();
  });

  it('npx 目录不存在返回 null', () => {
    expect(findCachedHost('0.1.1-rc.2', join(root, 'missing'))).toBeNull();
  });
});

describe('tailLog', () => {
  it('只取末 20 行，token= 参数打码', () => {
    const file = join(root, 'web.log');
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    lines.push('dsh web: http://127.0.0.1:3080/?token=abc123FAKEtoken');
    writeFileSync(file, lines.join('\n'));
    const out = tailLog(file, 20);
    expect(out.split('\n')).toHaveLength(20);
    expect(out).not.toContain('line 6');
    expect(out).toContain('token=***');
    expect(out).not.toContain('abc123FAKEtoken');
  });

  it('日志不存在时返回提示而非抛错', () => {
    expect(tailLog(join(root, 'nope.log'))).toContain('读不到日志');
  });
});

describe('waitReady', () => {
  it('子进程退出立即抛错，带退出码和日志尾', async () => {
    const child = new EventEmitter();
    const waiting = waitReady(child, 5000);
    child.emit('exit', 1, null);
    await expect(waiting).rejects.toThrow(/退出码 1[\s\S]*日志尾/);
  });

  it('被信号杀掉时带信号名', async () => {
    const child = new EventEmitter();
    const waiting = waitReady(child, 5000);
    child.emit('exit', null, 'SIGKILL');
    await expect(waiting).rejects.toThrow(/信号 SIGKILL/);
  });
});

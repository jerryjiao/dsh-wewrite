/**
 * service 层测试共享 harness（push-gate / credentials-write 共用）：
 * 内存版 StorageDomainHandle + CredentialsService + LlmService + fetch 路由 mock。
 * 非 test 文件（vitest 不收集）；断言纪律与 tests/ 其他文件一致。
 */

import { vi } from 'vitest';
import type { CredentialsService, HostLogger, KvTable, StorageDomainHandle } from '@/host/platform';
import type { PipelineLlm } from '@/host/pipeline/engine';

export class MemoryTable<V> implements KvTable<V> {
  private readonly map = new Map<string, V>();
  get(key: string): V | undefined {
    return this.map.get(key);
  }
  put(key: string, value: V): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }
  async update(key: string, patch: (value: V) => V): Promise<void> {
    const current = this.map.get(key);
    if (current !== undefined) this.map.set(key, patch(current));
  }
  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }
  keys(): IterableIterator<string> {
    return this.map.keys();
  }
  get size(): number {
    return this.map.size;
  }
}

export class MemoryDomain implements StorageDomainHandle {
  private readonly tables = new Map<string, MemoryTable<unknown>>();
  private globalValue: unknown = undefined;
  table(name: string): KvTable<unknown> {
    let table = this.tables.get(name);
    if (!table) {
      table = new MemoryTable<unknown>();
      this.tables.set(name, table);
    }
    return table;
  }
  readonly global = {
    get: () => this.globalValue,
    set: (value: unknown) => {
      this.globalValue = value;
      return Promise.resolve();
    },
  };
  async close(): Promise<void> {}
}

export function makeCredentials(values: Record<string, string> = {}) {
  const store = new Map(Object.entries(values));
  const calls = { set: [] as [string, string][], describe: [] as string[], resolve: [] as string[] };
  const service: CredentialsService = {
    set: async (ref, value) => {
      calls.set.push([ref, value]);
      store.set(ref, value);
    },
    describe: (ref) => {
      calls.describe.push(ref);
      return { configured: store.has(ref), writable: true, source: 'test-store' };
    },
    resolve: (ref) => {
      calls.resolve.push(ref);
      return store.get(ref);
    },
    unset: async (ref) => {
      store.delete(ref);
    },
  };
  return { service, calls, store };
}

/** 双调用流：第 1 次返回大纲短文，第 2 次返回注入的成稿（真门禁用）。 */
export function makeLlm(draft = '管线成稿文本，长度足够通过门禁判定。') {
  let callIndex = 0;
  const fn = vi.fn(async () => {
    callIndex += 1;
    async function* generate() {
      if (callIndex === 1) {
        yield { type: 'text' as const, text: '大纲：起承转合四段。' };
        yield { type: 'finish' as const };
        return;
      }
      yield { type: 'text' as const, text: draft };
      yield { type: 'finish' as const };
    }
    return generate();
  });
  return { stream: fn as unknown as PipelineLlm['stream'], fn };
}

export const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

export interface Route {
  match: (url: string) => boolean;
  respond: () => Response;
}

export function makeFetch(routes: Route[]) {
  const log: { method: string; url: string }[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const urlText = String(url);
    log.push({ method: String(init?.method ?? 'GET'), url: urlText });
    for (const route of routes) {
      if (route.match(urlText)) return route.respond();
    }
    return json({ errcode: -99, errmsg: `no route for ${urlText}` });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, log };
}

export const silentLogger: HostLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

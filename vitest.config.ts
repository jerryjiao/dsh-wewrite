import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // client 组件测试（.tsx）在文件头用 `// @vitest-environment jsdom` pragma 声明环境，
    // host/shared 维持默认 node——不用 workspace/projects，侵入最小（architecture §8 M2）。
    // setupFiles：RTL cleanup（仅 jsdom 生效，见 tests/client/rtl-cleanup.ts）。
    // server.deps.inline：宿主 primitives 导入链带 katex CSS，外部化后 node ESM 直接报
    // Unknown file extension ".css"；内联交给 Vite 处理（overlay-exit 用真 Modal 验证 portal/Escape）。
    server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } },
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['tests/client/rtl-cleanup.ts'],
  },
});

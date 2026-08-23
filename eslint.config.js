import tseslint from 'typescript-eslint';

export default tseslint.config(
  // website/ 是独立 Astro 包（自带工具链），根 eslint 只管插件本体
  { ignores: ['node_modules', 'lib', 'dist', 'coverage', 'website'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // chat-integration 边界纪律（architecture §9）：chat/ 与 composer/ 是对话线
  // 自有目录，禁 import components/editor/**（编辑器属并行 AI 改稿线主战场，
  // 物理隔离防止跨线耦合）；写作台联动只经 overlay 桥与 shared 契约。
  {
    files: ['src/client/chat/**', 'src/client/composer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/editor/**', '**/components/editor/*', '@/client/components/editor/**', '@/client/components/editor/*'],
              message: 'chat/composer 禁止 import components/editor/**（并行 AI 改稿线边界，见 architecture §9）',
            },
          ],
        },
      ],
    },
  },
);

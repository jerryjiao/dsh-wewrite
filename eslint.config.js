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
);

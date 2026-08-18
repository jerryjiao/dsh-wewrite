import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'lib', 'dist', 'coverage'] },
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

import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/.turbo/**', 'output/**', 'tmp/**'] },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
];

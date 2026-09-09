import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.axiom/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['apps/chat/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@axiom/core',
            '@axiom/providers',
            '@axiom/storage',
            '**/packages/core/**',
            '**/packages/providers/**',
            '**/packages/storage/**',
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react/*',
            'vite',
            'vite/*',
            'express',
            'express/*',
            '@axiom/providers',
            '@axiom/storage',
            '**/providers/**',
            '**/storage/**',
            'node:*',
          ],
        },
      ],
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@axiom/*', 'node:*', 'react', 'vite', 'express'] },
      ],
    },
  },
  {
    files: ['packages/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@axiom/core', '@axiom/storage', '**/apps/**', 'react', 'express', 'vite'] },
      ],
    },
  },
  {
    files: ['packages/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@axiom/core', '@axiom/providers', '**/apps/**', 'react', 'express', 'vite'] },
      ],
    },
  },
);

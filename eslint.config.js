import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'public/wasm', 'public/models', 'spike', 'data'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // SPEC 8.2 principle 1: the core is pure. No React, DOM adapters or MediaPipe.
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'], // tests run in Node and may read fixtures from disk
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'src/core must not import React.' },
            { group: ['@mediapipe/*'], message: 'src/core must not import MediaPipe.' },
            { group: ['**/app/**', '**/pose/**'], message: 'src/core must not import browser edges.' },
            { group: ['node:*'], message: 'src/core must also run in the browser.' },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
);

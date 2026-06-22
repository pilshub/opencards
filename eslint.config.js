// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts', 'packages/effects/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the seeded RNG from @opencards/core, not Math.random.',
        },
      ],
    },
  },
  {
    files: ['packages/{app,simulator,effects,schema}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@opencards/core',
              importNames: ['State', 'Player', 'Zone', 'CardInstance'],
              message:
                'Use PlayerView via getView(state, playerId) instead. See docs/dev-system.md:90.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@opencards/core',
              importNames: [
                'State',
                'Player',
                'Zone',
                'CardInstance',
                'createInitialState',
                'apply',
                'replay',
                'computeReplayHash',
                'getView',
              ],
              message:
                'Use the facade (startMatch/applyCommand/viewMatch/replayEnvelope) from @opencards/core. Raw state access goes through @opencards/core/internal which is reserved for tooling. See docs/dev-system.md:86-91.',
            },
            {
              name: '@opencards/core/internal',
              message:
                '@opencards/core/internal is reserved for tooling (scripts, simulator). The app must use the facade from @opencards/core. See docs/dev-system.md:86-91.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['packages/{schema,simulator,app}/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Та же конвенция, что у noUnusedParameters в tsconfig: подчёркивание
      // помечает намеренно неиспользуемый параметр заглушки.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Конфиги в .js и node-скрипты в .mjs лежат вне tsconfig — типизированные
  // правила к ним неприменимы, но обычные работают.
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Скрипты замеров: снаружи это node, но внутри `page.evaluate` код исполняет
  // браузер, поэтому там законны `document` и `window`.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },

  // Правила хуков — на весь src: хуки живут и в .ts (src/hooks), иначе
  // exhaustive-deps их не видит. react-refresh — только на .tsx, он про
  // экспорт компонентов.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  {
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite],
  },

  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Архитектурная граница из TASK.md, продублированная на уровне линтера.
  // Тест tests/game-boundary.test.ts ловит то же самое на CI.
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/game/** — чистая логика: импорты react запрещены (TASK.md, раздел 1).',
            },
            {
              group: ['pixi.js', 'pixi.js/*', '@pixi/*'],
              message: 'src/game/** — чистая логика: импорты pixi.js запрещены (TASK.md, раздел 1).',
            },
          ],
        },
      ],
    },
  },
);

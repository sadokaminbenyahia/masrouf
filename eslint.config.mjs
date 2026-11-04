import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Règles d'architecture (couches) :
 *  - src/domain   : pur, ne dépend de RIEN (ni framework, ni Prisma, ni Zod, ni autre couche)
 *  - src/server   : peut importer domain + lib, jamais app/components
 *  - src/components et src/lib : jamais src/server (sauf `import type`)
 */
const layerRule = (patterns) => ['error', { patterns, paths: [] }];

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': layerRule([
        {
          group: ['next', 'next/*', 'react', 'react/*', 'react-dom'],
          message: 'Le domaine est pur : aucun framework.',
        },
        { group: ['@prisma/*', '.prisma/*'], message: 'Le domaine ne connaît pas Prisma.' },
        {
          group: ['zod'],
          message: 'Le domaine ne dépend de rien (la validation Zod se fait aux frontières).',
        },
        {
          group: [
            '@/server',
            '@/server/*',
            '@/app',
            '@/app/*',
            '@/components',
            '@/components/*',
            '@/lib',
            '@/lib/*',
          ],
          message: 'Le domaine ne dépend d’aucune autre couche.',
        },
      ]),
    },
  },
  {
    files: ['src/server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': layerRule([
        {
          group: ['@/app', '@/app/*', '@/components', '@/components/*', 'react', 'react-dom'],
          message: 'Le serveur ne dépend pas de l’UI.',
        },
      ]),
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': layerRule([
        {
          group: ['@/server', '@/server/*'],
          message: 'L’UI passe par les server actions (src/app/actions).',
          allowTypeImports: true,
        },
        { group: ['@prisma/*'], message: 'L’UI ne connaît pas Prisma.', allowTypeImports: false },
      ]),
    },
  },
  {
    files: [
      'e2e/**/*.ts',
      'tests/**/*.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      'prisma/**/*.ts',
      '*.config.ts',
      '*.config.mjs',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
];

export default config;

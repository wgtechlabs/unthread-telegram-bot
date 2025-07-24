import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import security from 'eslint-plugin-security';

export default [
  // Base recommended configs
  js.configs.recommended,
  
  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
        URL: 'readonly',
        // Console (usually available in Node.js)
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
      'security': security,
    },
    rules: {
      // Dead Code Detection (formerly in -deadcode config)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      
      // Code Quality & Best Practices
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'no-unused-expressions': 'error',
      'no-unused-labels': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-duplicate-imports': 'error',
      
      // Import Organization
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true,
        },
      ],
      
      // Security Rules (make them warnings instead of errors for now)
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'warn',
      
      // Relax some rules that are causing too many errors
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  
  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  
  // Files with temporarily disabled features (attachment processing)
  {
    files: [
      '**/attachmentHandler.ts',
      '**/errorHandler.ts', 
      '**/types.ts',
      '**/webhookMessage.ts'
    ],
    rules: {
      // TODO: Re-enable after attachment processing refactoring is complete (Target: v1.1.0)
      '@typescript-eslint/no-unused-vars': 'off', // Completely off for disabled features
      // TODO: Re-enable after attachment processing refactoring is complete (Target: v1.1.0)
      'no-unused-vars': 'off', // Completely off for disabled features
      // TODO: Re-enable after attachment processing refactoring is complete (Target: v1.1.0)
      'unused-imports/no-unused-vars': 'off', // Completely off for disabled features
      // TODO: Re-enable after attachment processing refactoring is complete (Target: v1.1.0)
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in disabled features
      // TODO: Re-enable after attachment processing security review is complete (Target: v1.1.0)
      'security/detect-non-literal-fs-filename': 'off', // Allow filesystem operations
      // TODO: Re-enable after attachment processing regex cleanup is complete (Target: v1.1.0)
      'no-control-regex': 'off', // Allow control characters in regex
      // TODO: Re-enable after attachment processing string handling cleanup is complete (Target: v1.1.0)
      'no-useless-escape': 'off', // Allow escape characters
    },
  },
  
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
];

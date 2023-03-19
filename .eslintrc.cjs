module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    es6: true,
    node: true,
  },
  plugins: ['jsdoc', 'prettier', '@typescript-eslint'],
  parser: './node_modules/@typescript-eslint/parser/dist/index.js',
  extends: [
    'google',
    'plugin:jsdoc/recommended',
    'plugin:prettier/recommended',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  rules: {
    'jsdoc/require-returns-description': 'off',
    'jsdoc/require-property-description': 'off',
    'jsdoc/require-param-description': 'off',
    'prettier/prettier': 'error',
    'require-jsdoc': 'off',
    'valid-jsdoc': 'off',
    // Mongoose and such
    'no-invalid-this': 'off',
    'no-undef': 'error',
    'no-console': 'error',
    'no-const-assign': 'error',
    'no-unused-vars': ['error', {varsIgnorePattern: '^logger$', args: 'none'}],
    // using tsserver for this
    'jsdoc/no-undefined-types': 'off',
    'jsdoc/valid-types': 'off',
    'jsdoc/check-types': 'off',
    'jsdoc/check-tag-names': [
      'error',
      {
        definedTags: [
          'template',
          'api',
          'apiErrorExample',
          'apidefine',
          'apiExample',
          'apiGroup',
          'apiName',
          'apiParam',
          'apiDescription',
          'apiSuccessExample',
          'apiHeader',
        ],
      },
    ],
    'require-yield': 'error',
    'max-len': [
      'error',
      {
        code: 100,
        ignoreComments: true,
        ignorePattern: /( = require\()|(^\s*(return\s*)?'.*'[,;]?$)/.source,
        ignoreUrls: true,
        tabWidth: 2,
      },
    ],
  },
};

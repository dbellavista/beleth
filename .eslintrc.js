module.exports = {
  env: {
    es6: true,
    node: true
  },
  extends: ['google'],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'script'
  },
  rules: {
    'require-jsdoc': 'off',
    'no-invalid-this': 'off',
    'no-undef': 'error',
    'no-const-assign': 'error'
  }
};

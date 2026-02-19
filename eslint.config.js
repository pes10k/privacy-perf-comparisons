import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  stylistic.configs['recommended'],
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        "caughtErrorsIgnorePattern": "ignore"
      }],
      'camelcase': ['error', {
        'properties': 'never'
      }]
    }
  },
  {
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      "@stylistic/indent": ["error", 2, {
        "FunctionExpression": {
          "parameters": "first"
        },
        "CallExpression" : {
          "arguments": "first",
        },
        "ArrayExpression": "first",
      }],
      "@stylistic/space-before-function-paren": ["error", "always"],
    }
  }
)
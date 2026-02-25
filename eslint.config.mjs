import globals from 'globals'
import pluginJs from '@eslint/js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['dist/**'] },
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  { languageOptions: { globals: { ...globals.node } } },
  pluginJs.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module'
      }
    }
  }
]

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['dist', '.e2e-dist', 'public/data', '.worktrees', '.local', 'node_modules', 'test-results', 'playwright-report', '.wrangler', 'src/imagery/SpriteSheet.vue'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
)

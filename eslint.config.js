import antfu from '@antfu/eslint-config';

export default antfu(
  {
    vue: true,
    typescript: true,
    formatters: {
    /**
     * Format CSS, LESS, SCSS files, also the `<style>` blocks in Vue
     * By default uses Prettier
     */
      css: true,
      /**
       * Format HTML files
       * By default uses Prettier
       */
      html: true,
      /**
       * Format Markdown files
       * Supports Prettier and dprint
       * By default uses Prettier
       */
      markdown: 'prettier',
    },
    rules: {
      'style/semi': ['error', 'always'],
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/block-order': ['error', {
        order: [['template', 'script'], 'style'],
      }],
    },
  },
  {
    files: ['server/**/*.ts', 'drizzle.config.ts'],
    rules: {
      'node/prefer-global/process': 'off',
      'node/prefer-global/buffer': 'off',
    },
  },
  {
    files: ['docs/**'],
    rules: {
      'markdown/fenced-code-language': 'off',
    },
  },
);

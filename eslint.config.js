import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.wrangler/**', 'design/**', 'reference/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

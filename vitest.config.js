import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    // Sem isso, o vitest varre o projeto inteiro e também executa os
    // testes do backend/ (que têm seu próprio `npm test` e node_modules).
    exclude: ['**/node_modules/**', 'backend/**'],
  },
});

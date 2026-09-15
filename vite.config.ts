import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Репозиторий деплоится на GitHub Pages как ingvar.github.io/duskwing/.
  base: '/duskwing/',
  plugins: [react()],
  test: {
    // По ТЗ vitest покрывает только чистую логику: ни jsdom, ни тестов рендера.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

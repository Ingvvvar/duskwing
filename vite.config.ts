import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Репозиторий деплоится на GitHub Pages как ingvar.github.io/duskwing/.
  base: '/duskwing/',
  plugins: [react()],
  build: {
    /**
     * Pixi занимает около 530 kB и загружается целиком: игра без рендера не
     * работает. Порог поднят до 600 осознанно, а не чтобы заглушить
     * предупреждение — его смысл в том, чтобы ловить случайный рост, и при
     * 600 он это по-прежнему делает. Дробление Pixi на шесть чанков ради
     * цифры даёт шесть запросов вместо одного и ничего не экономит.
     *
     * Настоящее уменьшение — `skipExtensionImports: true` с явным списком
     * нужных расширений. Это ждёт фазы 7: там меняется набор того, что
     * рисуется, а вместе с ним и список импортов.
     */
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Pixi отдельным чанком: он больше всего остального вместе взятого
        // и меняется только с обновлением версии, поэтому кэшируется
        // отдельно от кода игры. Заодно уходит предупреждение о 500 kB.
        advancedChunks: {
          groups: [
            { name: 'pixi', test: /node_modules[\\/]pixi\.js/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    // По ТЗ vitest покрывает только чистую логику: ни jsdom, ни тестов рендера.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

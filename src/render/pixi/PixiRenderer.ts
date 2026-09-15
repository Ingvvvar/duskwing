import type { GameState, Renderer, Theme } from '../../game/types';

/**
 * Реализация `Renderer` на PixiJS v8.
 *
 * В фазе 0 здесь только форма контракта: тела методов пустые, `pixi.js` ещё не
 * импортируется. Параметры с подчёркиванием — чтобы `noUnusedParameters` не
 * ругался на заглушки; имена без подчёркивания вернутся вместе с реализацией.
 */
export class PixiRenderer implements Renderer {
  init(_canvas: HTMLCanvasElement, _theme: Theme): Promise<void> {
    // TODO: фаза 2 — await app.init({ canvas, resolution: devicePixelRatio, autoDensity: true }).
    return Promise.resolve();
  }

  setTheme(_theme: Theme, _crossfadeMs: number): void {
    // TODO: фаза 5 — кроссфейд сцен 700 мс, старая уничтожается с texture: false.
  }

  draw(_state: GameState, _dtMs: number): void {
    // TODO: фаза 2 — отрисовка кадра по состоянию с интерполяцией между шагами.
  }

  resize(_width: number, _height: number): void {
    // TODO: фаза 2 — пересчёт масштаба логической сетки 360×640.
  }

  destroy(): void {
    // TODO: фаза 2 — destroy({ children: true, texture: false }).
  }
}

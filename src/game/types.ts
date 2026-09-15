/**
 * Архитектурная граница проекта.
 *
 * Этот файл и весь `src/game/**` — чистый TypeScript: ни одного импорта `react`
 * и ни одного импорта `pixi.js`. Логика знает только о числах и своём состоянии,
 * рендер получает состояние снаружи. Проверяется `tests/game-boundary.test.ts`
 * и правилом `no-restricted-imports` в `eslint.config.js`.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type --
   GameState и LevelConfig заполняются в фазе 1, Theme — в фазе 3. До тех пор они
   намеренно пустые: интерфейс Renderer должен ссылаться на настоящие типы уже
   сейчас, чтобы его реализация не переписывалась вместе с ними. */

/** Состояние симуляции на один шаг. TODO: фаза 1. */
export interface GameState {}

/** Конфиг уровня — данные, не код. TODO: фаза 1. */
export interface LevelConfig {}

/** Визуальная тема уровня — данные, не код. TODO: фаза 3. */
export interface Theme {}

/* eslint-enable @typescript-eslint/no-empty-object-type */

/**
 * Контракт рендера. Логика не знает, что по ту сторону: PixiJS, canvas 2D
 * или заглушка в тесте.
 */
export interface Renderer {
  init(canvas: HTMLCanvasElement, theme: Theme): Promise<void>;
  setTheme(theme: Theme, crossfadeMs: number): void;
  draw(state: GameState, dtMs: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

/**
 * Архитектурная граница проекта.
 *
 * Этот файл и весь `src/game/**` — чистый TypeScript: ни одного импорта `react`
 * и ни одного импорта `pixi.js`, ни `Math.random`, ни обращений к часам.
 * Логика знает только о числах и своём состоянии, рендер получает состояние
 * снаружи. Проверяется `tests/game-boundary.test.ts` и правилом
 * `no-restricted-imports` в `eslint.config.js`.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type --
   Theme заполняется в фазе 3. До тех пор он намеренно пустой: интерфейс
   Renderer должен ссылаться на настоящий тип уже сейчас. */

/** Визуальная тема уровня — данные, не код. TODO: фаза 3. */
export interface Theme {}

/* eslint-enable @typescript-eslint/no-empty-object-type */

/** Состояние автомата игры. Цель уровня сюда не входит: её сверяет UI. */
export type GamePhase = 'ready' | 'play' | 'over';

/** Труба как значение: за время жизни не мутируется, а пересобирается. */
export interface Pipe {
  /** Сквозной номер. По нему тесты опознают трубу после ухода за экран. */
  readonly id: number;
  /** Левый край. Труба едет влево. */
  readonly x: number;
  readonly gapCenter: number;
  readonly gapHeight: number;
  /** Очко за трубу засчитывается ровно один раз — этим флагом. */
  readonly scored: boolean;
}

/** Снимок симуляции. Всё только на чтение. */
export interface GameState {
  readonly phase: GamePhase;
  readonly birdY: number;
  readonly birdVelocity: number;
  /**
   * Высота птицы на начало последнего шага и доля незакрытого шага в
   * аккумуляторе, 0…1. Вдвоём дают рендеру интерполяцию между тиками
   * фиксированного шага (TASK.md, раздел 2). Потребитель появится в фазе 2.
   */
  readonly prevBirdY: number;
  readonly alpha: number;
  readonly score: number;
  readonly elapsedMs: number;
  readonly pipes: readonly Pipe[];
}

/** Конфиг уровня — данные, не код (TASK.md, раздел 3). */
export interface LevelConfig {
  id: number;
  name: string;
  target: number;           // сколько труб пройти
  gravity: number;
  flapVelocity: number;     // отрицательное
  pipeSpeed: number;
  pipeGap: number;
  pipeSpacing: number;
  gapDrift: number;         // предел и разброса от центра, и расхождения соседей, px
  runwayMs: number;         // пауза до первой трубы
  ramp: { speedPerPipe: number; gapPerPipe: number; minGap: number } | null;
  mechanics: {
    movingPipes?: { amplitude: number; periodMs: number };
    airflow?: { zones: number; strength: number };  // вертикальный снос
  };
  themeId: string;
}

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

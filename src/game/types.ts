/**
 * Архитектурная граница проекта.
 *
 * Этот файл и весь `src/game/**` — чистый TypeScript: ни одного импорта `react`
 * и ни одного импорта `pixi.js`, ни `Math.random`, ни обращений к часам.
 * Логика знает только о числах и своём состоянии, рендер получает состояние
 * снаружи. Проверяется `tests/game-boundary.test.ts` и правилом
 * `no-restricted-imports` в `eslint.config.js`.
 */

/** Визуальная тема уровня — данные, не код (TASK.md, раздел 4). */
export interface Theme {
  id: string;
  sky: [string, string, string, string];         // стопы градиента сверху вниз
  celestial: { kind: 'sun' | 'moon' | 'none'; x: number; y: number; glow: string; stars: number };
  ridgeFar: { color: string; amplitude: number; roughness: number; seed: number };
  ridgeNear: { color: string; amplitude: number; roughness: number; seed: number };
  haze: { color: string; alpha: number } | null;
  weather: { kind: 'none' | 'rain' | 'snow' | 'fireflies' | 'dust'; count: number; speed: number };
  ground: { base: string; top: string };
  foreground: { kind: 'none' | 'grass' | 'streaks' | 'rocks'; blur: number };
  grade: { saturation: number; brightness: number; tint: string; vignette: number };
  accent: string;                                 // цвет труб — задаётся темой
}

/** Состояние автомата игры. Цель уровня сюда не входит: её сверяет UI. */
export type GamePhase = 'ready' | 'play' | 'over';

/** Труба как значение: за время жизни не мутируется, а пересобирается. */
export interface Pipe {
  /** Сквозной номер. По нему тесты опознают трубу после ухода за экран. */
  readonly id: number;
  /** Левый край. Труба едет влево. */
  readonly x: number;
  /** Действующий центр просвета: уже с учётом вертикального хода трубы. */
  readonly gapCenter: number;
  /** Центр колебания. Без `movingPipes` совпадает с `gapCenter`. */
  readonly baseGapCenter: number;
  /** Фаза колебания, 0…1. Своя у каждой трубы: синхронный ряд читался бы
   *  как одна сплошная стена, а не как отдельные препятствия. */
  readonly phase: number;
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
  /**
   * Пройденное миром расстояние. Мировая координата экранной точки `x` — это
   * `travelledX + x`; по ней считаются зоны `airflow`, и по ней же их будет
   * рисовать рендер. Копится тем же интегралом, что двигает трубы, поэтому
   * учитывает разгон из `ramp`.
   */
  readonly travelledX: number;
  /**
   * Безопасно ли сейчас начать вспышку во весь экран.
   *
   * Считается по худшему случаю — длительности `FLASH_MAX_MS`, — поэтому
   * разрешение годится для любой более короткой вспышки. Живёт в состоянии,
   * а не в рендере, потому что зависит от расписания появления труб: у
   * рендера его нет, а заводить вторую копию расписания нельзя.
   */
  readonly flashAllowed: boolean;
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

import {
  BIRD_RADIUS_HITBOX,
  BIRD_START_Y,
  BIRD_X,
  FLYABLE_CENTER,
  GROUND_TOP,
  MAX_FRAME_MS,
  PIPE_WIDTH,
  STEP_MS,
  STEP_SECONDS,
  WORLD_WIDTH,
} from './constants';
import { airflowAt, pipeGapCenterAt } from './mechanics';
import { circleHitsRect, hitsGround, integrateVertical, pipeRects, resolveCeiling } from './physics';
import type { Rng } from './rng';
import type { GamePhase, GameState, LevelConfig, Pipe } from './types';

/**
 * Конечный автомат и шаг симуляции.
 *
 * Время приходит единственным путём — параметром `step`. Обращений к часам
 * внутри нет и быть не должно: иначе прогон перестаёт воспроизводиться.
 *
 * Рестарта нет намеренно: мгновенная новая попытка — это `new Game(...)`.
 * Заодно вызывающий сам решает, передать тот же поток `rng` (новая раскладка
 * на каждой попытке) или свежий с тем же сидом (та же раскладка).
 */
export class Game {
  readonly #config: LevelConfig;
  readonly #rng: Rng;

  #phase: GamePhase = 'ready';
  #birdY = BIRD_START_Y;
  #prevBirdY = BIRD_START_Y;
  #birdVelocity = 0;
  #score = 0;
  #elapsedMs = 0;
  #accumulatorMs = 0;
  #pipes: readonly Pipe[] = [];
  #nextPipeId = 0;
  #lastGapCenter = FLYABLE_CENTER;
  /** Пройденное миром расстояние: мировая система координат для airflow. */
  #travelledX = 0;
  /** Сколько труб уже родилось. Шаг разгона `ramp` считается по ним. */
  #spawned = 0;

  constructor(config: LevelConfig, rng: Rng) {
    this.#config = config;
    this.#rng = rng;
  }

  /** Снимок на чтение. Внутреннее состояние наружу не утекает. */
  get state(): GameState {
    return {
      phase: this.#phase,
      birdY: this.#birdY,
      birdVelocity: this.#birdVelocity,
      prevBirdY: this.#prevBirdY,
      alpha: this.#accumulatorMs / STEP_MS,
      score: this.#score,
      elapsedMs: this.#elapsedMs,
      travelledX: this.#travelledX,
      pipes: this.#pipes,
    };
  }

  /** Первый тап выводит игру из `ready`. После смерти тап ничего не делает. */
  flap(): void {
    if (this.#phase === 'over') {
      return;
    }

    this.#phase = 'play';
    this.#birdVelocity = this.#config.flapVelocity;
  }

  step(dtMs: number): void {
    if (this.#phase !== 'play') {
      return;
    }

    // Тикер отдаёт 0 на первом кадре и мусор при возврате из фона.
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }

    this.#accumulatorMs += Math.min(dtMs, MAX_FRAME_MS);

    while (this.#accumulatorMs >= STEP_MS) {
      this.#accumulatorMs -= STEP_MS;

      if (!this.#tick()) {
        // Остаток времени после смерти досчитывать нечего, и alpha должна
        // остаться в [0, 1) даже если аккумулятор был полон.
        this.#accumulatorMs = 0;
        break;
      }
    }
  }

  /** Возвращает false, если этот тик оказался последним. */
  #tick(): boolean {
    this.#prevBirdY = this.#birdY;
    this.#elapsedMs += STEP_MS;

    // Поток считается для мировой позиции птицы той же функцией, которой в
    // подходе Б рендер будет рисовать полосы ветра.
    const { airflow } = this.#config.mechanics;
    const drift = airflow === undefined ? 0 : airflowAt(this.#travelledX + BIRD_X, airflow);

    const moved = resolveCeiling(
      integrateVertical(
        { y: this.#birdY, velocity: this.#birdVelocity },
        this.#config.gravity + drift,
        STEP_SECONDS,
      ),
      BIRD_RADIUS_HITBOX,
    );

    this.#birdY = moved.y;
    this.#birdVelocity = moved.velocity;

    this.#advancePipes();

    if (hitsGround(this.#birdY, BIRD_RADIUS_HITBOX) || this.#hitsAnyPipe()) {
      this.#phase = 'over';
      return false;
    }

    return true;
  }

  /**
   * Массив труб пересобирается целиком, трубы не мутируются на месте: так
   * снимок из `state` остаётся снимком, а не окном в живой массив. Цена —
   * порядка пятисот мелких объектов в секунду. Если на фазе 5 аллокации
   * всплывут в профиле, переходим на копирование при чтении снимка, а не на
   * мутацию на месте: иначе сломается и детерминизм тестов, и интерполяция.
   */
  #advancePipes(): void {
    const { pipeSpacing, runwayMs } = this.#config;
    const { movingPipes } = this.#config.mechanics;
    const shift = this.#speed() * STEP_SECONDS;
    const moved: Pipe[] = [];

    this.#travelledX += shift;

    for (const pipe of this.#pipes) {
      const x = pipe.x - shift;

      if (x + PIPE_WIDTH < 0) {
        continue;
      }

      const scored = pipe.scored || x + PIPE_WIDTH < BIRD_X;

      if (scored && !pipe.scored) {
        this.#score += 1;
      }

      moved.push({
        ...pipe,
        x,
        scored,
        gapCenter: pipeGapCenterAt(pipe.baseGapCenter, pipe.phase, this.#elapsedMs, movingPipes),
      });
    }

    const last = moved[moved.length - 1];
    const dueForSpawn =
      last === undefined ? this.#elapsedMs >= runwayMs : last.x <= WORLD_WIDTH - pipeSpacing;

    if (dueForSpawn) {
      moved.push(this.#spawnPipe());
    }

    this.#pipes = moved;
  }

  /** Скорость с учётом разгона: общая для всех труб на экране. */
  #speed(): number {
    const { ramp, pipeSpeed } = this.#config;

    return ramp === null ? pipeSpeed : pipeSpeed + ramp.speedPerPipe * this.#spawned;
  }

  /** Просвет с учётом разгона. Фиксируется у трубы в момент рождения. */
  #gap(): number {
    const { ramp, pipeGap } = this.#config;

    return ramp === null ? pipeGap : Math.max(ramp.minGap, pipeGap - ramp.gapPerPipe * this.#spawned);
  }

  #spawnPipe(): Pipe {
    const { gapDrift } = this.#config;
    const { movingPipes } = this.#config.mechanics;
    const gapHeight = this.#gap();
    // Удержание учитывает амплитуду хода: колеблющаяся труба не должна
    // вылезти ни за потолок, ни за землю в крайних точках колебания.
    const margin = gapHeight / 2 + (movingPipes?.amplitude ?? 0);

    // Три ограничения разом, без ветвлений:
    //   полоса ±gapDrift вокруг центра лётной зоны (LevelConfig),
    //   расхождение с соседом не больше gapDrift (TASK.md, раздел 3),
    //   просвет целиком внутри лётной зоны с запасом на колебание.
    const lower = Math.max(FLYABLE_CENTER - gapDrift, this.#lastGapCenter - gapDrift, margin);
    const upper = Math.min(FLYABLE_CENTER + gapDrift, this.#lastGapCenter + gapDrift, GROUND_TOP - margin);
    const baseGapCenter = lower + this.#rng() * Math.max(0, upper - lower);
    const phase = this.#rng();

    this.#lastGapCenter = baseGapCenter;
    this.#spawned += 1;
    const id = this.#nextPipeId;
    this.#nextPipeId += 1;

    return {
      id,
      x: WORLD_WIDTH,
      gapCenter: pipeGapCenterAt(baseGapCenter, phase, this.#elapsedMs, movingPipes),
      baseGapCenter,
      phase,
      gapHeight,
      scored: false,
    };
  }

  #hitsAnyPipe(): boolean {
    for (const pipe of this.#pipes) {
      const [top, bottom] = pipeRects(pipe.x, pipe.gapCenter, pipe.gapHeight);

      if (
        circleHitsRect(BIRD_X, this.#birdY, BIRD_RADIUS_HITBOX, top) ||
        circleHitsRect(BIRD_X, this.#birdY, BIRD_RADIUS_HITBOX, bottom)
      ) {
        return true;
      }
    }

    return false;
  }
}

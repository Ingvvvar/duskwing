import { Application, Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';

import { MAX_FRAME_MS, STEP_SECONDS, WORLD_HEIGHT, WORLD_WIDTH } from '../../game/constants';
import type { GameState, LevelConfig, Renderer, Theme } from '../../game/types';
import { BirdRig } from './entities/Bird';
import { PipePool } from './entities/Pipes';
import { Scene } from './Scene';

const LETTERBOX = 0x05060e;

/** Доля скорости уровня, с которой фон ползёт до первого тапа. */
const READY_PACE = 0.25;

interface DebugGlobal {
  __duskwingPixiInstances?: number;
}

/**
 * Счётчик живых экземпляров под DEV. Нужен, чтобы двойной монтаж StrictMode
 * можно было проверить прямо: в консоли дева `__duskwingPixiInstances`
 * обязан быть равен единице.
 */
function trackInstances(delta: number): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const scope = globalThis as DebugGlobal;

  scope.__duskwingPixiInstances = (scope.__duskwingPixiInstances ?? 0) + delta;
}

/**
 * Реализация `Renderer` на PixiJS v8.
 *
 * Конфиг уровня нужен ради `pipeSpeed` — им задаётся и интерполяция труб, и
 * скорость прокрутки фона — и передаётся конструктором: интерфейс `Renderer`
 * от этого не зависит.
 */
export class PixiRenderer implements Renderer {
  #config: LevelConfig;

  #app: Application | null = null;
  #world: Container | null = null;
  #bird: BirdRig | null = null;
  #pipes: PipePool | null = null;

  /** Слоты фиксируют порядок по z: сцены приходят и уходят внутри них. */
  readonly #backgroundSlot = new Container({ label: 'background-slot' });
  readonly #nearSlot = new Container({ label: 'near-slot' });
  readonly #gradeSlot = new Container({ label: 'grade-slot' });

  #current: Scene | null = null;
  #next: Scene | null = null;
  #theme: Theme | null = null;
  #nextAccent: string | null = null;
  #fadeMs = 0;
  #fadeTotalMs = 0;
  #reducedMotion = false;

  /**
   * Пройденное фоном расстояние. Величина чисто визуальная, поэтому копится
   * здесь, а не в `GameState`.
   */
  #scrollX = 0;

  constructor(config: LevelConfig) {
    this.#config = config;
  }

  /**
   * Конфиг текущего уровня. Из него берутся скорость прокрутки фона,
   * интерполяция труб и зоны для полос ветра, поэтому он обязан меняться при
   * смене уровня, а не оставаться тем, с которым рендер был создан: иначе
   * земля с параллаксом 1.0 едет со скоростью первого уровня.
   *
   * Не часть контракта `Renderer`: тот работает с состоянием, а не с уровнем.
   */
  /**
   * `prefers-reduced-motion`. По контракту ТЗ: частицы выключаются, вспышек
   * нет, кроссфейд мгновенный. Меняется на ходу — настройку системы можно
   * переключить, не перезагружая страницу.
   *
   * Не часть контракта `Renderer`: это свойство среды, а не состояния.
   */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.#reducedMotion) {
      return;
    }

    this.#reducedMotion = reduced;

    const app = this.#app;

    if (app !== null && this.#theme !== null) {
      // Пересборка сцены: частицы надо не остановить, а не создавать.
      this.#current?.setTheme(app.renderer, this.#theme, this.#config, reduced);
    }
  }

  setLevel(config: LevelConfig): void {
    this.#config = config;

    const app = this.#app;

    // Полосы ветра зависят от зон уровня — сцену надо пересобрать под них.
    if (app !== null && this.#theme !== null) {
      this.#current?.setTheme(app.renderer, this.#theme, config, this.#reducedMotion);
    }
  }

  async init(canvas: HTMLCanvasElement, theme: Theme): Promise<void> {
    const app = new Application();

    await app.init({
      canvas,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      antialias: true,
      background: LETTERBOX,
      // Тикер запускает подписчик: иначе между init и подпиской пройдут кадры
      // с пустой сценой.
      autoStart: false,
    });

    const world = new Container({ label: 'world' });
    const pipes = new PipePool(theme.accent);
    const bird = new BirdRig();

    // Игровой слой всегда выше слоёв фона и никогда не получает фильтров.
    const gameplay = new Container({ label: 'gameplay' });

    gameplay.addChild(pipes.container, bird.view);
    world.addChild(this.#backgroundSlot, gameplay, this.#nearSlot, this.#gradeSlot);

    // Маска по логической сетке. Нужна из-за труб: труба рождается при
    // x = WORLD_WIDTH и своей шириной заходит за правый край мира, то есть
    // без маски рисуется прямо в полосе леттербокса.
    const frame = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(0xffffff);

    world.addChild(frame);
    world.mask = frame;

    app.stage.addChild(world);

    this.#app = app;
    this.#world = world;
    this.#bird = bird;
    this.#pipes = pipes;

    this.setTheme(theme, 0);

    trackInstances(1);
  }

  /**
   * Смена темы. При нулевой длительности — мгновенная подмена, иначе
   * кроссфейд: новая сцена строится невидимой и за `crossfadeMs` гасит собой
   * старую. На время перехода живут две сцены, то есть четыре прохода
   * фильтра вместо двух; бюджет ТЗ писался под геймплей, а переход играется
   * на экране «уровень пройден», где мир заморожен.
   */
  setTheme(theme: Theme, crossfadeMs: number): void {
    const app = this.#app;

    if (app === null) {
      return;
    }

    // Переход, не успевший закончиться, завершается мгновенно: двух
    // одновременных кроссфейдов не бывает.
    this.#finishFade();
    this.#theme = theme;

    // При prefers-reduced-motion кроссфейд мгновенный — контракт ТЗ.
    const fadeMs = this.#reducedMotion ? 0 : crossfadeMs;

    if (this.#current === null || fadeMs <= 0) {
      const scene = this.#current ?? this.#createScene();

      scene.setTheme(app.renderer, theme, this.#config, this.#reducedMotion);
      scene.setAlpha(1);
      this.#current = scene;
      this.#pipes?.setColor(theme.accent);

      return;
    }

    const next = this.#createScene();

    next.setTheme(app.renderer, theme, this.#config, this.#reducedMotion);
    next.setAlpha(0);

    this.#next = next;
    this.#nextAccent = theme.accent;
    this.#fadeMs = 0;
    this.#fadeTotalMs = fadeMs;
  }

  draw(state: GameState, dtMs: number): void {
    const bird = this.#bird;
    const pipes = this.#pipes;

    if (bird === null || pipes === null) {
      return;
    }

    // Трубы — тот же момент времени, что и птица, поэтому (1 - alpha), а не
    // alpha: при alpha = 0 показывается положение на предыдущем тике, при
    // alpha → 1 — текущее. С alpha трубы ушли бы на тик вперёд птицы.
    pipes.sync(state.pipes, (1 - state.alpha) * this.#config.pipeSpeed * STEP_SECONDS);

    // До первого тапа фон ползёт на четверти скорости — мир ещё не запущен,
    // но и не мёртв. На `over` всё замирает: пауза после смерти работает
    // именно тем, что останавливается всё сразу.
    const pace = state.phase === 'play' ? 1 : state.phase === 'ready' ? READY_PACE : 0;
    const stepMs = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, MAX_FRAME_MS) : 0;
    const advance = (this.#config.pipeSpeed * stepMs * pace) / 1000;

    this.#scrollX += advance;

    // Риг замирает вместе с миром: при pace = 0 (смерть, «уровень пройден»)
    // не двигаются ни пружины, ни моргание, ни холостое колебание.
    bird.update(state, pace > 0 ? stepMs : 0, this.#config.flapVelocity, this.#reducedMotion);

    this.#current?.update(state, dtMs, this.#scrollX, advance);
    this.#next?.update(state, dtMs, this.#scrollX, advance);
    this.#advanceFade(stepMs);
  }

  resize(width: number, height: number): void {
    const app = this.#app;
    const world = this.#world;

    if (app === null || world === null || width <= 0 || height <= 0) {
      return;
    }

    app.renderer.resize(width, height);

    // Пропорции сохраняются, остаток уходит в полосы леттербокса. Внутри
    // world все координаты логические — пересчёт не протекает в логику.
    const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);

    world.scale.set(scale);
    world.position.set((width - WORLD_WIDTH * scale) / 2, (height - WORLD_HEIGHT * scale) / 2);
  }

  /**
   * Подписка на кадры тикера; возвращает отписку.
   *
   * Не входит в контракт `Renderer` намеренно: цикл — деталь конкретной
   * реализации, а хук про Pixi знать не должен. `pixi.js` импортируется
   * только внутри `src/render/**`.
   */
  onFrame(callback: (dtMs: number) => void): () => void {
    const app = this.#app;

    if (app === null) {
      throw new Error('PixiRenderer.onFrame вызван до init');
    }

    const tick = (): void => {
      callback(app.ticker.deltaMS);
    };

    // HIGH — чтобы шаг симуляции прошёл до app.render(), который висит на LOW.
    app.ticker.add(tick, undefined, UPDATE_PRIORITY.HIGH);
    app.start();

    return () => {
      app.ticker.remove(tick);
      app.stop();
    };
  }

  destroy(): void {
    const app = this.#app;

    if (app === null) {
      return;
    }

    this.#next?.destroy();
    this.#next = null;
    this.#current?.destroy();
    this.#current = null;
    this.#pipes?.destroy();

    // removeView: false — канвасом владеет React, забирать его из DOM нельзя.
    // releaseGlobalResources: true — иначе повторная инициализация в той же
    // вкладке (а это ровно StrictMode) тянет за собой мусор старых пулов.
    app.destroy(
      { removeView: false, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true },
    );

    this.#app = null;
    this.#world = null;
    this.#bird = null;
    this.#pipes = null;

    trackInstances(-1);
  }

  #createScene(): Scene {
    const scene = new Scene();

    this.#backgroundSlot.addChild(scene.background);
    this.#nearSlot.addChild(scene.near);
    this.#gradeSlot.addChild(scene.grade.vignette);

    return scene;
  }

  #advanceFade(stepMs: number): void {
    const next = this.#next;

    if (next === null) {
      return;
    }

    this.#fadeMs += stepMs;

    const t = this.#fadeTotalMs <= 0 ? 1 : Math.min(1, this.#fadeMs / this.#fadeTotalMs);

    this.#current?.setAlpha(1 - t);
    next.setAlpha(t);

    if (t >= 1) {
      this.#finishFade();
    }
  }

  #finishFade(): void {
    const next = this.#next;

    if (next === null) {
      return;
    }

    this.#current?.destroy();
    this.#current = next;
    this.#next = null;
    next.setAlpha(1);

    if (this.#nextAccent !== null) {
      // Цвет труб меняется разом в конце перехода: плавно смешивать его
      // нечем, а на середине подмена была бы заметнее всего.
      this.#pipes?.setColor(this.#nextAccent);
      this.#nextAccent = null;
    }
  }
}

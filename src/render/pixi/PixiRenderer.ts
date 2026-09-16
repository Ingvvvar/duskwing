import { Application, Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';

import { GROUND_TOP, MAX_FRAME_MS, STEP_SECONDS, WORLD_HEIGHT, WORLD_WIDTH } from '../../game/constants';
import type { GameState, LevelConfig, Renderer, Theme } from '../../game/types';
import { PARALLAX, WEATHER_PARALLAX } from '../parallax';
import { createBird } from './entities/Bird';
import { PipePool } from './entities/Pipes';
import { CelestialLayer } from './layers/Celestial';
import { ForegroundLayer } from './layers/Foreground';
import { GradeLayer } from './layers/Grade';
import { GroundLayer } from './layers/Ground';
import { HazeLayer } from './layers/Haze';
import { RidgeLayer } from './layers/Ridges';
import { SkyLayer } from './layers/Sky';
import { WeatherLayer } from './layers/Weather';

/** Цвет птицы: в `Theme` его нет, тема задаёт только акцент труб. */
const BIRD_COLOR = 0xf05d5e;
const LETTERBOX = 0x05060e;

/** Доля скорости уровня, с которой фон ползёт до первого тапа. */
const READY_PACE = 0.25;

/**
 * Вертикальная раскладка гребней. В ТЗ её нет: дальний гребень выше и мельче,
 * ближний ниже и крупнее, оба залиты вниз до земли.
 */
const RIDGE_FAR = { baselineY: GROUND_TOP - 120, tileWidth: 512, detail: 0 } as const;

/**
 * Ближний гребень: вторая октава превращает регулярную волну в рельеф, а
 * явное разрешение 2 снимает зависимость кромки от DPR дисплея — по умолчанию
 * generateTexture берёт renderer.resolution, и на экране без ретины кромка
 * вышла бы мягкой. Дальнему мягкость к месту, он остаётся на умолчании.
 */
const RIDGE_NEAR = { baselineY: GROUND_TOP - 40, tileWidth: 384, detail: 0.22, resolution: 2 } as const;

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

  readonly #sky = new SkyLayer();
  readonly #celestial = new CelestialLayer();
  readonly #ridgeFar = new RidgeLayer('ridge-far');
  readonly #ridgeNear = new RidgeLayer('ridge-near');
  readonly #haze = new HazeLayer();
  readonly #weather = new WeatherLayer();
  readonly #ground = new GroundLayer();
  readonly #foreground = new ForegroundLayer();
  readonly #grade = new GradeLayer();

  #app: Application | null = null;
  #world: Container | null = null;
  #bird: Graphics | null = null;
  #pipes: PipePool | null = null;

  /**
   * Пройденное фоном расстояние. Величина чисто визуальная, поэтому копится
   * здесь, а не в `GameState`.
   */
  #scrollX = 0;

  /** Вид погоды текущей темы: от него зависит её параллакс. */
  #weatherKind: Theme['weather']['kind'] = 'none';

  constructor(config: LevelConfig) {
    this.#config = config;
  }

  /**
   * Конфиг текущего уровня. Из него берутся скорость прокрутки фона и
   * интерполяция труб, поэтому он обязан меняться при смене уровня, а не
   * оставаться тем, с которым рендер был создан: иначе земля с параллаксом
   * 1.0 едет со скоростью первого уровня и отстаёт от труб.
   *
   * Не часть контракта `Renderer`: тот работает с состоянием, а не с уровнем.
   */
  setLevel(config: LevelConfig): void {
    this.#config = config;
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
    const bird = createBird(BIRD_COLOR);

    // Слои 0–5. Отдельным контейнером — в подходе Б сюда сядет
    // ColorMatrixFilter, а маска висит на world: вместе на одном контейнере
    // их держать нельзя, фильтр потечёт в полосы леттербокса.
    const background = new Container({ label: 'background' });

    background.addChild(
      this.#sky.view,
      this.#celestial.view,
      this.#ridgeFar.view,
      this.#ridgeNear.view,
      this.#haze.view,
      this.#weather.view,
    );

    // Игровой слой всегда выше слоёв фона и никогда не получает фильтров.
    const gameplay = new Container({ label: 'gameplay' });

    gameplay.addChild(pipes.container, bird);

    // Земля и передний план соседствуют по z-порядку, между ними ничего нет,
    // поэтому они идут одним контейнером: тот же экземпляр ColorMatrixFilter
    // красит их вместе с фоном, а проходов фильтра за кадр остаётся два.
    // Без общего грейда земля отваливается от фона по цвету на тёмных темах.
    const near = new Container({ label: 'near' });

    near.addChild(this.#ground.view, this.#foreground.view);

    background.filters = [this.#grade.filter];
    near.filters = [this.#grade.filter];

    world.addChild(background, gameplay, near, this.#grade.vignette);

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

  /** В подходе А — мгновенная подмена. Кроссфейд приезжает в фазе 5. */
  setTheme(theme: Theme, _crossfadeMs: number): void {
    const app = this.#app;

    if (app === null) {
      return;
    }

    this.#sky.setTheme(theme);
    this.#celestial.setTheme(theme);
    this.#ridgeFar.setTheme(app.renderer, theme.ridgeFar, RIDGE_FAR);
    this.#ridgeNear.setTheme(app.renderer, theme.ridgeNear, RIDGE_NEAR);
    this.#haze.setTheme(theme);
    this.#weather.setTheme(theme);
    this.#ground.setTheme(theme);
    this.#foreground.setTheme(theme);
    this.#grade.setTheme(theme);
    this.#pipes?.setColor(theme.accent);
    this.#weatherKind = theme.weather.kind;
  }

  draw(state: GameState, dtMs: number): void {
    const bird = this.#bird;
    const pipes = this.#pipes;

    if (bird === null || pipes === null) {
      return;
    }

    // Физики здесь нет: показывается снимок между двумя последними тиками.
    bird.y = state.prevBirdY + (state.birdY - state.prevBirdY) * state.alpha;

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

    // Слой 0 с параллаксом 0 не прокручивается вовсе.
    this.#celestial.scroll(this.#scrollX * PARALLAX.celestial);
    this.#ridgeFar.scroll(this.#scrollX * PARALLAX.ridgeFar);
    this.#ridgeNear.scroll(this.#scrollX * PARALLAX.ridgeNear);
    this.#haze.scroll(this.#scrollX * PARALLAX.haze);
    this.#ground.scroll(this.#scrollX * PARALLAX.ground);
    this.#foreground.scroll(this.#scrollX * PARALLAX.foreground);

    const weatherParallax =
      this.#weatherKind === 'none' ? 0 : WEATHER_PARALLAX[this.#weatherKind];

    this.#weather.update((stepMs * pace) / 1000, advance * weatherParallax);
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

    // Текстуры слоёв сняты вручную: они процедурные и не проходят через
    // Assets, поэтому уборка сцены о них ничего не знает.
    this.#sky.destroy();
    this.#celestial.destroy();
    this.#ridgeFar.destroy();
    this.#ridgeNear.destroy();
    this.#haze.destroy();
    this.#weather.destroy();
    this.#ground.destroy();
    this.#foreground.destroy();
    this.#grade.destroy();
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
}

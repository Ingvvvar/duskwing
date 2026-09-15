import { Application, Container, Graphics, GraphicsContext, UPDATE_PRIORITY } from 'pixi.js';

import {
  GROUND_HEIGHT,
  GROUND_TOP,
  PIPE_WIDTH,
  STEP_SECONDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../game/constants';
import type { GameState, LevelConfig, Renderer, Theme } from '../../game/types';
import { createBird } from './entities/Bird';
import { PipePool } from './entities/Pipes';

/**
 * Временная палитра фазы 2: плоская заливка вместо фона. Слои, темы и
 * кроссфейд приезжают в фазе 3 и забирают эти значения себе.
 */
const COLOR = {
  sky: 0x3d4c8f,
  ground: 0x151b3d,
  pipe: 0xe8dcc0,
  bird: 0xf05d5e,
  letterbox: 0x05060e,
} as const;

interface DebugGlobal {
  __duskwingPixiInstances?: number;
}

/**
 * Счётчик живых экземпляров под DEV. Нужен, чтобы двойной монтаж StrictMode
 * можно было проверить прямо, а не по косвенным признакам: в консоли деве
 * `__duskwingPixiInstances` обязан быть равен единице.
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
 * Конфиг уровня нужен ради `pipeSpeed` для интерполяции и передаётся
 * конструктором: интерфейс `Renderer` от этого не зависит.
 */
export class PixiRenderer implements Renderer {
  readonly #config: LevelConfig;

  #app: Application | null = null;
  #world: Container | null = null;
  #bird: Graphics | null = null;
  #pipes: PipePool | null = null;
  #pipeContext: GraphicsContext | null = null;

  constructor(config: LevelConfig) {
    this.#config = config;
  }

  async init(canvas: HTMLCanvasElement, _theme: Theme): Promise<void> {
    const app = new Application();

    await app.init({
      canvas,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      antialias: true,
      background: COLOR.letterbox,
      // Тикер запускает подписчик: иначе между init и подпиской пройдут кадры
      // с пустой сценой.
      autoStart: false,
    });

    const world = new Container({ label: 'world' });
    const sky = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(COLOR.sky);
    const ground = new Graphics()
      .rect(0, GROUND_TOP, WORLD_WIDTH, GROUND_HEIGHT)
      .fill(COLOR.ground);

    // Общая геометрия труб: тесселяция считается один раз на все трубы сразу.
    const pipeContext = new GraphicsContext().rect(0, 0, PIPE_WIDTH, 1).fill(COLOR.pipe);
    const pipes = new PipePool(pipeContext);
    const bird = createBird(COLOR.bird);

    // Земля поверх труб: трубы упираются в неё, а не торчат из неё.
    world.addChild(sky, pipes.container, bird, ground);

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
    this.#pipeContext = pipeContext;

    trackInstances(1);
  }

  setTheme(_theme: Theme, _crossfadeMs: number): void {
    // TODO: фаза 3 — темы, фаза 5 — кроссфейд сцен 700 мс.
  }

  draw(state: GameState, _dtMs: number): void {
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

    // removeView: false — канвасом владеет React, забирать его из DOM нельзя.
    // releaseGlobalResources: true — иначе повторная инициализация в той же
    // вкладке (а это ровно StrictMode) тянет за собой мусор старых пулов.
    app.destroy(
      { removeView: false, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true },
    );

    // Разделяемый контекст не принадлежит ни одному Graphics, поэтому
    // children: true его не уничтожает — только вручную.
    this.#pipeContext?.destroy();

    this.#app = null;
    this.#world = null;
    this.#bird = null;
    this.#pipes = null;
    this.#pipeContext = null;

    trackInstances(-1);
  }
}

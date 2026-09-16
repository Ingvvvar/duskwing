import { Container, Sprite, Texture, type Renderer } from 'pixi.js';

import { GROUND_TOP, MAX_FRAME_MS, WORLD_WIDTH } from '../../game/constants';
import type { GameState, LevelConfig, Theme } from '../../game/types';
import { layerScroll, weatherDrift } from '../parallax';
import { createEdgeHazeTexture } from './textures';
import { CelestialLayer } from './layers/Celestial';
import { ForegroundLayer } from './layers/Foreground';
import { GradeLayer } from './layers/Grade';
import { GroundLayer } from './layers/Ground';
import { HazeLayer } from './layers/Haze';
import { LightningLayer } from './layers/Lightning';
import { RidgeLayer } from './layers/Ridges';
import { SkyLayer } from './layers/Sky';
import { WeatherLayer } from './layers/Weather';
import { WindLayer } from './layers/Wind';

/**
 * Вертикальная раскладка гребней. В ТЗ её нет: дальний гребень выше и мельче,
 * ближний ниже и крупнее, оба залиты вниз до земли.
 */
const RIDGE_FAR = { baselineY: 548 - 120, tileWidth: 512, detail: 0 } as const;
const RIDGE_NEAR = { baselineY: 548 - 40, tileWidth: 384, detail: 0.22, resolution: 2 } as const;

/**
 * Дымка у правой кромки: препятствие проступает из глубины, а не выезжает
 * из-под ножа маски.
 *
 * Ширина выведена из времени реакции, а не подобрана. На самой быстрой
 * скорости (190 px/s — уровень 5 на своей цели и бесконечный режим на сотне
 * труб) плотная часть зоны — та, где альфа выше половины максимума, —
 * проходится за 68 мс при допуске около 150. Альфа растёт квадратично,
 * поэтому основная ширина почти прозрачна.
 */
const EDGE_HAZE = { width: 44, maxAlpha: 0.85 } as const;

/**
 * Одна полная сцена фона: слои 0–5 в `background`, слои 6–7 в `near`,
 * виньетка отдельно. Между ними лежит игровой слой, поэтому одним
 * контейнером их не собрать.
 *
 * Сцена — единица кроссфейда: на переходе их живёт две, и каждая гасится
 * собственной альфой со своим `ColorMatrixFilter`.
 */
export class Scene {
  readonly background = new Container({ label: 'background' });
  readonly near = new Container({ label: 'near' });
  readonly grade = new GradeLayer();

  readonly #sky = new SkyLayer();
  readonly #celestial = new CelestialLayer();
  readonly #ridgeFar = new RidgeLayer('ridge-far');
  readonly #ridgeNear = new RidgeLayer('ridge-near');
  readonly #haze = new HazeLayer();
  readonly #wind = new WindLayer();
  readonly #weather = new WeatherLayer();
  readonly #lightning = new LightningLayer();
  readonly #ground = new GroundLayer();
  readonly #foreground = new ForegroundLayer();
  readonly #edge = new Sprite({ label: 'edge-haze' });

  #edgeTexture: Texture | null = null;

  #weatherKind: Theme['weather']['kind'] = 'none';

  constructor() {
    this.background.addChild(
      this.#sky.view,
      this.#celestial.view,
      this.#ridgeFar.view,
      this.#ridgeNear.view,
      this.#haze.view,
      this.#wind.view,
      this.#weather.view,
      // Вспышка светит небу, а не трубам: игровой слой лежит выше и остаётся
      // тёмным силуэтом, как и положено.
      this.#lightning.view,
    );
    // Дымка кромки выше игрового слоя, но ниже земли: она затеняет
    // препятствие, а не землю. Это спрайт, а не фильтр, поэтому правило
    // «на игровом слое фильтров нет» не нарушается.
    this.#edge.position.set(WORLD_WIDTH - EDGE_HAZE.width, 0);
    this.#edge.setSize(EDGE_HAZE.width, GROUND_TOP);
    this.near.addChild(this.#edge, this.#ground.view, this.#foreground.view);

    // Фильтр один на обе группы сцены — без общего грейда земля отваливается
    // от фона по цвету на тёмных темах. Маска висит выше, на `world`.
    this.background.filters = [this.grade.filter];
    this.near.filters = [this.grade.filter];
  }

  setTheme(renderer: Renderer, theme: Theme, level: LevelConfig, reducedMotion: boolean): void {
    this.#sky.setTheme(theme);
    this.#celestial.setTheme(theme);
    this.#ridgeFar.setTheme(renderer, theme.ridgeFar, RIDGE_FAR);
    this.#ridgeNear.setTheme(renderer, theme.ridgeNear, RIDGE_NEAR);
    this.#haze.setTheme(theme);
    this.#wind.setTheme(theme, level.mechanics.airflow);
    this.#weather.setTheme(theme, reducedMotion);
    this.#lightning.setTheme(theme, reducedMotion);
    this.#ground.setTheme(theme);
    this.#foreground.setTheme(theme);

    const edge = createEdgeHazeTexture(theme.sky[3], EDGE_HAZE.width, EDGE_HAZE.maxAlpha);

    this.#edgeTexture?.destroy(true);
    this.#edgeTexture = edge;
    this.#edge.texture = edge;
    this.#edge.setSize(EDGE_HAZE.width, GROUND_TOP);
    this.#grade(theme);
    this.#weatherKind = theme.weather.kind;
  }

  update(state: GameState, dtMs: number, scrollX: number, advance: number): void {
    // Слой 0 с параллаксом 0 не прокручивается вовсе. Коэффициенты берутся
    // одним местом: врозь они разъезжались бы с таблицей незаметно.
    const offset = layerScroll(scrollX);

    this.#celestial.scroll(offset.celestial);
    this.#ridgeFar.scroll(offset.ridgeFar);
    this.#ridgeNear.scroll(offset.ridgeNear);
    this.#haze.scroll(offset.haze);
    this.#ground.scroll(offset.ground);
    this.#foreground.scroll(offset.foreground);
    this.#wind.update(state);
    this.#lightning.update(state, dtMs);

    const stepMs = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, MAX_FRAME_MS) : 0;

    this.#weather.update(
      (stepMs * (advance === 0 ? 0 : 1)) / 1000,
      weatherDrift(advance, this.#weatherKind),
    );
  }

  setAlpha(alpha: number): void {
    this.background.alpha = alpha;
    this.near.alpha = alpha;
    this.grade.vignette.alpha = alpha;
  }

  destroy(): void {
    // Процедурные текстуры слои снимают сами: уборка сцены о них не знает,
    // они не проходят через Assets.
    this.#sky.destroy();
    this.#celestial.destroy();
    this.#ridgeFar.destroy();
    this.#ridgeNear.destroy();
    this.#haze.destroy();
    this.#wind.destroy();
    this.#weather.destroy();
    this.#lightning.destroy();
    this.#ground.destroy();
    this.#foreground.destroy();
    this.#edgeTexture?.destroy(true);
    this.#edgeTexture = null;
    this.grade.destroy();

    // texture: false — общие текстуры остаются живыми, сцена уносит только
    // своё дерево.
    this.background.destroy({ children: true, texture: false });
    this.near.destroy({ children: true, texture: false });
    this.grade.vignette.destroy({ texture: false });
  }

  #grade(theme: Theme): void {
    this.grade.setTheme(theme);
  }
}

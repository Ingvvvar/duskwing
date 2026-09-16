import { Container, type Renderer } from 'pixi.js';

import { MAX_FRAME_MS } from '../../game/constants';
import type { GameState, LevelConfig, Theme } from '../../game/types';
import { PARALLAX, WEATHER_PARALLAX } from '../parallax';
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
    this.near.addChild(this.#ground.view, this.#foreground.view);

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
    this.#grade(theme);
    this.#weatherKind = theme.weather.kind;
  }

  update(state: GameState, dtMs: number, scrollX: number, advance: number): void {
    // Слой 0 с параллаксом 0 не прокручивается вовсе.
    this.#celestial.scroll(scrollX * PARALLAX.celestial);
    this.#ridgeFar.scroll(scrollX * PARALLAX.ridgeFar);
    this.#ridgeNear.scroll(scrollX * PARALLAX.ridgeNear);
    this.#haze.scroll(scrollX * PARALLAX.haze);
    this.#ground.scroll(scrollX * PARALLAX.ground);
    this.#foreground.scroll(scrollX * PARALLAX.foreground);
    this.#wind.update(state);
    this.#lightning.update(state, dtMs);

    const weatherParallax = this.#weatherKind === 'none' ? 0 : WEATHER_PARALLAX[this.#weatherKind];
    const stepMs = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, MAX_FRAME_MS) : 0;

    this.#weather.update((stepMs * (advance === 0 ? 0 : 1)) / 1000, advance * weatherParallax);
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

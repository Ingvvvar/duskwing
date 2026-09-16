import { TilingSprite, Texture } from 'pixi.js';

import { GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import { airflowPeriod } from '../../../game/mechanics';
import { windTileOffset } from '../../parallax';
import type { GameState, LevelConfig, Theme } from '../../../game/types';
import { createWindTexture } from '../textures';

/**
 * Телеграф должен быть виден до входа в зону, а не искаться глазами, — при
 * 0.16 полосы читались слишком мягко. Запас по контракту читаемости это
 * позволяет: на каньоне максимум яркости фона 22.6% при пороге 45%.
 */
const MAX_ALPHA = 0.24;

/**
 * Полосы ветра: телеграф зон `airflow`, а не украшение фона.
 *
 * Плитка шириной ровно в один период зон сдвигается на `state.travelledX` —
 * ту же величину, по которой физика берёт снос. Отсюда параллакс 1.0 и
 * записанное исключение из контракта читаемости в `parallax.ts`.
 */
export class WindLayer {
  readonly view = new TilingSprite({
    label: 'wind',
    texture: Texture.EMPTY,
    width: WORLD_WIDTH,
    height: GROUND_TOP,
    blendMode: 'screen',
  });

  #texture: Texture | null = null;
  #period = 0;

  setTheme(theme: Theme, airflow: LevelConfig['mechanics']['airflow']): void {
    this.#texture?.destroy(true);
    this.#texture = null;

    if (airflow === undefined || airflow.zones <= 0) {
      this.view.visible = false;
      this.view.texture = Texture.EMPTY;

      return;
    }

    // Восходящий поток холодный, нисходящий тёплый: направление читается
    // цветом, а не только положением полосы.
    const texture = createWindTexture(airflow, '#9FE8FF', theme.accent, MAX_ALPHA, GROUND_TOP);

    this.#texture = texture;
    this.#period = airflowPeriod(airflow);
    this.view.texture = texture;
    this.view.visible = true;
  }

  update(state: GameState): void {
    if (!this.view.visible) {
      return;
    }

    // Ровно travelledX, без коэффициентов: полоса обязана стоять там же, где
    // поток, который её породил. Формула — в `windTileOffset`, под тестом.
    this.view.tilePosition.x = windTileOffset(state.travelledX, this.#period);
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

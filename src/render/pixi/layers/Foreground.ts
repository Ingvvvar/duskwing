import { TilingSprite, Texture } from 'pixi.js';

import { FOREGROUND_BAND_HEIGHT, GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createForegroundTexture, dimToLuminance, relativeLuminance } from '../textures';

/**
 * Слой 7: передний план.
 *
 * Живёт строго в полосе `FOREGROUND_BAND_HEIGHT` над линией земли и выше не
 * поднимается. Что просвет в эту полосу не опускается — гарантия, проверяемая
 * `tests/foreground-band.test.ts`, а не надежда.
 *
 * Размытие запечено в текстуру, рантайм-фильтра на этом слое нет.
 */
export class ForegroundLayer {
  readonly view = new TilingSprite({
    label: 'foreground',
    texture: Texture.EMPTY,
    width: WORLD_WIDTH,
    height: FOREGROUND_BAND_HEIGHT,
    y: GROUND_TOP - FOREGROUND_BAND_HEIGHT,
  });

  #texture: Texture | null = null;

  setTheme(theme: Theme): void {
    this.#texture?.destroy(true);
    this.#texture = null;

    if (theme.foreground.kind === 'none') {
      this.view.visible = false;
      this.view.texture = Texture.EMPTY;

      return;
    }

    // Передний план темнее земли примерно вдвое по яркости: взятый как есть,
    // цвет земли сливается с ближним гребнем, и силуэты не читаются вовсе.
    const color = dimToLuminance(theme.ground.base, relativeLuminance(theme.ground.base) * 0.45);
    const texture = createForegroundTexture(theme.foreground.kind, theme.foreground.blur, color);

    this.#texture = texture;
    this.view.texture = texture;
    this.view.visible = true;
  }

  scroll(offsetX: number): void {
    this.view.tilePosition.x = -offsetX;
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

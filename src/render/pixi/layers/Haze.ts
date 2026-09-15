import { TilingSprite, Texture } from 'pixi.js';

import { GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createHazeTexture } from '../textures';

/** Контракт читаемости: альфа дымки не выше 0.2. */
const MAX_ALPHA = 0.2;

/** Слой 4: дымка. У темы dusk её нет — тогда слой просто невидим. */
export class HazeLayer {
  readonly view = new TilingSprite({
    label: 'haze',
    texture: Texture.EMPTY,
    width: WORLD_WIDTH,
    height: GROUND_TOP,
    blendMode: 'screen',
  });

  #texture: Texture | null = null;

  setTheme(theme: Theme): void {
    this.#texture?.destroy(true);
    this.#texture = null;

    if (theme.haze === null) {
      this.view.visible = false;
      this.view.texture = Texture.EMPTY;

      return;
    }

    const texture = createHazeTexture(theme.haze.color, GROUND_TOP);

    this.#texture = texture;
    this.view.texture = texture;
    this.view.visible = true;
    this.view.alpha = Math.min(theme.haze.alpha, MAX_ALPHA);
  }

  scroll(offsetX: number): void {
    this.view.tilePosition.x = -offsetX;
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

import { TilingSprite, Texture } from 'pixi.js';

import { GROUND_HEIGHT, GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createGroundTexture } from '../textures';

/** Слой 6: земля. Единственный слой, которому положен параллакс 1.0. */
export class GroundLayer {
  readonly view = new TilingSprite({
    label: 'ground',
    texture: Texture.EMPTY,
    width: WORLD_WIDTH,
    height: GROUND_HEIGHT,
    y: GROUND_TOP,
  });

  #texture: Texture | null = null;

  setTheme(theme: Theme): void {
    const texture = createGroundTexture(theme.ground.base, theme.ground.top);

    this.#texture?.destroy(true);
    this.#texture = texture;
    this.view.texture = texture;
  }

  scroll(offsetX: number): void {
    this.view.tilePosition.x = -offsetX;
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

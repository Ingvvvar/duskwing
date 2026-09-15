import { Sprite, Texture } from 'pixi.js';

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createSkyTexture } from '../textures';

/** Слой 0: небо. Параллакс 0 — не прокручивается никогда. */
export class SkyLayer {
  readonly view = new Sprite({ label: 'sky' });

  #texture: Texture | null = null;

  setTheme(theme: Theme): void {
    const texture = createSkyTexture(theme.sky);

    this.#texture?.destroy(true);
    this.#texture = texture;

    this.view.texture = texture;
    this.view.setSize(WORLD_WIDTH, WORLD_HEIGHT);
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

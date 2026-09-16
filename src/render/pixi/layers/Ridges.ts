import { TilingSprite, Texture, type Renderer } from 'pixi.js';

import { GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createRidgeTexture } from '../textures';

export interface RidgeLayout {
  /** Линия, вокруг которой гуляет силуэт. Отсчитывается от верха мира. */
  readonly baselineY: number;
  readonly tileWidth: number;
  /** Доля второй октавы: превращает регулярную волну в рельеф. */
  readonly detail: number;
  /** Задаётся явно там, где кромка не должна зависеть от DPR дисплея. */
  readonly resolution?: number;
}

/**
 * Слои 2 и 3: дальний и ближний гребни. Один класс на оба — различаются
 * только конфигом из темы и раскладкой.
 *
 * Вертикальной раскладки в ТЗ нет, она задана в `PixiRenderer`: дальний
 * гребень выше и мельче, ближний ниже и крупнее. Оба залиты вниз до земли.
 */
export class RidgeLayer {
  readonly view: TilingSprite;

  #texture: Texture | null = null;
  /** Ключ формы силуэта: пока он тот же, текстуру пересобирать не за чем. */
  #shape = '';

  constructor(label: string) {
    this.view = new TilingSprite({
      label,
      texture: Texture.EMPTY,
      width: WORLD_WIDTH,
      height: 1,
    });
  }

  setTheme(renderer: Renderer, config: Theme['ridgeFar'], layout: RidgeLayout): void {
    // Цвет задаётся тинтом, а силуэт рисуется белым. В бесконечном режиме
    // тема меняется на каждом очке, и пересобирать геометрию ради одного
    // лишь цвета — это снятие текстуры через generateTexture каждые пару
    // секунд на ровном месте.
    this.view.tint = config.color;

    const shape = `${String(config.amplitude)}/${String(config.roughness)}/${String(config.seed)}/${String(layout.tileWidth)}`;

    if (shape === this.#shape && this.#texture !== null) {
      return;
    }

    const top = layout.baselineY - config.amplitude;
    const tileHeight = GROUND_TOP - top;
    const texture = createRidgeTexture(renderer, {
      color: '#ffffff',
      amplitude: config.amplitude,
      roughness: config.roughness,
      seed: config.seed,
      tileWidth: layout.tileWidth,
      tileHeight,
      detail: layout.detail,
      ...(layout.resolution === undefined ? {} : { resolution: layout.resolution }),
    });

    this.#texture?.destroy(true);
    this.#texture = texture;
    this.#shape = shape;

    this.view.texture = texture;
    this.view.y = top;
    this.view.height = tileHeight;
  }

  scroll(offsetX: number): void {
    this.view.tilePosition.x = -offsetX;
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

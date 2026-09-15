import { ColorMatrixFilter, Sprite, Texture } from 'pixi.js';

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game/constants';
import type { Theme } from '../../../game/types';
import { createVignetteTexture } from '../textures';

/**
 * Слой 8: грейд.
 *
 * Виньетка — спрайт с blendMode multiply, фильтром она не является.
 * `ColorMatrixFilter` — один экземпляр на контейнер фона и на контейнер
 * ближних слоёв: без общего грейда земля отваливается от фона по цвету на
 * тёмных темах. Проходов фильтра за кадр от этого два, а не один — по одному
 * на контейнер; экземпляр общий ради настройки, не ради экономии проходов.
 */
export class GradeLayer {
  readonly vignette = new Sprite({ label: 'vignette', blendMode: 'multiply' });
  readonly filter = new ColorMatrixFilter();

  #texture: Texture | null = null;

  setTheme(theme: Theme): void {
    const texture = createVignetteTexture(theme.grade.vignette);

    this.#texture?.destroy(true);
    this.#texture = texture;
    this.vignette.texture = texture;
    this.vignette.setSize(WORLD_WIDTH, WORLD_HEIGHT);

    // saturate у Pixi принимает не множитель: фактор равен amount * 2/3 + 1,
    // поэтому множитель из темы пересчитывается обратно.
    this.filter.reset();
    this.filter.saturate((theme.grade.saturation - 1) * 1.5, true);
    this.filter.brightness(theme.grade.brightness, true);
    this.filter.tint(theme.grade.tint, true);
  }

  destroy(): void {
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

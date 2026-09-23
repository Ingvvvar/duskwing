import { Container, Graphics, Sprite, Texture } from 'pixi.js';

import { WORLD_WIDTH } from '../../../game/constants';
import { mulberry32 } from '../../../game/rng';
import type { Theme } from '../../../game/types';
import { createGlowTexture, dimToLuminance } from '../textures';

const DISC_RADIUS = 20;
const GLOW_RADIUS = 96;
const GLOW_PEAK_ALPHA = 0.16;

/**
 * Относительная яркость диска светила.
 *
 * Гасится не ради метрики: диск близкой к трубе яркости съедает её кромку в
 * момент прохода перед светилом. Перцентиль фона этого не ловит — эффект
 * локальный и короткий. Ореол не трогаем, он и так тусклый.
 *
 * Значение считано от яркости трубы НА ЭКРАНЕ, то есть после грейда и
 * виньетки (около 0.61), а не от цвета `accent` в теме: виньетка опускает
 * трубу заметно ниже её собственного цвета. 0.27 — это 45% от измеренного,
 * то есть контракт выполняется и для отдельного элемента, а не только по
 * перцентилю. Проверяется `scripts/readability.py`.
 */
const DISC_LUMINANCE = 0.27;
const STAR_SEED = 20260916;

/**
 * Слой 1: светило и звёзды. Статика, поэтому контейнер запекается через
 * `cacheAsTexture`.
 *
 * Содержимое строится дважды со сдвигом на период заворота: при параллаксе
 * 0.03 светило за минуту уезжает на 216 px, и без второй копии заворот по
 * модулю выглядел бы как скачок через весь экран.
 */
export class CelestialLayer {
  readonly view = new Container({ label: 'celestial' });

  readonly #span = WORLD_WIDTH + GLOW_RADIUS * 2;
  #textures: Texture[] = [];

  setTheme(theme: Theme): void {
    // Кэш снимается до пересборки и ставится заново после: запечённая
    // текстура не знает, что тема сменилась, и показывала бы прежнюю.
    // На контейнере фона стоит ColorMatrixFilter грейда — тем важнее, чтобы
    // кэш пересобирался вместе с темой, а не жил своей жизнью.
    this.view.cacheAsTexture(false);
    this.view.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    this.#destroyTextures();

    if (theme.celestial.kind !== 'none' || theme.celestial.stars > 0) {
      const glow = createGlowTexture(theme.celestial.glow, GLOW_RADIUS, GLOW_PEAK_ALPHA);

      this.#textures.push(glow);
      this.view.addChild(this.#buildCopy(theme, glow, 0));
      this.view.addChild(this.#buildCopy(theme, glow, this.#span));
    }

    this.view.cacheAsTexture(true);
  }

  scroll(offsetX: number): void {
    this.view.x = -(((offsetX % this.#span) + this.#span) % this.#span);
  }

  destroy(): void {
    this.view.cacheAsTexture(false);
    this.#destroyTextures();
  }

  #destroyTextures(): void {
    for (const texture of this.#textures) {
      texture.destroy(true);
    }

    this.#textures = [];
  }

  #buildCopy(theme: Theme, glow: Texture, offsetX: number): Container {
    const copy = new Container({ x: offsetX });
    const { celestial } = theme;

    if (celestial.stars > 0) {
      const random = mulberry32(STAR_SEED);
      const stars = new Graphics();

      for (let index = 0; index < celestial.stars; index += 1) {
        // Звёзды только в верхних двух третях: у горизонта их съедает небо.
        stars.circle(random() * WORLD_WIDTH, random() * (celestial.y + 120), random() * 1.1 + 0.4);
      }

      copy.addChild(stars.fill({ color: celestial.glow, alpha: 0.7 }));
    }

    if (celestial.kind !== 'none') {
      copy.addChild(
        new Sprite({
          texture: glow,
          anchor: 0.5,
          x: celestial.x,
          y: celestial.y,
          blendMode: 'add',
        }),
      );
      copy.addChild(
        new Graphics()
          .circle(celestial.x, celestial.y, DISC_RADIUS)
          .fill(dimToLuminance(celestial.glow, DISC_LUMINANCE)),
      );
    }

    return copy;
  }
}

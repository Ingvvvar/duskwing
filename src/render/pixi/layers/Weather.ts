import { Container, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';

import { GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import { mulberry32 } from '../../../game/rng';
import type { Theme } from '../../../game/types';
import { createParticleTexture } from '../textures';

/** Контракт читаемости: альфа частиц не выше 0.35. */
const MAX_ALPHA = 0.35;
/** Бюджет производительности из ТЗ. */
const MAX_PARTICLES = 400;
const SEED = 20260919;

interface Drop {
  readonly particle: Particle;
  readonly fallSpeed: number;
  readonly drift: number;
}

/**
 * Слой 5: погода.
 *
 * Лежит внутри контейнера фона, то есть получает грейд вместе с ним.
 * Частицы двигаются только пока движется мир: на `over` они замирают заодно
 * с фоном, иначе дождь идёт над мёртвой птицей и ломает паузу.
 */
export class WeatherLayer {
  readonly view = new Container({ label: 'weather' });

  #particles: ParticleContainer | null = null;
  #drops: Drop[] = [];
  #texture: Texture | null = null;

  setTheme(theme: Theme, reducedMotion: boolean): void {
    this.#teardown();

    // Контракт prefers-reduced-motion: частицы не создаются вовсе, а не
    // просто останавливаются — иначе они продолжают есть память и кадры.
    if (reducedMotion || theme.weather.kind === 'none' || theme.weather.count <= 0) {
      return;
    }

    const count = Math.min(theme.weather.count, MAX_PARTICLES);
    const texture = createParticleTexture(theme.weather.kind);
    const random = mulberry32(SEED);
    const tint = theme.haze?.color ?? theme.sky[3];
    const drops: Drop[] = [];

    for (let index = 0; index < count; index += 1) {
      const particle = new Particle({
        texture,
        x: random() * WORLD_WIDTH,
        y: random() * GROUND_TOP,
        anchorX: 0.5,
        anchorY: 0.5,
        tint,
        alpha: MAX_ALPHA * (0.45 + random() * 0.55),
      });

      drops.push({
        particle,
        fallSpeed: this.#fallSpeed(theme, random()),
        drift: (random() - 0.5) * 18,
      });
    }

    const container = new ParticleContainer({
      texture,
      boundsArea: new Rectangle(0, 0, WORLD_WIDTH, GROUND_TOP),
      dynamicProperties: { position: true },
      // Аддитивное смешивание — требование контракта читаемости.
      blendMode: 'add',
      particles: drops.map((drop) => drop.particle),
    });

    // Опция `particles` в конструкторе заполняет particleChildren, но
    // намеренно пропускает обновление вида — буфер под частицы при этом не
    // строится, и каждый кадр летит GL_INVALID_OPERATION «vertex buffer is
    // not big enough». Обновление вида нужно вызвать руками ровно один раз.
    container.update();

    this.view.addChild(container);

    this.#particles = container;
    this.#drops = drops;
    this.#texture = texture;
  }

  /**
   * @param dtSeconds ноль, когда мир стоит: частицы замирают вместе с фоном.
   * @param scrollDeltaX сдвиг слоя за кадр с уже применённым параллаксом.
   */
  update(dtSeconds: number, scrollDeltaX: number): void {
    if (dtSeconds <= 0 && scrollDeltaX === 0) {
      return;
    }

    for (const drop of this.#drops) {
      const { particle } = drop;

      particle.y += drop.fallSpeed * dtSeconds;
      particle.x += drop.drift * dtSeconds - scrollDeltaX;

      if (particle.y > GROUND_TOP) {
        particle.y -= GROUND_TOP;
      }

      if (particle.x < 0) {
        particle.x += WORLD_WIDTH;
      } else if (particle.x > WORLD_WIDTH) {
        particle.x -= WORLD_WIDTH;
      }
    }
  }

  destroy(): void {
    this.#teardown();
  }

  #fallSpeed(theme: Theme, roll: number): number {
    const base = { rain: 520, snow: 70, fireflies: 16, dust: 40, none: 0 }[theme.weather.kind];

    return base * theme.weather.speed * (0.7 + roll * 0.6);
  }

  #teardown(): void {
    this.#particles?.destroy({ children: true });
    this.#particles = null;
    this.#drops = [];
    this.#texture?.destroy(true);
    this.#texture = null;
  }
}

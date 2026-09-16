import { Graphics } from 'pixi.js';

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game/constants';
import { FLASH_MAX_ALPHA, FLASH_MAX_MS } from '../../../game/mechanics';
import { mulberry32 } from '../../../game/rng';
import type { GameState, Theme } from '../../../game/types';

const SEED = 20260920;
const MIN_GAP_MS = 2600;
const MAX_GAP_MS = 7000;

/**
 * Вспышки молнии.
 *
 * Все три ограничения контракта читаемости соблюдаются здесь:
 * длительность не больше `FLASH_MAX_MS`, альфа не выше `FLASH_MAX_ALPHA`,
 * а начинать вспышку разрешает только `state.flashAllowed` — флаг, который
 * логика считает по расписанию появления труб на всё окно вспышки.
 * Своего расписания у этого слоя нет.
 */
export class LightningLayer {
  readonly view = new Graphics({ label: 'lightning', blendMode: 'add' });

  #enabled = false;
  #remainingMs = 0;
  #cooldownMs = MIN_GAP_MS;
  readonly #random = mulberry32(SEED);

  constructor() {
    this.view.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill('#ffffff');
    this.view.alpha = 0;
    this.view.visible = false;
  }

  setTheme(theme: Theme, reducedMotion: boolean): void {
    // Молния живёт там, где идёт дождь. При prefers-reduced-motion вспышек
    // нет вовсе — по контракту читаемости.
    this.#enabled = !reducedMotion && theme.weather.kind === 'rain';
    this.#remainingMs = 0;
    this.view.alpha = 0;
    this.view.visible = false;
  }

  update(state: GameState, dtMs: number): void {
    if (!this.#enabled || dtMs <= 0) {
      return;
    }

    if (this.#remainingMs > 0) {
      this.#remainingMs -= dtMs;
      // Резкий подъём и спад: вспышка гаснет вместе с остатком окна.
      this.view.alpha = FLASH_MAX_ALPHA * Math.max(0, this.#remainingMs / FLASH_MAX_MS);
      this.view.visible = this.view.alpha > 0;

      return;
    }

    this.#cooldownMs -= dtMs;

    if (this.#cooldownMs > 0 || !state.flashAllowed) {
      return;
    }

    this.#remainingMs = FLASH_MAX_MS;
    this.#cooldownMs = MIN_GAP_MS + this.#random() * (MAX_GAP_MS - MIN_GAP_MS);
  }

  destroy(): void {
    this.#remainingMs = 0;
  }
}

import { Graphics } from 'pixi.js';

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../../game/constants';
import { mulberry32 } from '../../../game/rng';
import type { GameState, Theme } from '../../../game/types';
import { flashStep, INITIAL_FLASH, type FlashState } from '../../flashSchedule';

const SEED = 20260920;

/**
 * Вспышки молнии.
 *
 * Расписание живёт в `flashSchedule` — чистой функцией, под тестом. Здесь
 * остаётся только рисование и одно событие наружу: `update` возвращает `true`
 * в тот кадр, когда вспышка началась. От него же звучит гром: два источника
 * одного явления неизбежно разъезжаются.
 */
export class LightningLayer {
  readonly view = new Graphics({ label: 'lightning', blendMode: 'add' });

  #enabled = false;
  #state: FlashState = INITIAL_FLASH;
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
    this.#state = INITIAL_FLASH;
    this.view.alpha = 0;
    this.view.visible = false;
  }

  /** @returns вспышка началась на этом кадре. */
  update(state: GameState, dtMs: number): boolean {
    if (!this.#enabled || dtMs <= 0) {
      return false;
    }

    const step = flashStep(this.#state, dtMs, state.flashAllowed, this.#random);

    this.#state = step.state;
    this.view.alpha = step.alpha;
    this.view.visible = step.alpha > 0;

    return step.started;
  }

  destroy(): void {
    this.#state = INITIAL_FLASH;
  }
}

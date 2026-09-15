import { describe, expect, it } from 'vitest';

import { STEP_MS } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { LEVEL_1 } from '../src/game/levels';
import { mulberry32 } from '../src/game/rng';
import type { GameState } from '../src/game/types';
import { autopilot, gapCentersFrom, run, started } from './support/simulate';

interface Frame {
  readonly dtMs: number;
  readonly flap: boolean;
}

/**
 * Скрипт ввода с неровным кадром: 8.3, 16.7 и 33.4 мс вперемешку — так
 * аккумулятор на каждом кадре в разном состоянии, и совпадение прогонов
 * что-то значит. Тап на каждом седьмом кадре, первый запускает игру.
 */
const SCRIPT: readonly Frame[] = Array.from({ length: 900 }, (_, index) => ({
  dtMs: [8.3, 16.7, 33.4][index % 3] ?? STEP_MS,
  flap: index % 7 === 0,
}));

function replay(seed: number): GameState[] {
  const game = new Game(LEVEL_1, mulberry32(seed));

  return SCRIPT.map((frame) => {
    if (frame.flap) {
      game.flap();
    }

    game.step(frame.dtMs);

    return game.state;
  });
}

describe('детерминизм', () => {
  it('один сид и один скрипт ввода дают одинаковое состояние на каждом шаге', () => {
    expect(replay(20260916)).toEqual(replay(20260916));
  });

  it('разные сиды дают разные раскладки', () => {
    const first = gapCentersFrom(run(started(LEVEL_1, mulberry32(1)), { frames: 4000, control: autopilot }));
    const second = gapCentersFrom(run(started(LEVEL_1, mulberry32(2)), { frames: 4000, control: autopilot }));

    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(second).toHaveLength(first.length);
    expect(second).not.toEqual(first);
  });
});

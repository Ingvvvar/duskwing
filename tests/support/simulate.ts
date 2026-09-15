import { FLYABLE_CENTER, STEP_MS } from '../../src/game/constants';
import { Game } from '../../src/game/Game';
import type { Rng } from '../../src/game/rng';
import type { GameState, LevelConfig } from '../../src/game/types';

/** Игра выходит из `ready` первым тапом — тестам, которым нужен play, тоже. */
export function started(config: LevelConfig, rng: Rng): Game {
  const game = new Game(config, rng);
  game.flap();

  return game;
}

/**
 * Автопилот для тестов, где птица должна дожить до нескольких труб: флапает,
 * когда она ниже центра просвета ближайшей незачтённой трубы, а до первой
 * трубы — ниже центра лётной зоны. Импульс −430 при гравитации 1450 даёт
 * подъём 64 px, половина просвета уровня 1 — 105 px, запас есть.
 */
export function autopilot(state: GameState): boolean {
  const next = state.pipes.find((pipe) => !pipe.scored);

  return state.birdY > (next?.gapCenter ?? FLYABLE_CENTER);
}

export interface RunOptions {
  readonly frames: number;
  readonly dtMs?: number;
  readonly control?: (state: GameState) => boolean;
}

/** Кадр за кадром: спросить control, шагнуть, запомнить снимок. */
export function run(game: Game, options: RunOptions): GameState[] {
  const dtMs = options.dtMs ?? STEP_MS;
  const history: GameState[] = [];

  for (let frame = 0; frame < options.frames; frame += 1) {
    if (options.control?.(game.state) === true) {
      game.flap();
    }

    game.step(dtMs);
    history.push(game.state);
  }

  return history;
}

/** Просветы в порядке появления труб. Труба опознаётся по id, а не по месту. */
export function gapCentersFrom(history: readonly GameState[]): number[] {
  const seen = new Map<number, number>();

  for (const state of history) {
    for (const pipe of state.pipes) {
      if (!seen.has(pipe.id)) {
        seen.set(pipe.id, pipe.gapCenter);
      }
    }
  }

  return [...seen.entries()].sort(([a], [b]) => a - b).map(([, gapCenter]) => gapCenter);
}

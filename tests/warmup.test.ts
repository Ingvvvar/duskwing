import { describe, expect, it } from 'vitest';

import { BIRD_RADIUS_HITBOX, BIRD_START_Y, FLYABLE_CENTER, GROUND_TOP } from '../src/game/constants';
import { LEVEL_1, PLAYABLE } from '../src/game/levels';
import { mulberry32 } from '../src/game/rng';
import type { GameState, PipeShape } from '../src/game/types';
import { autopilot, run, started } from './support/simulate';

/** Виды препятствий в порядке рождения. */
function shapesInOrder(history: readonly GameState[]): PipeShape[] {
  const seen = new Map<number, PipeShape>();

  for (const state of history) {
    for (const pipe of state.pipes) {
      if (!seen.has(pipe.id)) {
        seen.set(pipe.id, pipe.shape);
      }
    }
  }

  return [...seen.entries()].sort(([a], [b]) => a - b).map(([, shape]) => shape);
}

describe('кривая видов препятствий', () => {
  it('применяется по порядку, дальше обычный просвет', () => {
    const history = run(started(LEVEL_1, mulberry32(5)), { frames: 4000, control: autopilot });
    const shapes = shapesInOrder(history);

    expect(shapes.length).toBeGreaterThanOrEqual(8);
    expect(shapes.slice(0, 6)).toEqual(LEVEL_1.warmup);
    expect(shapes.slice(6)).toEqual(shapes.slice(6).map(() => 'both'));
  });

  it('у остальных уровней кривой нет — все препятствия обычные', () => {
    for (const level of PLAYABLE) {
      if (level.id === LEVEL_1.id) {
        continue;
      }

      expect(level.warmup).toEqual([]);
    }
  });

  /**
   * Проверяется игровой запас, а не совпадение с формулой постановки: важно
   * не где именно встал центр, а сколько у новичка места на ошибку.
   *
   * Ограничение разброса продолжает действовать и на односторонних
   * препятствиях, поэтому первое верхнее встаёт не в самый край полосы —
   * и это правильно: инвариант «просветы не прыгают» остаётся целым.
   */
  it('односторонние оставляют новичку запас на ошибку', () => {
    const history = run(started(LEVEL_1, mulberry32(11)), { frames: 2600, control: autopilot });
    const first = new Map<number, { shape: PipeShape; top: number; bottom: number }>();

    for (const state of history) {
      for (const pipe of state.pipes) {
        if (!first.has(pipe.id)) {
          first.set(pipe.id, {
            shape: pipe.shape,
            top: pipe.baseGapCenter - pipe.gapHeight / 2,
            bottom: pipe.baseGapCenter + pipe.gapHeight / 2,
          });
        }
      }
    }

    const seen = [...first.values()];

    for (const pipe of seen) {
      if (pipe.shape === 'bottom') {
        // Запас на падение от стартовой высоты до опасной кромки.
        expect(pipe.bottom - BIRD_RADIUS_HITBOX - BIRD_START_Y).toBeGreaterThanOrEqual(140);
      }

      if (pipe.shape === 'top') {
        // Запас на подъём: верхнее препятствие достаётся только осознанным
        // перебором взмахов, а не одним лишним.
        expect(BIRD_START_Y - (pipe.top + BIRD_RADIUS_HITBOX)).toBeGreaterThanOrEqual(90);
      }
    }

    expect(seen.some((entry) => entry.shape === 'bottom')).toBe(true);
    expect(seen.some((entry) => entry.shape === 'top')).toBe(true);
  });

  it('проход над первыми препятствиями заведомо больше запаса на ошибку', () => {
    const half = LEVEL_1.pipeGap / 2;
    const upper = Math.min(FLYABLE_CENTER + LEVEL_1.gapDrift, GROUND_TOP - half);
    // Кромка нижнего препятствия и опасная линия с учётом хитбокса.
    const edge = upper + half;
    const danger = edge - BIRD_RADIUS_HITBOX;
    const rise = LEVEL_1.flapVelocity ** 2 / (2 * LEVEL_1.gravity);

    // Свободный проход от верха мира до кромки.
    expect(edge).toBeGreaterThan(400);
    // Одна неверно взятая нота меняет заметно меньше, чем есть запаса.
    expect(rise).toBeLessThan((danger - BIRD_START_Y) / 2);
  });
});

describe('коллизия при отсутствующей половине', () => {
  /**
   * Поведенческая проверка всей кривой разом: птица, машущая каждый кадр,
   * прижата к потолку. Первые три препятствия без потолка она проходит, на
   * четвёртом — первом без пола — обязана погибнуть. На обычном просвете она
   * не прошла бы и первого.
   */
  it('птица у потолка проходит препятствия без потолка и гибнет на первом верхнем', () => {
    const game = started(LEVEL_1, mulberry32(3));
    const history = run(game, { frames: 1600, control: () => true });
    const shapes = shapesInOrder(history);

    expect(shapes.slice(0, 4)).toEqual(['bottom', 'bottom', 'bottom', 'top']);
    expect(game.state.score).toBeGreaterThanOrEqual(3);
    expect(game.state.phase).toBe('over');
  });

  it('обычная игра проходит переход к полному просвету', () => {
    const game = started(LEVEL_1, mulberry32(7));

    run(game, { frames: 4000, control: autopilot });

    expect(game.state.phase).toBe('play');
    expect(game.state.score).toBeGreaterThanOrEqual(8);
  });
});

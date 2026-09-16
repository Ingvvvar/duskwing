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

    expect(shapes.length).toBeGreaterThan(LEVEL_1.warmup.length);
    const curve = LEVEL_1.warmup.length;

    expect(shapes.slice(0, curve)).toEqual(LEVEL_1.warmup);
    expect(shapes.slice(curve)).toEqual(shapes.slice(curve).map(() => 'both'));
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
  it('односторонние оставляют новичку запас, а кривая не идёт вспять', () => {
    const history = run(started(LEVEL_1, mulberry32(11)), { frames: 3000, control: autopilot });
    const first = new Map<number, { shape: PipeShape; room: number }>();

    for (const state of history) {
      for (const pipe of state.pipes) {
        if (first.has(pipe.id) || pipe.shape === 'both') {
          continue;
        }

        const edge =
          pipe.shape === 'bottom'
            ? pipe.baseGapCenter + pipe.gapHeight / 2
            : pipe.baseGapCenter - pipe.gapHeight / 2;

        first.set(pipe.id, {
          shape: pipe.shape,
          room:
            pipe.shape === 'bottom'
              ? edge - BIRD_RADIUS_HITBOX - BIRD_START_Y
              : BIRD_START_Y - (edge + BIRD_RADIUS_HITBOX),
        });
      }
    }

    const ordered = [...first.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
    const tops = ordered.filter((entry) => entry.shape === 'top').map((entry) => entry.room);
    const bottoms = ordered.filter((entry) => entry.shape === 'bottom').map((entry) => entry.room);

    expect(tops.length).toBeGreaterThanOrEqual(3);
    expect(bottoms.length).toBeGreaterThanOrEqual(4);

    /**
     * Главное требование к кривой: первый в жизни потолок не может быть
     * строже следующих. Раньше он был — 94.5 px против 154.5, — потому что
     * упирался в ограничение разброса, идя от нижних препятствий.
     */
    expect(tops[0]).toBeGreaterThanOrEqual(Math.max(...tops.slice(1)));

    // Запас на подъём у всех верхних одинаково щедрый.
    for (const room of tops) {
      expect(room).toBeGreaterThanOrEqual(140);
    }

    /**
     * Тесное место переехало на нижнее препятствие — то, что идёт навстречу
     * верхним. Там это безопасно: опасность — падение, лекарство — взмах,
     * а лишние взмахи без потолка ничем не грозят.
     */
    for (const room of bottoms) {
      expect(room).toBeGreaterThanOrEqual(90);
    }

    expect(Math.min(...bottoms)).toBeLessThan(Math.min(...tops));
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
    const withoutCeiling = LEVEL_1.warmup.filter((shape) => shape === 'bottom').length;
    const game = started(LEVEL_1, mulberry32(3));
    const history = run(game, { frames: 2000, control: () => true });
    const shapes = shapesInOrder(history);

    expect(withoutCeiling).toBeGreaterThanOrEqual(3);
    expect(shapes.slice(0, withoutCeiling + 1)).toEqual([
      ...Array.from({ length: withoutCeiling }, () => 'bottom'),
      'top',
    ]);
    expect(game.state.score).toBeGreaterThanOrEqual(withoutCeiling);
    expect(game.state.phase).toBe('over');
  });

  it('обычная игра проходит переход к полному просвету', () => {
    const game = started(LEVEL_1, mulberry32(7));

    run(game, { frames: 4000, control: autopilot });

    expect(game.state.phase).toBe('play');
    expect(game.state.score).toBeGreaterThanOrEqual(8);
  });
});

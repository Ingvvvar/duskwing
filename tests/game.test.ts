import { describe, expect, it } from 'vitest';

import { FLYABLE_CENTER, GROUND_TOP, MAX_FRAME_MS, STEP_MS } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { LEVEL_1 } from '../src/game/levels';
import { resolveOutcome } from '../src/game/progress';
import { mulberry32 } from '../src/game/rng';
import type { LevelConfig } from '../src/game/types';
import { autopilot, gapCentersFrom, run, started } from './support/simulate';

/** Допуск на накопленную ошибку чисел с плавающей точкой. */
const EPSILON = 1e-9;

describe('земля', () => {
  it('падение на землю завершает игру', () => {
    const game = started(LEVEL_1, mulberry32(3));

    run(game, { frames: 200 });

    expect(game.state.phase).toBe('over');
    expect(game.state.score).toBe(0);
    // Разгон ещё идёт, труб не было: убить могла только земля.
    expect(game.state.pipes).toHaveLength(0);
  });

  it('после смерти шаги и тапы ничего не меняют', () => {
    const game = started(LEVEL_1, mulberry32(3));

    run(game, { frames: 200 });
    const dead = game.state;

    game.flap();
    run(game, { frames: 50 });

    expect(game.state).toEqual(dead);
  });
});

describe('счёт', () => {
  it('очко засчитывается ровно один раз за трубу', () => {
    const game = started(LEVEL_1, mulberry32(5));
    const history = run(game, { frames: 4000, control: autopilot });
    const scoredIds = new Set<number>();
    let previous = 0;

    for (const state of history) {
      for (const pipe of state.pipes) {
        if (pipe.scored) {
          scoredIds.add(pipe.id);
        }
      }

      // Счёт не убывает, растёт не больше чем на единицу за кадр и всегда
      // равен числу труб, когда-либо помеченных зачтёнными.
      expect(state.score).toBeGreaterThanOrEqual(previous);
      expect(state.score - previous).toBeLessThanOrEqual(1);
      expect(state.score).toBe(scoredIds.size);
      previous = state.score;
    }

    expect(game.state.phase).toBe('play');
    expect(game.state.score).toBeGreaterThanOrEqual(3);
  });
});

describe('разгон', () => {
  it('до истечения runwayMs труб нет', () => {
    const game = started(LEVEL_1, mulberry32(11));
    const history = run(game, { frames: 320, control: autopilot });

    for (const state of history) {
      if (state.elapsedMs < LEVEL_1.runwayMs) {
        expect(state.pipes).toHaveLength(0);
      }
    }

    const firstWithPipe = history.find((state) => state.pipes.length > 0);

    expect(firstWithPipe).toBeDefined();
    expect(firstWithPipe?.elapsedMs).toBeGreaterThanOrEqual(LEVEL_1.runwayMs);
  });
});

describe('просветы', () => {
  it('держатся полосы вокруг центра и не расходятся с соседом сильнее gapDrift', () => {
    const game = started(LEVEL_1, mulberry32(17));
    const centers = gapCentersFrom(run(game, { frames: 4000, control: autopilot }));

    expect(centers.length).toBeGreaterThanOrEqual(5);

    let previous: number | undefined;

    for (const center of centers) {
      expect(Math.abs(center - FLYABLE_CENTER)).toBeLessThanOrEqual(LEVEL_1.gapDrift + EPSILON);

      if (previous !== undefined) {
        expect(Math.abs(center - previous)).toBeLessThanOrEqual(LEVEL_1.gapDrift + EPSILON);
      }

      previous = center;
    }
  });

  it('удерживаются внутри лётной зоны, когда полоса разброса шире неё', () => {
    const wide: LevelConfig = { ...LEVEL_1, pipeGap: 480, gapDrift: 200, runwayMs: 0 };
    const half = wide.pipeGap / 2;

    // Полоса ±gapDrift вокруг центра сама по себе выпустила бы просвет за
    // пределы лётной зоны в обе стороны — значит удержание здесь работает,
    // а не просто повторяет ограничение по разбросу.
    expect(FLYABLE_CENTER - wide.gapDrift).toBeLessThan(half);
    expect(FLYABLE_CENTER + wide.gapDrift).toBeGreaterThan(GROUND_TOP - half);

    const centers = gapCentersFrom(
      run(started(wide, mulberry32(23)), { frames: 4000, control: autopilot }),
    );

    expect(centers.length).toBeGreaterThanOrEqual(10);

    for (const center of centers) {
      expect(center - half).toBeGreaterThanOrEqual(-EPSILON);
      expect(center + half).toBeLessThanOrEqual(GROUND_TOP + EPSILON);
    }
  });
});

describe('интерполяция', () => {
  it('alpha всегда в [0, 1)', () => {
    const game = started(LEVEL_1, mulberry32(29));
    // Шаг кадра не кратен шагу симуляции — иначе аккумулятор всегда пуст
    // и проверка становится холостой.
    const history = run(game, { frames: 800, dtMs: 16.7, control: autopilot });

    expect(history.some((state) => state.alpha > 0)).toBe(true);

    for (const state of history) {
      expect(state.alpha).toBeGreaterThanOrEqual(0);
      expect(state.alpha).toBeLessThan(1);
    }
  });

  it('prevBirdY равен высоте на конец предыдущего шага', () => {
    const game = started(LEVEL_1, mulberry32(31));
    // Ровно один тик на кадр: только так «предыдущий шаг» и «предыдущий
    // кадр» — одно и то же.
    const history = run(game, { frames: 400, dtMs: STEP_MS, control: autopilot });

    expect(game.state.phase).toBe('play');

    let previous: number | undefined;

    for (const state of history) {
      if (previous !== undefined) {
        expect(state.prevBirdY).toBe(previous);
      }

      previous = state.birdY;
    }
  });
});

describe('шаг', () => {
  it('накопление за один вызов клампится', () => {
    const afterMinute = started(LEVEL_1, mulberry32(41));
    const afterClamp = started(LEVEL_1, mulberry32(41));

    // Вкладка провисела в фоне минуту. Минуту досчитывать нельзя: это и
    // подвешивает страницу, и убивает птицу, пока её никто не видел.
    afterMinute.step(60_000);
    afterClamp.step(MAX_FRAME_MS);

    expect(afterMinute.state).toEqual(afterClamp.state);
    expect(afterMinute.state.elapsedMs).toBeLessThan(MAX_FRAME_MS + STEP_MS);
  });

  it('нечисловой и неположительный шаг игнорируется', () => {
    const game = started(LEVEL_1, mulberry32(43));
    const before = game.state;

    for (const dtMs of [0, -16, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      game.step(dtMs);
    }

    expect(game.state).toEqual(before);
  });

  it('до первого тапа шаг ничего не двигает', () => {
    const game = new Game(LEVEL_1, mulberry32(47));
    const before = game.state;

    game.step(1000);

    expect(game.state).toEqual(before);
    expect(game.state.phase).toBe('ready');
  });
});

describe('цель и смерть одновременно', () => {
  it('состояние со score >= target и phase === over достижимо и разрешимо', () => {
    // Просвет широкий, цель — одно очко: птица гарантированно наберёт цель,
    // а потом, оставшись без флапов, упадёт. Смерть не должна ни обнулять
    // счёт, ни отменять достигнутую цель.
    const easy: LevelConfig = { ...LEVEL_1, target: 1, pipeGap: 400 };
    const game = started(easy, mulberry32(5));

    run(game, { frames: 900, control: autopilot });
    expect(game.state.score).toBeGreaterThanOrEqual(easy.target);

    run(game, { frames: 400 });

    expect(game.state.phase).toBe('over');
    expect(game.state.score).toBeGreaterThanOrEqual(easy.target);
    expect(resolveOutcome(game.state.score, easy.target, game.state.phase)).toBe('cleared');
  });
});

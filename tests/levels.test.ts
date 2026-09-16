import { describe, expect, it } from 'vitest';

import { LEVEL_1, LEVEL_4, LEVEL_5, LEVEL_ROSTER, LEVELS } from '../src/game/levels';
import { mulberry32 } from '../src/game/rng';
import type { LevelConfig } from '../src/game/types';
import { autopilot, run, started } from './support/simulate';

describe('уровень 1 заморожен', () => {
  /**
   * Конфиг уровня 1 выверен под новичка в разделе 3 ТЗ: он задаёт не «чуть
   * проще», а заметно проще, и любое значение здесь — решение, а не вкус.
   * Сверка идёт целиком, поле в поле, чтобы случайная правка при переборе
   * остальных уровней не прошла молча.
   */
  it('совпадает с ТЗ поле в поле', () => {
    // Обновлять этот тест можно только осознанно: он существует ровно для
    // того, чтобы случайная правка при переборе уровней не прошла молча.
    expect(LEVEL_1).toEqual({
      id: 1,
      name: 'Сумерки',
      target: 10,
      gravity: 1450,
      flapVelocity: -430,
      pipeSpeed: 120,
      pipeGap: 210,
      pipeSpacing: 260,
      gapDrift: 60,
      runwayMs: 2500,
      // Единственное, что добавилось к выверенному конфигу: кривая видов
      // препятствий. Скорость, просвет, разброс, разгон и цель — те же.
      warmup: ['bottom', 'bottom', 'bottom', 'bottom', 'top', 'top', 'top'],
      ramp: null,
      mechanics: {},
      themeId: 'dusk',
    });
  });
});

describe('реестр уровней', () => {
  it('пять конфигов, пять карточек, одинаковые id и имена', () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5]);
    expect(LEVELS.map((level) => level.name)).toEqual(LEVEL_ROSTER.map((entry) => entry.name));
    expect(new Set(LEVELS.map((level) => level.themeId)).size).toBe(5);
  });

  it('цель растёт от уровня к уровню', () => {
    const targets = LEVELS.map((level) => level.target);

    expect(targets).toEqual([...targets].sort((a, b) => a - b));
  });
});

describe('разгон', () => {
  it('просвет не опускается ниже minGap', () => {
    // Синтетический конфиг: просвет широкий, поэтому птица доживает до
    // момента, где кламп реально срабатывает, а не до середины разгона.
    const probe: LevelConfig = {
      ...LEVEL_1,
      pipeGap: 300,
      gapDrift: 30,
      runwayMs: 0,
      ramp: { speedPerPipe: 1, gapPerPipe: 8, minGap: 200 },
    };
    const history = run(started(probe, mulberry32(5)), { frames: 6000, control: autopilot });
    const gaps = new Map<number, number>();

    for (const state of history) {
      for (const pipe of state.pipes) {
        gaps.set(pipe.id, pipe.gapHeight);
      }
    }

    const observed = [...gaps.entries()].sort(([a], [b]) => a - b).map(([, gap]) => gap);

    expect(observed.length).toBeGreaterThanOrEqual(15);
    expect(Math.min(...observed)).toBe(probe.ramp?.minGap);
    for (const gap of observed) {
      expect(gap).toBeGreaterThanOrEqual(probe.ramp?.minGap ?? 0);
    }

    // Просвет сужается, а не скачет.
    expect(observed).toEqual([...observed].sort((a, b) => b - a));
  });

  it('скорость растёт: мир проходит больше за тот же отрезок', () => {
    const probe: LevelConfig = {
      ...LEVEL_1,
      pipeGap: 300,
      gapDrift: 30,
      runwayMs: 0,
      ramp: { speedPerPipe: 4, gapPerPipe: 0, minGap: 300 },
    };
    const history = run(started(probe, mulberry32(9)), { frames: 4000, control: autopilot });
    const at = (frame: number): number => history[frame]?.travelledX ?? 0;
    const early = at(999) - at(0);
    const late = at(3999) - at(3000);

    expect(late).toBeGreaterThan(early);
  });

  it('у реальных уровней просвет остаётся в границах их конфига', () => {
    for (const level of [LEVEL_4, LEVEL_5]) {
      const history = run(started(level, mulberry32(31)), { frames: 2500, control: autopilot });

      for (const state of history) {
        for (const pipe of state.pipes) {
          expect(pipe.gapHeight).toBeLessThanOrEqual(level.pipeGap);
          expect(pipe.gapHeight).toBeGreaterThanOrEqual(level.ramp?.minGap ?? level.pipeGap);
        }
      }
    }
  });
});

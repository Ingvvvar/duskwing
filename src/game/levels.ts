import type { LevelConfig } from './types';

/**
 * Уровень 1 — значения дословно из TASK.md, раздел 3.
 *
 * Новичок не должен раздражаться: сложность внутри уровня не растёт вообще
 * (`ramp: null`), механик нет, просвет широкий.
 */
export const LEVEL_1: LevelConfig = {
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
  ramp: null,
  mechanics: {},
  themeId: 'dusk',
};

/** Уровни 2–5 приезжают в фазе 5, каждый одним объектом и без правок кода. */
export const LEVELS: readonly LevelConfig[] = [LEVEL_1];

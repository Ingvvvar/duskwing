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
  /**
   * Кривая видов препятствий: четыре без потолка, три без пола, дальше
   * обычный просвет. Растёт не сложность — скорость и просвет постоянны, —
   * а вид препятствия. Первые без потолка потому, что частые взмахи новичка
   * там безнаказанны: именно ими он и отвечает на панику.
   *
   * Нижних четыре, а не три, потому что последнее из них идёт навстречу
   * верхним: иначе первый потолок упирается в ограничение разброса и
   * оказывается строже следующих.
   */
  warmup: ['bottom', 'bottom', 'bottom', 'bottom', 'top', 'top', 'top'],
  ramp: null,
  mechanics: {},
  themeId: 'dusk',
};

/** Ночь: быстрее и уже, без новых механик. */
export const LEVEL_2: LevelConfig = {
  id: 2,
  name: 'Ночь',
  target: 15,
  gravity: 1450,
  flapVelocity: -430,
  pipeSpeed: 135,
  pipeGap: 190,
  pipeSpacing: 250,
  gapDrift: 58,
  runwayMs: 2200,
  warmup: [],
  ramp: null,
  mechanics: {},
  themeId: 'night',
};

/**
 * Гроза: трубы ходят по вертикали.
 *
 * `ramp` намеренно нет: новая механика и нарастающая сложность вместе дают
 * два источника роста в одном уровне, и при разборе «тут нечестно» причину
 * не отделить. Механики самой по себе достаточно.
 */
export const LEVEL_3: LevelConfig = {
  id: 3,
  name: 'Гроза',
  target: 20,
  gravity: 1450,
  flapVelocity: -430,
  pipeSpeed: 145,
  pipeGap: 180,
  pipeSpacing: 245,
  gapDrift: 55,
  runwayMs: 2000,
  warmup: [],
  ramp: null,
  mechanics: { movingPipes: { amplitude: 26, periodMs: 2600 } },
  themeId: 'storm',
};

/** Каньон: зоны восходящих и нисходящих потоков. */
export const LEVEL_4: LevelConfig = {
  id: 4,
  name: 'Каньон',
  target: 25,
  gravity: 1450,
  flapVelocity: -430,
  pipeSpeed: 150,
  pipeGap: 180,
  pipeSpacing: 250,
  gapDrift: 48,
  runwayMs: 2000,
  warmup: [],
  ramp: { speedPerPipe: 0.6, gapPerPipe: 0.5, minGap: 160 },
  mechanics: { airflow: { zones: 3, strength: 220 } },
  themeId: 'canyon',
};

/** Пустота: всё сразу и минимальный просвет. */
export const LEVEL_5: LevelConfig = {
  id: 5,
  name: 'Пустота',
  target: 30,
  gravity: 1450,
  flapVelocity: -430,
  pipeSpeed: 165,
  pipeGap: 160,
  pipeSpacing: 240,
  gapDrift: 42,
  runwayMs: 2000,
  warmup: [],
  ramp: { speedPerPipe: 0.8, gapPerPipe: 0.7, minGap: 140 },
  mechanics: {
    movingPipes: { amplitude: 30, periodMs: 2200 },
    airflow: { zones: 4, strength: 340 },
  },
  themeId: 'void',
};

export const LEVELS: readonly LevelConfig[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5];

/**
 * Бесконечный режим. Тот же движок и тот же конфиг уровня, только с плавным
 * разгоном и без цели: `target` бесконечен, поэтому «уровень пройден» не
 * наступает никогда.
 *
 * В `LEVELS` намеренно не входит: это не шестой уровень, а режим. Открывается
 * после прохождения пятого — `isLevelUnlocked` по id 6 сверяется именно с ним.
 */
export const ENDLESS: LevelConfig = {
  id: 6,
  name: 'Бесконечность',
  target: Number.POSITIVE_INFINITY,
  gravity: 1450,
  flapVelocity: -430,
  pipeSpeed: 130,
  pipeGap: 200,
  pipeSpacing: 255,
  gapDrift: 55,
  runwayMs: 2500,
  warmup: [],
  ramp: { speedPerPipe: 0.5, gapPerPipe: 0.45, minGap: 145 },
  mechanics: {},
  // Темы как данных у режима нет: `endlessTheme` строит её по счёту.
  themeId: null,
};

/** Всё, во что можно играть: пять уровней плюс бесконечный режим. */
export const PLAYABLE: readonly LevelConfig[] = [...LEVELS, ENDLESS];

/**
 * Реестр всех пяти уровней из раздела 3 TASK.md — только id и имя.
 *
 * Нужен выбору уровня: карточки показываются для всех пяти, а конфиги 2–5
 * приезжают в фазе 5. Наличие имени здесь не означает, что уровень играбелен;
 * это решает `findLevel`.
 */
export const LEVEL_ROSTER: readonly { readonly id: number; readonly name: string }[] = [
  { id: 1, name: 'Сумерки' },
  { id: 2, name: 'Ночь' },
  { id: 3, name: 'Гроза' },
  { id: 4, name: 'Каньон' },
  { id: 5, name: 'Пустота' },
];

/** Конфиг уровня или режима, если он уже реализован. */
export function findLevel(id: number): LevelConfig | undefined {
  return PLAYABLE.find((level) => level.id === id);
}

import { describe, expect, it } from 'vitest';

import { FLYABLE_CENTER, FOREGROUND_BAND_HEIGHT, GROUND_TOP } from '../src/game/constants';
import { LEVELS } from '../src/game/levels';

/**
 * Передний план живёт в нижних `FOREGROUND_BAND_HEIGHT` px над линией земли.
 * Чтобы он не мог перекрыть проход, просвет обязан оставаться выше этой полосы
 * на любом уровне — иначе трава закроет дорогу, и это всплывёт не тестом, а
 * непроходимым уровнем.
 *
 * Худшая нижняя кромка считается так же, как её считает `Game.#spawnPipe`:
 * центр просвета зажат полосой ±gapDrift вокруг центра лётной зоны и
 * удержанием внутри самой зоны.
 */
function lowestGapBottom(level: (typeof LEVELS)[number]): number {
  const half = level.pipeGap / 2;
  const lowestCentre = Math.min(FLYABLE_CENTER + level.gapDrift, GROUND_TOP - half);

  return lowestCentre + half;
}

describe('полоса переднего плана', () => {
  it('просвет ни на одном уровне не опускается в полосу', () => {
    const limit = GROUND_TOP - FOREGROUND_BAND_HEIGHT;
    const offenders = LEVELS.filter((level) => lowestGapBottom(level) > limit).map(
      (level) => `${level.name}: ${String(lowestGapBottom(level))} > ${String(limit)}`,
    );

    expect(offenders).toEqual([]);
  });

  it('уровни есть — иначе проверка зеленеет, ничего не проверив', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
  });
});

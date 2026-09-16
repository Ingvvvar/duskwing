import { describe, expect, it } from 'vitest';

import { FLYABLE_CENTER, FOREGROUND_BAND_HEIGHT, GROUND_TOP } from '../src/game/constants';
import { PLAYABLE } from '../src/game/levels';

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
function lowestGapBottom(level: (typeof PLAYABLE)[number]): number {
  // Амплитуда хода трубы входит в запас: удержание в лётной зоне считает её
  // так же, поэтому нижняя кромка просвета опускается на amplitude ниже
  // своей базы в крайней точке колебания.
  const margin = level.pipeGap / 2 + (level.mechanics.movingPipes?.amplitude ?? 0);
  const lowestCentre = Math.min(FLYABLE_CENTER + level.gapDrift, GROUND_TOP - margin);

  return lowestCentre + margin;
}

describe('полоса переднего плана', () => {
  it('просвет ни на одном уровне не опускается в полосу', () => {
    const limit = GROUND_TOP - FOREGROUND_BAND_HEIGHT;
    const offenders = PLAYABLE.filter((level) => lowestGapBottom(level) > limit).map(
      (level) => `${level.name}: ${String(lowestGapBottom(level))} > ${String(limit)}`,
    );

    expect(offenders).toEqual([]);
  });

  it('проверка идёт по всем уровням и по бесконечному режиму', () => {
    expect(PLAYABLE).toHaveLength(6);
  });
});

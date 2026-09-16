import { describe, expect, it } from 'vitest';

import { FLYABLE_CENTER, FOREGROUND_BAND_HEIGHT, GROUND_TOP } from '../src/game/constants';
import { PLAYABLE } from '../src/game/levels';
import { foregroundBand } from '../src/render/foregroundBand';

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

/**
 * Вторая сторона того же контракта: сам слой обязан жить в полосе.
 *
 * Тест выше закрепляет данные — что просвет не опускается в полосу. Слой при
 * этом можно было нарисовать вдвое выше, и набор оставался зелёным: точка
 * применения не была закреплена ничем. Числа записаны литералами.
 */
describe('слой переднего плана', () => {
  it('стоит в нижних 72 px и упирается в линию земли', () => {
    const band = foregroundBand();

    expect(band.height).toBe(72);
    expect(band.y).toBe(476);
    expect(band.y + band.height).toBe(548);
  });

  it('не поднимается в лётную зону', () => {
    expect(foregroundBand().y).toBeGreaterThan(FLYABLE_CENTER);
  });
});

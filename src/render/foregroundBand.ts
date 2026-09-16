import { FOREGROUND_BAND_HEIGHT, GROUND_TOP } from '../game/constants';

/** Прямоугольник полосы переднего плана в мировых координатах. */
export interface ForegroundBand {
  readonly y: number;
  readonly height: number;
}

/**
 * Полоса, в которой живёт передний план: `FOREGROUND_BAND_HEIGHT` px, прижатые
 * к линии земли снизу.
 *
 * Вынесена из слоя отдельной функцией по той же причине, что и раскладка
 * препятствия: сам слой импортирует `pixi.js`, а в прогон тестов рантайм
 * рендера не тащится. Мутационный прогон показал, что слой можно было
 * нарисовать вдвое выше своей полосы, и набор оставался зелёным:
 * `tests/foreground-band.test.ts` закреплял сторону данных — что просвет не
 * опускается в полосу, — но не саму полосу.
 */
export function foregroundBand(): ForegroundBand {
  return { y: GROUND_TOP - FOREGROUND_BAND_HEIGHT, height: FOREGROUND_BAND_HEIGHT };
}

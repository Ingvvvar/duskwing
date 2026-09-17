import { describe, expect, it } from 'vitest';

import { BIRD_X, WORLD_WIDTH } from '../src/game/constants';
import { obstacleReveal, REVEAL_WIDTH } from '../src/render/obstacleReveal';

/**
 * Проявление препятствия у правой кромки.
 *
 * Числа записаны литералами, а не выражениями из самой функции: тест обязан
 * закреплять зону, а не повторять её.
 */
describe('проявление препятствия', () => {
  it('за краем невидимо, через 40 px непрозрачно', () => {
    expect(obstacleReveal(360)).toBe(0);
    expect(obstacleReveal(380)).toBe(0);
    expect(obstacleReveal(340)).toBeCloseTo(0.5, 10);
    expect(obstacleReveal(320)).toBe(1);
  });

  it('дальше зоны всегда непрозрачно, вплоть до ухода за левый край', () => {
    for (const x of [319, 200, BIRD_X, 0, -64]) {
      expect(obstacleReveal(x)).toBe(1);
    }
  });

  it('альфа не выходит за [0, 1] нигде', () => {
    for (let x = -100; x <= 400; x += 1) {
      const alpha = obstacleReveal(x);

      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it('зона узкая: препятствие непрозрачно задолго до икса птицы', () => {
    // На самой быстрой скорости, которую даёт игра.
    const fastest = 190;
    const fadeMs = (REVEAL_WIDTH / fastest) * 1000;
    const clearMs = ((WORLD_WIDTH - REVEAL_WIDTH - BIRD_X) / fastest) * 1000;

    expect(fadeMs).toBeLessThan(250);
    // Допуск на реакцию — около 150 мс; запас обязан быть кратным, а не впритык.
    expect(clearMs).toBeGreaterThan(150 * 5);
  });
});

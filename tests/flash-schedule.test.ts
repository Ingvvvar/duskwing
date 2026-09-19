import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../src/game/rng';
import { flashStep, INITIAL_FLASH, type FlashState } from '../src/render/flashSchedule';

const STEP_MS = 1000 / 120;

/** Прогон расписания: моменты начала вспышек и максимальная альфа. */
function run(frames: number, allowed = true): { starts: number[]; peak: number; lit: number } {
  const random = mulberry32(2026);
  let state: FlashState = INITIAL_FLASH;
  const starts: number[] = [];
  let peak = 0;
  let lit = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const step = flashStep(state, STEP_MS, allowed, random);

    state = step.state;
    peak = Math.max(peak, step.alpha);

    if (step.alpha > 0) {
      lit += 1;
    }

    if (step.started) {
      // Время ПОСЛЕ того, как dtMs этого кадра учтён: вспышка срабатывает на
      // вычитании, а не на входе в кадр.
      starts.push((frame + 1) * STEP_MS);
    }
  }

  return { starts, peak, lit };
}

/**
 * Расписание вспышек до вытяжки жило внутри слоя, который тянет `pixi.js`, и
 * не было покрыто ничем. Числа контракта читаемости здесь сверяются с
 * литералами, а не с константами модуля.
 */
describe('расписание вспышек', () => {
  it('альфа не выше 0.25 и вспышка не длиннее 120 мс', () => {
    const { starts, peak, lit } = run(120 * 60);

    expect(peak).toBeLessThanOrEqual(0.25);
    expect(starts.length).toBeGreaterThan(5);
    // Светится не дольше 120 мс на вспышку, то есть 14.4 кадра при шаге 1/120.
    expect(lit / starts.length).toBeLessThanOrEqual(120 / STEP_MS + 1);
  });

  it('пауза между вспышками лежит в 2.6–7 с', () => {
    const { starts } = run(120 * 180);

    expect(starts.length).toBeGreaterThan(20);

    for (let i = 1; i < starts.length; i += 1) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0);

      expect(gap).toBeGreaterThanOrEqual(2600);
      expect(gap).toBeLessThanOrEqual(7000 + 120 + STEP_MS);
    }
  });

  it('запрет из логики держит вспышку: своего расписания у неё нет', () => {
    const { starts, peak } = run(120 * 180, false);

    expect(starts).toEqual([]);
    expect(peak).toBe(0);
  });

  it('на нулевом dtMs состояние не двигается', () => {
    const random = mulberry32(1);
    const before: FlashState = { remainingMs: 40, cooldownMs: 900 };
    const step = flashStep(before, 0, true, random);

    expect(step.state).toEqual(before);
    expect(step.started).toBe(false);

    // И, главное, на нулевом кадре вспышка не начинается даже тогда, когда
    // пауза уже вышла: заморозка обязана держать её так же, как держит мир.
    const ready = flashStep({ remainingMs: 0, cooldownMs: 0 }, 0, true, random);

    expect(ready.started).toBe(false);
    expect(ready.alpha).toBe(0);
  });

  it('первая вспышка не раньше первой паузы', () => {
    const { starts } = run(120 * 60);

    expect(starts[0]).toBeGreaterThanOrEqual(2600);
  });
});

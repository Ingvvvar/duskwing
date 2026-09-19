import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../src/game/rng';
import { THUNDER_MAX_PENDING, ThunderQueue } from '../src/audio/thunder';
import { flashStep, INITIAL_FLASH, type FlashState } from '../src/render/flashSchedule';

const STEP_MS = 1000 / 120;

describe('очередь грома', () => {
  it('вспышка ставит гром, без вспышек очередь пуста', () => {
    const queue = new ThunderQueue(mulberry32(1));

    expect(queue.pending).toBe(0);
    expect(queue.advance(10_000)).toBe(0);

    queue.onFlash();
    expect(queue.pending).toBe(1);
  });

  it('гром звучит ровно один раз и не раньше 500 мс', () => {
    const queue = new ThunderQueue(mulberry32(2));

    queue.onFlash();
    // Числа-литералы: тест закрепляет пределы, а не повторяет их из модуля.
    expect(queue.advance(499)).toBe(0);
    expect(queue.advance(2000)).toBe(1);
    expect(queue.pending).toBe(0);
    expect(queue.advance(10_000)).toBe(0);
  });

  it('задержка всегда лежит в 500–2000 мс', () => {
    const queue = new ThunderQueue(mulberry32(7));

    for (let round = 0; round < 300; round += 1) {
      queue.onFlash();

      let waited = 0;

      while (queue.advance(1) === 0) {
        waited += 1;

        expect(waited).toBeLessThanOrEqual(2000);
      }

      expect(waited).toBeGreaterThanOrEqual(499);
    }
  });

  it('очередь не копит долг: лишние вспышки грома не порождают', () => {
    const queue = new ThunderQueue(mulberry32(3));

    for (let i = 0; i < 20; i += 1) {
      queue.onFlash();
    }

    expect(queue.pending).toBe(2);
    expect(THUNDER_MAX_PENDING).toBe(2);
    // Двадцать вспышек подряд дают два раската, а не двадцать.
    expect(queue.advance(5000)).toBe(2);
    expect(queue.advance(5000)).toBe(0);
  });

  it('после раската место освобождается', () => {
    const queue = new ThunderQueue(mulberry32(4));

    queue.onFlash();
    queue.onFlash();
    expect(queue.onFlash()).toBe(false);

    queue.advance(5000);
    expect(queue.onFlash()).toBe(true);
  });

  it('на замороженном мире гром ждёт', () => {
    const queue = new ThunderQueue(mulberry32(5));

    queue.onFlash();

    for (let frame = 0; frame < 1000; frame += 1) {
      expect(queue.advance(0)).toBe(0);
    }

    expect(queue.pending).toBe(1);
  });
});

/**
 * Связь «вспышка → запланирован гром», а не только сам звук.
 *
 * Расписание вспышек и очередь грома гоняются вместе, кадр за кадром: каждое
 * «вспышка началась» обязано дать ровно один раскат, и ни одного лишнего.
 * Непокрытым остаётся один стык — что `PixiRenderer` действительно зовёт
 * `onFlash`. Это та же граница «формула под тестом, вызов нет», что у полос
 * ветра и параллакса.
 */
describe('вспышка и гром идут от одного события', () => {
  function run(allowed: boolean, frames: number): { flashes: number; thunders: number } {
    const random = mulberry32(11);
    const queue = new ThunderQueue(mulberry32(12));
    let state: FlashState = INITIAL_FLASH;
    let flashes = 0;
    let thunders = 0;

    for (let frame = 0; frame < frames; frame += 1) {
      const step = flashStep(state, STEP_MS, allowed, random);

      state = step.state;

      if (step.started) {
        flashes += 1;
        queue.onFlash();
      }

      thunders += queue.advance(STEP_MS);
    }

    return { flashes, thunders };
  }

  it('сколько вспышек — столько раскатов', () => {
    // Минута игры: вспышки идут не чаще раза в 2.6 с, потолок очереди не задет.
    const { flashes, thunders } = run(true, 120 * 60);

    expect(flashes).toBeGreaterThan(5);
    expect(thunders).toBe(flashes);
  });

  it('вспышки запрещены — грома нет вовсе', () => {
    const { flashes, thunders } = run(false, 120 * 60);

    expect(flashes).toBe(0);
    expect(thunders).toBe(0);
  });
});

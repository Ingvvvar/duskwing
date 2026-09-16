import { describe, expect, it } from 'vitest';

import { LEVEL_3 } from '../src/game/levels';
import { FLASH_MAX_MS, FLASH_PIPE_GUARD_MS, flashAllowed } from '../src/game/mechanics';
import { mulberry32 } from '../src/game/rng';
import { autopilot, run, started } from './support/simulate';

describe('расписание вспышек', () => {
  it('запрет держится на всём окне вспышки, а не только в момент старта', () => {
    // До трубы ровно столько, чтобы вспышка успела кончиться до запретной зоны.
    expect(flashAllowed(10_000, FLASH_PIPE_GUARD_MS + FLASH_MAX_MS, FLASH_MAX_MS)).toBe(true);
    // На миллисекунду ближе — уже нет: хвост вспышки задел бы зону.
    expect(flashAllowed(10_000, FLASH_PIPE_GUARD_MS + FLASH_MAX_MS - 1, FLASH_MAX_MS)).toBe(false);
  });

  it('проверка одного лишь момента старта пропустила бы вспышку у границы', () => {
    const toNextPipe = 450;

    // Наивная проверка «до трубы не меньше 400» старт бы разрешила...
    expect(toNextPipe >= FLASH_PIPE_GUARD_MS).toBe(true);
    // ...а вспышка длиной 120 мс кончилась бы через 570 мс, то есть внутри
    // запретной зоны, которая начинается за 400 мс до трубы — на 50-й.
    expect(flashAllowed(10_000, toNextPipe, FLASH_MAX_MS)).toBe(false);
  });

  it('запрет симметричный: сразу после появления трубы тоже нельзя', () => {
    expect(flashAllowed(FLASH_PIPE_GUARD_MS - 1, 10_000, FLASH_MAX_MS)).toBe(false);
    expect(flashAllowed(FLASH_PIPE_GUARD_MS, 10_000, FLASH_MAX_MS)).toBe(true);
  });

  it('вспышка длиннее предела запрещена всегда', () => {
    expect(flashAllowed(10_000, 10_000, FLASH_MAX_MS + 1)).toBe(false);
  });
});

describe('флаг вспышки на реальной ленте спавнов', () => {
  it('ни одно разрешённое окно не задевает появление трубы', () => {
    // Уровень 3 без ramp: скорость постоянная, значит предсказание момента
    // следующего спавна точное, и тест проверяет расписание, а не погрешность.
    const history = run(started(LEVEL_3, mulberry32(13)), { frames: 4000, control: autopilot });
    const spawnAt = new Map<number, number>();

    for (const state of history) {
      for (const pipe of state.pipes) {
        if (!spawnAt.has(pipe.id)) {
          spawnAt.set(pipe.id, state.elapsedMs);
        }
      }
    }

    const spawns = [...spawnAt.values()];
    const allowed = history.filter((state) => state.flashAllowed);

    expect(spawns.length).toBeGreaterThanOrEqual(3);
    expect(allowed.length).toBeGreaterThan(0);

    const offenders = allowed.filter((state) =>
      spawns.some(
        (spawn) =>
          state.elapsedMs < spawn + FLASH_PIPE_GUARD_MS &&
          state.elapsedMs + FLASH_MAX_MS > spawn - FLASH_PIPE_GUARD_MS,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

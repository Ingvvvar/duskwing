import { describe, expect, it } from 'vitest';

import { LEVEL_1 } from '../src/game/levels';
import type { ProgressStorage } from '../src/game/progress';
import { EMPTY_PROGRESS, loadProgress, recordRun, saveProgress } from '../src/game/progress';

/** Хранилище в памяти: тот же порт, что даст адаптер localStorage в фазе 4. */
function memoryStorage(initial: string | null = null): ProgressStorage {
  let stored = initial;

  return {
    read: () => stored,
    write: (_key, value) => {
      stored = value;
    },
  };
}

describe('прогресс', () => {
  it('пустое хранилище даёт дефолт', () => {
    expect(loadProgress(memoryStorage())).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(memoryStorage(''))).toEqual(EMPTY_PROGRESS);
  });

  it('испорченное содержимое даёт дефолт и не бросает', () => {
    const broken = ['{"bestScores":', 'не json вовсе', '"строка вместо объекта"', 'null'];

    for (const raw of broken) {
      expect(() => loadProgress(memoryStorage(raw))).not.toThrow();
      expect(loadProgress(memoryStorage(raw))).toEqual(EMPTY_PROGRESS);
    }

    // Порча одного поля не обнуляет второе.
    expect(
      loadProgress(memoryStorage('{"bestScores":{"1":"много"},"clearedLevels":[1]}')),
    ).toEqual({ bestScores: {}, clearedLevels: [1] });

    // Бросающее чтение — приватный режим Safari — тоже даёт дефолт.
    const throwing: ProgressStorage = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => undefined,
    };

    expect(loadProgress(throwing)).toEqual(EMPTY_PROGRESS);
  });

  it('рекорд не понижается, пройденный уровень остаётся пройденным', () => {
    const storage = memoryStorage();

    saveProgress(storage, recordRun(loadProgress(storage), LEVEL_1.id, 12, LEVEL_1.target));
    expect(loadProgress(storage).bestScores['1']).toBe(12);

    const afterWeakRun = recordRun(loadProgress(storage), LEVEL_1.id, 4, LEVEL_1.target);

    expect(afterWeakRun.bestScores['1']).toBe(12);
    expect(afterWeakRun.clearedLevels).toEqual([LEVEL_1.id]);
  });
});

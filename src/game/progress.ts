/**
 * Рекорды и разблокировки поверх абстрактного хранилища.
 *
 * `localStorage` здесь не упоминается: `src/game/**` про браузер не знает.
 * Адаптер с try/catch вокруг реального хранилища подключается в фазе 4.
 * Разбор того, что пришло из хранилища, — забота этого файла: снаружи может
 * прийти пустота, обрезанная строка или чужой JSON.
 */

/** Порт хранилища. Реализация может бросать — здесь это учтено. */
export interface ProgressStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export interface Progress {
  /** Ключ — id уровня строкой: через JSON числовые ключи всё равно станут строками. */
  readonly bestScores: Readonly<Record<string, number>>;
  readonly clearedLevels: readonly number[];
}

export const PROGRESS_KEY = 'duskwing.progress';

export const EMPTY_PROGRESS: Progress = { bestScores: {}, clearedLevels: [] };

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'number' && Number.isFinite(entry),
  );
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

/**
 * Читает прогресс. Любая неисправность — пустое хранилище, мусор вместо JSON,
 * бросающий `read` — даёт дефолт, а не исключение. Порча одного поля не
 * обнуляет второе.
 */
export function loadProgress(storage: ProgressStorage): Progress {
  let raw: string | null;

  try {
    raw = storage.read(PROGRESS_KEY);
  } catch {
    return EMPTY_PROGRESS;
  }

  if (raw === null || raw === '') {
    return EMPTY_PROGRESS;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return EMPTY_PROGRESS;
  }

  const candidate = parsed as { bestScores?: unknown; clearedLevels?: unknown };

  return {
    bestScores: isNumberRecord(candidate.bestScores) ? candidate.bestScores : {},
    clearedLevels: isNumberArray(candidate.clearedLevels) ? candidate.clearedLevels : [],
  };
}

export function saveProgress(storage: ProgressStorage, progress: Progress): void {
  try {
    storage.write(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Не сохранился прогресс — не повод ронять игру: приватный режим Safari
    // и переполненная квота бросают именно отсюда.
  }
}

/**
 * Итог забега. Рекорд только растёт: неудачная попытка не затирает удачную.
 * Уровень считается пройденным, когда набрана цель из его конфига.
 */
export function recordRun(progress: Progress, levelId: number, score: number, target: number): Progress {
  const key = String(levelId);
  const best = progress.bestScores[key] ?? 0;
  const cleared =
    score >= target && !progress.clearedLevels.includes(levelId)
      ? [...progress.clearedLevels, levelId]
      : progress.clearedLevels;

  return {
    bestScores: { ...progress.bestScores, [key]: Math.max(best, score) },
    clearedLevels: cleared,
  };
}

/** Первый уровень открыт всегда, следующий — когда пройден предыдущий. */
export function isLevelUnlocked(progress: Progress, levelId: number): boolean {
  return levelId <= 1 || progress.clearedLevels.includes(levelId - 1);
}

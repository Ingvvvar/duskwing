import { WORLD_WIDTH } from './constants';
import type { LevelConfig } from './types';

type Airflow = NonNullable<LevelConfig['mechanics']['airflow']>;
type MovingPipes = NonNullable<LevelConfig['mechanics']['movingPipes']>;

/**
 * Вертикальное ускорение потока в мировой точке, px/s². Положительное сносит
 * вниз, отрицательное — вверх; складывается с гравитацией уровня.
 *
 * ЕДИНСТВЕННЫЙ источник координат зон. Мировая координата экранной точки `x`
 * равна `state.travelledX + x`: логика зовёт эту функцию для позиции птицы,
 * а рендер в подходе Б будет звать её же для каждой экранной полосы. Второй
 * формулы быть не должно — разъехавшиеся полосы и физика делают игру
 * нечестной, а причину такого расхождения почти невозможно найти.
 *
 * Период синуса — ровно две зоны: восходящая и нисходящая.
 */
export function airflowAt(worldX: number, airflow: Airflow): number {
  if (airflow.zones <= 0) {
    return 0;
  }

  const zoneWidth = WORLD_WIDTH / airflow.zones;

  return airflow.strength * Math.sin((Math.PI * worldX) / zoneWidth);
}

/**
 * Действующий центр просвета с учётом вертикального хода трубы.
 *
 * Возвращает именно действующее значение, а не смещение: у коллизий и у
 * рендера должен быть один и тот же `gapCenter`, иначе труба будет убивать
 * не там, где нарисована.
 */
export function pipeGapCenterAt(
  baseGapCenter: number,
  phase: number,
  elapsedMs: number,
  moving: MovingPipes | undefined,
): number {
  if (moving === undefined || moving.periodMs <= 0) {
    return baseGapCenter;
  }

  return (
    baseGapCenter +
    moving.amplitude * Math.sin(2 * Math.PI * (elapsedMs / moving.periodMs + phase))
  );
}

/**
 * Ширина одного полного периода зон в мировых единицах: восходящая зона плюс
 * нисходящая. По ней строится плитка полос ветра — плитка, равная периоду и
 * сдвигаемая на `travelledX`, попадает в зоны точно, без второй формулы.
 */
export function airflowPeriod(airflow: Airflow): number {
  return (2 * WORLD_WIDTH) / airflow.zones;
}

/** Нормированная сила потока, −1…1. Полосы ветра рисуются по ней. */
export function airflowNormalised(worldX: number, airflow: Airflow): number {
  return airflow.strength === 0 ? 0 : airflowAt(worldX, airflow) / airflow.strength;
}

/** Вспышка молнии не длиннее этого (TASK.md, контракт читаемости). */
export const FLASH_MAX_MS = 120;
/** И не ярче этого. */
export const FLASH_MAX_ALPHA = 0.25;
/** Запретная зона вокруг появления новой трубы в кадре. */
export const FLASH_PIPE_GUARD_MS = 400;

/**
 * Можно ли начать вспышку прямо сейчас.
 *
 * Проверяется **всё окно вспышки**, а не только момент старта: флаг,
 * разрешивший старт, ничего не говорит о том, что будет через 120 мс, а
 * труба за это время успевает войти в кадр — и запрет нарушится в середине
 * вспышки, там, где его никто не проверял.
 *
 * Запрет симметричный: вспышка за мгновение до появления трубы мешает так же,
 * как и сразу после.
 *
 * @param msSinceLastPipe сколько прошло с появления последней трубы
 * @param msToNextPipe через сколько появится следующая
 * @param durationMs длительность вспышки, которую собираются начать
 */
export function flashAllowed(
  msSinceLastPipe: number,
  msToNextPipe: number,
  durationMs: number,
): boolean {
  if (durationMs > FLASH_MAX_MS) {
    return false;
  }

  return (
    msSinceLastPipe >= FLASH_PIPE_GUARD_MS && msToNextPipe >= durationMs + FLASH_PIPE_GUARD_MS
  );
}

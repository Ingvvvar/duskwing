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

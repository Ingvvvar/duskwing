import { GROUND_TOP, MAX_FALL_SPEED, PIPE_WIDTH } from './constants';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Вертикальное состояние птицы. По X она не движется. */
export interface Vertical {
  readonly y: number;
  readonly velocity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Полунеявный Эйлер: сначала скорость, потом позиция по уже новой скорости.
 *
 * Порядок операций зафиксирован и менять его нельзя — от него зависит
 * побитовая воспроизводимость прогона при одном сиде.
 */
export function integrateVertical(vertical: Vertical, gravity: number, dtSeconds: number): Vertical {
  // Кламп односторонний: ограничивается падение, импульс вверх отрицателен.
  const velocity = Math.min(vertical.velocity + gravity * dtSeconds, MAX_FALL_SPEED);

  return { y: vertical.y + velocity * dtSeconds, velocity };
}

/** Потолок не убивает: птица упирается в него, вертикальная скорость гасится. */
export function resolveCeiling(vertical: Vertical, radius: number): Vertical {
  if (vertical.y >= radius) {
    return vertical;
  }

  return { y: radius, velocity: 0 };
}

/** Земля убивает. */
export function hitsGround(y: number, radius: number): boolean {
  return y + radius >= GROUND_TOP;
}

/**
 * Круг против прямоугольника через ближайшую точку.
 *
 * Сравнение строгое намеренно: касание ровно по касательной не убивает.
 * Это одно из мест, которыми уровень 1 сделан заметно проще, а не «чуть».
 * Не менять на `<=` при уборке кода — это решение, а не описка.
 */
export function circleHitsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y, rect.y + rect.height);
  const dx = cx - closestX;
  const dy = cy - closestY;

  return dx * dx + dy * dy < radius * radius;
}

/** Две коробки трубы: от потолка до просвета и от просвета до земли. */
export function pipeRects(x: number, gapCenter: number, gapHeight: number): readonly [Rect, Rect] {
  const gapTop = gapCenter - gapHeight / 2;
  const gapBottom = gapCenter + gapHeight / 2;

  return [
    { x, y: 0, width: PIPE_WIDTH, height: gapTop },
    { x, y: gapBottom, width: PIPE_WIDTH, height: GROUND_TOP - gapBottom },
  ];
}

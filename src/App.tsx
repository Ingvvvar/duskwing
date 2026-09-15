import type { ReactElement } from 'react';

/**
 * Фаза 0: пустой canvas на всю доступную площадь и больше ничего.
 * Размерами и DPR занимается рендер начиная с фазы 2 — здесь нет JS-логики.
 */
export function App(): ReactElement {
  return <canvas className="game-canvas" />;
}

import { useRef } from 'react';
import type { ReactElement } from 'react';

import { useGameLoop } from './hooks/useGameLoop';

/**
 * Обёртка `stage` нужна ResizeObserver: за самим канвасом наблюдать нельзя,
 * `autoDensity` пишет в него инлайн-стили.
 *
 * Счёт — один div, а не Pixi Text: это зачаток HUD из фазы 4.
 */
export function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const score = useGameLoop(canvasRef);

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="score">{score}</div>
    </div>
  );
}

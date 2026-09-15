import type { ReactElement } from 'react';

interface HudProps {
  readonly score: number;
  readonly target: number;
  readonly showHint: boolean;
}

/**
 * Счёт, цель и подсказка по управлению.
 *
 * Обновляется только при изменении счёта: в игровом цикле `setState` не
 * вызывается, значение приходит из хука уже сравнённым с предыдущим.
 */
export function Hud({ score, target, showHint }: HudProps): ReactElement {
  return (
    <div className="hud">
      <div className="hud__score">
        {score}
        <span className="hud__target"> / {target}</span>
      </div>
      {showHint ? <p className="hud__hint">Тап или пробел — взмах</p> : null}
    </div>
  );
}

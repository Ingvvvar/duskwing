import type { ReactElement } from 'react';

interface PauseOverlayProps {
  readonly name: string;
  readonly onResume: () => void;
  readonly onLeave: () => void;
}

/**
 * Экран паузы.
 *
 * Тап перехватывает, в отличие от «игра окончена»: под ним замороженная живая
 * попытка, и случайный тап мимо кнопок не должен ни возвращать в игру, ни
 * уходить во взмах. Возврат идёт только через «Продолжить» — и через отсчёт.
 */
export function PauseOverlay({ name, onResume, onLeave }: PauseOverlayProps): ReactElement {
  return (
    <div className="overlay overlay--center">
      <h2 className="title title--small">Пауза</h2>
      <p className="subtitle">{name}</p>
      <button className="button" type="button" onClick={onResume}>
        Продолжить
      </button>
      <button className="button button--quiet" type="button" onClick={onLeave}>
        К уровням
      </button>
      <p className="subtitle subtitle--faint">Попытка не потеряна: счёт и рекорд останутся</p>
    </div>
  );
}

import type { ReactElement } from 'react';

interface MenuProps {
  readonly onPlay: () => void;
}

/** Главное меню. Живая сцена за ним продолжает ползти — мир не выключен. */
export function Menu({ onPlay }: MenuProps): ReactElement {
  return (
    <div className="overlay overlay--center">
      <h1 className="title">Duskwing</h1>
      <p className="subtitle">Одна кнопка. Пять уровней. Сумерки не ждут.</p>
      <button className="button" type="button" onClick={onPlay}>
        Играть
      </button>
    </div>
  );
}

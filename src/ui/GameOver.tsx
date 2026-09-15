import type { ReactElement } from 'react';

interface GameOverProps {
  readonly score: number;
  readonly best: number;
  readonly onRestart: () => void;
}

/**
 * Экран «игра окончена».
 *
 * Не является шагом между попытками: тот же тап или пробел сразу начинает
 * новую, кнопка здесь — для мыши, а не обязательный подтверждающий клик.
 * Задержки перед приёмом ввода нет намеренно — ТЗ требует меньше 300 мс от
 * смерти до управляемой попытки, и любой антислучайный тайм-аут съедает
 * этот бюджет целиком.
 */
export function GameOver({ score, best, onRestart }: GameOverProps): ReactElement {
  return (
    <div className="overlay overlay--center overlay--quiet">
      <h2 className="title title--small">Игра окончена</h2>
      <p className="result">
        {score}
        <span className="result__best"> рекорд {best}</span>
      </p>
      <button className="button" type="button" onClick={onRestart}>
        Ещё раз
      </button>
      <p className="subtitle subtitle--faint">Тап или пробел — сразу новая попытка</p>
    </div>
  );
}

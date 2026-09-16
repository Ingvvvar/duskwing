import type { ReactElement } from 'react';

interface LevelClearProps {
  readonly name: string;
  readonly score: number;
  readonly best: number;
  readonly onContinue: () => void;
}

/** Экран «уровень пройден». Геймплей на нём не идёт — мир заморожен хуком. */
export function LevelClear({ name, score, best, onContinue }: LevelClearProps): ReactElement {
  return (
    <div className="overlay overlay--center overlay--passthrough">
      <h2 className="title title--small">Уровень пройден</h2>
      <p className="subtitle">{name}</p>
      <p className="result">
        {score}
        <span className="result__best"> рекорд {best}</span>
      </p>
      <button className="button" type="button" onClick={onContinue}>
        К уровням
      </button>
    </div>
  );
}

import type { ReactElement } from 'react';

import { ENDLESS, findLevel, LEVEL_ROSTER } from '../game/levels';
import type { Progress } from '../game/progress';
import { isLevelUnlocked } from '../game/progress';

interface LevelSelectProps {
  readonly progress: Progress;
  readonly onPick: (id: number) => void;
  readonly onBack: () => void;
}

/**
 * Выбор уровня.
 *
 * Два независимых признака, и их нельзя путать:
 *   `isLevelUnlocked` — открыт ли уровень по прогрессу игрока;
 *   `findLevel`       — существует ли его конфиг вообще.
 * Второй нужен потому, что после прохождения первого уровня второй станет
 * открытым по прогрессу, а его конфиг приедет только в фазе 5. Без этой
 * проверки игрок упёрся бы в открытую карточку, за которой ничего нет.
 */
export function LevelSelect({ progress, onPick, onBack }: LevelSelectProps): ReactElement {
  return (
    <div className="overlay overlay--center">
      <h2 className="title title--small">Уровни</h2>
      <ul className="levels">
        {LEVEL_ROSTER.map((entry) => {
          const unlocked = isLevelUnlocked(progress, entry.id);
          const ready = findLevel(entry.id) !== undefined;
          const best = progress.bestScores[String(entry.id)] ?? 0;

          if (!unlocked) {
            return (
              <li className="level level--locked" key={entry.id}>
                <span className="level__index">{entry.id}</span>
                <span className="level__name">{entry.name}</span>
                <span className="level__note">закрыт</span>
              </li>
            );
          }

          if (!ready) {
            return (
              <li className="level level--soon" key={entry.id}>
                <span className="level__index">{entry.id}</span>
                <span className="level__name">{entry.name}</span>
                <span className="level__note">скоро</span>
              </li>
            );
          }

          return (
            <li key={entry.id}>
              <button
                className="level level--open"
                type="button"
                onClick={() => {
                  onPick(entry.id);
                }}
              >
                <span className="level__index">{entry.id}</span>
                <span className="level__name">{entry.name}</span>
                <span className="level__note">{best > 0 ? `рекорд ${String(best)}` : 'играть'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {isLevelUnlocked(progress, ENDLESS.id) ? (
        <button
          className="level level--open level--endless"
          type="button"
          onClick={() => {
            onPick(ENDLESS.id);
          }}
        >
          <span className="level__index">∞</span>
          <span className="level__name">{ENDLESS.name}</span>
          <span className="level__note">
            {(progress.bestScores[String(ENDLESS.id)] ?? 0) > 0
              ? `рекорд ${String(progress.bestScores[String(ENDLESS.id)] ?? 0)}`
              : 'играть'}
          </span>
        </button>
      ) : null}
      <button className="button button--quiet" type="button" onClick={onBack}>
        Назад
      </button>
    </div>
  );
}

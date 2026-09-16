import type { ReactElement } from 'react';

interface MuteButtonProps {
  readonly muted: boolean;
  readonly onToggle: () => void;
}

/**
 * Переключатель звука в углу сцены. Виден на всех экранах: во время игры он
 * нужнее всего, а спрятанный в меню требовал бы выйти из уровня.
 */
export function MuteButton({ muted, onToggle }: MuteButtonProps): ReactElement {
  return (
    <button
      className="mute"
      type="button"
      aria-label={muted ? 'Включить звук' : 'Выключить звук'}
      aria-pressed={muted}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? (
          <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" fill="none" />
        ) : (
          <path
            d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        )}
      </svg>
    </button>
  );
}

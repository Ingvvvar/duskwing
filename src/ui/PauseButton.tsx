import type { ReactElement } from 'react';

interface PauseButtonProps {
  readonly onPause: () => void;
}

/**
 * Кнопка паузы в углу сцены, слева от мьюта.
 *
 * Тап по ней не доходит до канваса и взмахом не считается: кнопка лежит выше
 * и перехватывает попадание сама, как и мьют. Проверяется кликом по координате
 * с настоящим попаданием по слоям, а не событием, адресованным канвасу.
 */
export function PauseButton({ onPause }: PauseButtonProps): ReactElement {
  return (
    <button className="pause" type="button" aria-label="Пауза" onClick={onPause}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
      </svg>
    </button>
  );
}

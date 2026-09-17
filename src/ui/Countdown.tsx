import type { ReactElement } from 'react';

interface CountdownProps {
  readonly value: number;
}

/**
 * Отсчёт возврата из паузы поверх замороженного мира.
 *
 * Последняя секунда выделена крупнее и тёплым цветом: на ноль игрок обязан
 * уже держать палец наготове, а не начинать реагировать. Оверлея под отсчётом
 * нет — мир виден целиком, и положение птицы читается заранее.
 */
export function Countdown({ value }: CountdownProps): ReactElement {
  const last = value <= 1;

  return (
    <div className="countdown" aria-live="assertive">
      <span className={last ? 'countdown__value countdown__value--last' : 'countdown__value'}>
        {value}
      </span>
      <span className="countdown__hint">{last ? 'Приготовься' : 'Возврат в игру'}</span>
    </div>
  );
}

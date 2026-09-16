/**
 * Параллакс слоёв фона — таблица из раздела 4 TASK.md.
 *
 * Вынесено отдельным модулем без единого импорта `pixi.js`: так контракт
 * читаемости проверяется тестом (`tests/parallax.test.ts`), а не глазами, и
 * при этом рантайм рендера не утаскивается в node-прогон.
 */
/**
 * Погода в ТЗ заявлена диапазоном 0.6–1.2, но контракт читаемости запрещает
 * 0.85–1.15. Правило главнее: значения разведены по нижней части диапазона,
 * запретную полосу не пересекает ни один слой, кроме земли.
 */
export const PARALLAX = {
  sky: 0,
  celestial: 0.03,
  ridgeFar: 0.12,
  ridgeNear: 0.28,
  haze: 0.2,
  weatherSnow: 0.6,
  weatherFireflies: 0.65,
  weatherDust: 0.7,
  weatherRain: 0.8,
  ground: 1,
  /**
   * Полосы ветра идут ровно со скоростью мира: зоны `airflow` неподвижны в
   * мировых координатах, и полоса обязана стоять там же, где поток. Любое
   * другое значение — это вторая формула координат зон.
   */
  wind: 1,
  foreground: 1.5,
} as const;

/** Разбор по видам погоды. Значения те же, тест покрывает их через PARALLAX. */
export const WEATHER_PARALLAX = {
  rain: PARALLAX.weatherRain,
  snow: PARALLAX.weatherSnow,
  fireflies: PARALLAX.weatherFireflies,
  dust: PARALLAX.weatherDust,
} as const;

/**
 * Запретная полоса из контракта читаемости: слой фона, идущий со скоростью,
 * близкой к игровой, читается как ложное движение препятствия.
 */
export const FALSE_MOTION_BAND = { min: 0.85, max: 1.15 } as const;

/**
 * Исключения из запретной полосы.
 *
 * `ground` — земля, ей и положено идти со скоростью игры.
 *
 * `wind` — полосы ветра каньона. Это **не фон, а телеграф механики**: они
 * показывают, где физика сносит птицу вверх, а где вниз. Совпадение с
 * физикой для них важнее правила про ложное движение — разъехавшись с
 * зонами, они начнут врать игроку, а найти причину такого расхождения по
 * симптомам почти невозможно. Риск «читается как препятствие» снимается
 * иначе: мягкими градиентами и низкой альфой, а не параллаксом.
 *
 * Список закрытый. Новая строка здесь — это ослабление контракта
 * читаемости, и она требует такого же записанного обоснования.
 */
export const FALSE_MOTION_EXEMPT: readonly string[] = ['ground', 'wind'];

/**
 * Смещение плитки полос ветра по `travelledX`.
 *
 * Коэффициента здесь нет и быть не может: зоны `airflow` неподвижны в мировых
 * координатах, а полоса — их телеграф. Любой множитель означает, что полоса
 * поедет мимо потока, который её породил, и игра начнёт врать игроку о том,
 * где её снесёт.
 *
 * Вынесено из слоя отдельной функцией потому, что сам слой импортирует
 * `pixi.js`: мутационный прогон показал, что множитель 0.8 в точке применения
 * проходил мимо всего набора.
 */
export function windTileOffset(travelledX: number, period: number): number {
  if (period <= 0) {
    return 0;
  }

  return -(((travelledX % period) + period) % period);
}

/** Смещения слоёв фона на пройденной дистанции. */
export interface LayerScroll {
  readonly celestial: number;
  readonly ridgeFar: number;
  readonly ridgeNear: number;
  readonly haze: number;
  readonly ground: number;
  readonly foreground: number;
}

/**
 * Применение таблицы `PARALLAX` к пройденной дистанции — одним местом.
 *
 * Таблица сама по себе была закреплена тестом, а её применение нет: слой мог
 * ехать со скоростью мира мимо таблицы, а земля с передним планом — обменяться
 * коэффициентами, и набор оставался зелёным.
 */
export function layerScroll(scrollX: number): LayerScroll {
  return {
    celestial: scrollX * PARALLAX.celestial,
    ridgeFar: scrollX * PARALLAX.ridgeFar,
    ridgeNear: scrollX * PARALLAX.ridgeNear,
    haze: scrollX * PARALLAX.haze,
    ground: scrollX * PARALLAX.ground,
    foreground: scrollX * PARALLAX.foreground,
  };
}

/** Снос частиц погоды за кадр. У «никакой» погоды сноса нет. */
export function weatherDrift(advance: number, kind: keyof typeof WEATHER_PARALLAX | 'none'): number {
  return kind === 'none' ? 0 : advance * WEATHER_PARALLAX[kind];
}

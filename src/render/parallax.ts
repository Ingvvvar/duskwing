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
   * Частицы потока. Их горизонтальная скорость не обязана совпадать с миром:
   * вертикальная скорость каждой частицы считается от её собственной мировой
   * координаты на каждом кадре, поэтому телеграф остаётся честным при любом
   * параллаксе. Полосам ветра, которые были здесь раньше, для этого
   * требовалась ровно скорость мира и исключение из запретной полосы.
   */
  flow: 0.7,
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
 * `ground` — земля, ей и положено идти со скоростью игры. Больше исключений
 * нет: телеграф зон потока раньше требовал второго — полосы ветра обязаны
 * были идти ровно со скоростью мира, — а частицы потока, пришедшие им на
 * смену, берут вертикальную скорость от своей мировой координаты на каждом
 * кадре и в поблажке не нуждаются.
 *
 * Список закрытый. Новая строка здесь — это ослабление контракта
 * читаемости, и она требует такого же записанного обоснования.
 */
export const FALSE_MOTION_EXEMPT: readonly string[] = ['ground'];


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

/**
 * Снос частиц телеграфа за кадр.
 *
 * Отдельно от погоды потому, что телеграф живёт и там, где погоды нет вовсе
 * (пустота), а стоять на месте ему незачем: его честность держится не на
 * скорости, а на том, что вертикаль считается от мировой координаты частицы.
 */
export function flowDrift(advance: number): number {
  return advance * PARALLAX.flow;
}

/** Снос частиц погоды за кадр. У «никакой» погоды сноса нет. */
export function weatherDrift(advance: number, kind: keyof typeof WEATHER_PARALLAX | 'none'): number {
  return kind === 'none' ? 0 : advance * WEATHER_PARALLAX[kind];
}

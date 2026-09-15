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

/** Земля — единственное исключение: ей и положено идти со скоростью игры. */
export const FALSE_MOTION_EXEMPT: readonly string[] = ['ground'];

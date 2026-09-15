import type { Theme } from './types';

/**
 * Сумерки — тема уровня 1 и самая спокойная из пяти: погоды нет, переднего
 * плана нет, дымки нет. Всё, что здесь выключено, существует ради остальных
 * тем и проверяется отладочной темой ниже.
 *
 * Четвёртый стоп неба добавлен к трём из ТЗ как промежуточный: тип требует
 * четыре, направление индиго → пурпур сохранено.
 */
export const DUSK: Theme = {
  id: 'dusk',
  sky: ['#151B3D', '#242D5C', '#3D4C8F', '#8E6FA0'],
  celestial: { kind: 'sun', x: 268, y: 392, glow: '#F0DCB4', stars: 0 },
  ridgeFar: { color: '#28305E', amplitude: 46, roughness: 5, seed: 1337 },
  ridgeNear: { color: '#181E42', amplitude: 64, roughness: 9, seed: 4242 },
  haze: null,
  weather: { kind: 'none', count: 0, speed: 0 },
  ground: { base: '#10152F', top: '#2A2350' },
  foreground: { kind: 'none', blur: 0 },
  grade: { saturation: 1.04, brightness: 1, tint: '#FFE8C8', vignette: 0.28 },
  accent: '#E8DCC0',
};

/**
 * Отладочная тема: включено всё сразу, включая слои, которых нет ни у dusk,
 * ни у большинства остальных тем. Нужна, чтобы погода, передний план, дымка
 * и грейд не оставались непроверенными до фазы 5.
 *
 * Доступна только через `?theme=debug` и только под `import.meta.env.DEV`:
 * в проде условие схлопывается, и эта константа выпадает из бандла.
 * Цвета намеренно ядовитые — на скриншоте видно, какой слой отвечает за что.
 */
export const DEBUG_THEME: Theme = {
  id: 'debug-all-layers',
  sky: ['#0B1020', '#1B2450', '#3A2E5E', '#6E4A7A'],
  celestial: { kind: 'moon', x: 96, y: 150, glow: '#BFE6FF', stars: 60 },
  ridgeFar: { color: '#2B3D6B', amplitude: 52, roughness: 6, seed: 9001 },
  ridgeNear: { color: '#151B3D', amplitude: 70, roughness: 11, seed: 9002 },
  haze: { color: '#7FE3FF', alpha: 0.18 },
  weather: { kind: 'rain', count: 300, speed: 1 },
  ground: { base: '#0E1024', top: '#3A2E5E' },
  foreground: { kind: 'grass', blur: 3 },
  grade: { saturation: 0.8, brightness: 1.1, tint: '#FF00E6', vignette: 0.5 },
  accent: '#00FFB3',
};

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
  grade: { saturation: 1.04, brightness: 1, tint: '#FFE8C8', vignette: 0.18 },
  accent: '#E8DCC0',
  obstacle: { kind: 'column', capHeight: 14, capOverhang: 8, decor: 'rings', edgeSoftness: 6 },
};


/** Ночь: луна, звёзды, светляки, холодный грейд. */
export const NIGHT: Theme = {
  id: 'night',
  sky: ['#080C24', '#111838', '#1B2450', '#3A2E5E'],
  celestial: { kind: 'moon', x: 92, y: 148, glow: '#CBD9F2', stars: 70 },
  ridgeFar: { color: '#1C2450', amplitude: 44, roughness: 5, seed: 2201 },
  ridgeNear: { color: '#0D1230', amplitude: 62, roughness: 9, seed: 2202 },
  haze: null,
  weather: { kind: 'fireflies', count: 40, speed: 1 },
  ground: { base: '#070A1C', top: '#1B2450' },
  foreground: { kind: 'grass', blur: 3 },
  grade: { saturation: 0.85, brightness: 1, tint: '#C8D8FF', vignette: 0.24 },
  accent: '#D9E2F5',
  obstacle: { kind: 'slab', capHeight: 17, capOverhang: 7, decor: 'grooves', edgeSoftness: 7 },
};

/** Гроза: светила нет, дождь и вспышки, сильно обесцвеченный грейд. */
export const STORM: Theme = {
  id: 'storm',
  sky: ['#1A2230', '#242E3C', '#2E3B48', '#4A5560'],
  celestial: { kind: 'none', x: 0, y: 0, glow: '#C9D4DC', stars: 0 },
  ridgeFar: { color: '#28323F', amplitude: 48, roughness: 6, seed: 3301 },
  ridgeNear: { color: '#161D27', amplitude: 66, roughness: 10, seed: 3302 },
  haze: { color: '#8E9BA6', alpha: 0.14 },
  weather: { kind: 'rain', count: 300, speed: 1.1 },
  ground: { base: '#10161F', top: '#2E3B48' },
  foreground: { kind: 'streaks', blur: 2 },
  grade: { saturation: 0.65, brightness: 0.98, tint: '#D6E2EC', vignette: 0.3 },
  accent: '#E6ECEF',
  obstacle: { kind: 'monolith', capHeight: 22, capOverhang: 10, decor: 'cracks', edgeSoftness: 8 },
};

/**
 * Каньон: пыль и полосы ветра.
 *
 * Полосы рисуют зоны `airflow` уровня — здесь фон работает телеграфом
 * геймплея, поэтому идёт со скоростью мира; см. исключение в `parallax.ts`.
 */
export const CANYON: Theme = {
  id: 'canyon',
  sky: ['#2A1C2E', '#52293A', '#7A3B46', '#C0764A'],
  celestial: { kind: 'none', x: 0, y: 0, glow: '#FFD8B0', stars: 0 },
  ridgeFar: { color: '#4A2733', amplitude: 50, roughness: 5, seed: 4401 },
  ridgeNear: { color: '#2A1822', amplitude: 68, roughness: 9, seed: 4402 },
  haze: { color: '#E0A070', alpha: 0.1 },
  weather: { kind: 'dust', count: 120, speed: 0.6 },
  ground: { base: '#1E1018', top: '#5A2E38' },
  foreground: { kind: 'rocks', blur: 2 },
  grade: { saturation: 1.1, brightness: 1, tint: '#FFD8B0', vignette: 0.26 },
  accent: '#FFE8C8',
  obstacle: { kind: 'spire', capHeight: 20, capOverhang: 12, decor: 'grooves', edgeSoftness: 9 },
};

/** Пустота: почти монохром, ленты сияния, тяжёлая виньетка. */
export const VOID: Theme = {
  id: 'void',
  sky: ['#05060E', '#090B18', '#0E1024', '#1A1233'],
  celestial: { kind: 'none', x: 0, y: 0, glow: '#9FB6FF', stars: 40 },
  ridgeFar: { color: '#12142C', amplitude: 46, roughness: 5, seed: 5501 },
  ridgeNear: { color: '#08091A', amplitude: 64, roughness: 9, seed: 5502 },
  haze: { color: '#3BE0C0', alpha: 0.16 },
  weather: { kind: 'none', count: 0, speed: 0 },
  ground: { base: '#04050C', top: '#1A1233' },
  foreground: { kind: 'none', blur: 0 },
  grade: { saturation: 0.55, brightness: 0.95, tint: '#C8D0FF', vignette: 0.42 },
  accent: '#6FE3B8',
  obstacle: { kind: 'crystal', capHeight: 18, capOverhang: 10, decor: 'facets', edgeSoftness: 10 },
};

/** Все темы по id. Дев-переключатель `?theme=<id>` ходит сюда же. */
export const THEMES: Readonly<Record<string, Theme>> = {
  [DUSK.id]: DUSK,
  [NIGHT.id]: NIGHT,
  [STORM.id]: STORM,
  [CANYON.id]: CANYON,
  [VOID.id]: VOID,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Смешивание цветов в sRGB. Для палитры этого достаточно. */
export function mixHex(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number): number =>
    Math.round(mix((a >> shift) & 0xff, (b >> shift) & 0xff, clamp01(t)));

  // Прописные, как в литералах тем: тогда смесь при t = 0 буквально равна
  // исходному цвету, и это можно сравнивать напрямую.
  return `#${[16, 8, 0]
    .map((shift) => channel(shift).toString(16).padStart(2, '0').toUpperCase())
    .join('')}`;
}

/**
 * Плавный переход между темами.
 *
 * Перетекают только **палитра и грейд**, как и требует ТЗ: цвета неба,
 * гребней, дымки, земли, акцента и числа грейда. Всё структурное — вид
 * светила и погоды, число звёзд, форма силуэтов, передний план — переключается
 * на середине: интерполировать его нечем, а главное, перестройка формы стоит
 * снятия текстуры, и в бесконечном режиме она случалась бы на каждом очке.
 *
 * Для бесконечного режима погодой отдельно управляет `endlessTheme`.
 */
export function interpolateTheme(from: Theme, to: Theme, t: number): Theme {
  const k = clamp01(t);
  const late = k >= 0.5;

  return {
    id: `${from.id}->${to.id}`,
    sky: [
      mixHex(from.sky[0], to.sky[0], k),
      mixHex(from.sky[1], to.sky[1], k),
      mixHex(from.sky[2], to.sky[2], k),
      mixHex(from.sky[3], to.sky[3], k),
    ],
    celestial: late ? to.celestial : from.celestial,
    ridgeFar: {
      ...(late ? to.ridgeFar : from.ridgeFar),
      color: mixHex(from.ridgeFar.color, to.ridgeFar.color, k),
    },
    ridgeNear: {
      ...(late ? to.ridgeNear : from.ridgeNear),
      color: mixHex(from.ridgeNear.color, to.ridgeNear.color, k),
    },
    haze: mixHaze(from.haze, to.haze, k),
    weather: late ? to.weather : from.weather,
    ground: {
      base: mixHex(from.ground.base, to.ground.base, k),
      top: mixHex(from.ground.top, to.ground.top, k),
    },
    foreground: late ? to.foreground : from.foreground,
    grade: {
      saturation: mix(from.grade.saturation, to.grade.saturation, k),
      brightness: mix(from.grade.brightness, to.grade.brightness, k),
      tint: mixHex(from.grade.tint, to.grade.tint, k),
      vignette: mix(from.grade.vignette, to.grade.vignette, k),
    },
    accent: mixHex(from.accent, to.accent, k),
    // Форма препятствия структурна: смешивать колонну с кристаллом нечем.
    obstacle: late ? to.obstacle : from.obstacle,
  };
}

function mixHaze(from: Theme['haze'], to: Theme['haze'], t: number): Theme['haze'] {
  if (from === null && to === null) {
    return null;
  }

  // Появляющаяся или исчезающая дымка вводится альфой от нуля, а не скачком.
  if (from === null) {
    return to === null ? null : { color: to.color, alpha: to.alpha * t };
  }

  if (to === null) {
    return { color: from.color, alpha: from.alpha * (1 - t) };
  }

  return { color: mixHex(from.color, to.color, t), alpha: mix(from.alpha, to.alpha, t) };
}

/** Счёт, на котором палитра бесконечного режима доходит до `void`. */
export const ENDLESS_FULL_SCORE = 60;

/**
 * Погода бесконечного режима переключается на порогах: вид погоды — не число,
 * интерполировать его нечем.
 */
const ENDLESS_WEATHER: readonly { readonly from: number; readonly weather: Theme['weather'] }[] = [
  { from: 0, weather: { kind: 'none', count: 0, speed: 0 } },
  { from: 12, weather: { kind: 'fireflies', count: 40, speed: 1 } },
  { from: 28, weather: { kind: 'dust', count: 120, speed: 0.7 } },
  { from: 45, weather: { kind: 'rain', count: 240, speed: 1.1 } },
];

/** Тема бесконечного режима по счёту: палитра и грейд текут от dusk к void. */
export function endlessTheme(score: number): Theme {
  const blended = interpolateTheme(DUSK, VOID, score / ENDLESS_FULL_SCORE);
  const step = [...ENDLESS_WEATHER].reverse().find((entry) => score >= entry.from);

  return { ...blended, id: 'endless', weather: step?.weather ?? blended.weather };
}

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
  obstacle: { kind: 'crystal', capHeight: 22, capOverhang: 14, decor: 'facets', edgeSoftness: 12 },
};

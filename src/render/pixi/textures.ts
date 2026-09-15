import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';

import { GROUND_HEIGHT, WORLD_HEIGHT } from '../../game/constants';
import { mulberry32 } from '../../game/rng';
import type { Theme } from '../../game/types';

/**
 * Процедурная генерация текстур. Бинарных ассетов в репозитории нет — всё
 * рисуется один раз при старте и при смене темы.
 */

function createCanvas(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('2D-контекст недоступен: не на чем сгенерировать текстуру');
  }

  return context;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toLinear(channel: number): number {
  const c = channel / 255;

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSrgb(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const c = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;

  return Math.round(c * 255);
}

/** Относительная яркость по WCAG. Та же формула, что в замере читаемости. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Гасит цвет до заданной относительной яркости, сохраняя оттенок.
 *
 * Множитель считается точно, а не подбирается: яркость линейна по линейным
 * каналам, поэтому масштабирование их всех на `target / current` даёт ровно
 * нужную яркость. Цвет светлее цели не трогается.
 */
export function dimToLuminance(hex: string, target: number): string {
  const current = relativeLuminance(hex);

  if (current <= target || current === 0) {
    return hex;
  }

  const factor = target / current;
  const channels = hexToRgb(hex)
    .map((channel) => toSrgb(toLinear(channel) * factor))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');

  return `#${channels}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);

  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/**
 * Небо: вертикальный градиент в четыре стопа. Холст шириной 8 px, а не во всю
 * ширину мира — градиент вертикальный, растянуть его спрайтом дешевле, чем
 * держать в памяти 920 КБ пикселей.
 */
export function createSkyTexture(stops: Theme['sky']): Texture {
  const context = createCanvas(8, WORLD_HEIGHT);
  const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);

  stops.forEach((color, index) => {
    gradient.addColorStop(index / (stops.length - 1), color);
  });

  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, WORLD_HEIGHT);

  return Texture.from(context.canvas);
}

/** Ореол светила под аддитивное смешивание: радиальный градиент в прозрачность. */
export function createGlowTexture(color: string, radius: number, peakAlpha: number): Texture {
  const size = radius * 2;
  const context = createCanvas(size, size);
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);

  gradient.addColorStop(0, rgba(color, peakAlpha));
  gradient.addColorStop(0.35, rgba(color, peakAlpha * 0.4));
  gradient.addColorStop(1, rgba(color, 0));

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return Texture.from(context.canvas);
}

export interface RidgeOptions {
  readonly color: string;
  readonly amplitude: number;
  readonly roughness: number;
  readonly seed: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** Доля второй октавы: высокая частота поверх основной формы, 0 — выключена. */
  readonly detail: number;
  /** По умолчанию generateTexture берёт renderer.resolution, то есть DPR. */
  readonly resolution?: number;
}

const GROUND_SEED = 20260916;

/** Множитель частоты второй октавы относительно первой. */
const DETAIL_FREQUENCY = 4;

function smoothstep(edge: number): number {
  return edge * edge * (3 - 2 * edge);
}

/**
 * Силуэт гребня по сид-функции, снятый в текстуру.
 *
 * Контрольные точки берутся по модулю их числа, поэтому правый край плитки
 * совпадает с левым — без этого шов виден при каждом повторе.
 */
export function createRidgeTexture(renderer: Renderer, options: RidgeOptions): Texture {
  const random = mulberry32(options.seed);
  const count = Math.max(2, Math.round(options.roughness));
  const controls = Array.from({ length: count }, () => random());
  const detailCount = count * DETAIL_FREQUENCY;
  const detailControls = Array.from({ length: detailCount }, () => random());

  const sample = (values: readonly number[], x: number): number => {
    const t = (x / options.tileWidth) * values.length;
    const index = Math.floor(t);
    const from = values[index % values.length] ?? 0;
    const to = values[(index + 1) % values.length] ?? 0;

    return from + (to - from) * smoothstep(t - index);
  };

  // Вторая октава: та же обёртка по модулю, поэтому плитка остаётся бесшовной.
  const heightAt = (x: number): number =>
    sample(controls, x) * (1 - options.detail) + sample(detailControls, x) * options.detail;

  const points: number[] = [];

  for (let x = 0; x <= options.tileWidth; x += 2) {
    points.push(x, options.amplitude * (1 - heightAt(x)));
  }

  // Замыкаем контур вниз до подошвы плитки: под гребнем сплошная заливка,
  // иначе между ним и землёй будет щель.
  points.push(options.tileWidth, options.tileHeight, 0, options.tileHeight);

  const silhouette = new Graphics().poly(points, true).fill(options.color);

  // frame задаётся явно, а не берётся из границ полигона. Верх силуэта до
  // нуля не доходит, поэтому без frame текстура выходит ниже tileHeight,
  // а TilingSprite добирает высоту вторым повтором по вертикали — и его
  // прозрачная верхушка читается как щель между гребнем и землёй.
  const frame = new Rectangle(0, 0, options.tileWidth, options.tileHeight);
  const texture = renderer.generateTexture(
    options.resolution === undefined
      ? { target: silhouette, frame }
      : { target: silhouette, frame, resolution: options.resolution },
  );

  silhouette.destroy();

  return texture;
}

/**
 * Земля: плитка с полосой `top` сверху и насечками, без которых прокрутка
 * сплошной заливки не читается как движение.
 */
export function createGroundTexture(base: string, top: string): Texture {
  const tileWidth = 128;
  const context = createCanvas(tileWidth, GROUND_HEIGHT);

  context.fillStyle = base;
  context.fillRect(0, 0, tileWidth, GROUND_HEIGHT);

  context.fillStyle = top;
  context.fillRect(0, 0, tileWidth, 6);

  context.fillStyle = rgba(top, 0.35);

  // Ширина и шаг нерегулярные: равные интервалы читаются как измерительная
  // лента, а не как земля. Насечка, вылезающая за правый край плитки,
  // дорисовывается слева — без этого плитка перестаёт быть бесшовной.
  const random = mulberry32(GROUND_SEED);

  for (let x = 0; x < tileWidth; ) {
    const width = 1 + Math.round(random() * 3);
    const height = 5 + Math.round(random() * 9);

    context.fillRect(x, 6, width, height);

    if (x + width > tileWidth) {
      context.fillRect(x - tileWidth, 6, width, height);
    }

    x += 7 + Math.round(random() * 17);
  }

  return Texture.from(context.canvas);
}

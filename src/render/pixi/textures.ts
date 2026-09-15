import { Graphics, Texture, type Renderer } from 'pixi.js';

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
}

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

  const heightAt = (x: number): number => {
    const t = (x / options.tileWidth) * count;
    const index = Math.floor(t);
    const from = controls[index % count] ?? 0;
    const to = controls[(index + 1) % count] ?? 0;

    return from + (to - from) * smoothstep(t - index);
  };

  const points: number[] = [];

  for (let x = 0; x <= options.tileWidth; x += 2) {
    points.push(x, options.amplitude * (1 - heightAt(x)));
  }

  // Замыкаем контур вниз до подошвы плитки: под гребнем сплошная заливка,
  // иначе между ним и землёй будет щель.
  points.push(options.tileWidth, options.tileHeight, 0, options.tileHeight);

  const silhouette = new Graphics().poly(points, true).fill(options.color);
  const texture = renderer.generateTexture(silhouette);

  silhouette.destroy();

  return texture;
}

/**
 * Земля: плитка с полосой `top` сверху и насечками, без которых прокрутка
 * сплошной заливки не читается как движение.
 */
export function createGroundTexture(base: string, top: string): Texture {
  const tileWidth = 64;
  const context = createCanvas(tileWidth, GROUND_HEIGHT);

  context.fillStyle = base;
  context.fillRect(0, 0, tileWidth, GROUND_HEIGHT);

  context.fillStyle = top;
  context.fillRect(0, 0, tileWidth, 6);

  context.fillStyle = rgba(top, 0.35);

  for (let x = 4; x < tileWidth; x += 16) {
    context.fillRect(x, 6, 2, 10);
  }

  return Texture.from(context.canvas);
}

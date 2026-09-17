import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';

import {
  FOREGROUND_BAND_HEIGHT,
  GROUND_HEIGHT,
  PIPE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../game/constants';
import { airflowNormalised, airflowPeriod } from '../../game/mechanics';
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
 * Плитка тайлится только по горизонтали.
 *
 * По вертикали ставится зажим выборки, а не заворот, и это не перестраховка.
 * Все тайлящиеся слои прокручиваются лишь по X, а их плитка по высоте равна
 * высоте слоя — заворот по Y не нужен вовсе. Но при дробном масштабе
 * устройства (логический мир 360 px на физический экран — это 2.25 device px
 * на единицу) выборка у верхней кромки захватывает противоположный,
 * полностью залитый край, и он проступает волосяной линией во всю ширину
 * кадра. Линия была видна на всех пяти темах: на мировых y 444 и 380 —
 * кромки гребней, на 476 — кромка переднего плана.
 *
 * `TilingSpritePipe` выставляет `addressMode = 'repeat'`, только если геттер
 * вернул не `'repeat'`, а геттер отдаёт `addressModeU`. Поэтому пара
 * «repeat по X, зажим по Y» переживает пайплайн, а не перетирается им.
 */
function tileHorizontally(texture: Texture): Texture {
  texture.source.style.addressModeU = 'repeat';
  texture.source.style.addressModeV = 'clamp-to-edge';
  texture.source.style.update();

  return texture;
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
const HAZE_SEED = 20260917;
const FOREGROUND_SEED = 20260918;

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

  return tileHorizontally(texture);
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

  return tileHorizontally(Texture.from(context.canvas));
}

/**
 * Полосы ветра: плитка шириной ровно в один период зон `airflow`.
 *
 * Значения берутся из `airflowNormalised` — той же функции, по которой
 * считает физика. Своей формулы здесь нет и быть не должно: плитка ширины
 * периода, сдвинутая на `travelledX`, попадает в зоны точно.
 *
 * Восходящий поток и нисходящий различаются знаком и потому цветом; альфа
 * мягко нарастает к середине зоны, чтобы полоса не читалась как препятствие.
 */
export function createWindTexture(
  airflow: { zones: number; strength: number },
  upColor: string,
  downColor: string,
  maxAlpha: number,
  height: number,
): Texture {
  const width = Math.round(airflowPeriod(airflow));
  // Высота плитки равна высоте слоя: по горизонтали заворот нужен и работает
  // ровно по периоду зон, а вертикальный повтор резал бы градиент и давал
  // горизонтальные полосы поперёк экрана.
  const context = createCanvas(width, height);

  for (let x = 0; x < width; x += 1) {
    const value = airflowNormalised(x, airflow);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    const color = value >= 0 ? downColor : upColor;
    const alpha = Math.abs(value) * maxAlpha;

    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.5, rgba(color, alpha));
    gradient.addColorStop(1, rgba(color, 0));
    context.fillStyle = gradient;
    context.fillRect(x, 0, 1, height);
  }

  return tileHorizontally(Texture.from(context.canvas));
}

/**
 * Дымка: мягкие пятна под blendMode screen.
 *
 * Высота плитки равна высоте слоя намеренно: пятна заворачиваются только по
 * горизонтали, и при вертикальном повторе их обрезанные края читаются как
 *горизонтальные полосы поперёк всего экрана. По горизонтали слой прокручивается, там
 * заворот нужен; по вертикали повтора быть не должно.
 */
export function createHazeTexture(color: string, tileHeight: number): Texture {
  const tileWidth = 256;
  const context = createCanvas(tileWidth, tileHeight);
  const random = mulberry32(HAZE_SEED);

  for (let index = 0; index < 7; index += 1) {
    const x = random() * tileWidth;
    const y = random() * tileHeight;
    const radius = 40 + random() * 60;

    // Пятно у края дорисовывается с противоположной стороны — иначе на
    // повторе плитки виден шов.
    for (const offset of [0, -tileWidth, tileWidth]) {
      const gradient = context.createRadialGradient(x + offset, y, 0, x + offset, y, radius);

      gradient.addColorStop(0, rgba(color, 0.5));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.fillRect(x + offset - radius, y - radius, radius * 2, radius * 2);
    }
  }

  return tileHorizontally(Texture.from(context.canvas));
}

/**
 * Частица погоды. Все виды рисуются белым: цвет задаётся тинтом на самой
 * частице, поэтому текстура одна на контейнер, как того требует
 * ParticleContainer.
 */
export function createParticleTexture(kind: Theme['weather']['kind']): Texture {
  if (kind === 'rain') {
    const context = createCanvas(2, 16);
    const gradient = context.createLinearGradient(0, 0, 0, 16);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 16);

    return Texture.from(context.canvas);
  }

  const size = kind === 'dust' ? 4 : 10;
  const context = createCanvas(size, size);
  const radius = size / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);

  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(kind === 'fireflies' ? 0.3 : 0.6, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return Texture.from(context.canvas);
}

/**
 * Передний план: силуэты в полосе `FOREGROUND_BAND_HEIGHT` над линией земли.
 */
export function createForegroundTexture(
  kind: Theme['foreground']['kind'],
  blur: number,
  color: string,
): Texture {
  const tileWidth = 256;
  const context = createCanvas(tileWidth, FOREGROUND_BAND_HEIGHT);
  const random = mulberry32(FOREGROUND_SEED);

  // Размытие запекается в текстуру, а не вешается рантайм-фильтром: силуэты
  // статичны, размывать их покадрово не за что, а бюджет ТЗ — не больше двух
  // активных фильтров, и оба уже заняты грейдом фона и ближних слоёв.
  // Не заменять на BlurFilter «как в ТЗ»: это осознанный размен.
  context.filter = `blur(${String(blur)}px)`;
  context.fillStyle = color;

  if (kind === 'grass') {
    for (let x = -8; x < tileWidth + 8; x += 3 + random() * 5) {
      const height = 18 + random() * (FOREGROUND_BAND_HEIGHT - 24);
      const lean = (random() - 0.5) * 10;

      context.beginPath();
      context.moveTo(x, FOREGROUND_BAND_HEIGHT);
      context.quadraticCurveTo(x + lean, FOREGROUND_BAND_HEIGHT - height * 0.6, x + lean * 2, FOREGROUND_BAND_HEIGHT - height);
      context.lineTo(x + 2.5, FOREGROUND_BAND_HEIGHT);
      context.closePath();
      context.fill();
    }
  } else if (kind === 'streaks') {
    for (let x = -40; x < tileWidth + 40; x += 14 + random() * 22) {
      context.beginPath();
      context.moveTo(x, FOREGROUND_BAND_HEIGHT);
      context.lineTo(x + 26, FOREGROUND_BAND_HEIGHT - 40 - random() * 20);
      context.lineTo(x + 32, FOREGROUND_BAND_HEIGHT - 40 - random() * 20);
      context.lineTo(x + 8, FOREGROUND_BAND_HEIGHT);
      context.closePath();
      context.fill();
    }
  } else if (kind === 'rocks') {
    for (let x = -20; x < tileWidth + 20; x += 18 + random() * 30) {
      const radius = 8 + random() * 16;

      context.beginPath();
      context.ellipse(x, FOREGROUND_BAND_HEIGHT, radius, radius * 0.7, 0, Math.PI, 0);
      context.fill();
    }
  }

  return tileHorizontally(Texture.from(context.canvas));
}

/** Виньетка под blendMode multiply: белая в центре, тёмная по краям. */
export function createVignetteTexture(strength: number): Texture {
  const context = createCanvas(WORLD_WIDTH, WORLD_HEIGHT);
  const half = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  const gradient = context.createRadialGradient(half.x, half.y, WORLD_WIDTH * 0.25, half.x, half.y, WORLD_HEIGHT * 0.72);
  const edge = Math.round((1 - Math.min(1, Math.max(0, strength))) * 255);

  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, `rgb(${String(edge)}, ${String(edge)}, ${String(edge)})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  return Texture.from(context.canvas);
}

const OBSTACLE_SEED = 20260922;
/** Растягиваемая середина плитки препятствия. */
const OBSTACLE_MIDDLE = 26;
/** Нерастягиваемый дальний конец. */
const OBSTACLE_TAIL = 4;

export interface ObstacleTexture {
  readonly texture: Texture;
  /** Отступ слева: спрайт ставится левее коллизии на эту величину. */
  readonly pad: number;
  /** Высота нерастягиваемой части со стороны навершия. */
  readonly capBorder: number;
  readonly tailBorder: number;
}

/**
 * Плитка препятствия под NineSliceSprite.
 *
 * Внутри `PIPE_WIDTH` — плотная зона, ровно та, что участвует в коллизии, и
 * ровно цвета `accent`. Ядро заливается на всю ширину всегда: рисунок уже
 * коллизии означал бы смерть о пустое место, а это та же нечестность, только
 * с другой стороны. Всё, что снаружи ядра — вылет навершия и мягкое поле, —
 * рисуется с падающей альфой и рваным краем.
 *
 * Разделение рисунка между серединой и навершием не декоративное, а
 * вынужденное: девятислайс растягивает середину на всю высоту трубы, поэтому
 * там живут только вертикальные узоры — они растяжение переживают. Всё
 * горизонтальное и вся форма силуэта уходят в навершие, которое не тянется.
 */
export function createObstacleTexture(theme: Theme, half: 'top' | 'bottom'): ObstacleTexture {
  const look = theme.obstacle;
  const pad = look.capOverhang + look.edgeSoftness;
  const width = PIPE_WIDTH + pad * 2;
  const height = look.capHeight + OBSTACLE_MIDDLE + OBSTACLE_TAIL;
  const context = createCanvas(width, height);
  const random = mulberry32(OBSTACLE_SEED);
  const capAtTop = half === 'bottom';
  const left = pad;
  const right = pad + PIPE_WIDTH;

  // 1. Плотное ядро во всю ширину коллизии.
  context.fillStyle = theme.accent;
  context.fillRect(left, 0, PIPE_WIDTH, height);

  // 2. Вертикальный узор середины: растяжение его не портит.
  drawBodyDecor(context, look.decor, left, PIPE_WIDTH, height, theme.accent);

  // 3. Навершие: форма силуэта и всё горизонтальное — здесь.
  const capTop = capAtTop ? 0 : height - look.capHeight;

  drawCap(context, look, left, PIPE_WIDTH, capTop, capAtTop, theme.accent, random);

  // 4. Мягкое поле по бокам: падает от кромки коллизии наружу.
  for (const side of [-1, 1] as const) {
    const from = side < 0 ? left : right;
    const gradient = context.createLinearGradient(from, 0, from + side * pad, 0);

    gradient.addColorStop(0, rgba(theme.accent, 0.42));
    gradient.addColorStop(1, rgba(theme.accent, 0));
    context.fillStyle = gradient;
    context.fillRect(Math.min(from, from + side * pad), 0, pad, height);

    // Вылет навершия — плотнее поля, но всё равно мягкий.
    const capGradient = context.createLinearGradient(from, 0, from + side * look.capOverhang, 0);

    capGradient.addColorStop(0, rgba(theme.accent, 0.62));
    capGradient.addColorStop(1, rgba(theme.accent, 0));
    context.fillStyle = capGradient;
    context.fillRect(
      Math.min(from, from + side * look.capOverhang),
      capTop,
      look.capOverhang,
      look.capHeight,
    );
  }

  // 5. Рваный край поля: ровная кромка читалась бы как плотная.
  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = 'rgba(0,0,0,1)';
  for (let y = 0; y < height; y += 2) {
    const biteLeft = random() * look.edgeSoftness * 0.9;
    const biteRight = random() * look.edgeSoftness * 0.9;

    context.fillRect(0, y, biteLeft, 2);
    context.fillRect(width - biteRight, y, biteRight, 2);
  }
  context.globalCompositeOperation = 'source-over';

  return {
    texture: Texture.from(context.canvas),
    pad,
    capBorder: look.capHeight,
    tailBorder: OBSTACLE_TAIL,
  };
}

/** Узор тела: только вертикальный — середина плитки растягивается. */
function drawBodyDecor(
  context: CanvasRenderingContext2D,
  decor: Theme['obstacle']['decor'],
  left: number,
  width: number,
  height: number,
  accent: string,
): void {
  const dark = rgba(accent, 0.3);
  const light = 'rgba(255, 255, 255, 0.12)';

  if (decor === 'grooves' || decor === 'cracks') {
    context.fillStyle = dark;
    for (let x = left + 9; x < left + width - 6; x += 12) {
      context.fillRect(x, 0, 2.5, height);
    }
    context.fillStyle = light;
    for (let x = left + 13; x < left + width - 6; x += 12) {
      context.fillRect(x, 0, 1, height);
    }

    return;
  }

  if (decor === 'facets') {
    // Две грани: светлая слева, тёмная справа, раздел вертикальный.
    context.fillStyle = light;
    context.fillRect(left, 0, width * 0.34, height);
    context.fillStyle = dark;
    context.fillRect(left + width * 0.74, 0, width * 0.26, height);

    return;
  }

  if (decor === 'rings') {
    // У колонны вертикальная растушёвка объёма; кольца — в навершии.
    const gradient = context.createLinearGradient(left, 0, left + width, 0);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, rgba(accent, 0.28));
    context.fillStyle = gradient;
    context.fillRect(left, 0, width, height);
  }
}

/** Навершие: форма силуэта темы. Не растягивается, поэтому здесь можно всё. */
function drawCap(
  context: CanvasRenderingContext2D,
  look: Theme['obstacle'],
  left: number,
  width: number,
  capTop: number,
  capAtTop: boolean,
  accent: string,
  random: () => number,
): void {
  const dark = rgba(accent, 0.34);
  const light = 'rgba(255, 255, 255, 0.2)';
  const bright = 'rgba(255, 255, 255, 0.32)';
  // Кромка, обращённая к просвету.
  const edge = capAtTop ? capTop : capTop + look.capHeight;
  const inward = capAtTop ? 1 : -1;

  context.save();
  context.beginPath();
  context.rect(left, capTop, width, look.capHeight);
  context.clip();

  if (look.kind === 'column') {
    // Кольца карниза.
    context.fillStyle = light;
    for (let i = 1; i <= 3; i += 1) {
      context.fillRect(left, edge + inward * (i * 4), width, 2);
    }
    context.fillStyle = bright;
    context.fillRect(left, edge - (capAtTop ? 0 : 3), width, 3);
  } else if (look.kind === 'slab') {
    // Плита: выраженная ступень с фаской и тенью под ней. Кромка — главное,
    // что отличает эту тему, поэтому она читается в три слоя.
    context.fillStyle = dark;
    context.fillRect(left, edge + inward * 9, width, look.capHeight);
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.fillRect(left, edge + inward * 7, width, 3);
    context.fillStyle = bright;
    context.fillRect(left, edge - (capAtTop ? 0 : 6), width, 6);
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.fillRect(left, edge - (capAtTop ? 0 : 2), width, 2);
  } else if (look.kind === 'monolith') {
    // Скол: рваная кромка. Зубцы глубокие и разной высоты — мелкая пила
    // на этой высоте читалась как ровная линия.
    context.fillStyle = dark;
    context.beginPath();
    context.moveTo(left, edge);
    for (let x = left; x <= left + width; x += 5) {
      context.lineTo(x, edge + inward * (3 + random() * 17));
    }
    context.lineTo(left + width, edge + inward * look.capHeight);
    context.lineTo(left, edge + inward * look.capHeight);
    context.closePath();
    context.fill();

    // Второй ряд сколов светлее — кромка получает глубину, а не силуэт.
    context.fillStyle = 'rgba(255, 255, 255, 0.16)';
    context.beginPath();
    context.moveTo(left, edge + inward * 2);
    for (let x = left; x <= left + width; x += 7) {
      context.lineTo(x, edge + inward * (4 + random() * 10));
    }
    context.lineTo(left + width, edge + inward * 12);
    context.lineTo(left, edge + inward * 12);
    context.closePath();
    context.fill();
  } else if (look.kind === 'spire') {
    // Шпиль: сужение к просвету, поверх сплошного ядра.
    context.fillStyle = dark;
    context.beginPath();
    context.moveTo(left, edge);
    context.lineTo(left + width * 0.22, edge + inward * look.capHeight);
    context.lineTo(left, edge + inward * look.capHeight);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(left + width, edge);
    context.lineTo(left + width * 0.78, edge + inward * look.capHeight);
    context.lineTo(left + width, edge + inward * look.capHeight);
    context.closePath();
    context.fill();
    context.fillStyle = bright;
    context.fillRect(left + width * 0.3, edge - (capAtTop ? 0 : 2), width * 0.4, 2);
  } else {
    // Кристалл: шеврон к просвету.
    context.fillStyle = bright;
    context.beginPath();
    context.moveTo(left, edge + inward * look.capHeight);
    context.lineTo(left + width / 2, edge);
    context.lineTo(left + width, edge + inward * look.capHeight);
    context.lineTo(left + width, edge + inward * (look.capHeight + 4));
    context.lineTo(left, edge + inward * (look.capHeight + 4));
    context.closePath();
    context.fill();
  }

  context.restore();
}

/** Дымка у правой кромки: препятствие проступает, а не выезжает из-под маски. */
export function createEdgeHazeTexture(color: string, width: number, maxAlpha: number): Texture {
  const context = createCanvas(width, 8);
  const gradient = context.createLinearGradient(0, 0, width, 0);

  // Квадратичное нарастание: основная ширина почти прозрачна, плотная часть
  // узкая — иначе препятствие прячется дольше, чем игрок успевает среагировать.
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;

    gradient.addColorStop(t, rgba(color, maxAlpha * t * t));
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, 8);

  return Texture.from(context.canvas);
}

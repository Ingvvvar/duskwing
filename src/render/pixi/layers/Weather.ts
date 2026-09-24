import { Container, Particle, ParticleContainer, Rectangle, RenderTexture, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';

import { GROUND_TOP, WORLD_WIDTH } from '../../../game/constants';
import { airflowAt } from '../../../game/mechanics';
import { mulberry32 } from '../../../game/rng';
import type { LevelConfig, Theme } from '../../../game/types';
import { particleCounts, PARTICLE_MAX_ALPHA } from '../../particles';
import { weatherKey, weatherTint } from '../../textureKeys';
import type { ParticleTextures } from '../textures';

type Airflow = LevelConfig['mechanics']['airflow'];

const SEED = 20260919;
/**
 * Ускорение потока (px/s²) в скорость частицы (px/s).
 *
 * При силе каньона 220 это 62 px/s в середине зоны, при силе пустоты 340 —
 * 95 px/s. За те доли секунды, что игрок смотрит на экран, частица проходит
 * десяток пикселей: направление читается сразу, без подсказок.
 */
const FLOW_SPEED_SCALE = 0.28;
/**
 * Спад видимости к границам зоны.
 *
 * Показатель больше единицы поджимает свечение к середине, где снос сильнее:
 * у границы, где поток меняет знак, частицы гаснут. Это видимость, а не число
 * частиц — их в пуле всегда поровну, — но читается именно как плотность.
 */
const FLOW_FALLOFF = 1.4;
/**
 * Во сколько раз частица вытягивается по вертикали в середине зоны.
 *
 * Точка направления не показывает: на неподвижном кадре она неотличима от
 * пыли погоды и от звёзд. След показывает. Якорь ставится на голову следа,
 * поэтому хвост тянется ПРОТИВ движения — как у кометы, и куда летит частица,
 * видно сразу, без подсказок и без ожидания.
 */
const FLOW_STRETCH = 6;
/**
 * Толщина следа.
 *
 * Альфа упёрта в потолок контракта (0.35), и поднимать её нельзя, а на тёмных
 * темах этого хватает лишь на 5% яркости над фоном. Единственный оставшийся
 * рычаг — покрытие: длина и толщина штриха. Поэтому след длинный и не тоньше
 * точки, а не яркий.
 */
const FLOW_THICKNESS = 1;
/** Холодный оттенок телеграфа: тот же, что был у полос ветра. */
const FLOW_TINT = '#9FE8FF';

/**
 * Динамические свойства контейнера частиц.
 *
 * Цвет и вершины динамические только там, где есть телеграф: его частицы
 * гаснут к границам зон и вытягиваются в след по силе сноса. Без этого ни
 * спад, ни растяжение не доехали бы до буфера. Одна функция на слой и на
 * прогрев: прогретый набор обязан совпадать с тем, что рисует слой.
 */
function dynamicProperties(hasFlow: boolean): {
  position: boolean;
  color: boolean;
  vertex: boolean;
} {
  return { position: true, color: hasFlow, vertex: hasFlow };
}

/**
 * Прогрев конвейера частиц: одна отрисовка на загрузке, до первого кадра игры.
 *
 * Шейдер частиц у Pixi компилируется при первой отрисовке контейнера, и без
 * прогрева это случалось посреди игры — на 12-м очке бесконечного режима, где
 * впервые появляются светлячки: кадр 15–18 мс вместо 4–5.
 *
 * Следа не остаётся: рисуется во внеэкранную текстуру 1×1, не на канвас;
 * контейнер к сцене не подключается и уничтожается сразу; текстура частицы —
 * встроенная белая Pixi, кэш текстур частиц не трогается. Прогреваются оба
 * набора свойств, которые рисует слой: одна погода и погода с телеграфом.
 */
export function warmUpParticles(renderer: Renderer): void {
  const target = RenderTexture.create({ width: 1, height: 1 });

  for (const hasFlow of [false, true]) {
    const container = new ParticleContainer({
      texture: Texture.WHITE,
      dynamicProperties: dynamicProperties(hasFlow),
      blendMode: 'add',
      particles: [new Particle({ texture: Texture.WHITE })],
    });

    // Та же ловушка, что в слое: опция `particles` буфер не строит.
    container.update();
    renderer.render({ container, target });
    container.destroy({ children: true });
  }

  target.destroy(true);
}

interface Drop {
  readonly particle: Particle;
  readonly fallSpeed: number;
  readonly drift: number;
}

interface Mote {
  readonly particle: Particle;
  /** Разброс яркости, чтобы частицы не пульсировали одинаково. */
  readonly weight: number;
}

/**
 * Слой 5: частицы. Погода и телеграф зон потока.
 *
 * Оба населения живут в ОДНОМ `ParticleContainer`: он рендерит всё общей
 * текстурой — «they must all share the same base texture», — и второй
 * контейнер означал бы второй проход отрисовки ради того же самого. Разводятся
 * они оттенком: погода берёт цвет темы, поток — холодный.
 *
 * Телеграф пришёл на смену полосам ветра. Полосе, чтобы не врать, требовалось
 * идти ровно со скоростью мира, и ради этого в контракте читаемости держалось
 * исключение из запретной полосы параллакса. Частице исключение не нужно: её
 * вертикальная скорость считается от её собственной мировой координаты на
 * каждом кадре, поэтому при любом параллаксе она показывает тот поток, в
 * котором действительно находится.
 *
 * Лежит внутри контейнера фона, то есть получает грейд вместе с ним. Частицы
 * двигаются только пока движется мир: на `over` они замирают заодно с фоном.
 */
export class WeatherLayer {
  readonly view = new Container({ label: 'weather' });

  /** Текстуры берутся у рендерера и здесь не уничтожаются: см. `ParticleTextures`. */
  readonly #textures: ParticleTextures;

  #particles: ParticleContainer | null = null;
  #drops: Drop[] = [];
  #motes: Mote[] = [];
  #airflow: Airflow = undefined;
  /** Что построено сейчас: тот же ключ — строить нечего (`textureKeys.ts`). */
  #key: string | null = null;

  constructor(textures: ParticleTextures) {
    this.#textures = textures;
  }

  setTheme(theme: Theme, airflow: Airflow, reducedMotion: boolean): void {
    const key = weatherKey(theme, airflow, reducedMotion);

    // Совпал ключ — контейнер живёт дальше, и частицы продолжают свой путь,
    // а не возвращаются в исходную раскладку на каждом очке бесконечного режима.
    if (key === this.#key) {
      return;
    }

    this.#key = key;
    this.#teardown();

    const hasFlow = airflow !== undefined && airflow.zones > 0 && airflow.strength !== 0;
    const weatherCount = theme.weather.kind === 'none' ? 0 : theme.weather.count;

    // Контракт prefers-reduced-motion: частицы не создаются вовсе, а не
    // просто останавливаются — иначе они продолжают есть память и кадры.
    if (reducedMotion || (weatherCount <= 0 && !hasFlow)) {
      return;
    }

    // Бюджет общий: телеграф берёт то, что осталось от погоды. Делёж — в
    // `particleCounts`, под тестом.
    const { drops, motes } = particleCounts(weatherCount, hasFlow);

    // Текстура одна на контейнер. Когда погоды нет, берём пылинку: телеграф
    // по ТЗ и есть пыль или мелкий сор.
    const texture = this.#textures.get(drops > 0 ? theme.weather.kind : 'dust');
    const random = mulberry32(SEED);
    const tint = weatherTint(theme);

    this.#drops = Array.from({ length: drops }, () => {
      const particle = new Particle({
        texture,
        x: random() * WORLD_WIDTH,
        y: random() * GROUND_TOP,
        anchorX: 0.5,
        anchorY: 0.5,
        tint,
        alpha: PARTICLE_MAX_ALPHA * (0.45 + random() * 0.55),
      });

      return {
        particle,
        fallSpeed: WeatherLayer.#fallSpeed(theme, random()),
        drift: (random() - 0.5) * 18,
      };
    });

    this.#motes = Array.from({ length: motes }, () => ({
      particle: new Particle({
        texture,
        x: random() * WORLD_WIDTH,
        y: random() * GROUND_TOP,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: FLOW_THICKNESS,
        scaleY: 1,
        tint: FLOW_TINT,
        alpha: 0,
      }),
      weight: 0.8 + random() * 0.2,
    }));

    const container = new ParticleContainer({
      texture,
      boundsArea: new Rectangle(0, 0, WORLD_WIDTH, GROUND_TOP),
      dynamicProperties: dynamicProperties(motes > 0),
      // Аддитивное смешивание — требование контракта читаемости.
      blendMode: 'add',
      particles: [...this.#drops, ...this.#motes].map((entry) => entry.particle),
    });

    // Опция `particles` в конструкторе заполняет particleChildren, но
    // намеренно пропускает обновление вида — буфер под частицы при этом не
    // строится, и каждый кадр летит GL_INVALID_OPERATION «vertex buffer is
    // not big enough». Обновление вида нужно вызвать руками ровно один раз.
    container.update();

    this.view.addChild(container);

    this.#particles = container;
    this.#airflow = airflow;
  }

  /**
   * @param dtSeconds ноль, когда мир стоит: частицы замирают вместе с фоном.
   * @param scrollDeltaX сдвиг слоя за кадр с уже применённым параллаксом.
   * @param travelledX пройденное миром расстояние: мировая координата частицы.
   */
  update(dtSeconds: number, scrollDeltaX: number, travelledX: number): void {
    if (dtSeconds <= 0 && scrollDeltaX === 0) {
      return;
    }

    for (const drop of this.#drops) {
      const { particle } = drop;

      particle.y += drop.fallSpeed * dtSeconds;
      particle.x += drop.drift * dtSeconds - scrollDeltaX;
      WeatherLayer.#wrap(particle);
    }

    const airflow = this.#airflow;

    if (airflow === undefined) {
      return;
    }

    for (const mote of this.#motes) {
      const { particle } = mote;
      // Та же функция, что ведёт физику птицы и порывы звука. Четвёртого
      // источника координат зон в проекте нет.
      const flow = airflowAt(travelledX + particle.x, airflow);
      const normalised = Math.min(1, Math.abs(flow) / airflow.strength);

      particle.y += flow * FLOW_SPEED_SCALE * dtSeconds;
      particle.x -= scrollDeltaX;
      particle.alpha = PARTICLE_MAX_ALPHA * mote.weight * Math.pow(normalised, FLOW_FALLOFF);
      particle.scaleY = 1 + FLOW_STRETCH * normalised;
      // Якорь на голове следа: вниз — голова снизу, вверх — сверху. Хвост
      // всегда позади, и направление читается с неподвижного кадра.
      particle.anchorY = flow > 0 ? 1 : 0;
      WeatherLayer.#wrap(particle);
    }
  }

  destroy(): void {
    this.#teardown();
    this.#key = null;
  }

  static #wrap(particle: Particle): void {
    if (particle.y > GROUND_TOP) {
      particle.y -= GROUND_TOP;
    } else if (particle.y < 0) {
      particle.y += GROUND_TOP;
    }

    if (particle.x < 0) {
      particle.x += WORLD_WIDTH;
    } else if (particle.x > WORLD_WIDTH) {
      particle.x -= WORLD_WIDTH;
    }
  }

  static #fallSpeed(theme: Theme, roll: number): number {
    const base = { rain: 520, snow: 70, fireflies: 16, dust: 40, none: 0 }[theme.weather.kind];

    return base * theme.weather.speed * (0.7 + roll * 0.6);
  }

  #teardown(): void {
    // Только контейнер: текстура принадлежит кэшу рендерера и переживает смену темы.
    this.#particles?.destroy({ children: true });
    this.#particles = null;
    this.#drops = [];
    this.#motes = [];
    this.#airflow = undefined;
  }
}

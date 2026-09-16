import { Container, Graphics } from 'pixi.js';

import { BIRD_X, MAX_FALL_SPEED } from '../../../game/constants';
import { mulberry32 } from '../../../game/rng';
import type { GameState } from '../../../game/types';

/**
 * Палитра птицы. Цвет птицы — константа рендера, в `Theme` его нет: птица
 * одна на все пять тем, и перекрашивать её вместе с фоном значило бы терять
 * единственный элемент кадра, за которым игрок следит постоянно.
 */
const PALETTE = {
  body: '#F05D5E',
  head: '#F4736F',
  wing: '#B8383F',
  tail: '#C74450',
  beak: '#F2B24C',
  sclera: '#F7F2E8',
  pupil: '#14101A',
} as const;

/**
 * Параметры ощущения.
 *
 * Это не физика мира — её значения лежат в `src/game/constants.ts` и выверены
 * под баланс. Здесь то, насколько живой выглядит птица, и правится оно на
 * глаз, а не считается. Менять лучше по одному: вместе эти числа дают не
 * сумму, а кашу, и понять, что именно испортилось, становится нельзя.
 */
const FEEL = {
  /** Наклон тела: радиан на единицу вертикальной скорости. */
  tiltPerSpeed: 0.0016,
  /** Пределы наклона. Вертикально птица не встаёт ни вверх, ни вниз. */
  tiltUp: -0.42,
  tiltDown: 0.72,

  /**
   * Пружина тела: цель наклона догоняется, а не присваивается.
   *
   * Жёсткость подобрана под длительность подъёма: от взмаха до верхней точки
   * проходит около 0.3 с, и на мягкой пружине наклон вверх просто не успевал
   * появиться — птица шла вверх горизонтально. Период здесь примерно 0.28 с,
   * затухание чуть ниже критического, чтобы не звенела на частых взмахах.
   */
  bodyStiffness: 520,
  bodyDamping: 40,
  /** Голова отстаёт слабо, хвост заметно — отсюда читается инерция. */
  headStiffness: 300,
  headDamping: 26,
  headFollow: 0.5,
  tailStiffness: 140,
  tailDamping: 17,
  tailFollow: 1.4,

  /** Углы крыла: удар вниз, нейтраль, планирование. */
  wingDown: -1.05,
  wingNeutral: 0.12,
  wingGlide: 0.42,
  /** Дальнее крыло отстаёт по фазе и слабее по размаху. */
  wingFarScale: 0.78,
  wingFarLagMs: 40,

  /** Холостое колебание: живая поза до первого тапа. */
  idleAmplitude: 0.16,
  idlePeriodMs: 1500,

  /** Зрачок: сдвиг по направлению движения, px. */
  pupilShift: 1.5,

  /** Моргание: базовый интервал, разброс и длительность. */
  blinkEveryMs: 3200,
  blinkJitterMs: 2800,
  blinkDurationMs: 110,

  /**
   * Предел шага для пружин. `dtMs` доходит до 250 при возврате из фона, и на
   * таком шаге явная схема взрывается.
   */
  maxStepMs: 33,
} as const;

const BLINK_SEED = 20260921;

interface Spring {
  value: number;
  velocity: number;
}

function advance(spring: Spring, target: number, stiffness: number, damping: number, dt: number): void {
  const acceleration = (target - spring.value) * stiffness - spring.velocity * damping;

  spring.velocity += acceleration * dt;
  spring.value += spring.velocity * dt;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Птица как риг из частей, собранный процедурно: ни спрайт-листа, ни единого
 * бинарного ассета.
 *
 * Поза выводится из состояния физики, а не из собственного отсчёта времени.
 * Ключ — удар крыла: сразу после взмаха скорость равна `flapVelocity`,
 * гравитация гасит её к нулю и разгоняет вниз, поэтому
 * `-velocity / -flapVelocity` само по себе даёт 1 в момент взмаха, 0 в
 * верхней точке и отрицательное в падении. Никакого таймера взмаха нет.
 *
 * Пружины хвоста и головы — другое: это догоняющие величины, они обязаны
 * интегрироваться по времени, иначе отставания не получится.
 *
 * Хитбокс ригом не задаётся: радиус столкновения живёт в `src/game` и
 * визуальные размеры на него не влияют никак.
 */
export class BirdRig {
  readonly view = new Container({ label: 'bird' });

  readonly #head = new Container();
  readonly #tail = new Container();
  readonly #wingFar = new Container();
  readonly #wingNear = new Container();
  readonly #eye = new Container();
  readonly #pupil: Graphics;

  readonly #body: Spring = { value: 0, velocity: 0 };
  readonly #headTurn: Spring = { value: 0, velocity: 0 };
  readonly #tailTurn: Spring = { value: 0, velocity: 0 };

  readonly #random = mulberry32(BLINK_SEED);

  #clockMs = 0;
  #blinkInMs: number = FEEL.blinkEveryMs;
  #blinkLeftMs = 0;
  #wingFarHistory: number = FEEL.wingNeutral;

  constructor() {
    this.view.x = BIRD_X;

    const body = new Graphics().ellipse(0, 0, 13, 10).fill(PALETTE.body);

    this.#wingFar.position.set(-1, -3);
    this.#wingFar.addChild(new Graphics().ellipse(-8, 0, 10, 3.6).fill(PALETTE.wing));
    this.#wingFar.scale.set(FEEL.wingFarScale);

    this.#tail.position.set(-10.5, -1);
    this.#tail.addChild(
      new Graphics().poly([0, -3.5, -13, -7.5, -9.5, 0, -13, 7.5, 0, 3.5], true).fill(PALETTE.tail),
    );

    // Плотные части — тело, голова и клюв — не выходят за хитбокс больше
    // чем на 3 px: иначе игрок увидит наложение на препятствие без смерти.
    // Хитбокс 10.5, предел выноса 13.5. Голова: 6.95 + 5.6 = 12.55, клюв 13.2.
    // Крылья и хвост крупнее свободно — они мягкие.
    this.#head.position.set(6, -3.5);
    this.#head.addChild(new Graphics().circle(0, 0, 5.6).fill(PALETTE.head));
    this.#head.addChild(new Graphics().poly([3.6, -1.2, 7.2, 0.4, 3.6, 2.6], true).fill(PALETTE.beak));

    this.#eye.position.set(2, -1.5);
    this.#eye.addChild(new Graphics().circle(0, 0, 2.4).fill(PALETTE.sclera));
    this.#pupil = new Graphics().circle(0, 0, 1.2).fill(PALETTE.pupil);
    this.#eye.addChild(this.#pupil);
    this.#head.addChild(this.#eye);

    this.#wingNear.position.set(0, 1);
    this.#wingNear.addChild(new Graphics().ellipse(-9, 0, 12, 4.6).fill(PALETTE.wing));

    this.view.addChild(this.#wingFar, this.#tail, body, this.#head, this.#wingNear);
  }

  /**
   * @param dtMs ноль, когда мир замер. Тогда не двигается ничего: ни пружины,
   * ни моргание, ни холостое колебание. Птица, моргающая в застывшем кадре,
   * ломает ту самую паузу, которую это замирание и ставит.
   */
  update(state: GameState, dtMs: number, flapVelocity: number, reducedMotion: boolean): void {
    // Физики здесь нет: показывается снимок между двумя последними тиками.
    this.view.y = state.prevBirdY + (state.birdY - state.prevBirdY) * state.alpha;

    const step = Math.min(Math.max(dtMs, 0), FEEL.maxStepMs) / 1000;

    if (step > 0) {
      this.#clockMs += dtMs;
    }

    // Удар крыла как функция скорости: 1 сразу после взмаха, 0 в верхней
    // точке, отрицательное в падении.
    const strike = clamp(state.birdVelocity / flapVelocity, -1, 1);
    const idle = reducedMotion
      ? 0
      : Math.sin((this.#clockMs / FEEL.idlePeriodMs) * Math.PI * 2) *
        FEEL.idleAmplitude *
        (1 - Math.abs(strike));

    this.#advanceSprings(state, step);
    this.#poseWings(strike, idle, step);
    this.#poseEye(state, dtMs, reducedMotion);
  }

  #advanceSprings(state: GameState, step: number): void {
    const target = clamp(state.birdVelocity * FEEL.tiltPerSpeed, FEEL.tiltUp, FEEL.tiltDown);

    if (step > 0) {
      advance(this.#body, target, FEEL.bodyStiffness, FEEL.bodyDamping, step);
      advance(this.#headTurn, this.#body.value, FEEL.headStiffness, FEEL.headDamping, step);
      advance(this.#tailTurn, this.#body.value, FEEL.tailStiffness, FEEL.tailDamping, step);
    }

    this.view.rotation = this.#body.value;
    // Отставание берётся как разница между телом и догоняющим: голова
    // отстаёт слабо, хвост сильно, и поворот читается инерцией.
    this.#head.rotation = (this.#headTurn.value - this.#body.value) * FEEL.headFollow;
    this.#tail.rotation = (this.#tailTurn.value - this.#body.value) * FEEL.tailFollow;
  }

  #poseWings(strike: number, idle: number, step: number): void {
    const near =
      strike >= 0
        ? mix(FEEL.wingNeutral, FEEL.wingDown, strike)
        : mix(FEEL.wingNeutral, FEEL.wingGlide, -strike);

    this.#wingNear.rotation = near + idle;

    // Дальнее крыло догоняет ближнее — крылья не двигаются как одна доска.
    const lag = step > 0 ? Math.min(1, (step * 1000) / FEEL.wingFarLagMs) : 1;

    this.#wingFarHistory += (near - this.#wingFarHistory) * lag;
    this.#wingFar.rotation = this.#wingFarHistory + idle * 0.7;
  }

  #poseEye(state: GameState, dtMs: number, reducedMotion: boolean): void {
    const fall = clamp(state.birdVelocity / MAX_FALL_SPEED, -1, 1);

    this.#pupil.position.set(FEEL.pupilShift * (1 - Math.abs(fall) * 0.4), fall * FEEL.pupilShift);

    if (reducedMotion) {
      this.#eye.scale.y = 1;

      return;
    }

    if (dtMs <= 0) {
      return;
    }

    if (this.#blinkLeftMs > 0) {
      this.#blinkLeftMs -= dtMs;
      this.#eye.scale.y = this.#blinkLeftMs > 0 ? 0.12 : 1;

      return;
    }

    this.#blinkInMs -= dtMs;

    if (this.#blinkInMs <= 0) {
      this.#blinkLeftMs = FEEL.blinkDurationMs;
      this.#blinkInMs = FEEL.blinkEveryMs + this.#random() * FEEL.blinkJitterMs;
    }
  }
}

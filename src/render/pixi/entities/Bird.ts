import { Graphics } from 'pixi.js';

import { BIRD_RADIUS_VISUAL, BIRD_X } from '../../../game/constants';

/**
 * Птица: круг фиксированного радиуса. По X стоит на месте, покадрово меняется
 * только Y, поэтому геометрия строится один раз и больше не перерисовывается.
 * Радиус здесь визуальный, хитбокс меньше и живёт в логике.
 */
export function createBird(color: number): Graphics {
  const bird = new Graphics().circle(0, 0, BIRD_RADIUS_VISUAL).fill(color);

  bird.x = BIRD_X;

  return bird;
}

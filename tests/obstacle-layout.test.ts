import { describe, expect, it } from 'vitest';

import { GROUND_TOP } from '../src/game/constants';
import { pipeRects } from '../src/game/physics';
import { THEMES } from '../src/game/themes';
import { obstacleLayout } from '../src/render/obstacleLayout';

/** Неразрезаемый минимум плитки: навершие плюс хвост (`textures.ts`). */
const OBSTACLE_TAIL = 4;

const FLOORS = Object.values(THEMES).map((theme) => theme.obstacle.capHeight + OBSTACLE_TAIL);

/** Просветы уровней 1–5 и бесконечного режима, включая минимумы `ramp`. */
const GAPS = [140, 145, 160, 180, 190, 200, 210];

function* cases(): Generator<{ gapCenter: number; gapHeight: number; floor: number }> {
  for (const floor of FLOORS) {
    for (const gapHeight of GAPS) {
      // Весь диапазон, который допускает `Game`: просвет целиком внутри
      // лётной зоны, включая касание потолка и земли.
      for (let gapCenter = gapHeight / 2; gapCenter <= GROUND_TOP - gapHeight / 2; gapCenter += 1) {
        yield { gapCenter, gapHeight, floor };
      }
    }
  }
}

/**
 * Рисунок препятствия и его коллизия — одна и та же геометрия.
 *
 * Тест сверяет кромки просвета у раскладки с прямоугольниками `pipeRects`,
 * то есть с тем самым, обо что птица убивается. Разойтись они не могут по
 * построению — и именно это здесь и закрепляется: формула раскладки живёт в
 * рендере, формула коллизии в логике, и ничто, кроме теста, не мешает им
 * разъехаться при следующей правке.
 */
describe('раскладка препятствия', () => {
  it('нижняя кромка верхней половины стоит ровно на кромке коллизии', () => {
    for (const { gapCenter, gapHeight, floor } of cases()) {
      const layout = obstacleLayout(gapCenter, gapHeight, floor, floor);
      const [top] = pipeRects(0, gapCenter, gapHeight);

      expect(layout.topY + layout.topHeight).toBeCloseTo(top.y + top.height, 10);
    }
  });

  it('верхняя кромка нижней половины стоит ровно на кромке коллизии', () => {
    for (const { gapCenter, gapHeight, floor } of cases()) {
      const layout = obstacleLayout(gapCenter, gapHeight, floor, floor);
      const [, bottom] = pipeRects(0, gapCenter, gapHeight);

      expect(layout.bottomY).toBeCloseTo(bottom.y, 10);
    }
  });

  it('ни одна половина не залезает в просвет', () => {
    for (const { gapCenter, gapHeight, floor } of cases()) {
      const layout = obstacleLayout(gapCenter, gapHeight, floor, floor);

      expect(layout.topY + layout.topHeight).toBeLessThanOrEqual(gapCenter - gapHeight / 2);
      expect(layout.bottomY).toBeGreaterThanOrEqual(gapCenter + gapHeight / 2);
    }
  });

  it('половина никогда не ниже минимума плитки: девятислайс не деформируется', () => {
    for (const { gapCenter, gapHeight, floor } of cases()) {
      const layout = obstacleLayout(gapCenter, gapHeight, floor, floor);

      expect(layout.topHeight).toBeGreaterThanOrEqual(floor);
      expect(layout.bottomHeight).toBeGreaterThanOrEqual(floor);
    }
  });
});

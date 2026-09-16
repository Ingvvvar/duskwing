import { GROUND_TOP } from '../game/constants';

/** Прямоугольники спрайтов препятствия в мировых координатах. */
export interface ObstacleLayout {
  readonly topY: number;
  readonly topHeight: number;
  readonly bottomY: number;
  readonly bottomHeight: number;
}

/**
 * Раскладка половин препятствия по центру просвета.
 *
 * Вынесена из пула отдельной чистой функцией не ради красоты: кромки
 * нарисованного просвета обязаны совпадать с прямоугольниками `pipeRects`,
 * и это единственная формула, которую можно сверить с ними тестом
 * (`tests/obstacle-layout.test.ts`). Пул её только зовёт — каждый кадр, а не
 * один раз при выдаче из пула: у движущихся труб `gapCenter` меняется на
 * каждом тике, и геометрия, поставленная при появлении трубы за экраном,
 * к моменту встречи с птицей расходится с коллизией на десятки пикселей.
 *
 * `minTopHeight`/`minBottomHeight` — неразрезаемый минимум девятислайсовой
 * плитки (навершие плюс хвост). Когда просвет подходит вплотную к потолку,
 * половина не может стать ниже этого минимума, поэтому лишнее уводится за
 * край мира: верхняя половина смещается вверх, и её нижняя кромка остаётся
 * ровно на границе коллизии. Обрезает маска мира, а снизу — слой земли,
 * который рисуется поверх игрового.
 */
export function obstacleLayout(
  gapCenter: number,
  gapHeight: number,
  minTopHeight: number,
  minBottomHeight: number,
): ObstacleLayout {
  const gapTop = gapCenter - gapHeight / 2;
  const gapBottom = gapCenter + gapHeight / 2;
  const topHeight = Math.max(minTopHeight, gapTop);
  const bottomHeight = Math.max(minBottomHeight, GROUND_TOP - gapBottom);

  return { topY: gapTop - topHeight, topHeight, bottomY: gapBottom, bottomHeight };
}

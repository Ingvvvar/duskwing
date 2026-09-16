#!/usr/bin/env python3
"""Замер контракта читаемости по скриншоту игры.

Считает относительную яркость (WCAG) трубы и фона в её вертикальной полосе и
проверяет порог из TASK.md. Зависимостей нет: PNG разбирается стандартной
библиотекой.

    python3 scripts/readability.py '.playwright-mcp/*.png'

Труба опознаётся ГЕОМЕТРИЧЕСКИ, по яркости, а не по константе `accent` из
темы. Причина: грейд и виньетка сдвигают цвет трубы на экране — виньетка
превращает её в градиент, — и сравнение с цветом темы начинает записывать
часть трубы в фон, завышая яркость фона в разы. Порог тоже считается от
измеренной яркости трубы, а не от цвета в теме: иначе каждую новую тему
пришлось бы пересчитывать руками.

Фон в полосе трубы виден только сквозь просвет — его и меряем.
"""
import glob
import struct
import sys
import zlib

WORLD_W, WORLD_H, GROUND_TOP = 360, 640, 640 - 92
FOREGROUND_BAND = 72                # полоса переднего плана над землёй
BIRD_X, BIRD_CLEARANCE = 104, 15   # птица — игровой слой, в фон не идёт
SKIP_TOP_CSS = 60                  # полоса, где лежит div счёта
THRESHOLD = 0.45                   # контракт: фон не выше 45% яркости трубы
EDGE_INSET = 3                     # экранных px отступа от кромок трубы


def decode_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', f'{path}: не PNG'
    pos, idat, width, height, channels = 8, b'', None, None, None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and interlace == 0, 'поддерживается только 8 бит без интерлейса'
            assert color in (2, 6), 'поддерживается только RGB/RGBA'
            channels = 3 if color == 2 else 4
        elif ctype == b'IDAT':
            idat += body
        elif ctype == b'IEND':
            break
        pos += 12 + length
    raw, stride = zlib.decompress(idat), width * channels
    out, prev, p = [], bytearray(stride), 0
    for _ in range(height):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if f == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                c = prev[i - channels] if i >= channels else 0
                b = prev[i]
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out.append(bytes(line))
        prev = line
    return width, height, channels, out


def luminance(r, g, b):
    def linear(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)


def analyse(path):
    w, h, ch, rows = decode_png(path)
    scale = min(w / WORLD_W, h / WORLD_H)
    x0, y0 = (w - WORLD_W * scale) / 2, (h - WORLD_H * scale) / 2
    top_y = int(y0 + SKIP_TOP_CSS)
    # Нижняя полоса исключается: там по ТЗ живёт передний план, он рисуется
    # ПОВЕРХ труб и затемняет их основание. Медиана строки от этого проседает,
    # строка уходит в «просвет», а яркие пиксели самой трубы попадают в «фон».
    # Просвет в эту полосу не опускается (tests/foreground-band.test.ts),
    # поэтому фона, видимого сквозь него, там нет вовсе.
    ground_y = int(y0 + (GROUND_TOP - FOREGROUND_BAND) * scale)

    def px(x, y):
        i = x * ch
        return rows[y][i], rows[y][i + 1], rows[y][i + 2]

    bird_lo = int(x0 + (BIRD_X - BIRD_CLEARANCE) * scale)
    bird_hi = int(x0 + (BIRD_X + BIRD_CLEARANCE) * scale)

    cols = [x for x in range(int(x0), int(x0 + WORLD_W * scale))
            if not bird_lo <= x <= bird_hi
            and sum(1 for y in range(top_y, ground_y, 3) if luminance(*px(x, y)) > 0.45) > 20]
    if not cols:
        return None
    runs, cur = [], [cols[0]]
    for x in cols[1:]:
        if x == cur[-1] + 1:
            cur.append(x)
        else:
            runs.append(cur)
            cur = [x]
    runs.append(cur)
    band = max(runs, key=len)
    if len(band) < 20:
        return None
    # Отступ от боковых кромок: там пиксели — смесь трубы и фона, и без
    # отступа максимум всегда показывает сглаживание, а не элемент фона.
    band = band[EDGE_INSET:-EDGE_INSET]

    stats = []
    for y in range(top_y, ground_y):
        vals = sorted(luminance(*px(x, y)) for x in band)
        stats.append((y, vals[len(vals) // 2], vals))
    peak = max(median for _, median, _ in stats)
    pipe_rows = [s for s in stats if s[1] > peak * 0.55]
    gap_rows = [s for s in stats if s[1] <= peak * 0.55][EDGE_INSET:-EDGE_INSET]
    if not pipe_rows or not gap_rows:
        return None

    pipe = [v for _, _, vals in pipe_rows for v in vals]
    background = sorted(v for _, _, vals in gap_rows for v in vals)
    centres = [y for y, _, _ in gap_rows]
    return {
        'file': path.split('/')[-1],
        'gap_centre': ((sum(centres) / len(centres)) - y0) / scale,
        'pipe': sum(pipe) / len(pipe),
        'bg_mean': sum(background) / len(background),
        'bg_p95': background[int(len(background) * 0.95)],
        'bg_max': background[-1],
    }


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else '.playwright-mcp/*.png'
    results = [r for r in (analyse(p) for p in sorted(glob.glob(pattern))) if r]
    if not results:
        print('подходящих кадров не найдено: нужен кадр, где труба на экране')
        return 1
    failed = False
    for r in results:
        p95 = r['bg_p95'] / r['pipe'] * 100
        top = r['bg_max'] / r['pipe'] * 100
        verdict = 'ok' if p95 <= THRESHOLD * 100 else 'ПОРОГ ПРЕВЫШЕН'
        failed = failed or p95 > THRESHOLD * 100
        print(f"{r['file']:<16} просвет~{r['gap_centre']:6.1f}  труба={r['pipe']:.4f}  "
              f"фон ср={r['bg_mean']:.4f} p95={r['bg_p95']:.4f} max={r['bg_max']:.4f}  "
              f"p95/труба={p95:5.1f}%  max/труба={top:5.1f}%  {verdict}")
    print(f"\nпорог {THRESHOLD * 100:.0f}% считается от измеренной яркости трубы "
          f"(после грейда и виньетки). Решение — по p95, максимум справочно.")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())

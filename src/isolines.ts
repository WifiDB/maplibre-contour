/*
Adapted from d3-contour https://github.com/d3/d3-contour

Copyright 2012-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/

import type { HeightTile } from "./height-tile";

class Fragment {
  start: number;
  end: number;
  ring: number[][];
  closed: boolean = false; // add a flag to check if contour is closed

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
    this.ring = [];
  }

  isEmpty() {
    return this.ring.length < 2;
  }
  close() {
    this.closed = true;
  }
}

const CASES: [number, number][][][] = [
  [],
  [
    [
      [1, 2],
      [0, 1],
    ],
  ],
  [
    [
      [2, 1],
      [1, 2],
    ],
  ],
  [
    [
      [2, 1],
      [0, 1],
    ],
  ],
  [
    [
      [1, 0],
      [2, 1],
    ],
  ],
  [
    [
      [1, 2],
      [0, 1],
    ],
    [
      [1, 0],
      [2, 1],
    ],
  ],
  [
    [
      [1, 0],
      [1, 2],
    ],
  ],
  [
    [
      [1, 0],
      [0, 1],
    ],
  ],
  [
    [
      [0, 1],
      [1, 0],
    ],
  ],
  [
    [
      [1, 2],
      [1, 0],
    ],
  ],
  [
    [
      [0, 1],
      [1, 0],
    ],
    [
      [2, 1],
      [1, 2],
    ],
  ],
  [
    [
      [2, 1],
      [1, 0],
    ],
  ],
  [
    [
      [0, 1],
      [2, 1],
    ],
  ],
  [
    [
      [1, 2],
      [2, 1],
    ],
  ],
  [
    [
      [0, 1],
      [1, 2],
    ],
  ],
  [],
];

function index(width: number, x: number, y: number, point: [number, number]) {
  x = x * 2 + point[0];
  y = y * 2 + point[1];
  return x + y * (width + 1) * 2;
}

function ratio(a: number, b: number, c: number) {
  return (b - a) / (c - a);
}
function smoothLinear(
  ring: number[][],
  values: HeightTile,
  value: number,
  dx: number,
  dy: number,
) {
  ring.forEach(function (point) {
    var x = point[0],
      y = point[1],
      xt = x | 0,
      yt = y | 0,
      v1 = valid(values.get(xt, yt));
    if (x > 0 && x < dx && xt === x) {
      point[0] = smooth1(x, valid(values.get(xt - 1, yt)), v1, value);
    }
    if (y > 0 && y < dy && yt === y) {
      point[1] = smooth1(y, valid(values.get(xt, yt - 1)), v1, value);
    }
  });
}

function valid(v: number) {
  return v == null || isNaN((v = +v)) ? -Infinity : v;
}
function smooth1(x: number, v0: number, v1: number, value: number) {
  const a = value - v0;
  const b = v1 - v0;
  const d = isFinite(a) || isFinite(b) ? a / b : Math.sign(a) / Math.sign(b);
  return isNaN(d) ? x : x + d - 0.5;
}

/**
 * Generates contour polygons from a HeightTile
 *
 * @param interval Vertical distance between contours
 * @param tile The input height tile, where values represent the height at the top-left of each pixel
 * @param extent Vector tile extent (default 4096)
 * @param buffer How many pixels into each neighboring tile to include in a tile
 * @returns an object where keys are the elevation, and values are a list of `[[x1, y1, x2, y2, ...], [...]]`
 * polygons in tile coordinates
 */
export default function generateIsolines(
  interval: number,
  tile: HeightTile,
  extent: number = 4096,
  buffer: number = 1,
  smooth = true,
): { [ele: number]: number[][][] } {
  if (!interval) {
    return {};
  }
  const multiplier = extent / (tile.width - 1);
  let tld: number, trd: number, bld: number, brd: number;
  let r: number, c: number;
  const polygons: { [ele: string]: number[][][] } = {};
  const fragmentByStartByLevel: {
    [level: number]: { [index: number]: Fragment };
  } = {};
  const fragmentByEndByLevel: {
    [level: number]: { [index: number]: Fragment };
  } = {};

  function interpolate(
    point: [number, number],
    threshold: number,
    accept: (x: number, y: number) => void,
  ) {
    if (point[0] === 0) {
      // left
      accept(
        multiplier * (c - 1),
        multiplier * (r - ratio(bld, threshold, tld)),
      );
    } else if (point[0] === 2) {
      // right
      accept(multiplier * c, multiplier * (r - ratio(brd, threshold, trd)));
    } else if (point[1] === 0) {
      // top
      accept(
        multiplier * (c - ratio(trd, threshold, tld)),
        multiplier * (r - 1),
      );
    } else {
      // bottom
      accept(multiplier * (c - ratio(brd, threshold, bld)), multiplier * r);
    }
  }

  for (r = 1 - buffer; r < tile.height + buffer; r++) {
    trd = tile.get(0, r - 1);
    brd = tile.get(0, r);
    let minR = Math.min(trd, brd);
    let maxR = Math.max(trd, brd);
    for (c = 1 - buffer; c < tile.width + buffer; c++) {
      tld = trd;
      bld = brd;
      trd = tile.get(c, r - 1);
      brd = tile.get(c, r);
      const minL = minR;
      const maxL = maxR;
      minR = Math.min(trd, brd);
      maxR = Math.max(trd, brd);
      if (isNaN(tld) || isNaN(trd) || isNaN(brd) || isNaN(bld)) {
        continue;
      }
      const min = Math.min(minL, minR);
      const max = Math.max(maxL, maxR);
      const start = Math.ceil(min / interval) * interval;
      const end = Math.floor(max / interval) * interval;
      for (let threshold = start; threshold <= end; threshold += interval) {
        const tl = tld > threshold;
        const tr = trd > threshold;
        const bl = bld > threshold;
        const br = brd > threshold;
        for (const segment of CASES[
          (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)
        ]) {
          let fragmentByStart = fragmentByStartByLevel[threshold];
          if (!fragmentByStart)
            fragmentByStartByLevel[threshold] = fragmentByStart = {};

          let fragmentByEnd = fragmentByEndByLevel[threshold];
          if (!fragmentByEnd)
            fragmentByEndByLevel[threshold] = fragmentByEnd = {};

          const start = segment[0];
          const end = segment[1];
          const startIndex = index(tile.width, c, r, start);
          const endIndex = index(tile.width, c, r, end);
          let f, g;
          const startPoint: number[] = [];
          interpolate(start, threshold, (x, y) => startPoint.push(x, y));
          const endPoint: number[] = [];
          interpolate(end, threshold, (x, y) => endPoint.push(x, y));

          if ((f = fragmentByEnd[startIndex])) {
            delete fragmentByEnd[startIndex];
            if ((g = fragmentByStart[endIndex])) {
              delete fragmentByStart[endIndex];
              if (f === g) {
                // closing a ring, polygon detected
                f.ring.push(endPoint);
                if (!f.isEmpty()) {
                  let list = polygons[threshold];
                  if (!list) {
                    polygons[threshold] = list = [];
                  }
                  if (smooth)
                    smoothLinear(
                      f.ring,
                      tile,
                      threshold,
                      tile.width,
                      tile.height,
                    );

                  f.close();
                  list.push([f.ring]);
                }
              } else {
                // connecting 2 segments
                f.ring.push(endPoint);
                g.ring.forEach((p) => f.ring.push(p));

                fragmentByEnd[(f.end = g.end)] = f;
              }
            } else {
              // adding to the end of f
              f.ring.push(endPoint);
              fragmentByEnd[(f.end = endIndex)] = f;
            }
          } else if ((f = fragmentByStart[endIndex])) {
            delete fragmentByStart[endIndex];
            // extending the start of f
            f.ring.unshift(startPoint);
            fragmentByStart[(f.start = startIndex)] = f;
          } else {
            // starting a new fragment
            const newFrag = new Fragment(startIndex, endIndex);
            newFrag.ring.push(startPoint);
            newFrag.ring.push(endPoint);
            fragmentByStart[startIndex] = fragmentByEnd[endIndex] = newFrag;
          }
        }
      }
    }
  }
  for (const level in fragmentByStartByLevel) {
    let list: number[][][] | null = null;
    const fragmentByStart = fragmentByStartByLevel[level];
    for (const startIndex in fragmentByStart) {
      const value = fragmentByStart[startIndex];
      if (!value.isEmpty() && !value.closed) {
        if (list == null) {
          list = polygons[level] || (polygons[level] = []);
        }
        if (smooth)
          smoothLinear(
            value.ring,
            tile,
            Number(level),
            tile.width,
            tile.height,
          );
        list.push([value.ring]);
      }
    }
  }

  return polygons;
}

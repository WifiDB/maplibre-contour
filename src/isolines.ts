import type { HeightTile } from "./height-tile";

class Fragment {
  start: number;
  end: number;
  points: number[];

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
    this.points = [];
    this.append = this.append.bind(this);
    this.prepend = this.prepend.bind(this);
  }

  append(x: number, y: number) {
    this.points.push(Math.round(x), Math.round(y));
  }

  prepend(x: number, y: number) {
    this.points.splice(0, 0, Math.round(x), Math.round(y));
  }

  lineString() {
    return this.toArray();
  }

  isEmpty() {
    return this.points.length < 2;
  }

  appendFragment(other: Fragment) {
    this.points.push(...other.points);
    this.end = other.end;
  }

  toArray() {
    return this.points;
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

function closePolygons(segments: { [ele: number]: number[][] }, tile: HeightTile, buffer: number, multiplier: number) {
  const closedSegments: { [ele: number]: number[][] } = {};
  for (const level in segments) {
    const frags = segments[level];
    if (!frags) {
      continue;
    }
    const closedLevel = closedSegments[level] = [] as number[][];
    const lineStringByFirstPoint = new Map<string, number[]>();
    const lineStringByLastPoint = new Map<string, number[]>();

    for (const frag of frags) {
      const first = `${frag[0]},${frag[1]}`;
      const last = `${frag[frag.length - 2]},${frag[frag.length - 1]}`;
      lineStringByFirstPoint.set(first, frag);
      lineStringByLastPoint.set(last, frag);
    }
    const processedFrags = new Set<number[]>();

    for (const frag of frags) {
      if (processedFrags.has(frag)) {
        continue;
      }

      const currentFrag = frag;
      let isClosed = false;
      while (!isClosed) {
        processedFrags.add(currentFrag);
        const firstX = currentFrag[0];
        const firstY = currentFrag[1];
        const lastX = currentFrag[currentFrag.length - 2];
        const lastY = currentFrag[currentFrag.length - 1];
        const first = `${firstX},${firstY}`
        const last = `${lastX},${lastY}`


        const matchingStart = lineStringByLastPoint.get(first);
        if (matchingStart && matchingStart !== currentFrag) {
          currentFrag.splice(0, 0, ...matchingStart.slice(0, matchingStart.length - 2));
          continue
        }


        const matchingEnd = lineStringByFirstPoint.get(last);
        if (matchingEnd && matchingEnd !== currentFrag) {
              currentFrag.push(...matchingEnd.slice(2))
              continue;
        }

        if (first === last) {
          isClosed = true;
        } else if (
            firstX < multiplier * buffer || firstX > multiplier * (tile.width - buffer - 1) ||
            firstY < multiplier * buffer || firstY > multiplier * (tile.height - buffer - 1) ||
             lastX < multiplier * buffer || lastX > multiplier * (tile.width - buffer - 1) ||
             lastY < multiplier * buffer || lastY > multiplier * (tile.height - buffer - 1)
        )
         {

          const completeBoundary = (x1: number, y1: number, x2: number, y2: number, tileWidth: number, tileHeight: number)=>{
            const points: number[] = [];
             // if x is off the boundary
                if(x1< multiplier*buffer)
                {
                    points.push(0, y1)
                     if (y2< multiplier*buffer){
                        points.push(0,0)
                         points.push(x2, 0)
                        } else if(y2>multiplier*(tileHeight - buffer)){
                        points.push(0,multiplier*tileHeight)
                        points.push(x2, multiplier*tileHeight)
                    }else {
                        points.push(0, y2)
                    }

                }else if (x1 > multiplier*(tileWidth - buffer)){
                    points.push(multiplier*tileWidth, y1)
                    if (y2< multiplier*buffer){
                        points.push(multiplier*tileWidth,0)
                         points.push(x2, 0)
                        } else if(y2>multiplier*(tileHeight - buffer)){
                        points.push(multiplier*tileWidth,multiplier*tileHeight)
                        points.push(x2, multiplier*tileHeight)
                    }else {
                        points.push(multiplier*tileWidth, y2)
                    }

                }
             else if (y1 < multiplier * buffer){
                    points.push(x1,0);
                  if (x2 < multiplier*buffer){
                        points.push(0,0)
                         points.push(0,y2)
                    }else if(x2 > multiplier*(tileWidth-buffer)){
                         points.push(multiplier*tileWidth,0)
                        points.push(multiplier*tileWidth,y2)
                   } else{
                       points.push(x2,0)
                  }
            }else if (y1 > multiplier * (tileHeight- buffer)){
                    points.push(x1, multiplier*tileHeight)
                    if (x2 < multiplier*buffer){
                        points.push(0, multiplier*tileHeight)
                         points.push(0,y2)
                    }else if(x2 > multiplier*(tileWidth-buffer)){
                         points.push(multiplier*tileWidth, multiplier*tileHeight)
                        points.push(multiplier*tileWidth,y2)
                   } else{
                       points.push(x2, multiplier*tileHeight)
                  }

            }

           return points;
        }

         const points = completeBoundary(lastX, lastY, firstX, firstY, tile.width, tile.height);
         currentFrag.push(...points)


          isClosed = true;
        } else {
          //we're out of other fragments so just make it closed
          currentFrag.push(currentFrag[0], currentFrag[1])
          isClosed = true;
        }
      }
       closedLevel.push(currentFrag);
    }
  }
  return closedSegments;
}

/**
 * Generates contour lines from a HeightTile
 *
 * @param interval Vertical distance between contours
 * @param tile The input height tile, where values represent the height at the top-left of each pixel
 * @param extent Vector tile extent (default 4096)
 * @param buffer How many pixels into each neighboring tile to include in a tile
 * @returns an object where keys are the elevation, and values are a list of `[x1, y1, x2, y2, ...]`
 * contour lines in tile coordinates
 */
export default function generateIsolines(
  interval: number,
  tile: HeightTile,
  extent: number = 4096,
  buffer: number = 1,
): { [ele: number]: number[][] } {
  if (!interval) {
    return {};
  }
    const multiplier = extent / (tile.width - 1);

  let tld: number, trd: number, bld: number, brd: number;
  let r: number, c: number;
  const segments: { [ele: string]: number[][] } = {};
  const fragmentByStartByLevel: Map<number, Map<number, Fragment>> = new Map();
  const fragmentByEndByLevel: Map<number, Map<number, Fragment>> = new Map();

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
          let fragmentByStart = fragmentByStartByLevel.get(threshold);
          if (!fragmentByStart)
            fragmentByStartByLevel.set(
              threshold,
              (fragmentByStart = new Map()),
            );
          let fragmentByEnd = fragmentByEndByLevel.get(threshold);
          if (!fragmentByEnd)
            fragmentByEndByLevel.set(threshold, (fragmentByEnd = new Map()));
          const start = segment[0];
          const end = segment[1];
          const startIndex = index(tile.width, c, r, start);
          const endIndex = index(tile.width, c, r, end);
          let f, g;

          if ((f = fragmentByEnd.get(startIndex))) {
            fragmentByEnd.delete(startIndex);
            if ((g = fragmentByStart.get(endIndex))) {
              fragmentByStart.delete(endIndex);
              if (f === g) {
                // closing a ring
                interpolate(end, threshold, f.append);
                if (!f.isEmpty()) {
                  let list = segments[threshold];
                  if (!list) {
                    segments[threshold] = list = [];
                  }
                  list.push(f.lineString());
                }
              } else {
                // connecting 2 segments
                f.appendFragment(g);
                fragmentByEnd.set((f.end = g.end), f);
              }
            } else {
              // adding to the end of f
              interpolate(end, threshold, f.append);
              fragmentByEnd.set((f.end = endIndex), f);
            }
          } else if ((f = fragmentByStart.get(endIndex))) {
            fragmentByStart.delete(endIndex);
            // extending the start of f
            interpolate(start, threshold, f.prepend);
            fragmentByStart.set((f.start = startIndex), f);
          } else {
            // starting a new fragment
            const newFrag = new Fragment(startIndex, endIndex);
            interpolate(start, threshold, newFrag.append);
            interpolate(end, threshold, newFrag.append);
            fragmentByStart.set(startIndex, newFrag);
            fragmentByEnd.set(endIndex, newFrag);
          }
        }
      }
    }
  }
  for (const [level, fragmentByStart] of fragmentByStartByLevel.entries()) {
    let list: number[][] | null = null;
    for (const value of fragmentByStart.values()) {
      if (!value.isEmpty()) {
        if (list == null) {
          list = segments[level] || (segments[level] = []);
        }
        list.push(value.lineString());
      }
    }
  }

   const closedSegments = closePolygons(segments, tile, buffer, multiplier);

  return closedSegments;
}

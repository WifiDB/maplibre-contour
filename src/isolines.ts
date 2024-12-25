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
  const tolerance = 0.00001;
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
                  firstX < multiplier * buffer - tolerance || firstX > multiplier * (tile.width - buffer - 1) + tolerance ||
                  firstY < multiplier * buffer - tolerance || firstY > multiplier * (tile.height - buffer - 1) + tolerance ||
                  lastX < multiplier * buffer - tolerance || lastX > multiplier * (tile.width - buffer - 1) + tolerance ||
                  lastY < multiplier * buffer - tolerance || lastY > multiplier * (tile.height - buffer - 1) + tolerance

              ) {

                const completeBoundary = (x1: number, y1: number, x2: number, y2: number, tileWidth: number, tileHeight: number)=>{
                  const points: number[] = [];
                    if(x1< multiplier*buffer - tolerance)
                    {
                          points.push(0, y1)
                            if (y2< multiplier*buffer - tolerance){
                                points.push(0,0)
                                points.push(x2, 0)
                          } else if(y2>multiplier*(tileHeight - buffer) + tolerance){
                                points.push(0,multiplier*tileHeight)
                                points.push(x2, multiplier*tileHeight)
                           }else {
                                points.push(0, y2)
                            }

                    }else if (x1 > multiplier*(tileWidth - buffer) + tolerance){
                        points.push(multiplier*tileWidth, y1)
                        if (y2< multiplier*buffer - tolerance){
                            points.push(multiplier*tileWidth,0)
                            points.push(x2, 0)
                            } else if(y2>multiplier*(tileHeight - buffer) + tolerance){
                            points.push(multiplier*tileWidth,multiplier*tileHeight)
                            points.push(x2, multiplier*tileHeight)
                        }else {
                            points.push(multiplier*tileWidth, y2)
                        }
                    }
                   else if (y1 < multiplier * buffer - tolerance){
                        points.push(x1,0);
                          if (x2 < multiplier*buffer - tolerance){
                                points.push(0,0)
                                points.push(0,y2)
                            }else if(x2 > multiplier*(tileWidth-buffer) + tolerance){
                                 points.push(multiplier*tileWidth,0)
                                points.push(multiplier*tileWidth,y2)
                           } else{
                                points.push(x2,0)
                          }
                      }else if (y1 > multiplier * (tileHeight- buffer) + tolerance){
                          points.push(x1, multiplier*tileHeight)
                          if (x2 < multiplier*buffer- tolerance){
                              points.push(0, multiplier*tileHeight)
                                points.push(0,y2)
                            }else if(x2 > multiplier*(tileWidth-buffer) + tolerance){
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
    // same as before
     const closedSegments = closePolygons(segments, tile, buffer, multiplier);

    const result: { [ele: number]: number[][] } = {};

      for (const level in closedSegments) {
          const frags = closedSegments[level];
          // flat is used here to flatten the output of map from number[][][] to number[][]
          result[Number(level)] = frags.map(lineString=>{
             if(lineString[0] === lineString[lineString.length-2] && lineString[1] === lineString[lineString.length-1]){
                 // it's a polygon
                return [lineString]
             }else{
                // It's a MultiLineString
                return [lineString]
             }
        }).flat()
      }

  return result;
}
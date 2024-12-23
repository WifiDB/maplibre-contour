import type { HeightTile } from "./height-tile";
import {contours} from "d3-contour";
import {extent} from "d3-array";
import { Position } from 'geojson';

/**
 * Generates contour polygons from a HeightTile
 *
 * @param interval Vertical distance between contours
 * @param tile The input height tile, where values represent the height at the top-left of each pixel
 * @param tileExtent Vector tile extent (default 4096)
 * @param buffer How many pixels into each neighboring tile to include in a tile
  * @param smooth Whether the contour should be smoothed or not
 * @returns an object where keys are the elevation, and values are a list of `[[x1, y1, x2, y2, ...], [...]]`
 * polygons in tile coordinates
 */
export default function generateIsolines(
    interval: number,
    tile: HeightTile,
    tileExtent: number = 4096,
    buffer: number = 1,
    smooth = true
): { [ele: string]: Position[][][] } {
    if (!interval) {
        return {};
    }
    const threshold = (values:ArrayLike<number>):number[] => {
      const e = extent(Array.from(values), (x) => isFinite(x) ? x : NaN)
      if(!e) return [];
      let eMin:number, eMax:number;
      if(Array.isArray(e)){
          eMin = e[0] !== undefined ? Number(e[0]) : 0;
          eMax = e[1] !== undefined ? Number(e[1]) : 0
      } else{
          eMin = e !== undefined ? Number(e) : 0;
           eMax = e !== undefined ? Number(e) : 0;
      }
      if(eMin === undefined || eMax === undefined) return [];
      const niceThreshold = Math.ceil((eMax - eMin) / interval)
      return  [...Array(niceThreshold).keys()].map(i => eMin + i * interval)
  };

    const contourGenerator = contours()
        .size([tile.width, tile.height])
        .thresholds(threshold)
        .smooth(smooth);


    const allPolygons:{ [ele: number]: Position[][][] } = {};
     const result  = contourGenerator(Array.from({length: tile.width * tile.height}, (_, i) => i))
    for(const res of result){
        const polygons = res.coordinates;
          const closedPolygons: Position[][][] = [];
        for(const polygon of polygons){
            const firstPoint = polygon[0];
             const lastPoint = polygon[polygon.length - 1];
           if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
                polygon.push(firstPoint);
            }
              const splitPolygons : Position[][] = [];
              let currentPolygon : Position[] = []
             for(const point of polygon){ // iterate over the list of points instead of a single point
                // Check if we are at the border of the virtual tile, and start new polygon if so.
                  if(point[0][0] <= 0 || point[0][0] >= (tile.width - 1) || point[0][1] <= 0 || point[0][1] >= (tile.height - 1)) {
                    if(currentPolygon.length > 0) {
                         splitPolygons.push(currentPolygon);
                    }
                     currentPolygon = []
                }
                  currentPolygon.push(point[0]) // push the current point
             }
             if(currentPolygon.length > 0)
                splitPolygons.push(currentPolygon)
              for(const poly of splitPolygons){
                closedPolygons.push([poly]);
              }
         }
         allPolygons[res.value] = closedPolygons;
    }
    return allPolygons as {[ele:string]:Position[][][]};
}
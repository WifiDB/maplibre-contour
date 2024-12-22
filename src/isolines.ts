import type { HeightTile } from "./height-tile";
import {contours} from "d3-contour";
import {extent} from "d3-array";
import type { Position } from "./types";

/**
 * Generates contour polygons from a HeightTile using d3-contour
 *
 * @param interval Vertical distance between contours
 * @param tile The input height tile, where values represent the height at the top-left of each pixel
 * @param tileExtent Vector tile extent (default 4096)
 * @param buffer How many pixels into each neighboring tile to include in a tile
 * @returns an object where keys are the elevation, and values are a list of `[[x1, y1, x2, y2, ...], [...]]`
 * polygons in tile coordinates
 */
export default function generateIsolines(
    interval: number,
    tile: HeightTile,
    tileExtent: number = 4096,
    buffer: number = 1,
    smooth=true
): { [ele: string]: Position[][][] } {
    if (!interval) {
        return {};
    }
      const threshold =  (values:ArrayLike<number>) => {
         const data = Array.from(values).map((_,i) => tile.get(i % tile.width, Math.floor(i/tile.width)));
        const e = extent(data, (x) => isFinite(x) ? x : NaN)
         if(!e) return [];
         let eMin, eMax;
         if(Array.isArray(e)){
             eMin = e[0];
             eMax = e[1]
         } else{
             eMin = e;
             eMax = e;
         }

       if(eMin === undefined || eMax === undefined) return [];
      const niceThreshold = Math.ceil((eMax - eMin) / interval)
        return  [...Array(niceThreshold).keys()].map(i => eMin + i * interval)
    };


    const contourGenerator = contours()
    .size([tile.width, tile.height])
    .thresholds(threshold)
    .smooth(smooth);


    const allPolygons:{ [ele: string]: Position[][][] } = {};
     const result  = contourGenerator(Array.from({length: tile.width * tile.height}, (_, i) => i))

    for(const res of result){
        allPolygons[res.value.toString()] = res.coordinates
    }
    return allPolygons
}

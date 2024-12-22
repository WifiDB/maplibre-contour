import AsyncCache from "./cache";
import defaultDecodeImage from "./decode-image";
import { HeightTile } from "./height-tile";
import generateIsolines from "./isolines";
import { encodeIndividualOptions, isAborted, withTimeout } from "./utils";
import type {
    ContourTile,
    DecodeImageFunction,
    DemManager,
    DemManagerInitizlizationParameters,
    DemTile,
    Encoding,
    FetchResponse,
    GetTileFunction,
    IndividualContourTileOptions,
    Feature,
    Layer,
    Tile
} from "./types";
import encodeVectorTile, { GeomType } from "./vtpbf";
import { Timer } from "./performance";
import type { Position } from 'geojson';


const defaultGetTile: GetTileFunction = async (
    url: string,
    abortController: AbortController,
) => {
    const options: RequestInit = {
        signal: abortController.signal,
    };
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Bad response: ${response.status} for $`);
    }
    return {
        data: await response.blob(),
        expires: response.headers.get("expires") || undefined,
        cacheControl: response.headers.get("cache-control") || undefined,
    };
};

/**
 * Caches, decodes, and processes raster tiles in the current thread.
 */
export class LocalDemManager implements DemManager {
    tileCache: AsyncCache<string, FetchResponse>;
    parsedCache: AsyncCache<string, DemTile>;
    contourCache: AsyncCache<string, ContourTile>;
    demUrlPattern: string;
    encoding: Encoding;
    maxzoom: number;
    timeoutMs: number;
    loaded = Promise.resolve();
    decodeImage: DecodeImageFunction;
    getTile: GetTileFunction;

    constructor(options: DemManagerInitizlizationParameters) {
        this.tileCache = new AsyncCache(options.cacheSize);
        this.parsedCache = new AsyncCache(options.cacheSize);
        this.contourCache = new AsyncCache(options.cacheSize);
        this.timeoutMs = options.timeoutMs;
        this.demUrlPattern = options.demUrlPattern;
        this.encoding = options.encoding;
        this.maxzoom = options.maxzoom;
        this.decodeImage = options.decodeImage || defaultDecodeImage;
        this.getTile = options.getTile || defaultGetTile;
    }

    fetchTile(
        z: number,
        x: number,
        y: number,
        parentAbortController: AbortController,
        timer?: Timer,
    ): Promise<FetchResponse> {
        const url = this.demUrlPattern
            .replace("{z}", z.toString())
            .replace("{x}", x.toString())
            .replace("{y}", y.toString());
        timer?.useTile(url);
        return this.tileCache.get(
            url,
            (_, childAbortController) => {
                timer?.fetchTile(url);
                const mark = timer?.marker("fetch");
                return withTimeout(
                    this.timeoutMs,
                    this.getTile(url, childAbortController).finally(() => mark?.()),
                    childAbortController,
                );
            },
            parentAbortController,
        );
    }
    fetchAndParseTile = (
        z: number,
        x: number,
        y: number,
        abortController: AbortController,
        timer?: Timer,
    ): Promise<DemTile> => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const url = this.demUrlPattern
            .replace("{z}", z.toString())
            .replace("{x}", x.toString())
            .replace("{y}", y.toString());

        timer?.useTile(url);

        return this.parsedCache.get(
            url,
            async (_, childAbortController) => {
                const response = await self.fetchTile(
                    z,
                    x,
                    y,
                    childAbortController,
                    timer,
                );
                if (isAborted(childAbortController)) throw new Error("canceled");
                const promise = self.decodeImage(
                    response.data,
                    self.encoding,
                    childAbortController,
                );
                const mark = timer?.marker("decode");
                const result = await promise;
                mark?.();
                return result;
            },
            abortController,
        );
    };

    async fetchDem(
        z: number,
        x: number,
        y: number,
        options: IndividualContourTileOptions,
        abortController: AbortController,
        timer?: Timer,
    ): Promise<HeightTile> {
        const zoom = Math.min(z - (options.overzoom || 0), this.maxzoom);
        const subZ = z - zoom;
        const div = 1 << subZ;
        const newX = Math.floor(x / div);
        const newY = Math.floor(y / div);

        const tile = await this.fetchAndParseTile(
            zoom,
            newX,
            newY,
            abortController,
            timer,
        );

        return HeightTile.fromRawDem(tile).split(subZ, x % div, y % div);
    }

      fetchContourTile(
          z: number,
          x: number,
          y: number,
          options: IndividualContourTileOptions,
          parentAbortController: AbortController,
          timer?: Timer,
      ): Promise<ContourTile> {
          const {
              levels,
              multiplier = 1,
              buffer = 1,
              extent = 4096,
              contourLayer = "contours",
              elevationKey = "ele",
              levelKey = "level",
              subsampleBelow = 100,
              smooth = true,
          } = options;

          // no levels means less than min zoom with levels specified
          if (!levels || levels.length === 0) {
              return Promise.resolve({ arrayBuffer: new ArrayBuffer(0) });
          }
          const key = [z, x, y, encodeIndividualOptions(options)].join("/");
          return this.contourCache.get(
              key,
              async (_, childAbortController) => {
                  const max = 1 << z;
                  const neighborPromises: (Promise<HeightTile> | undefined)[] = [];
                   // Fetch all 9 neighbors tiles
                  for (let iy = y - 1; iy <= y + 1; iy++) {
                      for (let ix = x - 1; ix <= x + 1; ix++) {
                          neighborPromises.push(
                              iy < 0 || iy >= max
                                  ? undefined
                                  : this.fetchDem(
                                      z,
                                      (ix + max) % max,
                                      iy,
                                      options,
                                      childAbortController,
                                      timer,
                                  ),
                          );
                      }
                  }
                  const neighbors = await Promise.all(neighborPromises);
                  let virtualTile = HeightTile.combineNeighbors(neighbors);
                  if (!virtualTile || isAborted(childAbortController)) {
                      return { arrayBuffer: new Uint8Array().buffer };
                  }
                  const mark = timer?.marker("isoline");

                  if (virtualTile.width >= subsampleBelow) {
                      virtualTile = virtualTile.materialize(2);
                  } else {
                      while (virtualTile.width < subsampleBelow) {
                          virtualTile = virtualTile.subsamplePixelCenters(2).materialize(2);
                      }
                  }

                  virtualTile = virtualTile
                      .averagePixelCentersToGrid()
                      .scaleElevation(multiplier);


                  // generate the isolines for all zoom levels and cache them at the manager
                  let allIsolines: { [level: string]: Position[][][] } = {};
                  //Map that will store the open contours on the edges.
                  const openContours: { [level: string]: { [index: number]: Position[][] } } = {}

                  for (const level of levels) {
                    const isolines = generateIsolines(
                            level,
                            virtualTile,
                            extent,
                            buffer,
                            smooth,
                        );
                        allIsolines = { ...allIsolines, ...isolines };
                         // Process the output of generate isolines to separate the closed contours and the opened contours.
                        for (const ele in isolines){
                            const polygons = isolines[ele];
                            const opened:Position[][] = [];
                            const index = indexFn(x,y);
                            for (const polygon of polygons){
                                // Check if the polygon is closed
                                const firstPoint = polygon[0][0]
                                const lastPoint = polygon[0][polygon[0].length -1]
                                if(firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1] ) {
                                     // The polygon is closed, store it as a regular polygon.
                                      if(allIsolines[ele] === undefined) allIsolines[ele] = []
                                       allIsolines[ele].push(polygon)
                                }else{
                                    // This is a non-closed polygon, store it in a map to be processed later.
                                    opened.push(polygon[0])
                                }
                            }
                            if(opened.length > 0){
                              if(openContours[level] === undefined) openContours[level] = {}
                                openContours[level][index] = opened;
                            }
                        }
                  }

                  //Process all the open contours at the borders of each tile
                  //Map that will store the combined polygons.
                   const combinedIsolines: { [level: string]: Position[][][] } = {};
                 for (const level of levels){
                   if(openContours[level] !== undefined){
                    const xPlusOneIndex = indexFn((x + 1 + max) % max, y);
                    const xMinusOneIndex = indexFn((x - 1 + max) % max, y);
                    const yPlusOneIndex = indexFn(x, y + 1);
                    const yMinusOneIndex = indexFn(x, y - 1);

                     const xPlusOneOpenedContours = openContours[level][xPlusOneIndex];
                     const xMinusOneOpenedContours = openContours[level][xMinusOneIndex]
                     const yPlusOneOpenedContours = openContours[level][yPlusOneIndex];
                     const yMinusOneOpenedContours = openContours[level][yMinusOneIndex]

                        for(const index in openContours[level]){
                            const polygons = openContours[level][index]
                             for (const polygon of polygons){
                                // Check if there are neighbors and if we need to extend the polygons
                               if(xPlusOneOpenedContours && xPlusOneOpenedContours.length > 0) {
                                 const first = polygon[0];
                                    for(let i = 0; i< xPlusOneOpenedContours.length; i++){
                                        const neighborPolygon = xPlusOneOpenedContours[i];
                                        const last = neighborPolygon[neighborPolygon.length-1];
                                         if(first[0] === last[0] && first[1] === last[1]){
                                              // Remove the item from the map so it won't be processed again
                                              xPlusOneOpenedContours.splice(i, 1)
                                              polygon.push(...neighborPolygon)
                                              break;
                                         }
                                    }
                               }
                               if(xMinusOneOpenedContours && xMinusOneOpenedContours.length > 0) {
                                 const last = polygon[polygon.length - 1];
                                  for(let i = 0; i< xMinusOneOpenedContours.length; i++){
                                         const neighborPolygon = xMinusOneOpenedContours[i]
                                        const first = neighborPolygon[0];
                                          if(first[0] === last[0] && first[1] === last[1]){
                                            // Remove the item from the map so it won't be processed again
                                            xMinusOneOpenedContours.splice(i, 1)
                                              polygon.unshift(...neighborPolygon)
                                             break;
                                          }
                                    }
                               }
                               if(yPlusOneOpenedContours && yPlusOneOpenedContours.length > 0) {
                                const first = polygon[0];
                                  for(let i = 0; i< yPlusOneOpenedContours.length; i++){
                                      const neighborPolygon = yPlusOneOpenedContours[i];
                                       const last = neighborPolygon[neighborPolygon.length-1];
                                     if(first[0] === last[0] && first[1] === last[1]){
                                         // Remove the item from the map so it won't be processed again
                                          yPlusOneOpenedContours.splice(i, 1)
                                          polygon.push(...neighborPolygon)
                                          break;
                                     }
                                  }
                               }
                               if(yMinusOneOpenedContours && yMinusOneOpenedContours.length > 0) {
                                const last = polygon[polygon.length - 1];
                                    for(let i = 0; i< yMinusOneOpenedContours.length; i++){
                                        const neighborPolygon = yMinusOneOpenedContours[i];
                                        const first = neighborPolygon[0]
                                         if(first[0] === last[0] && first[1] === last[1]){
                                             // Remove the item from the map so it won't be processed again
                                             yMinusOneOpenedContours.splice(i, 1)
                                              polygon.unshift(...neighborPolygon)
                                              break;
                                        }
                                    }
                               }
                                if(combinedIsolines[level] === undefined) combinedIsolines[level] = [];
                                 combinedIsolines[level].push([polygon])
                             }
                        }

                   }
                 }


                 // Merge all isolines
                 const finalIsolines: { [level: string]: Position[][][] } = {}
                  for( const level in allIsolines){
                        if(combinedIsolines[level] !== undefined) {
                           finalIsolines[level] = [...allIsolines[level], ...combinedIsolines[level]]
                        }else{
                             finalIsolines[level] = allIsolines[level]
                        }
                   }


                  mark?.();
                const result = encodeVectorTile({
                    extent,
                    layers: {
                        [contourLayer]: {
                            features: Object.entries(finalIsolines).flatMap(
                                ([eleString, polygons]) => {
                                    const ele = Number(eleString);
                                    return polygons.map((polygon) : Feature => ({
                                        type: GeomType.POLYGON,
                                        geometry: polygon,
                                        properties: {
                                            [elevationKey]: ele,
                                            [levelKey]: Math.max(
                                                ...levels.map((l, i) => (ele % l === 0 ? i : 0)),
                                            ),
                                        },
                                    }));
                                },
                            ),
                        },
                    },
                } as Tile);
                mark?.();

                return { arrayBuffer: result.buffer as ArrayBuffer };
              },
              parentAbortController,
          );
      }
  }

  function indexFn(x: number, y: number):number {
    return x + y * 100000; // The number here should be a large number, bigger than your tiles
  }

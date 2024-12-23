import fs from "node:fs";
import { PMTiles, FetchSource, type Source } from "pmtiles";
import sharp from 'sharp';
import { default as mlcontour } from "../dist/index.mjs";
import type { DemTile, Encoding } from "../dist/types";

const httpTester = /^https?:\/\//i;

export class PMTilesFileSource implements Source {
  private fd: number;

  constructor(fd: number) {
    this.fd = fd;
  }

  getKey(): string {
    return String(this.fd); // Convert the fd to a string
  }

  async getBytes(
    offset: number,
    length: number,
  ): Promise<{ data: ArrayBuffer }> {
    const buffer = Buffer.alloc(length);
    await readFileBytes(this.fd, buffer, offset);
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return { data: ab };
  }
}

async function readFileBytes(
  fd: number,
  buffer: Buffer,
  offset: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.read(fd, buffer, 0, buffer.length, offset, (err, bytesRead, buff) => {
      if (err) {
        return reject(err);
      }
      if (bytesRead !== buffer.length) {
        return reject(
          new Error(
            `Failed to read the requested amount of bytes, got ${bytesRead} expected ${buffer.length}`,
          ),
        );
      }
      resolve();
    });
  });
}

export function openPMtiles(FilePath: string): PMTiles {
  let pmtiles: PMTiles;
  let fd: number | undefined;

  try {
    if (httpTester.test(FilePath)) {
      const source = new FetchSource(FilePath);
      pmtiles = new PMTiles(source);
    } else {
      fd = fs.openSync(FilePath, "r");
      const source = new PMTilesFileSource(fd);
      pmtiles = new PMTiles(source);
    }
    return pmtiles;
  } finally {
  }
}

export async function getPMtilesTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number,
): Promise<{ data: ArrayBuffer | undefined }> {
  try {
    const zxyTile = await pmtiles.getZxy(z, x, y);

    if (zxyTile && zxyTile.data) {
      return { data: zxyTile.data };
    } else {
      return { data: undefined };
    }
  } catch (error) {
    console.error("Error fetching tile:", error);
    return { data: undefined };
  }
}

/**
 * Processes image data from a blob.
 * @param {Blob} blob - The image data as a Blob.
 * @param {Encoding} encoding - The encoding to use when decoding.
 * @param {AbortController} abortController - An AbortController to cancel the image processing.
 * @returns {Promise<DemTile>} - A Promise that resolves with the processed image data, or throws if aborted.
 * @throws If an error occurs during image processing.
 */
export async function GetImageData(
  blob: Blob,
  encoding: Encoding,
  abortController: AbortController,
): Promise<DemTile> {
  if (abortController?.signal?.aborted) {
      throw new Error("Image processing was aborted.");
  }
  try {

      const buffer = await blob.arrayBuffer();
      const image = sharp(Buffer.from(buffer))

      if (abortController?.signal?.aborted) {
          throw new Error("Image processing was aborted.");
      }

      const { data, info } = await image
          .ensureAlpha() // Ensure RGBA output
          .raw()
          .toBuffer({ resolveWithObject: true });

        if (abortController?.signal?.aborted) {
            throw new Error("Image processing was aborted.");
        }
      const parsed = mlcontour.decodeParsedImage(
          info.width,
          info.height,
          encoding,
          data as any as Uint8ClampedArray,
      );
        if (abortController?.signal?.aborted) {
            throw new Error("Image processing was aborted.");
        }

      return parsed;
  } catch (error) {
      console.error('Error processing image:', error);
        if (error instanceof Error){
            throw error;
        }
        throw new Error("An unknown error has occurred.");
  }
}

export function extractZXYFromUrlTrim(
  url: string,
): { z: number; x: number; y: number } | null {
  // 1. Find the index of the last `/`
  const lastSlashIndex = url.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return null; // URL does not have any slashes
  }

  const segments = url.split("/");
  if (segments.length <= 3) {
    return null;
  }

  const ySegment = segments[segments.length - 1];
  const xSegment = segments[segments.length - 2];
  const zSegment = segments[segments.length - 3];

  const lastDotIndex = ySegment.lastIndexOf(".");
  const cleanedYSegment =
    lastDotIndex === -1 ? ySegment : ySegment.substring(0, lastDotIndex);

  // 3. Attempt to parse segments as numbers
  const z = parseInt(zSegment, 10);
  const x = parseInt(xSegment, 10);
  const y = parseInt(cleanedYSegment, 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return null; // Conversion failed, invalid URL format
  }

  return { z, x, y };
}

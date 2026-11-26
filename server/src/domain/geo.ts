/**
 * Local metric plane: an equirectangular projection centred on a reference point.
 * Good to well under 1% over the extent of one Track (tens of km), which is far
 * below GPS error. Not valid across the antimeridian or near the poles.
 */
const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

export interface XY {
  x: number;
  y: number;
}

export interface LocalPlane {
  toXY(lat: number, lon: number): XY;
  toLatLon(p: XY): { lat: number; lon: number };
}

export function localPlane(lat0: number, lon0: number): LocalPlane {
  const kx = Math.cos(lat0 * DEG) * EARTH_RADIUS_M * DEG;
  const ky = EARTH_RADIUS_M * DEG;
  return {
    toXY: (lat, lon) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * ky }),
    toLatLon: ({ x, y }) => ({ lat: lat0 + y / ky, lon: lon0 + x / kx }),
  };
}

/** Great-circle distance in metres (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function dist(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from point p to segment ab. */
export function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

import { gridPathCells, latLngToCell } from 'h3-js';
import { LAND_RESOLUTION } from './land.js';
import type { LandId, TrackPoint } from './types.js';

/**
 * Lands a path crosses: the cells of every fix plus the cells between consecutive
 * fixes, so a cycling-speed path does not skip Lands between sparse fixes.
 * A Visit is an Exercise path crossing a Land the user holds (GLOSSARY).
 */
export function landsCrossed(points: readonly TrackPoint[]): Set<LandId> {
  const out = new Set<LandId>();
  let prev: string | undefined;
  for (const p of points) {
    const cell = latLngToCell(p.lat, p.lon, LAND_RESOLUTION);
    if (prev && prev !== cell) {
      try {
        for (const c of gridPathCells(prev, cell)) out.add(c);
      } catch {
        // gridPathCells fails across pentagons or very long jumps; the endpoints still count.
      }
    }
    out.add(cell);
    prev = cell;
  }
  return out;
}

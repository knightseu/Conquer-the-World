/** One GPS fix as recorded by the client. */
export interface TrackPoint {
  /** Fix time, milliseconds since the Unix epoch. */
  t: number;
  lat: number;
  lon: number;
  /** Reported horizontal accuracy in metres (iOS `horizontalAccuracy`). */
  acc: number;
  /** Altitude in metres, when the device reports one. */
  alt?: number;
}

export type MovementType = 'walk' | 'run' | 'hike' | 'cycle' | 'drive';

/** Score category (SPEC F8). */
export type Category = 'exercise' | 'travel';

export function categoryOf(type: MovementType): Category {
  return type === 'drive' ? 'travel' : 'exercise';
}

/** An H3 cell index at the Land resolution. */
export type LandId = string;

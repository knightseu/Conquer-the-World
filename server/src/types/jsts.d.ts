// Minimal typings for the parts of jsts we use. The package ships only `any`-typed
// declarations in a separate folder that TypeScript cannot find from deep imports.

declare module 'jsts/org/locationtech/jts/geom/Coordinate.js' {
  export default class Coordinate {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }
}

declare module 'jsts/org/locationtech/jts/geom/PrecisionModel.js' {
  export default class PrecisionModel {
    constructor(scale: number);
  }
}

declare module 'jsts/org/locationtech/jts/geom/GeometryFactory.js' {
  import type Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
  import type PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel.js';

  export interface JstsGeometry {
    getArea(): number;
    getGeometryType(): string;
  }
  export interface JstsLineString extends JstsGeometry {
    getCoordinates(): Coordinate[];
  }
  export interface JstsPolygon extends JstsGeometry {
    getExteriorRing(): JstsLineString;
    getNumInteriorRing(): number;
    getInteriorRingN(n: number): JstsLineString;
  }
  export default class GeometryFactory {
    constructor(pm?: PrecisionModel);
    createLineString(coords: Coordinate[]): JstsLineString;
    createMultiLineString(lines: JstsLineString[]): JstsGeometry;
  }
}

declare module 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js' {
  import type ArrayList from 'jsts/java/util/ArrayList.js';
  import type {
    JstsGeometry,
    JstsPolygon,
  } from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
  export default class Polygonizer {
    /** A geometry, or a java.util.Collection of geometries. */
    add(g: JstsGeometry | ArrayList<JstsGeometry>): void;
    getPolygons(): { toArray(): JstsPolygon[]; size(): number };
  }
}

declare module 'jsts/java/util/ArrayList.js' {
  export default class ArrayList<T = unknown> {
    add(x: T): boolean;
    size(): number;
    toArray(): T[];
  }
}

declare module 'jsts/org/locationtech/jts/noding/snapround/GeometryNoder.js' {
  import type ArrayList from 'jsts/java/util/ArrayList.js';
  import type { JstsLineString } from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
  import type PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel.js';
  export default class GeometryNoder {
    constructor(pm: PrecisionModel);
    node(lines: ArrayList<JstsLineString>): ArrayList<JstsLineString>;
  }
}

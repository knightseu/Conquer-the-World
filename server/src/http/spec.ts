import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { parse } from 'yaml';

/** `api/openapi.yaml`, the contract's source of truth (ADR 0002). */
export const SPEC_PATH = fileURLToPath(new URL('../../../api/openapi.yaml', import.meta.url));

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * Registers every `components.schemas` entry with Fastify (as `<Name>#`) so routes
 * can validate requests and serialize responses against the spec itself.
 * OpenAPI `#/components/schemas/X` refs are rewritten to Fastify's `X#`.
 */
export function registerSpecSchemas(app: FastifyInstance, specPath = SPEC_PATH): void {
  const spec = parse(readFileSync(specPath, 'utf8')) as {
    components?: { schemas?: Record<string, Json> };
  };
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    app.addSchema({ $id: name, ...(rewriteRefs(schema) as object) });
  }
}

/** Reference a spec schema from a route definition. */
export const ref = (name: string) => ({ $ref: `${name}#` });

function rewriteRefs(node: Json): Json {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] =
        k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')
          ? `${v.slice('#/components/schemas/'.length)}#`
          : rewriteRefs(v);
    }
    return out;
  }
  return node;
}

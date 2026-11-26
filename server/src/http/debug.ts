import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Debug-only routes (M1): off unless DEBUG_ROUTES=1, and every request needs the
 * admin token. Not part of the public API contract.
 *
 * `/debug/tracks/:id` draws a stored Track with MapLibre GL JS. Track storage is not
 * built yet (it waits on "API contract outline"), so the page loads GeoJSON from
 * `/debug/tracks/:id.geojson`, which returns 404 until it is.
 */
export const debugRoutes: FastifyPluginAsync<{ adminToken: string }> = async (
  app,
  { adminToken },
) => {
  const expected = Buffer.from(adminToken);
  app.addHook('onRequest', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const query = (req.query as { token?: string }).token ?? '';
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : query);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get<{ Params: { id: string } }>('/debug/tracks/:id.geojson', async (_req, reply) =>
    reply.code(404).send({ error: 'track storage not implemented yet' }),
  );

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/debug/tracks/:id',
    async (req, reply) => {
      const id = encodeURIComponent(req.params.id);
      const token = encodeURIComponent(req.query.token ?? '');
      return reply.type('text/html').send(trackPage(id, token));
    },
  );
};

function trackPage(id: string, token: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Track ${id}</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>html,body,#map{margin:0;height:100%}#msg{position:absolute;top:8px;left:8px;background:#fff;padding:4px 8px;font:14px system-ui}</style>
</head><body><div id="map"></div><div id="msg"></div>
<script>
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', center: [0, 0], zoom: 1 });
map.on('load', async () => {
  const res = await fetch('/debug/tracks/${id}.geojson?token=${token}');
  if (!res.ok) { document.getElementById('msg').textContent = 'Track ${id}: ' + res.status; return; }
  const data = await res.json();
  map.addSource('track', { type: 'geojson', data });
  map.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#e4572e', 'line-width': 3 } });
  const b = new maplibregl.LngLatBounds();
  for (const f of data.features ?? []) for (const c of f.geometry.coordinates ?? []) b.extend(c);
  if (!b.isEmpty()) map.fitBounds(b, { padding: 40 });
});
</script></body></html>`;
}

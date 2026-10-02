import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { billingMonth, GoogleMapsError, type GoogleMaps } from '../maps.js';

/** Calls the server may make to each Google SKU per month, kept under each free allowance. */
export type MapsCaps = { routes: number; autocomplete: number; placeDetails: number };

type Options = { db: Db; google: GoogleMaps | null; caps: MapsCaps };

const latLng = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
// Google asks for a URL-safe string of at most 36 characters (a UUID fits).
const sessionToken = z.string().regex(/^[A-Za-z0-9_-]{8,36}$/);

// A route search asks Google twice: once normally, once avoiding highways.
const ROUTE_CALLS = 2;

export const mapsRoutes: FastifyPluginAsync<Options> = async (app, { db, google, caps }) => {
  const usedStatement = db.prepare('SELECT count FROM maps_usage WHERE month = ? AND sku = ?');
  const addStatement = db.prepare(
    `INSERT INTO maps_usage (month, sku, count) VALUES (?, ?, ?)
     ON CONFLICT (month, sku) DO UPDATE SET count = count + excluded.count`
  );
  const used = (sku: keyof MapsCaps) =>
    Number((usedStatement.get(billingMonth(), sku) as { count: number } | undefined)?.count ?? 0);

  /**
   * Counts the calls before making them, so a failed call still counts: that
   * errs toward stopping early. Returns false when the month's allowance is
   * spent. node:sqlite is synchronous, so the check and the add can't
   * interleave with another request.
   */
  const reserve = (sku: keyof MapsCaps, calls: number) => {
    if (used(sku) + calls > caps[sku]) return false;
    addStatement.run(billingMonth(), sku, calls);
    return true;
  };

  const googleAvailable = () =>
    google !== null &&
    used('routes') + ROUTE_CALLS <= caps.routes &&
    used('autocomplete') < caps.autocomplete &&
    used('placeDetails') < caps.placeDetails;

  // The app treats this one error as "use Apple's maps instead".
  const unavailable = (reply: FastifyReply) =>
    sendError(reply, 503, 'maps_unavailable', 'Google Maps isn’t available right now.');

  const callGoogle = async <T>(request: FastifyRequest, reply: FastifyReply, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof GoogleMapsError)) throw error;
      request.log.warn(error.message);
      unavailable(reply);
      return undefined;
    }
  };

  app.get('/status', async () => ({ google: googleAvailable() }));

  app.post('/autocomplete', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = z
      .object({ input: z.string().trim().min(1).max(200), sessionToken, near: latLng.nullish() })
      .safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', 'That search wasn’t valid.');
    if (!google || !reserve('autocomplete', 1)) return unavailable(reply);

    const { input, near } = body.data;
    const suggestions = await callGoogle(request, reply, () =>
      google.autocomplete(input, body.data.sessionToken, near ?? null)
    );
    return suggestions === undefined ? reply : { suggestions };
  });

  app.post('/place', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = z.object({ placeId: z.string().min(1).max(300), sessionToken }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', 'That place wasn’t valid.');
    if (!google || !reserve('placeDetails', 1)) return unavailable(reply);

    const place = await callGoogle(request, reply, () => google.placeDetails(body.data.placeId, body.data.sessionToken));
    if (place === undefined) return reply;
    if (place === null) return sendError(reply, 404, 'place_not_found', 'Couldn’t find that place. Try another search.');
    return place;
  });

  app.post('/routes', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = z.object({ from: latLng, to: latLng }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', 'Those places weren’t valid.');
    if (!google || !reserve('routes', ROUTE_CALLS)) return unavailable(reply);

    const { from, to } = body.data;
    const found = await callGoogle(request, reply, () =>
      Promise.all([google.computeRoutes(from, to, false), google.computeRoutes(from, to, true)])
    );
    if (found === undefined) return reply;
    const [normal, noHighways] = found;
    if (normal.length === 0 && noHighways.length === 0) {
      return sendError(reply, 404, 'no_route', 'No route found between those places.');
    }
    // The app scores these and picks scenic vs fastest, the same way it does
    // for Apple's routes.
    return { normal, noHighways };
  });
};

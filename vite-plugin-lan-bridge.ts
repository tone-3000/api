/**
 * Vite plugin for the LAN-relay demo.
 *
 * The LAN-relay flow needs an HTTP listener on the laptop's LAN IP that the
 * user's phone can reach after completing OAuth on tone3000. A browser tab
 * can't host one, so we mount middleware on the Vite dev server itself and
 * use Vite's --host binding (0.0.0.0) to make it reachable from the phone.
 *
 * Endpoints:
 *   GET /lan-info               → { lanIp: string | null }
 *                                  The laptop's first private (RFC1918) IPv4.
 *                                  React UI uses this to build redirect_uri.
 *   GET /lan-callback?code&state→ Captures code+state, parks them keyed by
 *                                  state. Returns a tiny HTML page so the
 *                                  user's phone shows confirmation rather
 *                                  than a blank screen.
 *   GET /lan-poll?state         → Returns { code, state } when the matching
 *                                  /lan-callback has fired, otherwise 204.
 *                                  React UI polls every 500ms.
 *
 * State parking is in-memory; this is a dev-only plugin.
 */

import type { Plugin } from 'vite';
import { networkInterfaces } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface ParkedCallback {
  code: string;
  state: string;
  receivedAt: number;
}

function pickLanIp(): string | null {
  const nets = networkInterfaces();
  // Preference order: 192.168 > 10 > 172.16-31 > 169.254
  const candidates: { rank: number; address: string }[] = [];
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const a = net.address;
      let rank = 99;
      if (a.startsWith('192.168.')) rank = 1;
      else if (a.startsWith('10.')) rank = 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) rank = 3;
      else if (a.startsWith('169.254.')) rank = 4;
      else continue; // skip public IPs
      candidates.push({ rank, address: a });
    }
  }
  candidates.sort((x, y) => x.rank - y.rank);
  return candidates[0]?.address ?? null;
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function lanBridgePlugin(): Plugin {
  // Map keyed by state so concurrent flows don't collide. Entries expire
  // 2 minutes after receipt; the React poller usually drains them within
  // milliseconds, but we cap the lifetime to keep stale codes out of memory.
  const parked = new Map<string, ParkedCallback>();
  const TTL_MS = 2 * 60 * 1000;

  function gc(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of parked) {
      if (v.receivedAt < cutoff) parked.delete(k);
    }
  }

  return {
    name: 'lan-bridge-demo',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';

        if (url.startsWith('/lan-info')) {
          sendJson(res, 200, { lanIp: pickLanIp() });
          return;
        }

        if (url.startsWith('/lan-callback')) {
          const q = parseQuery(url);
          const code = q.get('code');
          const state = q.get('state');
          const error = q.get('error');
          gc();
          if (state) {
            // Park whatever we got — code on success, error params on failure.
            // The React UI will inspect and surface either.
            parked.set(state, {
              code: code ?? '',
              state,
              receivedAt: Date.now(),
            });
            // Stash error params alongside under a separate key so the UI can
            // distinguish "user denied" from "user approved but no code yet."
            if (error) {
              parked.set(state, {
                code: `__error__:${error}:${q.get('error_description') ?? ''}`,
                state,
                receivedAt: Date.now(),
              });
            }
          }
          // Friendly confirmation for the phone — the device (laptop) will
          // pick this up in the next poll and complete the exchange.
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
            `<title>tone3000 — LAN relay demo</title>` +
            `<body style="font-family:system-ui;padding:32px;text-align:center">` +
            `<h2>You're all set.</h2>` +
            `<p>Return to the device to finish.</p></body>`
          );
          return;
        }

        if (url.startsWith('/lan-poll')) {
          const state = parseQuery(url).get('state');
          gc();
          if (state && parked.has(state)) {
            const entry = parked.get(state)!;
            parked.delete(state);
            sendJson(res, 200, entry);
            return;
          }
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

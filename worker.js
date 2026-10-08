// worker.js
// Cloudflare Worker Media Proxy - Enforced 30-Day Video Segment Caching

const MEDIA_CACHE_TTL_SECONDS = 2592000; // Force Cloudflare to keep segments for 30 Days

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- CORS preflight ----
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ---- Validate target ----
    const target = url.searchParams.get('url');
    if (!target) return text('Missing url', 400);

    const referer = url.searchParams.get('referer') || 'https://filmu.in';
    let origin;
    try {
      origin = url.searchParams.get('origin') || new URL(referer).origin;
    } catch {
      return text('Unsupported referer', 400);
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return text('Bad url', 400);
    }

    const pathname = targetUrl.pathname.toLowerCase();
    const isPlaylist = pathname.endsWith('.m3u8') || pathname.endsWith('.m3u');
    const incomingRange = request.headers.get('range');

    // ---- Normalise Cache Key ----
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKeyUrl = new URL(targetUrl.href);
    
    // FIX: Force a clean GET request for the lookup key, explicitly omitting 'cache-control: no-cache'
    const cacheKey = cache && request.method === 'GET' && !isPlaylist
      ? new Request(cacheKeyUrl.toString(), {
          method: 'GET',
          headers: incomingRange ? { 'Range': incomingRange } : {}
        })
      : null;

    // Check early cache entries
    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const cachedHeaders = new Headers(cached.headers);
        Object.entries(corsHeaders()).forEach(([k, v]) => cachedHeaders.set(k, v));
        cachedHeaders.set('X-Worker-Cache', 'HIT');
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: cachedHeaders,
        });
      }
    }

    // ---- Build upstream headers ----
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
      Origin: origin,
      'Accept-Encoding': 'identity',
    };

    if (incomingRange && !isPlaylist) upstreamHeaders.Range = incomingRange;

    // ---- Fetch upstream ----
    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: 'follow',
      });
    } catch (e) {
      return text(`Proxy failed: ${e.message}`, 502);
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

    // Determine Cacheability purely by video payload type
    const isMediaContent = contentType.startsWith('video/') || 
                          contentType.startsWith('audio/') || 
                          contentType.startsWith('image/') ||
                          contentType === 'application/octet-stream';

    const isCacheCandidate = request.method === 'GET' && !isPlaylist && (upstream.status === 200 || upstream.status === 206) && isMediaContent;

    // ---- Output headers ----
    const outHeaders = corsHeaders();
    outHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
    outHeaders['X-Worker-Cache'] = 'MISS';
    outHeaders['Content-Type'] = contentType || (isPlaylist ? 'application/vnd.apple.mpegurl' : 'application/octet-stream');
    
    outHeaders['Cache-Control'] = isCacheCandidate
      ? `public, max-age=${MEDIA_CACHE_TTL_SECONDS}, s-maxage=${MEDIA_CACHE_TTL_SECONDS}, immutable`
      : 'no-store, no-cache, must-revalidate';

    // Preserve range / length headers so seeking works.
    for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
      const v = upstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }

    // ---- Reject hotlink-protection HTML ----
    if (contentType.includes('text/html')) {
      return new Response('Upstream returned HTML (hotlink protection?)', {
        status: 404,
        headers: outHeaders,
      });
    }

    // ---- Rewrite playlists ----
    if (isPlaylist) {
      outHeaders['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      const baseQuery = "referer=" + encodeURIComponent(referer) + "&origin=" + encodeURIComponent(origin);
      const workerBase = url.origin + url.pathname;

      const lines = (await upstream.text()).split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          if (trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              const abs = new URL(uri, target).href;
              return 'URI="' + workerBase + '?url=' + encodeURIComponent(abs) + '&' + baseQuery + '"';
            });
          }
          return line;
        }
        const abs = new URL(trimmed, target).href;
        return workerBase + '?url=' + encodeURIComponent(abs) + '&' + baseQuery;
      });

      const rewritten = rewrittenLines.join('\n');
      outHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
      return new Response(rewritten, { status: 200, headers: outHeaders });
    }

    // ---- Asynchronous Cache Storage Dispatch (Buffered for Large Files) ----
    if (isCacheCandidate && cacheKey) {
      const buffer = await upstream.arrayBuffer();
      
      const cacheHeaders = new Headers();
      cacheHeaders.set('Content-Type', outHeaders['Content-Type']);
      cacheHeaders.set('Cache-Control', `public, max-age=${MEDIA_CACHE_TTL_SECONDS}, s-maxage=${MEDIA_CACHE_TTL_SECONDS}, immutable`);
      if (outHeaders['Content-Length']) cacheHeaders.set('Content-Length', outHeaders['Content-Length']);
      if (outHeaders['Content-Range']) cacheHeaders.set('Content-Range', outHeaders['Content-Range']);
      if (outHeaders['Accept-Ranges']) cacheHeaders.set('Accept-Ranges', outHeaders['Accept-Ranges']);

      const responseToCache = new Response(buffer, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: cacheHeaders,
      });

      if (ctx?.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseToCache).catch(() => {}));
      } else {
        await cache.put(cacheKey, responseToCache).catch(() => {});
      }

      const clientResponseHeaders = new Headers(outHeaders);
      return new Response(buffer, {
        status: upstream.status,
        headers: clientResponseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: new Headers(outHeaders),
    });
  },
};

// Clear headers globally helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, X-Worker-Cache',
  };
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

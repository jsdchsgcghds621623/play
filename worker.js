// worker.js
// Cloudflare Worker replacement for the Node server's /proxy/any route.
// Deploy at: https://<your-worker>.workers.dev  (or a custom domain)
// The player calls:  <worker>/proxy/any?url=...&referer=...&origin=...

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // ---- CORS preflight ----
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ---- Validate target ----
    const target = url.searchParams.get('url');
    if (!target) return text('Missing url', 400);

    const referer = url.searchParams.get('referer') || 'https://embed.filmu.in/';
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

    const pathname = targetUrl.pathname;
    const isPlaylist = /\.(m3u8|m3u|txt)$/i.test(pathname);

    // ---- Build upstream headers ----
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
      Origin: origin,
      'Accept-Encoding': 'identity',
    };

    const incomingRange = request.headers.get('range');
    if (incomingRange && !isPlaylist) upstreamHeaders.Range = incomingRange;

    // ---- Fetch upstream ----
    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: 'follow',
        cf: { cacheEverything: false },
      });
    } catch (e) {
      return text(`Proxy failed: ${e.message}`, 502);
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

    // ---- Output headers ----
    const outHeaders = corsHeaders();
    outHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
    outHeaders['Cache-Control'] = 'no-store';
    outHeaders['Content-Type'] =
      contentType || (isPlaylist ? 'application/vnd.apple.mpegurl' : 'application/octet-stream');

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
      const baseQuery = `referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
      // Base used for rewritten URLs. Preserves /proxy/any so the player's
      // URL scheme stays identical to what the Node server produced.
      const workerBase = `${url.origin}${url.pathname}`;

      const rewritten = (await upstream.text())
        .split(/\r?\n/)
        .map(line => {
          if (!line.trim() || line.trim().startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (_, uri) => {
              const abs = new URL(uri, target).href;
              return `URI="${workerBase}?url=${encodeURIComponent(abs)}&${baseQuery}"`;
            });
          }
          const abs = new URL(line.trim(), target).href;
          return `${workerBase}?url=${encodeURIComponent(abs)}&${baseQuery}`;
        })
        .join('\n');

      outHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
      return new Response(rewritten, { status: 200, headers: outHeaders });
    }

    // ---- Stream everything else (supports 206 partial content) ----
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers':
      'Accept-Ranges, Content-Length, Content-Range, Content-Type',
  };
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
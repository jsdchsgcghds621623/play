var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const target = url.searchParams.get("url");
    if (!target) return text("Missing url", 400);
    const referer = url.searchParams.get("referer") || "https://embed.filmu.in/";
    let origin;
    try {
      origin = url.searchParams.get("origin") || new URL(referer).origin;
    } catch {
      return text("Unsupported referer", 400);
    }
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return text("Bad url", 400);
    }
    const pathname = targetUrl.pathname;
    const isPlaylist = /\.(m3u8|m3u|txt)$/i.test(pathname);
    const upstreamHeaders = {
      "User-Agent": "Mozilla/5.0",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
      Origin: origin,
      "Accept-Encoding": "identity"
    };
    const incomingRange = request.headers.get("range");
    if (incomingRange && !isPlaylist) upstreamHeaders.Range = incomingRange;
    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
        cf: { cacheEverything: false }
      });
    } catch (e) {
      return text(`Proxy failed: ${e.message}`, 502);
    }
    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const outHeaders = corsHeaders();
    outHeaders["Cross-Origin-Resource-Policy"] = "cross-origin";
    outHeaders["Cache-Control"] = "no-store";
    outHeaders["Content-Type"] = contentType || (isPlaylist ? "application/vnd.apple.mpegurl" : "application/octet-stream");
    for (const h of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
      const v = upstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }
    if (contentType.includes("text/html")) {
      return new Response("Upstream returned HTML (hotlink protection?)", {
        status: 404,
        headers: outHeaders
      });
    }
    if (isPlaylist) {
      const baseQuery = `referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
      const workerBase = `${url.origin}${url.pathname}`;
      const rewritten = (await upstream.text()).split(/\r?\n/).map((line) => {
        if (!line.trim() || line.trim().startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            const abs2 = new URL(uri, target).href;
            return `URI="${workerBase}?url=${encodeURIComponent(abs2)}&${baseQuery}"`;
          });
        }
        const abs = new URL(line.trim(), target).href;
        return `${workerBase}?url=${encodeURIComponent(abs)}&${baseQuery}`;
      }).join("\n");
      outHeaders["Content-Type"] = "application/vnd.apple.mpegurl";
      return new Response(rewritten, { status: 200, headers: outHeaders });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders
    });
  }
};
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type"
  };
}
__name(corsHeaders, "corsHeaders");
function text(body, status) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" }
  });
}
__name(text, "text");

// C:/Users/faisa/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/faisa/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ResCtv/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// C:/Users/faisa/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ResCtv/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

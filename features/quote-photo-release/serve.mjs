const typeOfHtml = "text/html";

export function withQuoteAssets(app, assets) {
    const stylesheet = Object.keys(assets).find((path) => assets[path].mime.startsWith("text/css"));
    return {
        ...app,
        async fetch(request, env, context) {
            const path = new URL(request.url).pathname;
            const isHead = request.method === "HEAD";
            if ((request.method === "GET" || isHead) && Object.hasOwn(assets, path)) {
                const asset = assets[path];
                const etag = `"${asset.sha256}"`;
                const headers = {
                    "Content-Type": asset.mime,
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "X-Content-Type-Options": "nosniff",
                    "ETag": etag,
                };
                if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
                const store = env.FAMA_STATIC_ASSETS;
                const row = await store.prepare(
                    "SELECT body_base64 FROM static_assets WHERE app = ? AND path = ? AND sha256 = ?",
                ).bind("system", path, asset.sha256).first();
                if (!row?.body_base64) return new Response("Arquivo da versão indisponível.", {
                    status: 503, headers: { "Cache-Control": "no-store" },
                });
                const bytes = Uint8Array.from(atob(row.body_base64), (char) => char.charCodeAt(0));
                if (bytes.byteLength !== asset.bytes) return new Response("Arquivo da versão incompleto.", {
                    status: 503, headers: { "Cache-Control": "no-store" },
                });
                return new Response(isHead ? null : bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
            }

            const response = await app.fetch(request, env, context);
            if (request.method !== "GET" || !response.ok || !response.headers.get("content-type")?.includes(typeOfHtml)) return response;
            const headers = new Headers(response.headers);
            for (const name of ["content-length", "etag", "last-modified"]) headers.delete(name);
            return new HTMLRewriter().on("head", {
                element(head) { head.append(`<link rel="stylesheet" href="${stylesheet}">`, { html: true }); },
            }).transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
        },
    };
}

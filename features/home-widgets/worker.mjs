import { widgets } from "./catalog.mjs";
import { createHomeWidgets } from "./client.mjs";
import { originalHomeAsset, homeWidgetAsset, patchHomeBrowser } from "./patch.mjs";

export function withHomeWidgets(app) {
    return {
        ...app,
        async fetch(request, env, context) {
            const url = new URL(request.url);
            if (!["GET", "HEAD"].includes(request.method) || url.pathname !== homeWidgetAsset)
                return app.fetch(request, env, context);

            // Use the assembled browser asset so the existing release transformations are preserved.
            url.pathname = originalHomeAsset;
            const original = await app.fetch(new Request(url, { method: "GET" }), env, context);
            if (!original.ok) return original;
            const code = patchHomeBrowser(await original.text(), widgets, createHomeWidgets);
            return new Response(request.method === "HEAD" ? null : code, {
                headers: {
                    "Content-Type": "application/javascript; charset=utf-8",
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "X-Content-Type-Options": "nosniff",
                },
            });
        },
    };
}

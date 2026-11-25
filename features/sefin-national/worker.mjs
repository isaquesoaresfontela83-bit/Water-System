export function updateFiscalCopy(text) {
    return text.replace(/NFS-e (?:pela|pelo|via) Asaas/g, "NFS-e pela SEFIN Nacional");
}

export function withSefinWorker(app, role) {
    return {
        ...app,
        async fetch(request, env, context) {
            const path = new URL(request.url).pathname.replace(/\/$/, "") || "/";
            if (role === "system" && path === "/api/finance/asaas-webhook")
                return Response.json({ error: "A emissão de NFS-e usa a SEFIN Nacional." }, {
                    status: 410, headers: { "Cache-Control": "no-store" },
                });
            const response = await app.fetch(request, env, context);
            if (request.method !== "GET" || !response.ok) return response;
            const contentType = response.headers.get("Content-Type") ?? "";
            if (!["/api/public/plans", "/", "/planos"].includes(path) ||
                !/html|json|text\/x-component/.test(contentType)) return response;
            const original = await response.text();
            const result = updateFiscalCopy(original);
            const headers = new Headers(response.headers);
            if (result !== original)
                for (const name of ["Content-Length", "Content-Encoding", "ETag", "Last-Modified"]) headers.delete(name);
            return new Response(result, { status: response.status, statusText: response.statusText, headers });
        },
    };
}

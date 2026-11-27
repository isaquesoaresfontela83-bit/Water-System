import { widgets, widgetVariants } from "./catalog.mjs";

const supportedSizes = new Set(["small", "medium", "large"]);
const variantSizes = new Map(widgetVariants.map(({ id, sizes }) => [id, new Set(sizes)]));
const ids = new Set(widgets.map(([id]) => id));
const reply = (body, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
});

export async function handleHomeWidgets(request, db, requireTenant, assertRateLimit, RequestError) {
    try {
        const { organization, user } = await requireTenant(request);
        if (request.headers.get("x-organization-id") !== organization.id)
            return reply({ error: "Selecione a empresa para continuar." }, 403);

        if (request.method === "GET") {
            const row = await db.prepare("SELECT hidden, sizes FROM water_home_widgets WHERE user_id = ? AND organization_id = ?")
                .bind(user.id, organization.id).first();
            return reply({ hidden: row ? JSON.parse(row.hidden).filter(id => ids.has(id)) : [],
                sizes: row?.sizes ? JSON.parse(row.sizes) : null });
        }
        if (request.method !== "POST")
            return reply({ error: "Método inválido." }, 405);
        const origin = request.headers.get("Origin");
        if (origin && origin !== new URL(request.url).origin)
            return reply({ error: "Abra a página inicial do Water System." }, 403);
        if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
            return reply({ error: "Formato inválido." }, 415);
        await assertRateLimit(request, "home_widgets", user.id, 30, 60);

        const reader = request.body?.getReader();
        const buffer = new Uint8Array(1024);
        let length = 0;
        if (!reader) return reply({ error: "Preferências inválidas." }, 400);
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (length + value.length > buffer.length) {
                    await reader.cancel();
                    return reply({ error: "Preferências inválidas." }, 413);
                }
                buffer.set(value, length);
                length += value.length;
            }
        } finally {
            reader.releaseLock();
        }

        let preference;
        try { preference = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length))); }
        catch { return reply({ error: "Preferências inválidas." }, 400); }
        let hidden = preference?.hidden;
        const sizes = preference?.sizes ?? null;
        if (sizes !== null && (typeof sizes !== "object" || Array.isArray(sizes) ||
            Object.entries(sizes).some(([id, size]) => !(variantSizes.get(id)?.has(size) ?? (ids.has(id) && supportedSizes.has(size))))))
            return reply({ error: "Tamanho de widget inválido." }, 400);
        if (!Array.isArray(hidden) || hidden.length > ids.size || hidden.some(id => !ids.has(id)))
            return reply({ error: "Preferências inválidas." }, 400);

        hidden = [...new Set(hidden)];
        await db.prepare(`INSERT INTO water_home_widgets (user_id, organization_id, hidden, sizes)
            VALUES (?, ?, ?, ?) ON CONFLICT(user_id, organization_id) DO UPDATE SET hidden = excluded.hidden, sizes = excluded.sizes`)
            .bind(user.id, organization.id, JSON.stringify(hidden), sizes === null ? null : JSON.stringify(sizes)).run();
        return reply({ hidden, sizes });
    } catch (error) {
        if (error instanceof RequestError) return reply({ error: error.message }, error.status);
        return reply({ error: "Não foi possível acessar suas preferências. Tente novamente." }, 503);
    }
}

import { individualPlan } from "./catalog.mjs";
import { bookingDraft, bookingPath, ConsultationError, saveConsultation, validateBooking } from "./booking.mjs";
import { bookingPublicClient, consultationAgendaPath, individualAgendaPage, individualControlClient, individualControlPage, individualPage, individualStylesheet } from "./page.mjs";
import { pricingAssetRevision } from "./patch-pricing.mjs";

export const releaseVersion = "15.23.39";
export const releaseId = "2026-11-25-water-individual-original-theme-01";
export const individualAdminPath = "/plano-individual";
const maxFormBytes = 12_288;
const contentHeaders = type => ({
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
});

function html(body, { status = 200, head = false } = {}) {
    const headers = contentHeaders("text/html; charset=utf-8");
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'self'; img-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
    return new Response(head ? null : body, { status, headers });
}

async function readConsultationForm(request) {
    if (!request.headers.get("content-type")?.split(";")[0].trim().toLowerCase().match(/^application\/x-www-form-urlencoded$/))
        throw new ConsultationError("Formato inválido. Volte ao formulário e tente novamente.", 415);
    const reader = request.body?.getReader();
    if (!reader) return new URLSearchParams();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let text = "";
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxFormBytes) {
                await reader.cancel();
                throw new RangeError("Solicitação muito grande.");
            }
            text += decoder.decode(value, { stream: true });
        }
        return new URLSearchParams(text + decoder.decode());
    } finally {
        reader.releaseLock();
    }
}

async function consult(request, services) {
    let draft = {};
    try {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin)
            throw new ConsultationError("Abra o formulário do Water System e tente novamente.", 403);
        const body = await readConsultationForm(request);
        draft = bookingDraft(body);
        const record = validateBooking(body);
        await saveConsultation(request, record, services);
        return html(individualPage({ scheduled: record.meeting_at }), { status: 201 });
    } catch (cause) {
        let error;
        if (cause instanceof ConsultationError) error = cause;
        else if (cause instanceof RangeError) error = new ConsultationError("A solicitação é muito grande. Reduza a observação e tente novamente.", 413);
        else if (cause?.status === 429) error = new ConsultationError("Muitas solicitações recentes. Aguarde um pouco e tente novamente.", 429);
        else error = new ConsultationError("Não conseguimos registrar sua solicitação agora. Tente novamente.", 503);
        if (error.status === 409) draft.id = crypto.randomUUID();
        return html(individualPage({ draft, error }), { status: error.status });
    }
}

function alteredHeaders(response) {
    const headers = new Headers(response.headers);
    for (const key of ["content-length", "content-encoding", "etag", "last-modified"]) headers.delete(key);
    return headers;
}

function rewriteAssetReferences(source, paths) {
    for (const path of paths) {
        const filename = path.slice(path.lastIndexOf("/") + 1);
        const pattern = new RegExp(filename.replaceAll(".", "\\.") + "(?:\\?(?:fama-plan|individual)=[-\\w.]+)?", "g");
        source = source.replaceAll(pattern, filename + "?individual=" + pricingAssetRevision);
    }
    return source;
}

function asset(body, head, type, immutable = false) {
    const headers = contentHeaders(type);
    if (immutable) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    return new Response(head ? null : body, { headers });
}

export function withIndividualPlan(app, role, resources, bookingServices = {}) {
    const browserAssets = resources.browser ?? {};
    const importers = resources.importers ?? [];
    const rewritePaths = [...Object.keys(browserAssets), ...importers];
    return {
        ...app,
        async fetch(request, env, context) {
            const url = new URL(request.url);
            const path = url.pathname.replace(/\/$/, "") || "/";
            const head = request.method === "HEAD";
            const readable = request.method === "GET" || head;
            const system = role === "system";
            if (readable && path === individualStylesheet)
                return asset(resources.css, head, "text/css; charset=utf-8", true);
            if (readable && system && Object.hasOwn(browserAssets, path)) {
                const revision = url.searchParams.get("individual");
                return asset(browserAssets[path], head, "application/javascript; charset=utf-8", revision === pricingAssetRevision);
            }
            if (system && path === "/assinar/individual" && readable)
                return new Response(null, { status: 302, headers: { Location: "/plano-individual", "Cache-Control": "no-store" } });
            if (system && readable && path === bookingPublicClient)
                return asset(resources.bookingClient, head, "application/javascript; charset=utf-8", true);
            if (system && path === bookingPath) {
                if (readable) return html(individualPage(), { head });
                if (request.method === "POST") return consult(request, bookingServices);
                return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
            }
            if (!system && readable && (path === individualAdminPath || path === consultationAgendaPath)) {
                const response = html(path === consultationAgendaPath ? individualAgendaPage() : individualControlPage(), { head });
                response.headers.set("X-Robots-Tag", "noindex, nofollow");
                return response;
            }
            if (!system && readable && path === individualControlClient)
                return asset(resources.adminClient, head, "application/javascript; charset=utf-8", true);

            const response = await app.fetch(request, env, context);
            if (request.method !== "GET" || !response.ok) return response;
            const contentType = response.headers.get("content-type") ?? "";
            if (path === "/api/health" && contentType.includes("application/json")) {
                const body = await response.json();
                return Response.json({ ...body, version: releaseVersion, releaseId, release: releaseId }, { headers: alteredHeaders(response) });
            }
            if (system && path === "/api/public/plans" && contentType.includes("application/json")) {
                const body = await response.json();
                if (body.plans && !Array.isArray(body.plans)) body.plans.individual = individualPlan;
                return Response.json(body, { headers: alteredHeaders(response) });
            }
            if (system && (contentType.includes("text/html") || contentType.includes("text/x-component") || importers.includes(path) && contentType.includes("javascript"))) {
                let body = rewriteAssetReferences(await response.text(), rewritePaths);
                if ((path === "/" || path === "/planos") && contentType.includes("text/html") && body.includes("individual-plan-card"))
                    body = body.replace("</head>", `<link rel="stylesheet" href="${individualStylesheet}"></head>`);
                return new Response(body, { status: response.status, headers: alteredHeaders(response) });
            }
            if (!system && path === "/" && contentType.includes("text/html") && resources.adminLink)
                return new HTMLRewriter().on("head", {
                    element(head) { head.append(`<script type="module" src="${individualControlClient}"></script>`, { html: true }); },
                }).transform(response);
            return response;
        },
    };
}

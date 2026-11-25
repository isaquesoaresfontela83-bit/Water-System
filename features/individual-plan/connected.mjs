import { updatePricingView, pricingServerModule } from "./patch-pricing.mjs";
import { patchTenant, patchFeatureGate, patchSystemServer, patchControlServer, patchBillingView, systemTenant, systemCatalog, systemSsrFeatures, systemSsrBilling } from "./patch-platform.mjs";

const individualBaseline = {
    system: {
        entry: "water-quote-main.mjs", version: "6d6d675c-fd32-4a32-991e-24dc9954d441",
        hash: "6e204d33aad4ce143e591baadeb185d710b16e74bd48dafce644f1f926a08af8", modules: 146, bindings: 41,
    },
    control: {
        entry: "water-brand-main.mjs", version: "20d1d0f8-69f4-4023-8645-3c14b8dc0d15",
        hash: "b907b67861fad46e0e10bfabef3c4c3b108b2bfc237ee8d642d9c25b6b2f380c", modules: 77, bindings: 29,
    },
};
const individualMain = "water-individual-main.mjs";
const individualModuleNames = [
    "water-individual-catalog.mjs", "water-individual-page.mjs", "water-individual-pricing.mjs",
    "water-individual-company.mjs", "water-individual-worker.mjs",
];
export const individualEncoder = new TextEncoder();
export const individualDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const individualPath = (account, role) => `/accounts/${account}/workers/scripts/fama-${role}-app`;

export function buildIndividualEntry(role, resources) {
    const original = JSON.stringify("./" + individualBaseline[role].entry);
    return [
        `import app from ${original};`,
        `export * from ${original};`,
        'import {withIndividualPlan} from "./water-individual-worker.mjs";',
        `export default withIndividualPlan(app,${JSON.stringify(role)},${JSON.stringify(resources)});`,
    ].join("\n");
}

async function individualDigest(bytes) {
    const value = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function individualModules(api, path) {
    const raw = await api.request({ method: "GET", path });
    const head = typeof raw === "string" ? raw.slice(0, 512) : individualDecoder.decode(raw.slice(0, 512));
    const boundary = head.split("\r\n")[0];
    if (!boundary.startsWith("--") || typeof raw === "string" && raw.includes("\ufffd"))
        throw new Error("O conteúdo ativo não chegou inteiro.");
    const form = await new Response(raw, { headers: { "Content-Type": "multipart/form-data; boundary=" + boundary.slice(2) } }).formData();
    const parts = new Map();
    for (const [name, value] of form) {
        if (name === "metadata") continue;
        if (parts.has(name)) throw new Error("Módulo duplicado: " + name);
        const text = typeof value === "string";
        parts.set(name, {
            bytes: text ? individualEncoder.encode(value) : new Uint8Array(await value.arrayBuffer()),
            type: text ? "application/javascript+module" : value.type || "application/javascript+module",
        });
    }
    return parts;
}

export async function individualFingerprint(parts) {
    const entries = await Promise.all([...parts].map(async ([name, { bytes }]) => [name, await individualDigest(bytes)]));
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return individualDigest(individualEncoder.encode(JSON.stringify(entries)));
}

export async function individualActive(api, path) {
    const response = await api.request({ method: "GET", path: path + "/deployments", query: { per_page: 1 } });
    const deployment = response.result.deployments?.[0];
    if (deployment?.versions?.length !== 1 || deployment.versions[0].percentage !== 100)
        throw new Error("Existe uma publicação concorrente ou gradual.");
    return { id: deployment.id, version: deployment.versions[0].version_id };
}

export async function prepareIndividualWorker(api, account, role, sources, upload = false) {
    const previous = individualBaseline[role];
    if (!previous) throw new Error("Aplicação inválida.");
    const path = individualPath(account, role);
    const [active, latest, settings, parts] = await Promise.all([
        individualActive(api, path),
        api.request({ method: "GET", path: path + "/versions", query: { page: 1, per_page: 1 } }),
        api.request({ method: "GET", path: path + "/settings" }),
        individualModules(api, path),
    ]);
    const configuration = settings.result;
    if (active.version !== previous.version || latest.result.items?.[0]?.id !== active.version
        || configuration.bindings.length !== previous.bindings || parts.size !== previous.modules
        || await individualFingerprint(parts) !== previous.hash) {
        throw new Error("A versão ativa do " + role + " mudou. Recupere a base atual para validar novamente.");
    }
    const changes = role === "system" ? {
        "index.js": patchSystemServer,
        [systemTenant]: patchTenant,
        [systemCatalog]: patchFeatureGate,
        [systemSsrFeatures]: patchFeatureGate,
        [systemSsrBilling]: patchBillingView,
        [pricingServerModule]: updatePricingView,
    } : { "index.js": patchControlServer };
    for (const [name, patch] of Object.entries(changes)) {
        const part = parts.get(name);
        if (!part || typeof patch !== "function") throw new Error("Módulo ausente: " + name);
        const body = patch(individualDecoder.decode(part.bytes));
        parts.set(name, { ...part, bytes: individualEncoder.encode(body) });
    }
    for (const name of individualModuleNames) {
        if (parts.has(name) || typeof sources.modules[name] !== "string") throw new Error("Módulo novo inválido: " + name);
        parts.set(name, { type: "application/javascript+module", bytes: individualEncoder.encode(sources.modules[name]) });
    }
    const entry = buildIndividualEntry(role, sources.resources);
    parts.set(individualMain, { type: "application/javascript+module", bytes: individualEncoder.encode(entry) });
    const hash = await individualFingerprint(parts);
    const result = {
        role, previous: active.version, previousDeployment: active.id, hash, modules: parts.size,
        inheritedBindings: configuration.bindings.length, changes: Object.keys(changes),
    };
    if (!upload) return result;

    const versionId = await uploadIndividualVersion(api, path, parts, configuration, active.version, "15.23.37", "Plano Individual");
    return { ...result, versionId };
}

export async function uploadIndividualVersion(api, path, parts, configuration, previousVersion, version, message) {
    if ((await individualActive(api, path)).version !== previousVersion) throw new Error("A versão ativa mudou durante o preparo.");
    const metadata = {
        main_module: individualMain,
        keep_assets: true,
        bindings: configuration.bindings.map(({ name }) => ({ name, type: "inherit" })),
        annotations: { "workers/tag": version, "workers/message": message },
    };
    for (const key of ["compatibility_date", "compatibility_flags", "observability", "usage_model", "logpush", "tail_consumers", "tags", "placement", "limits"]) {
        if (configuration[key] !== undefined) metadata[key] = configuration[key];
    }
    if (configuration.assets?.config) metadata.assets = { config: configuration.assets.config };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    for (const [name, { bytes, type }] of parts) form.append(name, new Blob([bytes], { type }), name);
    const saved = await api.request({ method: "POST", path: path + "/versions", query: { bindings_inherit: "strict" }, body: form });
    if (!saved.result?.id || saved.result.id === previousVersion) throw new Error("A versão nova não foi confirmada.");
    return saved.result.id;
}

async function individualDeploy(api, path, version) {
    await api.request({
        method: "POST", path: path + "/deployments",
        body: { strategy: "percentage", versions: [{ version_id: version, percentage: 100 }] },
    });
    const current = await individualActive(api, path);
    if (current.version !== version) throw new Error("A reconsulta não confirmou a publicação.");
    return current;
}

export async function rollbackIndividualWorkers(api, account, staged) {
    const result = {};
    for (const role of ["control", "system"]) {
        const path = individualPath(account, role);
        try {
            const active = await individualActive(api, path);
            result[role] = active.version === staged[role].versionId
                ? await individualDeploy(api, path, staged[role].previous) : active;
        } catch (error) {
            result[role] = { error: String(error) };
        }
    }
    return result;
}

export async function activateIndividualWorkers(api, account, staged, baseline = individualBaseline) {
    for (const role of ["system", "control"]) {
        const path = individualPath(account, role);
        const next = staged[role];
        if (next.previous !== baseline[role].version || (await individualActive(api, path)).version !== next.previous)
            throw new Error("A produção mudou antes da publicação.");
        const saved = await api.request({ method: "GET", path: path + "/versions/" + next.versionId });
        if (saved.result?.id !== next.versionId) throw new Error("O pacote preparado não está disponível.");
    }
    const active = {};
    try {
        for (const role of ["system", "control"]) {
            const path = individualPath(account, role);
            if ((await individualActive(api, path)).version !== staged[role].previous)
                throw new Error("Outra publicação alterou a produção.");
            active[role] = await individualDeploy(api, path, staged[role].versionId);
            const [parts, settings] = await Promise.all([individualModules(api, path), api.request({ method: "GET", path: path + "/settings" })]);
            if (await individualFingerprint(parts) !== staged[role].hash || settings.result.bindings.length !== staged[role].inheritedBindings)
                throw new Error("A versão ativa não confere com o pacote preparado.");
        }
        return { success: true, active };
    } catch (error) {
        return { success: false, error: String(error), rollback: await rollbackIndividualWorkers(api, account, staged) };
    }
}

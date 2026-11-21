const staticDatabase = "a02259e9-97ff-4cba-8deb-568b7e584067";
const baseline = {
    system: { version: "f62876d1-7f13-4def-a23d-de4968390205", hash: "c5940a41a106f37f9c16db7588800e6267d27ac984f9ab74349935efe7d14041", modules: 144, bindings: 41 },
    control: { version: "02ef13ed-7fa5-4345-b5be-12571ff726ca", hash: "e33376f13874a5302ce3812ae8aa4c1012dd7dedd4ac4c9dd9a23fe615dee5e1", modules: 77, bindings: 29 },
};
const roles = Object.keys(baseline);
const encode = (value) => new TextEncoder().encode(value);
const decode = (value) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
const sha256 = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
function toBase64(bytes) {
    let text = "";
    for (let start = 0; start < bytes.length; start += 8000)
        text += String.fromCharCode(...bytes.subarray(start, start + 8000));
    return btoa(text);
}
const versionPath = (account, role) => `/accounts/${account}/workers/scripts/fama-${role}-app`;
const staticPath = (account) => `/accounts/${account}/d1/database/${staticDatabase}/query`;

async function request(api, options) {
    const result = await api.request(options);
    if (result?.success === false) throw new Error(`Cloudflare rejeitou ${options.method} ${options.path}.`);
    return result;
}
async function query(api, account, sql, params = []) {
    const response = await request(api, { method: "POST", path: staticPath(account), body: { sql, params } });
    const result = response.result?.[0];
    if (!result?.success) throw new Error("A operação na base de arquivos estáticos falhou.");
    return result.results;
}
async function active(api, path) {
    const response = await request(api, { method: "GET", path: path + "/deployments" });
    const deployment = response.result.deployments[0];
    const versions = deployment?.versions;
    if (versions?.length !== 1 || versions[0].percentage !== 100) throw new Error("A versão ativa mudou.");
    return { id: deployment.id, version: versions[0].version_id };
}
async function settings(api, path) {
    const response = await request(api, { method: "GET", path: path + "/settings" });
    return response.result;
}
async function modules(api, path) {
    const raw = await request(api, { method: "GET", path });
    const prefix = typeof raw === "string" ? raw.slice(0, 512) : decode(raw.slice(0, 512));
    const boundary = prefix.split("\r\n")[0];
    if (!boundary.startsWith("--") || (typeof raw === "string" && raw.includes("\ufffd")))
        throw new Error("A cópia da versão ativa chegou incompleta.");
    const form = await new Response(raw, { headers: { "Content-Type": "multipart/form-data; boundary=" + boundary.slice(2) } }).formData();
    const parts = new Map();
    for (const [name, value] of form) {
        if (name === "metadata") continue;
        if (parts.has(name)) throw new Error("Módulo duplicado na versão ativa.");
        const isText = typeof value === "string";
        const bytes = isText ? encode(value) : new Uint8Array(await value.arrayBuffer());
        if (isText && !/\.(?:mjs|js)$/.test(name)) throw new Error("Arquivo binário recebido como texto.");
        parts.set(name, { name, bytes, type: isText ? "application/javascript+module" : value.type || "application/javascript+module" });
    }
    return parts;
}
async function fingerprint(parts) {
    const entries = await Promise.all([...parts.values()].map(async ({ name, bytes }) => [name, await sha256(bytes)]));
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return sha256(encode(JSON.stringify(entries)));
}
function validateAsset(asset) {
    if (!/^\/assets\/(?:water-quote|cloriva-app-water-quote|registration-lookup-water-quote)-15\.23\.33\.(?:js|css)$/.test(asset.path)
        || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 1_000_000
        || asset.mime !== (asset.path.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8"))
        throw new Error("Arquivo de interface inválido.");
}
async function verifyAsset(api, account, asset) {
    validateAsset(asset);
    const [row] = await query(api, account,
        "SELECT body_base64, content_type, sha256 FROM static_assets WHERE app = ? AND path = ?", ["system", asset.path]);
    if (!row) return false;
    const bytes = fromBase64(row.body_base64);
    if (row.content_type !== asset.mime || row.sha256 !== asset.sha256 || bytes.length !== asset.bytes || await sha256(bytes) !== asset.sha256)
        throw new Error("O arquivo de interface já existe com outro conteúdo.");
    return true;
}

export async function stageAssetPart(api, account, asset, number, data) {
    validateAsset(asset);
    if (!Number.isInteger(number) || number < 0 || data.length > 56000 || !/^[A-Za-z0-9+/=]+$/.test(data))
        throw new Error("Parte inválida.");
    await query(api, account,
        "INSERT INTO static_asset_parts(app,path,sha256,part_no,body_base64) VALUES (?,?,?,?,?) ON CONFLICT(app,path,sha256,part_no) DO UPDATE SET body_base64=excluded.body_base64",
        ["system", asset.path, asset.sha256, String(number), data]);
    return { path: asset.path, part: number };
}

export async function finalizeAsset(api, account, asset, partCount) {
    if (!await verifyAsset(api, account, asset)) {
        const rows = await query(api, account,
            "SELECT part_no,body_base64 FROM static_asset_parts WHERE app = ? AND path = ? AND sha256 = ? ORDER BY part_no",
            ["system", asset.path, asset.sha256]);
        if (rows.length !== partCount || rows.some((row, index) => row.part_no !== index)) throw new Error("Faltam partes do arquivo.");
        const compressed = fromBase64(rows.map((row) => row.body_base64).join(""));
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        if (bytes.length !== asset.bytes || await sha256(bytes) !== asset.sha256) throw new Error("O arquivo enviado não confere com o manifesto.");
        await query(api, account,
            "INSERT INTO static_assets(app,path,body_base64,content_type,sha256) VALUES (?,?,?,?,?) ON CONFLICT(app,path) DO NOTHING",
            ["system", asset.path, toBase64(bytes), asset.mime, asset.sha256]);
        if (!await verifyAsset(api, account, asset)) throw new Error("O arquivo completo não pôde ser confirmado.");
    }
    await query(api, account, "DELETE FROM static_asset_parts WHERE app = ? AND path = ? AND sha256 = ?",
        ["system", asset.path, asset.sha256]);
    return { path: asset.path, bytes: asset.bytes, sha256: asset.sha256 };
}

function newModule(name, code) {
    return { name, bytes: encode(code), type: "application/javascript+module" };
}

export async function prepareWorker(api, account, role, plan, serve, upload = false) {
    if (!roles.includes(role) || plan.version !== "15.23.33") throw new Error("Destino do lançamento inválido.");
    const path = versionPath(account, role);
    const [current, configuration, parts, available] = await Promise.all([
        active(api, path), settings(api, path), modules(api, path),
        request(api, { method: "GET", path: path + "/versions", query: { page: 1, per_page: 1 } }),
    ]);
    const previous = baseline[role];
    if (current.version !== previous.version || available.result.items?.[0]?.id !== current.version
        || parts.size !== previous.modules || await fingerprint(parts) !== previous.hash
        || configuration.bindings.length !== previous.bindings)
        throw new Error(`A base de produção de ${role} mudou. Revise o pacote antes de publicar.`);
    const changed = Object.entries(plan.serverPatches[role]);
    for (const [name, patch] of changed) {
        const part = parts.get(name);
        if (!part || await sha256(part.bytes) !== patch.originalSha256) throw new Error("Módulo diferente da base: " + name);
        let body = decode(part.bytes);
        let boundary = body.length;
        for (const { start, end, text } of patch.edits) {
            if (start < 0 || end < start || end > boundary) throw new Error("Edição fora do módulo: " + name);
            body = body.slice(0, start) + text + body.slice(end);
            boundary = start;
        }
        const bytes = encode(body);
        if (await sha256(bytes) !== patch.sha256) throw new Error("O módulo preparado não confere: " + name);
        parts.set(name, { ...part, bytes });
    }
    let main = "water-brand-main.mjs";
    if (role === "system") {
        const assets = Object.fromEntries(plan.publicAssets.map(({ path, bytes, sha256, mime }) => [path, { bytes, sha256, mime }]));
        for (const asset of plan.publicAssets) validateAsset(asset);
        main = "water-quote-main.mjs";
        const entry = `import app from "./water-brand-main.mjs";
export * from "./water-brand-main.mjs";
import { withQuoteAssets } from "./water-quote-assets.mjs";
export default withQuoteAssets(app, ${JSON.stringify(assets)});
`;
        parts.set(main, newModule(main, entry));
        parts.set("water-quote-assets.mjs", newModule("water-quote-assets.mjs", serve));
        if (upload) {
            const verified = await Promise.all(plan.publicAssets.map((asset) => verifyAsset(api, account, asset)));
            if (verified.some((exists) => !exists)) throw new Error("Os arquivos de interface precisam estar completos antes do envio dos Workers.");
        }
    }
    const hash = await fingerprint(parts);
    const result = { role, previous: current.version, previousDeployment: current.id, hash, modules: parts.size, changed: changed.map(([name]) => name) };
    if (!upload) return result;

    if ((await active(api, path)).version !== current.version) throw new Error("A ativação concorrente alterou o Worker.");
    const metadata = { main_module: main, keep_assets: true,
        bindings: configuration.bindings.map(({ name }) => ({ name, type: "inherit" })),
        annotations: { "workers/tag": plan.version, "workers/message": "Orçamentos com fotos e resumo ao vivo sobre a produção 15.23.32" },
    };
    for (const key of ["compatibility_date", "compatibility_flags", "observability", "usage_model", "logpush", "tail_consumers", "tags", "placement", "limits"]) {
        if (configuration[key] !== undefined) metadata[key] = configuration[key];
    }
    if (configuration.assets?.config) metadata.assets = { config: configuration.assets.config };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    for (const part of parts.values()) form.append(part.name, new Blob([part.bytes], { type: part.type }), part.name);
    const response = await request(api, { method: "POST", path: path + "/versions", query: { bindings_inherit: "strict" }, body: form });
    const id = response.result?.id;
    if (!id || id === current.version) throw new Error("O novo Worker não recebeu um identificador de versão.");
    return { ...result, versionId: id };
}

async function setActive(api, path, version) {
    await request(api, { method: "POST", path: path + "/deployments",
        body: { strategy: "percentage", versions: [{ version_id: version, percentage: 100 }] },
    });
    const now = await active(api, path);
    if (now.version !== version) throw new Error("A Cloudflare ainda não confirmou a nova versão.");
    return now;
}

export async function rollbackWorkers(api, account, staged) {
    const result = [];
    for (const role of [...roles].reverse()) {
        const path = versionPath(account, role);
        try {
            const current = await active(api, path);
            if (current.version === staged[role].versionId) {
                const state = await setActive(api, path, baseline[role].version);
                result.push({ role, state });
            } else result.push({ role, state: current, alreadyRestored: current.version === baseline[role].version });
        } catch (error) { result.push({ role, error: String(error) }); }
    }
    return result;
}

export async function activateWorkers(api, account, staged) {
    for (const role of roles) {
        const path = versionPath(account, role);
        const before = baseline[role];
        if (!staged[role].versionId || staged[role].previous !== before.version || (await active(api, path)).version !== before.version)
            throw new Error("A produção mudou depois da preparação dos Workers.");
        const version = await request(api, { method: "GET", path: path + "/versions/" + staged[role].versionId });
        if (version.result?.id !== staged[role].versionId) throw new Error("O pacote preparado não está disponível.");
    }
    const applied = {};
    try {
        for (const role of roles) {
            const path = versionPath(account, role);
            if ((await active(api, path)).version !== baseline[role].version) throw new Error("Outra publicação alterou a produção.");
            const now = await setActive(api, path, staged[role].versionId);
            const [parts, configuration] = await Promise.all([modules(api, path), settings(api, path)]);
            if (await fingerprint(parts) !== staged[role].hash || configuration.bindings.length !== baseline[role].bindings)
                throw new Error(`O pacote ativo de ${role} não corresponde ao arquivo preparado.`);
            applied[role] = now;
        }
        return { success: true, applied };
    } catch (error) {
        return { success: false, error: String(error), rollback: await rollbackWorkers(api, account, staged) };
    }
}

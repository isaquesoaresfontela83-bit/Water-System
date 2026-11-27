import { individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "../individual-plan/connected.mjs";
import { homeWidgetAsset, replaceOne } from "./patch.mjs";

export const homeWidgetsBaseline = {
    system: { version: "afe0b76c-9f85-4298-baed-fd25a1525a22", hash: "b3cf85d897ac99015aba4dd9f455dc86f1a33e120fc703d375f664fb8e698d02", modules: 163, bindings: 41 },
    control: { version: "2b9f2120-2c2f-4237-a144-3eb1ac6e5676", hash: "b0e194df9dc8c5231bb581027df7d0e83f608077a12646389a1f92c85ae17ce7", modules: 85, bindings: 29 },
};

export async function prepareHomeWidgets(api, account, role, modules, upload = false) {
    const baseline = homeWidgetsBaseline[role];
    const path = individualPath(account, role);
    const [active, settings, parts] = await Promise.all([
        individualActive(api, path), api.request({ method: "GET", path: path + "/settings" }), individualModules(api, path),
    ]);
    const config = settings.result;
    if (active.version !== baseline.version || parts.size !== baseline.modules ||
        config.bindings.length !== baseline.bindings || await individualFingerprint(parts) !== baseline.hash)
        throw new Error("A base publicada mudou. Confira os dois Workers antes de continuar.");

    const read = name => individualDecoder.decode(parts.get(name).bytes);
    const releaseModule = "water-individual-worker.mjs";
    const versionSource = read(releaseModule)
        .replaceAll("2026-11-27-water-widget-gallery-01", "2026-11-27-water-widget-live-01")
        .replaceAll("15.23.44", "15.23.45");
    if (versionSource === read(releaseModule)) throw new Error("Identificador da versão ativa não encontrado.");
    const changes = new Map([[releaseModule, versionSource]]);

    if (role === "system") {
        const previousAsset = "assets/cloriva-app-widget-gallery-15.23.44.js";
        for (const name of ["__vite_rsc_assets_manifest.js", "ssr/__vite_rsc_assets_manifest.js", "water-quote-assets.mjs", "index.js"])
            changes.set(name, replaceOne(read(name), previousAsset, homeWidgetAsset.slice(1)));
        for (const [name, code] of Object.entries(modules)) changes.set(name, code);
    }
    for (const [name, body] of changes)
        parts.set(name, { type: parts.get(name)?.type ?? "application/javascript+module", bytes: individualEncoder.encode(body) });

    const result = {
        role, previous: active.version, hash: await individualFingerprint(parts),
        inheritedBindings: baseline.bindings, changes: [...changes.keys()],
    };
    if (!upload) return result;
    const versionId = await uploadIndividualVersion(api, path, parts, config, active.version, "15.23.45", "Troca de widgets em tempo real");
    return { ...result, versionId };
}

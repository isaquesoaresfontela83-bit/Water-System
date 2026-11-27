import { individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "../individual-plan/connected.mjs";
import { homeWidgetAsset, replaceOne } from "./patch.mjs";

export const homeWidgetsBaseline = {
    system: { version: "8900e76f-c412-4080-9cca-c9fda8b89321", hash: "058318af485e4e57418b547ec7fefb34bcb8b1e1b02d70a81505b2c6ca03254b", modules: 162, bindings: 41 },
    control: { version: "4ad9c1a9-3db2-41bc-812c-5e999c817c49", hash: "287172aaf1582f54f88812abce6d5a2e260e820722df4a09b24af924d6b88d9f", modules: 85, bindings: 29 },
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
        .replaceAll("2026-11-27-water-widget-studio-01", "2026-11-27-water-widget-gallery-01")
        .replaceAll("15.23.43", "15.23.44");
    if (versionSource === read(releaseModule)) throw new Error("Identificador da versão ativa não encontrado.");
    const changes = new Map([[releaseModule, versionSource]]);

    if (role === "system") {
        const previousAsset = "assets/cloriva-app-widget-studio-15.23.43.js";
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
    const versionId = await uploadIndividualVersion(api, path, parts, config, active.version, "15.23.44", "Galeria de widgets por categoria");
    return { ...result, versionId };
}

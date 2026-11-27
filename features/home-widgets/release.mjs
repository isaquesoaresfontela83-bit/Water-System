import { individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "../individual-plan/connected.mjs";
import { homeWidgetAsset, replaceOne } from "./patch.mjs";

export const homeWidgetsBaseline = {
    system: { version: "d6a60a2a-73bd-46c3-9926-fd359bad5a56", hash: "4ea66173df7f2a5e3a9f913d14f96052320cf2d29699c4969575a0a64cc230c7", modules: 162, bindings: 41 },
    control: { version: "9f5c3992-962c-4338-9f81-874be18d3282", hash: "0327a724dd0e76f3cf23e97712adc7181c534e3aafed1c6c0011dbd1b1dfa3d0", modules: 85, bindings: 29 },
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
        .replaceAll("2026-11-27-water-home-widgets-01", "2026-11-27-water-widget-studio-01")
        .replaceAll("15.23.42", "15.23.43");
    if (versionSource === read(releaseModule)) throw new Error("Identificador da versão ativa não encontrado.");
    const changes = new Map([[releaseModule, versionSource]]);

    if (role === "system") {
        const previousAsset = "assets/cloriva-app-home-widgets-15.23.42.js";
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
    const versionId = await uploadIndividualVersion(api, path, parts, config, active.version, "15.23.43", "Editor visual de widgets");
    return { ...result, versionId };
}

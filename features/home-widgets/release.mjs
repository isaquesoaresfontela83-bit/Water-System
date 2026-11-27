import { individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "../individual-plan/connected.mjs";
import { homeWidgetAsset, mountHomeWidgetsRoute, originalHomeAsset, replaceOne } from "./patch.mjs";

export const homeWidgetsBaseline = {
    system: { version: "abaf199c-028a-4f1e-a62b-b2b92cc12d94", hash: "95ebf952ee466f39db2f92878540193981923a347d2fe3c52988ef943e62e90c", modules: 157, bindings: 41 },
    control: { version: "ebaee1fe-36c3-457e-9b95-3dd4077f70ff", hash: "8722445452828f3897a0ce2cb658254d68388305e6c295f56427aba8981ab49f", modules: 85, bindings: 29 },
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
    const changes = new Map();
    for (const [name, part] of parts) {
        if (!/\.[cm]?js$/.test(name)) continue;
        const source = individualDecoder.decode(part.bytes);
        const updated = source
            .replaceAll("2026-11-25-water-sefin-national-02", "2026-11-27-water-home-widgets-01")
            .replaceAll("15.23.41", "15.23.42");
        if (updated !== source) changes.set(name, updated);
    }
    if (!changes.size) throw new Error("Identificador da versão ativa não encontrado.");

    if (role === "system") {
        const rewrite = source => replaceOne(source, originalHomeAsset.slice(1), homeWidgetAsset.slice(1));
        for (const name of ["__vite_rsc_assets_manifest.js", "ssr/__vite_rsc_assets_manifest.js", "water-quote-assets.mjs", "index.js"])
            changes.set(name, rewrite(changes.get(name) ?? read(name)));
        changes.set("index.js", mountHomeWidgetsRoute(changes.get("index.js")));
        const entry = "water-individual-main.mjs";
        changes.set(entry, 'import{withHomeWidgets}from"./water-home-widgets-worker.mjs";\n' +
            replaceOne(changes.get(entry) ?? read(entry), 'export default withSefinWorker(beforeSefin,"system");',
                'export default withHomeWidgets(withSefinWorker(beforeSefin,"system"));'));
        for (const [name, code] of Object.entries(modules)) changes.set(name, code);
    }
    for (const [name, body] of changes)
        parts.set(name, { type: parts.get(name)?.type ?? "application/javascript+module", bytes: individualEncoder.encode(body) });

    const result = {
        role, previous: active.version, hash: await individualFingerprint(parts),
        inheritedBindings: baseline.bindings, changes: [...changes.keys()],
    };
    if (!upload) return result;
    const versionId = await uploadIndividualVersion(api, path, parts, config, active.version, "15.23.42", "Widgets da página inicial");
    return { ...result, versionId };
}

import { activateIndividualWorkers, individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "./connected.mjs";

const bookingBaseline = {
    system: { version: "42fddaf4-4ed9-416e-b029-736b5f1c56b1", hash: "51cb4c7305ad173c560436f32bf7a0853b26e70984333d27a88d61d8690adca5", modules: 152, bindings: 41 },
    control: { version: "9512425f-09c1-4d4e-99cd-84f81b9246de", hash: "61a42773eacf762dea6a65d0536e812537337d61df1f13697bceb43be91e01da", modules: 83, bindings: 29 },
};
const bookingThemeBaseline = {
    system: { version: "b24d33af-96f7-45b5-83a4-b85dd3c2ac23", hash: "b38c40bf299a88270115c76b44a947cad3ea169ed2e2163bd14266a187fd102a", modules: 153, bindings: 41 },
    control: { version: "b4cf872e-1816-4a06-851d-c163a468eb1f", hash: "392e127621f442e6c4c42d4479a343aa80764cd9bd9d426edf648fffda658bc5", modules: 84, bindings: 29 },
};
const bookingEntry = "water-individual-main.mjs";

function changeBookingSource(source, from, to) {
    const at = source.indexOf(from);
    if (at < 0 || source.indexOf(from, at + from.length) >= 0)
        throw new Error("Trecho da produção não identificado: " + from.slice(0, 80));
    return source.slice(0, at) + to + source.slice(at + from.length);
}

function routeArrayEnd(source, start) {
    let depth = 0;
    let quote = "";
    for (let cursor = start; cursor < source.length; cursor++) {
        const character = source[cursor];
        if (quote) {
            if (character === "\\") cursor++;
            else if (character === quote) quote = "";
        } else if (character === '"' || character === "'" || character.charCodeAt(0) === 96) {
            quote = character;
        } else if (character === "[") depth++;
        else if (character === "]" && --depth === 0) return cursor;
    }
    return -1;
}

export function updateBookingEntry(source, role, bundle) {
    const original = /export default withIndividualPlan\(app,"(system|control)",([\s\S]+)\);\s*$/.exec(source);
    if (!original || original[1] !== role) throw new Error("A entrada ativa do Individual mudou.");
    const services = role === "system" ? ',{callRpc:waterBookingRpc,assertRateLimit:waterBookingLimit}' : "";
    const alreadyWired = Boolean(services && original[2].endsWith(services));
    const current = JSON.parse(alreadyWired ? original[2].slice(0, -services.length) : original[2]);
    const imports = role === "system" && !alreadyWired ? [
        'import {r as waterBookingRpc} from "./assets/supabase-D0sLPb1J.js";',
        'import {i as waterBookingLimit} from "./assets/security-DKbrqGr_.js";',
    ].join("\n") + "\n" : "";
    const { adminPage, ...resources } = current;
    return source.slice(0, original.index) + imports +
        `export default withIndividualPlan(app,${JSON.stringify(role)},${JSON.stringify({ ...resources, ...bundle })}${services});\n`;
}

export function addConsultationRoute(source) {
    const target = 'pattern:"/api/admin/organizations",patternParts:["api","admin","organizations"]';
    const at = source.indexOf(target);
    const start = source.lastIndexOf("{__buildTimeClassifications:", at);
    const finish = source.indexOf("},{__buildTimeClassifications:", at);
    const manifest = source.indexOf("var Bc=[");
    const manifestEnd = manifest < 0 ? -1 : routeArrayEnd(source, manifest + "var Bc=".length);
    const routeFactory = /\bST=([\w$]+)\(\{GET:\(\)=>Wp,POST:/.exec(source)?.[1];
    if (at < 0 || start < manifest || finish < start || manifestEnd < finish || !routeFactory)
        throw new Error("A lista de rotas do Water Control mudou.");
    const route = source.slice(start, finish + 1)
        .replaceAll("/api/admin/organizations", "/api/admin/individual-consultations")
        .replaceAll('"organizations"', '"individual-consultations"')
        .replace("routeHandler:ST", "routeHandler:waterConsultationRoute");
    if (!route.includes("routeHandler:waterConsultationRoute") || !route.includes('pattern:"/api/admin/individual-consultations"'))
        throw new Error("A rota administrativa não pôde ser preparada.");
    let next = source.slice(0, manifestEnd) + "," + route + source.slice(manifestEnd);
    next = changeBookingSource(next, "var Bc=[", `
        function waterConsultationRequest(request){
            return waterManageConsultations(request,{requireAdmin:ce,isTrustedMutation:be,selectRows:pe,selectOne:ue,updateRows:tt});
        }
        var waterConsultationRoute=${routeFactory}({GET:()=>waterConsultationRequest,PATCH:()=>waterConsultationRequest});
        var Bc=[`);
    next = changeBookingSource(next, 'wx=new Set(["fama_create_branch","fama_material_operation","fama_consume_rate_limit"',
        'wx=new Set(["fama_create_branch","fama_material_operation","fama_consume_rate_limit","water_book_individual_consultation"');
    return 'import{handleConsultationAdmin as waterManageConsultations}from"./water-individual-booking.mjs";\n' + next;
}

export async function prepareBookingWorker(api, account, role, bundle, upload = false, themeOnly = false) {
    const baseline = (themeOnly ? bookingThemeBaseline : bookingBaseline)[role];
    if (!baseline) throw new Error("Aplicação inválida.");
    const path = individualPath(account, role);
    const [active, settings, parts] = await Promise.all([
        individualActive(api, path),
        api.request({ method: "GET", path: path + "/settings" }),
        individualModules(api, path),
    ]);
    const configuration = settings.result;
    if (active.version !== baseline.version || configuration.bindings.length !== baseline.bindings ||
        parts.size !== baseline.modules || await individualFingerprint(parts) !== baseline.hash)
        throw new Error("A produção mudou. Confira a base antes de publicar.");
    const original = name => individualDecoder.decode(parts.get(name).bytes);
    const changes = [
        [bookingEntry, updateBookingEntry(original(bookingEntry), role, bundle[role])],
        ...Object.entries(bundle.modules),
    ];
    if (role === "control" && !themeOnly) changes.push(["index.js", addConsultationRoute(original("index.js"))]);
    for (const [name, content] of changes)
        parts.set(name, { type: parts.get(name)?.type ?? "application/javascript+module", bytes: individualEncoder.encode(content) });
    const result = {
        role, previous: active.version, previousDeployment: active.id,
        hash: await individualFingerprint(parts), modules: parts.size, inheritedBindings: baseline.bindings,
        changes: changes.map(([name]) => name),
    };
    if (!upload) return result;
    const version = themeOnly ? "15.23.39" : "15.23.38";
    const description = themeOnly ? "Visual original do Water System no plano Individual" : "Agendamento de consultoria do plano Individual";
    const versionId = await uploadIndividualVersion(api, path, parts, configuration, active.version, version, description);
    return { ...result, versionId };
}

export function activateBookingWorkers(api, account, staged, themeOnly = false) {
    return activateIndividualWorkers(api, account, staged, themeOnly ? bookingThemeBaseline : bookingBaseline);
}

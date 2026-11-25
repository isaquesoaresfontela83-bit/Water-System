import { activateIndividualWorkers, individualActive, individualDecoder, individualEncoder, individualFingerprint, individualModules, individualPath, uploadIndividualVersion } from "../individual-plan/connected.mjs";
import { updateBookingEntry } from "../individual-plan/booking-release.mjs";
import { updateFiscalCopy } from "./worker.mjs";

const sefinVersion = "15.23.41";
const sefinUiAsset = "/assets/water-sefin-ui-15.23.40.js";
const companyAsset = "/assets/company-settings-panel-Dzoh68dy.js";
const financeAsset = "/assets/finance-workspace-5oFyX2xt.js";
const sefinBaseline = {
    system: { version: "0eec3f93-ed71-4809-a0ba-5d783b3957de", hash: "bbd8fa9ce23633048e059e86d0f456e7bf682c2818ac20e164c546b027eb0815", modules: 153, bindings: 41 },
    control: { version: "5eed063e-a572-4660-93ae-fad788f8bbdf", hash: "5b1dc43e366cdf335f4941ee62a34c8f5790905501eec5772e27f67b4b3ce50c", modules: 84, bindings: 29 },
};
const sefinSessionBaseline = {
    system: { version: "f424303e-d682-4f03-9647-73f8aa982abf", hash: "e654c65182d76112ca5c4daa58e518bba50448e749ed10465f9f3d59ef7065aa", modules: 157, bindings: 41 },
    control: { version: "5f1384f0-9312-454f-93f8-140213cf5841", hash: "2d1ec7418b7ab6f4db881269515c7d7dae8fce3af07624054e070d23ba347f9d", modules: 85, bindings: 29 },
};

function oneFiscalChange(source, original, replacement) {
    const position = source.indexOf(original);
    if (position < 0 || source.indexOf(original, position + original.length) >= 0)
        throw new Error("Trecho fiscal ativo mudou: " + original.slice(0, 80));
    return source.slice(0, position) + replacement + source.slice(position + original.length);
}

function reactSymbol(source) {
    const symbol = /\(0,([\w$]+)\.useState\)/.exec(source)?.[1];
    if (!symbol) throw new Error("Não foi possível identificar o React no módulo fiscal.");
    return symbol;
}

function importSefinUi(server) {
    const target = server ? "../../water-sefin-ui.mjs" : "./" + sefinUiAsset.split("/").pop();
    return 'import{createSefinUi as waterCreateSefinUi}from' + JSON.stringify(target) + ';\n';
}

export function patchFinanceWorkspace(source, server) {
    const financeExport = /export\{([\w$]+) as FinanceWorkspace\};?/.exec(source);
    if (!financeExport) throw new Error("A exportação do Financeiro mudou.");
    const react = reactSymbol(source);
    const { 0: original, 1: previous } = financeExport;
    const wrapper = `
        const {SefinWorkspace:WaterSefinWorkspace}=waterCreateSefinUi(${react});
        function WaterFinanceWorkspace(props){
            if(props.tab==="notas"&&props.invoicesEnabled)
                return ${react}.createElement(WaterSefinWorkspace,{key:props.organizationId,organizationId:props.organizationId});
            return ${react}.createElement(${previous},props);
        }
        export{WaterFinanceWorkspace as FinanceWorkspace};`;
    return importSefinUi(server) + oneFiscalChange(source, original, wrapper);
}

export function patchFiscalSettings(source, server) {
    const start = /([\w$]+)&&\(0,([\w$]+)\.jsxs\)\(([`"])section\3,\{className:\3surface settings-section\3,children:\[.{1,330}Emiss(?:ão|\\xE3o) oficial de nota fiscal/.exec(source);
    if (!start) throw new Error("A seção fiscal das configurações mudou.");
    const [, gate, jsx] = start;
    const section = start.index + start[0].indexOf("(");
    const bound = source.indexOf("}),", start.index);
    if (bound < section) throw new Error("A seção fiscal ficou incompleta.");
    const next = source.slice(0, start.index) + gate + "&&(0," + jsx + ".jsx)(WaterSefinShortcut,{}),false&&" + source.slice(section);
    return importSefinUi(server) + next + "\nconst {SefinSettingsShortcut:WaterSefinShortcut}=waterCreateSefinUi(" + reactSymbol(source) + ");\n";
}

export function mountSefinRoute(source) {
    const anchor = 'pattern:"/api/finance",patternParts:["api","finance"]';
    const at = source.indexOf(anchor);
    const start = source.lastIndexOf("{__buildTimeClassifications:", at);
    const end = source.indexOf("},{__buildTimeClassifications:", at);
    const factory = /\bvar sL=([\w$]+)\(\{GET:\(\)=>cL,/.exec(source)?.[1];
    const manifest = "var Md=[{__buildTimeClassifications:";
    if (at < 0 || start < 0 || end < 0 || !factory || source.indexOf(manifest) < 0 ||
        !source.includes("export function waterFiscalEntry") || source.includes('pattern:"/api/finance/sefin"'))
        throw new Error("A rota ativa de autenticação fiscal mudou.");
    const nativeRoute = source.slice(start, end + 1)
        .replaceAll("/api/finance", "/api/finance/sefin")
        .replaceAll('["api","finance"]', '["api","finance","sefin"]')
        .replace("routeHandler:sL", "routeHandler:waterFiscalRouter");
    if (!nativeRoute.includes("routeHandler:waterFiscalRouter"))
        throw new Error("A rota fiscal não pôde ser ligada à sessão do sistema.");
    const next = source.slice(0, end + 1) + "," + nativeRoute + source.slice(end + 1);
    const routeInitialization = `
        function waterFiscalRoute(request){return waterFiscalEntry(request,waterFiscalEnv);}
        var waterFiscalRouter=${factory}({GET:()=>waterFiscalRoute,POST:()=>waterFiscalRoute});
        `;
    return 'import{env as waterFiscalEnv}from"cloudflare:workers";\n' +
        oneFiscalChange(next, manifest, routeInitialization + manifest);
}

export function patchFiscalServer(source) {
    const action = 'const n=await e.json(),o=q(n.action);t=["fiscalInvoice","registerPortalInvoice",';
    const next = oneFiscalChange(source, action, `
        const n=await e.json(),o=q(n.action);
        if(["fiscalInvoice","registerPortalInvoice","registerPortalCancellation","issueFiscalInvoice","refreshFiscalInvoice","updateFiscalInvoice"].includes(o))
            return Response.json({error:"Abra Notas fiscais para emitir pela SEFIN Nacional."},{status:410});
        t=["fiscalInvoice","registerPortalInvoice",`);
    const clean = oneFiscalChange(next, "c=r[4],l=nL(a?await ri(t.id):Ge);return Response.json({suppliers:",
        'c=r[4],l={provider:"sefin",apiEnabled:false};return Response.json({suppliers:');
    return mountSefinRoute('import{handleSefinRequest as waterSefinHandler}from"./water-sefin-api.mjs";\n' + updateFiscalCopy(clean) + `
        export function waterFiscalEntry(request,env){
            return waterSefinHandler(request,env,{
                requireTenant:ae,
                assertPlanFeature:tt,
                canFinance:ye,
                database:D,
                assertRateLimit:ce,
                RequestError:_
            });
        }\n`);
}

export function prepareSefinEntry(source, role, assets) {
    const marker = "export default withIndividualPlan(";
    const start = source.indexOf(marker);
    if (start < 0) throw new Error("Entrada do Water System não identificada.");
    const config = /export default withIndividualPlan\(app,"system",([\s\S]+),\{callRpc:waterBookingRpc,assertRateLimit:waterBookingLimit\}\);\s*$/.exec(source);
    const resources = role === "system" ? { browser: { ...JSON.parse(config?.[1] || "{}").browser, ...assets } } : {};
    const adjusted = updateBookingEntry(source, role, resources);
    const adapted = oneFiscalChange(adjusted, marker, "const beforeSefin=withIndividualPlan(");
    return 'import{withSefinWorker}from"./water-sefin-worker.mjs";\n' + adapted +
        "export default withSefinWorker(beforeSefin," + JSON.stringify(role) + ");\n";
}

export async function prepareSefinRelease(api, account, role, payload, upload = false) {
    const baseline = sefinBaseline[role];
    if (!baseline) throw new Error("Aplicação fiscal inválida.");
    const path = individualPath(account, role);
    const [current, settings, parts] = await Promise.all([
        individualActive(api, path), api.request({ method: "GET", path: path + "/settings" }), individualModules(api, path),
    ]);
    const config = settings.result;
    if (current.version !== baseline.version || config.bindings.length !== baseline.bindings ||
        parts.size !== baseline.modules || await individualFingerprint(parts) !== baseline.hash)
        throw new Error("A produção mudou. Confira a base antes de publicar a emissão fiscal.");
    const changes = new Map(Object.entries(payload.common));
    const original = name => individualDecoder.decode(parts.get(name).bytes);
    const browser = role === "system" ? {
        [financeAsset]: patchFinanceWorkspace(payload.browser[financeAsset], false),
        [companyAsset]: patchFiscalSettings(payload.browser[companyAsset], false),
        [sefinUiAsset]: payload.system["water-sefin-ui.mjs"],
    } : {};
    changes.set("water-individual-main.mjs", prepareSefinEntry(original("water-individual-main.mjs"), role, browser));
    if (role === "system") {
        for (const [key, value] of Object.entries(payload.system)) changes.set(key, value);
        changes.set("index.js", patchFiscalServer(original("index.js")));
        const workspace = "ssr/assets/finance-workspace-CwnJvkM1.js";
        const settingsPanel = "ssr/assets/company-settings-panel-CTQGlccX.js";
        const catalog = "assets/plan-catalog-BypiXgOX.js";
        changes.set(workspace, patchFinanceWorkspace(original(workspace), true));
        changes.set(settingsPanel, patchFiscalSettings(original(settingsPanel), true));
        changes.set(catalog, updateFiscalCopy(original(catalog)));
    }
    for (const [name, body] of changes)
        parts.set(name, { type: parts.get(name)?.type ?? "application/javascript+module", bytes: individualEncoder.encode(body) });
    const staged = {
        role, previous: current.version, previousDeployment: current.id,
        hash: await individualFingerprint(parts), modules: parts.size, inheritedBindings: baseline.bindings, changes: [...changes.keys()],
    };
    if (!upload) return staged;
    const versionId = await uploadIndividualVersion(api, path, parts, config, current.version, sefinVersion, "Emissão fiscal pela SEFIN Nacional");
    return { ...staged, versionId };
}

export async function prepareSefinSessionRelease(api, account, role, payload, upload = false) {
    const baseline = sefinSessionBaseline[role];
    if (!baseline) throw new Error("Aplicação fiscal inválida.");
    const path = individualPath(account, role);
    const [current, settings, parts] = await Promise.all([
        individualActive(api, path), api.request({ method: "GET", path: path + "/settings" }), individualModules(api, path),
    ]);
    const config = settings.result;
    if (current.version !== baseline.version || config.bindings.length !== baseline.bindings ||
        parts.size !== baseline.modules || await individualFingerprint(parts) !== baseline.hash)
        throw new Error("A publicação fiscal mudou. Confira a base antes de corrigir a sessão.");
    const changes = new Map(Object.entries(payload.common));
    const original = name => individualDecoder.decode(parts.get(name).bytes);
    if (role === "system") {
        const entry = oneFiscalChange(original("water-individual-main.mjs"), 'import{waterFiscalEntry}from"./index.js";\n', "");
        changes.set("water-individual-main.mjs", oneFiscalChange(entry, ',waterFiscalEntry);', ');'));
        changes.set("index.js", mountSefinRoute(original("index.js")));
        changes.set("water-sefin-api.mjs", payload.system["water-sefin-api.mjs"]);
    }
    for (const [name, body] of changes)
        parts.set(name, { type: parts.get(name)?.type ?? "application/javascript+module", bytes: individualEncoder.encode(body) });
    const staged = {
        role, previous: current.version, previousDeployment: current.id,
        hash: await individualFingerprint(parts), modules: parts.size, inheritedBindings: baseline.bindings, changes: [...changes.keys()],
    };
    if (!upload) return staged;
    const versionId = await uploadIndividualVersion(api, path, parts, config, current.version, sefinVersion, "Sessão e emissão fiscal pela SEFIN Nacional");
    return { ...staged, versionId };
}

export function publishSefinRelease(api, account, staged, sessionRelease = false) {
    return activateIndividualWorkers(api, account, staged, sessionRelease ? sefinSessionBaseline : sefinBaseline);
}

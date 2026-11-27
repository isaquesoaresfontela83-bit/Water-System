export const originalHomeAsset = "/assets/cloriva-app-weekly-agenda-15.23.36.js";
export const homeWidgetAsset = "/assets/cloriva-app-widget-live-15.23.45.js";

export function replaceOne(source, original, replacement) {
    const position = source.indexOf(original);
    if (position < 0 || source.indexOf(original, position + original.length) >= 0)
        throw new Error("A estrutura da página inicial mudou: " + original.slice(0, 100));
    return source.slice(0, position) + replacement + source.slice(position + original.length);
}

export function patchHomeBrowser(source, catalog, createEditor, variants, createVariants) {
    const start = source.indexOf("function lg({organizationId:");
    const end = source.indexOf("function ", start + 12);
    if (start < 0 || end < 0) throw new Error("Central de operações indisponível.");
    let operation = source.slice(start, end);
    operation = replaceOne(operation, "onSelect:a}){", "onSelect:a,waterLayout,waterEditing}){");
    const kpis = [
        ["received", "finance", "ops-kpi ops-desktop-kpi", "Recebido no mês"],
        ["services", "agenda", "ops-kpi ops-service-kpi", "Serviços hoje"],
        ["receivable", "finance", "ops-kpi ops-receivable-kpi", "A receber"],
        ["quotes", "quotes", "ops-kpi ops-desktop-kpi", "Orçamentos abertos"],
        ["stock", "inventory", "ops-kpi ops-desktop-kpi", "Estoque baixo"],
    ];
    for (const [id, module, className, label] of kpis) {
        const pattern = new RegExp("l\\(`" + module + "`\\)&&(?=\\(0,Z\\.jsxs\\)\\(`button`,\\{type:`button`,className:`" +
            className + "`[^;]{0,450}?children:`" + label + "`)", "g");
        const matches = [...operation.matchAll(pattern)];
        if (matches.length !== 1) throw new Error("Indicador ativo mudou: " + label);
        operation = operation.replace(pattern, "waterVisible(" + JSON.stringify(id) + ")&&$&");
    }
    operation = replaceOne(operation, "let[s,c]=(0,X.useState)", "let waterVisible=id=>!waterLayout.hidden.includes(id);let[s,c]=(0,X.useState)");
    operation = replaceOne(operation, "l(`agenda`)&&(0,Z.jsx)(WaterHomeWeeklyAgenda", "waterVisible('week')&&l(`agenda`)&&(0,Z.jsx)(WaterHomeWeeklyAgenda");
    operation = replaceOne(operation, "l(`agenda`)&&(0,Z.jsxs)(`section`,{className:`ops-panel ops-next`",
        "waterVisible('next')&&l(`agenda`)&&(0,Z.jsxs)(`section`,{className:`ops-panel ops-next`");
    operation = replaceOne(operation, "l(`agenda`)&&S,C,l(`finance`)&&w,l(`crm`)&&T,",
        "waterVisible('today')&&l(`agenda`)&&S,waterVisible('attention')&&C,waterVisible('cashflow')&&l(`finance`)&&w,waterVisible('pipeline')&&l(`crm`)&&T,waterVisible('activity')&&");
    operation = replaceOne(operation, "l(`team`)&&(0,Z.jsxs)(`section`,{className:`ops-panel ops-team`",
        "waterVisible('team')&&l(`team`)&&(0,Z.jsxs)(`section`,{className:`ops-panel ops-team`");
    operation = replaceOne(operation, 'return(0,Z.jsxs)(`div`,{className:`operations-center`',
        'return waterApplyHomeLayout((0,Z.jsxs)(`div`,{className:`operations-center`');
    operation = replaceOne(operation, '}var ug=768;', ',waterLayout,waterEditing)}var ug=768;');
    let result = source.slice(0, start) + operation + source.slice(end);
    result = replaceOne(result, "function zv(e){let[t,n]", `const {useHomeWidgets:waterUseHomeWidgets,HomeWidgetEditor:WaterHomeWidgetEditor,applyHomeLayout:waterApplyHomeLayout,sizeHomeIndicators:waterSizeHomeIndicators,ExtraHomeWidgets:WaterExtraHomeWidgets}=
        (${createEditor.toString()})(X,${JSON.stringify(catalog)},${JSON.stringify(variants)},(${createVariants.toString()}));
        function zv(e){const waterPreferences=waterUseHomeWidgets(e.organizationId);let[t,n]`);
    result = replaceOne(result, "children:[(0,Z.jsx)(lg,{organizationId:e.organizationId",
        "children:[(0,Z.jsx)(WaterHomeWidgetEditor,{preferences:waterPreferences,allowed:e.allowed}),(0,Z.jsx)(WaterExtraHomeWidgets,{layout:waterPreferences.current,update:waterPreferences.update,allowed:e.allowed,data:e.data,lowStock:e.settings.lowStockAlert}),(0,Z.jsx)(lg,{waterLayout:waterPreferences.current,waterEditing:waterPreferences.editing,organizationId:e.organizationId");
    result = replaceOne(result, "(0,Z.jsxs)(`details`,{className:`ops-details`,open:t",
        "!waterPreferences.current.hidden.includes('indicators')&&waterSizeHomeIndicators((0,Z.jsxs)(`details`,{className:`ops-details`,open:t");
    return replaceOne(result, "t&&(0,Z.jsx)(Bv,{...e})]})]})}function Bv",
        "t&&(0,Z.jsx)(Bv,{...e})]}),waterPreferences.current)]})}function Bv");
}

export function mountHomeWidgetsRoute(source) {
    const pattern = 'pattern:"/api/finance/sefin"';
    const at = source.indexOf(pattern);
    const start = source.lastIndexOf("{__buildTimeClassifications:", at);
    const end = source.indexOf("},{__buildTimeClassifications:", at);
    const factory = /var waterFiscalRouter=([\w$]+)\(\{GET:/.exec(source)?.[1];
    const auth = /requireTenant:([\w$]+),\s*assertPlanFeature:[\w$]+,\s*canFinance:[\w$]+,\s*database:([\w$]+),\s*assertRateLimit:([\w$]+),\s*RequestError:([\w$]+)/.exec(source);
    if (start < 0 || end < 0 || !factory || !auth) throw new Error("A rota de sessão ativa mudou.");
    const route = source.slice(start, end + 1)
        .replaceAll("/api/finance/sefin", "/api/home-widgets")
        .replaceAll('["api","finance","sefin"]', '["api","home-widgets"]')
        .replace("routeHandler:waterFiscalRouter", "routeHandler:waterHomeWidgetsRouter");
    if (!route.includes("routeHandler:waterHomeWidgetsRouter")) throw new Error("A rota de widgets não foi montada.");
    const [, tenant, database, rate, requestError] = auth;
    return 'import{handleHomeWidgets as waterHandleHomeWidgets}from"./water-home-widgets-api.mjs";\n' +
        replaceOne(source.slice(0, end + 1) + "," + route + source.slice(end + 1), "var Md=[{", `
        function waterHomeWidgetsRoute(request){
            return waterHandleHomeWidgets(request,${database}(),${tenant},${rate},${requestError});
        }
        var waterHomeWidgetsRouter=${factory}({GET:()=>waterHomeWidgetsRoute,POST:()=>waterHomeWidgetsRoute});
        var Md=[{`);
}

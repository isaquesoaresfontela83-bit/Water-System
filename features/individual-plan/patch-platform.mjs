export const systemTenant = "assets/tenant-Babv1AWx.js";
export const systemCatalog = "assets/plan-catalog-BypiXgOX.js";
export const systemSsrFeatures = "ssr/assets/plan-features-X8p0ZSXu.js";
export const systemBrowserFeatures = "/assets/plan-features-DsrwsQ16.js";
export const systemSsrBilling = "ssr/assets/billing-center-5uwqzPPm.js";
export const systemBrowserBilling = "/assets/billing-center-DE7W4rpU.js";

function replaceOne(code, original, replacement) {
    const index = code.indexOf(original);
    if (index < 0 || code.indexOf(original, index + original.length) >= 0) {
        throw new Error("A base ativa mudou perto de " + original.slice(0, 88));
    }
    return code.slice(0, index) + replacement + code.slice(index + original.length);
}

function replaceMatches(code, pattern, count, replacement) {
    const matches = [...code.matchAll(pattern)];
    if (matches.length !== count) throw new Error(`Esperadas ${count} correspondências para ${pattern.source}; encontradas ${matches.length}.`);
    return code.replace(pattern, replacement);
}

export function patchTenant(code) {
    let updated = 'import{readIndividualCompany as waterReadIndividual}from"../water-individual-company.mjs";\n' + code;
    updated = replaceOne(updated, "async function _(a){", 'async function _(a,configuration){if(a==="individual")return waterReadIndividual(configuration)?.features??[];');
    updated = replaceOne(updated,
        'async function x(a,i){const e=i??(await m("organizations",{id:String(a.organization_id)},{select:"plan"}))?.plan??"inicial",n=await la(String(a.organization_id),String(a.id));return U(String(a.role),a.permissions,n,e,await _(e))}',
        `async function x(a,i,t){
            let e=i,n=t;
            if(e===undefined||e==="individual"&&n===undefined){
                const company=await E(await m("organizations",{id:String(a.organization_id)}));
                e=e??company?.plan??"inicial";
                n=company?.individual_plan;
            }
            const rules=await la(String(a.organization_id),String(a.id));
            return U(String(a.role),a.permissions,rules,e,await _(e,n));
        }`);
    updated = replaceOne(updated,
        '["plan","plan_status","plan_expires_at","billing_enabled","block_on_expiry"]',
        '["plan","plan_status","plan_expires_at","billing_enabled","block_on_expiry","individual_plan"]');
    for (const [member, company] of [["n", "t"], ["s", "l"]]) {
        updated = replaceOne(updated, `moduleAccess:await x(${member},${company}.plan??"inicial")`,
            `moduleAccess:await x(${member},${company}.plan??"inicial",${company}.individual_plan)`);
        updated = replaceOne(updated, `planFeatures:await _(${company}.plan??"inicial")`,
            `planFeatures:await _(${company}.plan??"inicial",${company}.individual_plan),individualLimitPlan:${company}.plan==="individual"?waterReadIndividual(${company}.individual_plan)?.limitPlan:undefined`);
    }
    updated = replaceOne(updated, 'const b=await _(l.plan??"inicial");',
        'const b=await _(l.plan??"inicial",l.individual_plan);');
    return updated;
}

export function patchFeatureGate(code) {
    // The browser and SSR versions use different minified symbols.
    const match = /function (\w+)\((\w+),(\w+),(\w+)\)\{return!?\(?\3===["`]branches["`]&&\w+\(\2\)===["`]inicial["`]\)?&&([\w$]+)\.profissional\.includes\(\3\)/.exec(code);
    if (!match) throw new Error("Validação de recursos por plano não identificada.");
    const [pattern, , plan, feature, configured, catalog] = match;
    const position = match.index + pattern.indexOf("{") + 1;
    return code.slice(0, position)
        + `if(${plan}==="individual")return ${catalog}.profissional.includes(${feature})&&Array.isArray(${configured})&&${configured}.includes(${feature});`
        + code.slice(position);
}

export function patchBillingView(code) {
    const match = /return ([\w$]+)\.billingEnabled===!1\?\(0,([\w$]+)\.jsxs\)\(["`]section["`],\{className:["`]billing-center["`]/.exec(code);
    if (!match) throw new Error("Tela de assinatura não identificada.");
    const [, billing, runtime] = match;
    return code.slice(0, match.index)
        + `return ${billing}.plan==="individual"?(0,${runtime}.jsxs)("section",{className:"surface billing-center",children:[
            (0,${runtime}.jsx)("h2",{children:"Plano Individual"}),
            (0,${runtime}.jsx)("p",{children:"Os recursos e as condições do seu plano são definidos com a equipe Water System."}),
            (0,${runtime}.jsx)("a",{className:"button",href:"/plano-individual",children:"Conversar sobre meu plano"})
        ]}):`
        + code.slice(match.index + "return ".length);
}

export function patchSystemServer(code) {
    let updated = 'import{readIndividualCompany as waterReadIndividual}from"./water-individual-company.mjs";\n' + code;
    updated = replaceOne(updated,
        "async function tt(e,t){const a=await x_(e);",
        `async function tt(company,t){
            const e=typeof company==="string"?company:company.plan;
            const a=e==="individual"?company.planFeatures??waterReadIndividual(company.individual_plan)?.features??[]:await x_(e);`);
    updated = replaceMatches(updated, /\btt\(([\w.]+)\.plan,/g, 17, "tt($1,");
    const planForLimits = `
        async function waterPlanForLimits(company){
            if(company.plan!=="individual")return wa(Tt(company.plan)?company.plan:"inicial");
            const plan=await wa(company.individualLimitPlan??"inicial");
            return {...plan,code:"individual",name:"Individual",priceCents:null};
        }`;
    updated += planForLimits;
    updated = replaceMatches(updated, /\bwa\(Tt\(([ar])\.plan\)\?\1\.plan:"inicial"\)/g, 2, "waterPlanForLimits($1)");
    updated = replaceMatches(updated, /\bwa\(([ta])\.plan\)/g, 2, "waterPlanForLimits($1)");
    updated = replaceOne(updated, "async function My(e,t){", 'async function My(e,t){if(t.plan==="individual")return t;');
    updated = replaceOne(updated,
        'const{user:t,organization:a}=await ae(e,["owner","admin"]);await Fy();const r=await e.json(),n=q(r.action);',
        `const{user:t,organization:a}=await ae(e,["owner","admin"]);
        if(a.plan==="individual")return Response.json({error:"A cobrança do plano Individual é combinada na consultoria."},{status:409});
        await Fy();const r=await e.json(),n=q(r.action);`);
    return updated;
}

export function patchControlServer(code) {
    let updated = 'import{configureIndividualCompany as waterConfigureIndividual}from"./water-individual-company.mjs";\n' + code;
    updated = replaceOne(updated,
        'n.action==="grantFreeAccess"&&Object.assign',
        `if(n.action==="configureIndividualPlan"){
            if(!V())throw new S("O banco de empresas está indisponível.",503);
            return await waterConfigureIndividual({body:n,current:o,admin:a,id:r,updateRows:tt,logAudit:st,RequestError:S});
        }
        n.action==="grantFreeAccess"&&Object.assign`);
    updated = replaceOne(updated,
        'if(!tp.includes(n.plan))throw new S("Escolha um plano v\\xE1lido.",400);',
        'if(!tp.includes(n.plan)&&!(n.plan==="individual"&&o.plan==="individual"&&o.individual_plan))throw new S("Escolha um plano v\\xE1lido.",400);');
    return updated;
}

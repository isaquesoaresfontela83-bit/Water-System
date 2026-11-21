import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "../../apps/system/node_modules/typescript/lib/typescript.js";

const root = new URL("../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const [baseline, output] = process.argv.slice(2);
if (!baseline || !output) throw new Error("Informe o diretório da produção recuperada e o diretório de saída.");
const version = "15.23.33";
const release = "2026-11-21-water-quote-photos-01";
const oldRelease = "2026-11-21-control-ai-dock-clearance-01";
const assets = {
    clientApp: ["cloriva-app-Bo3PpNh-.js", `cloriva-app-water-quote-${version}.js`],
    registration: ["registration-lookup-LbXNh975.js", `registration-lookup-water-quote-${version}.js`],
    css: `water-quote-${version}.css`,
};
const serverPatches = { system: {}, control: {} };
const publicAssets = [];
const digest = (text) => createHash("sha256").update(text).digest("hex");
const literal = JSON.stringify;

class Module {
    edits = [];
    constructor(name, body) {
        this.name = name;
        this.body = body;
        this.tree = ts.createSourceFile(name, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        assert.equal(this.tree.parseDiagnostics.length, 0, name);
    }
    text(node) { return node.getText(this.tree); }
    edit(start, end, text) { this.edits.push({ start, end, text }); }
    replace(node, text) { this.edit(node.getStart(this.tree), node.end, text); }
    before(node, text) { this.edit(node.getStart(this.tree), node.getStart(this.tree), text); }
    add(text) { this.edit(this.body.length, this.body.length, "\n" + text); }
    find(scope, predicate, description) {
        const nodes = [];
        function visit(node) {
            if (predicate(node)) nodes.push(node);
            node.forEachChild(visit);
        }
        visit(scope);
        assert.equal(nodes.length, 1, this.name + " · " + description);
        return nodes[0];
    }
    fn(name) {
        return this.find(this.tree, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name, name);
    }
    props(scope, key, value) {
        return this.find(scope, (n) => ts.isObjectLiteralExpression(n) && stringValue(prop(n, key)) === value, key + "=" + value);
    }
    swap(from, to, count) {
        let start = this.body.indexOf(from);
        let found = 0;
        while (start !== -1) {
            this.edit(start, start + from.length, to);
            found++;
            start = this.body.indexOf(from, start + from.length);
        }
        if (count !== undefined) assert.equal(found, count, this.name + " · " + from);
        return found;
    }
    finish() {
        const edits = this.edits.sort((a, b) => b.start - a.start || b.end - a.end);
        let text = this.body;
        let boundary = Infinity;
        for (const { start, end, text: replacement } of edits) {
            assert(end <= boundary, this.name + " · alterações sobrepostas");
            text = text.slice(0, start) + replacement + text.slice(end);
            boundary = start;
        }
        const result = new Module(this.name, text);
        return { text: result.body, sha256: digest(text), originalSha256: digest(this.body), edits };
    }
}

function prop(node, key) {
    return node?.properties?.find((entry) => ts.isPropertyAssignment(entry) && entry.name.text === key)?.initializer;
}
function stringValue(node) { return node && ts.isStringLiteralLike(node) ? node.text : undefined; }
function outerReturn(fn) {
    return fn.body.statements.findLast(ts.isReturnStatement);
}
function children(node) {
    const array = prop(node, "children");
    assert(ts.isArrayLiteralExpression(array));
    return array.elements;
}

const productUi = await source("apps/system/app/quote-product-photo.jsx");
const validation = await source("apps/system/lib/pool-quote-catalog.js");
const pdf = await source("apps/system/lib/quote-pdf.js");
const imageCheck = validation.slice(validation.indexOf("export function isQuoteProductPhoto"), validation.indexOf("export function poolQuoteConfigError")).replace("export ", "");
const pdfGallery = pdf.slice(pdf.indexOf("function addProductPhotos"), pdf.indexOf("export async function generateQuotePdf"));
assert(imageCheck.startsWith("function isQuoteProductPhoto"));
assert(pdfGallery.startsWith("function addProductPhotos"));
const catalogCheck = `function validateQuotePhotoCatalog(config) {
    let size = 0;
    for (const group of config.catalog) {
        for (const item of group.items) {
            if (item.photo === undefined || item.photo === "") continue;
            if (!isQuoteProductPhoto(item.photo)) return "Confira a foto de " + item.name + ".";
            size += item.photo.length;
            if (size > 750000) return "O catálogo atingiu o limite de fotos. Remova imagens antes de adicionar novas.";
        }
    }
    return null;
}
function quoteLinesWithoutPhotos(lines) {
    return lines.map(({ photo, ...line }) => line);
}`;

function addCatalogValidation(module, name) {
    const fn = module.fn(name);
    const validate = `return validateQuotePhotoCatalog(${module.text(fn.parameters[0].name)});`;
    // The existing validator falls through with undefined when all checks pass.
    const last = fn.body.statements.at(-1);
    if (ts.isReturnStatement(last)) {
        assert.equal(module.text(last.expression), "null");
        module.replace(last, validate);
    } else {
        module.edit(fn.body.end - 1, fn.body.end - 1, ";" + validate);
    }
}

function photoComponents(react, runtime) {
    const input = productUi.replace(/^"use client";\s*/m, "").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
    const result = ts.transpileModule(input, { compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
    }}).outputText;
    const imports = result.match(/^import \{ (.+) \} from "react\/jsx-runtime";$/m);
    assert(imports, "Importações JSX do editor de fotos");
    const aliases = imports[1].split(", ").map((entry) => {
        const [original, name] = entry.split(" as ");
        return `const ${name}=${runtime}.${original};`;
    });
    return `const useState=${react}.useState;\n` + aliases.join("\n") + "\n" + result.replace(imports[0], "").replace(/^export \{\};$/m, "");
}

function updateQuoteUi(module, state) {
    const { jsx, react, validator, catalog, builder, detail } = state;
    const render = (tag, props = "{}", multiple = false) => `(0,${jsx}.${multiple ? "jsxs" : "jsx"})(${tag},${props})`;
    addCatalogValidation(module, validator);
    module.add(imageCheck + catalogCheck + photoComponents(react, jsx));

    const catalogFn = module.fn(catalog.fn);
    module.edit(catalogFn.body.getStart(module.tree) + 1, catalogFn.body.getStart(module.tree) + 1,
        `const [waterPhotosPending,setWaterPhotosPending]=${react}.useState(0);`);
    const grid = module.props(catalogFn, "className", "catalog-fields-editor");
    const photoInput = render("QuoteProductPhotoInput",
        `{photo:${catalog.editItem}.photo,name:${catalog.editItem}.name,onBusy:delta=>setWaterPhotosPending(count=>count+delta),onChange:photo=>${catalog.updateItem}(${catalog.categoryIndex},${catalog.itemIndex},{photo})}`);
    module.before(grid.parent, photoInput + ",");
    const card = module.props(catalogFn, "className", "pool-project-card");
    module.before(children(card)[0], render("QuoteProductPhoto", `{photo:${catalog.cardItem}.photo,name:${catalog.cardItem}.name}`) + ",");
    const editor = module.props(catalogFn, "className", "catalog-normal-editor");
    module.replace(editor.parent.arguments[0], '"fieldset"');
    module.before(editor.properties[0], `disabled:waterPhotosPending>0||${catalog.saving},`);
    const form = module.props(catalogFn, "className", "catalog-editor-form");
    const submit = prop(form, "onSubmit");
    module.replace(submit, `event=>{if(waterPhotosPending||${catalog.saving}){event.preventDefault();return}return ${module.text(submit)}(event)}`);
    const button = module.props(form, "type", "submit");
    module.replace(prop(button, "disabled"), `waterPhotosPending>0||${catalog.saving}`);
    const cancel = module.props(form, "children", "Cancelar");
    module.before(cancel.properties[0], `disabled:waterPhotosPending>0||${catalog.saving},`);
    const control = module.find(catalogFn, (n) => ts.isObjectLiteralExpression(n) &&
        module.text(prop(n, "onOpenChange") ?? n) === catalog.setOpen && Boolean(prop(n, "open")), "Dialog do catálogo");
    module.replace(prop(control, "onOpenChange"), `open=>{if(!waterPhotosPending&&!${catalog.saving})${catalog.setOpen}(open)}`);
    const editLabels = ["Editar orçamento automático", "Salvar orçamento automático"];
    for (const [i, label] of editLabels.entries()) {
        const labels = [];
        function visit(n) { if (stringValue(n) === label) labels.push(n); n.forEachChild(visit); }
        visit(catalogFn);
        assert(labels.length > 0, label);
        for (const n of labels) module.replace(n, literal(i === 0 ? "Editar catálogo" : "Salvar catálogo"));
    }

    const builderFn = module.fn(builder.fn);
    const quoteBuilder = module.props(builderFn, "className", "pool-catalog-picker span-2");
    module.replace(prop(quoteBuilder, "aria-label"), literal("Modelos de proposta"));
    const topLabel = module.find(quoteBuilder, (n) => ts.isPropertyAssignment(n) &&
        n.name.text === "children" && module.text(n.initializer) === `${builder.config}.title`, "título do catálogo");
    module.replace(topLabel.initializer, literal("1. Escolha um modelo"));
    const cards = module.props(builderFn, "className", "pool-service-cards");
    const cardProps = module.find(cards, (n) => ts.isObjectLiteralExpression(n) && Boolean(prop(n, "onClick")), "cartão do modelo");
    module.before(children(cardProps)[0], render("QuoteProductPhoto", `{photo:${builder.cardItem}.photo,name:${builder.cardItem}.name}`) + ",");
    module.before(cardProps.properties[0], `"aria-pressed":${module.text(prop(cardProps, "className").condition)},`);
    const line = module.find(builderFn, (n) => ts.isObjectLiteralExpression(n) && prop(n, "dimensions") && prop(n, "unitPrice"), "novo item");
    module.before(line.properties[0], `photo:${builder.item}.photo,`);
    const lineCard = module.props(builderFn, "className", "pool-quote-line");
    const lineContent = children(children(lineCard)[0].arguments[1]);
    module.before(lineContent[0], render("QuoteProductPhoto", `{photo:${builder.lineItem}.photo,name:${builder.lineItem}.name}`) + ",");
    for (const name of ["poolItems", "products"]) {
        const input = module.props(builderFn, "name", name);
        module.replace(prop(input, "value"), `JSON.stringify(quoteLinesWithoutPhotos(${builder.lines}))`);
    }
    const unitPreview = module.props(builderFn, "children", "Preço estimado do item");
    module.replace(prop(unitPreview, "children"), literal("Subtotal do item"));
    const price = module.props(builderFn, "className", "pool-price-preview");
    module.before(price.properties[0], '"aria-live":"polite",');
    module.before(children(price)[1],
        render('"div"', `{children:[${render('"small"', `{children:"Preço por "+${builder.item}.unit}`)},${render('"strong"', `{children:${builder.money}(waterQuoteUnitSale)}`)}]}`, true) + ",");
    module.before(outerReturn(builderFn), `const waterQuoteUnitSale=Math.round((${builder.item}?.price??0)*(1+(${builder.item}?.markup??0)/100)*100);
        const waterQuoteSubtotal=${builder.subtotal}+${builder.itemTotal};
        const waterQuoteBase=Math.max(0,waterQuoteSubtotal+Math.round(waterQuoteSubtotal*${builder.config}.urgency[${builder.urgency}]/100)-${builder.discount});
        const waterQuoteWithItem=${builder.calculateCard}(waterQuoteBase,${builder.payment}==="credit"?${builder.cardRate}:0).totalCents;`);
    const breakdown = module.props(builderFn, "className", "quote-breakdown span-2");
    module.replace(prop(breakdown, "className"), literal("quote-breakdown"));
    module.before(breakdown.properties[0], '"aria-live":"polite",');
    const heading = render('"div"', `{className:"pool-builder-heading",children:${render('"strong"', '{children:"Resumo da proposta"}')}}`);
    const projected = render('"div"', `{className:"pool-price-preview",children:[${render('"div"', `{children:[${render('"small"', `{children:"Com "+${builder.item}.name+" adicionado"}`)},${render('"strong"', `{children:${builder.money}(waterQuoteWithItem)}`)}]}`, true)},${render('"small"', '{children:"Adicione o item acima para incluí-lo no orçamento."}')}]}`, true);
    module.before(breakdown.parent, `(0,${jsx}.jsxs)("section",{className:"pool-quote-lines span-2","aria-label":"Resumo da proposta",children:[${heading},`);
    module.edit(breakdown.parent.end, breakdown.parent.end, `,${builder.item}&&${builder.quantity}>0&&${builder.itemTotal}>0&&${projected}]})`);

    const detailFn = module.fn(detail.fn);
    const galleryTarget = module.props(detailFn, "className", "quote-breakdown");
    module.before(galleryTarget.parent, render("QuotePhotoGallery", `{itemsJson:${detail.notes}.details.poolItems}`) + ",");
}

function addPdfGallery(module, name, options) {
    const fn = module.fn(name);
    const footer = module.find(fn, (n) => ts.isVariableStatement(n) && n.declarationList.declarations.some((entry) =>
        entry.initializer && module.text(entry.initializer) === `${options.pdf}.getNumberOfPages()`), "paginação do PDF");
    module.before(footer, `addProductPhotos(${options.pdf},${options.notes}.poolItems,${options.quote}.quoteNumber||"Proposta",18,192);`);
    module.add(pdfGallery);
}

function addServerPhotos(module) {
    addCatalogValidation(module, "Iw");
    module.add(imageCheck + catalogCheck);
    const create = module.fn("QD");
    const line = module.find(create, (n) => ts.isObjectLiteralExpression(n) && prop(n, "unitPrice") && prop(n, "dimensions"), "persistência do item");
    const item = module.text(prop(line, "unitPrice").expression);
    module.before(line.properties[0], `...(isQuoteProductPhoto(${item}.photo)?{photo:${item}.photo}:{}),`);
    const quoteNotes = module.find(create, (n) => ts.isObjectLiteralExpression(n) && prop(n, "pricingSnapshot") && prop(n, "products"), "persistência da proposta");
    const products = prop(quoteNotes, "products");
    const productsCall = products.whenTrue;
    assert(ts.isCallExpression(productsCall));
    module.replace(productsCall.arguments[0], `quoteLinesWithoutPhotos(${module.text(productsCall.arguments[0])})`);
    const conversion = module.fn("nP");
    const workOrder = module.find(conversion, (n) => ts.isObjectLiteralExpression(n) && prop(n, "productsUsed") && prop(n, "osNumber"), "conversão em OS");
    const productsUsed = prop(workOrder, "productsUsed");
    module.before(productsUsed, "stripWorkOrderQuotePhotos(");
    module.edit(productsUsed.end, productsUsed.end, ")");
    module.add(`function stripWorkOrderQuotePhotos(value) {
        try {
            const items = JSON.parse(value);
            if (Array.isArray(items) && items.some(item => isQuoteProductPhoto(item?.photo))) {
                return JSON.stringify(quoteLinesWithoutPhotos(items));
            }
        } catch {}
        return value;
    }`);
    addPdfGallery(module, "Aw", { pdf: "o", notes: "i", quote: "e" });
}

async function server(name, role, update) {
    const part = new Module(name, await readFile(join(baseline, role, name), "utf8"));
    update(part);
    const { text, ...patch } = part.finish();
    serverPatches[role][name] = patch;
    await writeFile(join(output, name.replaceAll("/", "--") + "." + role + ".candidate"), text);
}

async function writePublic(name, content, mime = "application/javascript; charset=utf-8") {
    const file = join(output, name);
    await writeFile(file, content);
    publicAssets.push({ path: "/assets/" + name, file, bytes: Buffer.byteLength(content), sha256: digest(content), mime });
}

await mkdir(output, { recursive: true });
const clientApp = new Module("client-app.js", await readFile(join(baseline, "system/client-app.js"), "utf8"));
updateQuoteUi(clientApp, {
    jsx: "Z", react: "X", validator: "__",
    catalog: { fn: "Uv", cardItem: "e", editItem: "e", categoryIndex: "t", itemIndex: "n", updateItem: "ee", setOpen: "y", saving: "S" },
    builder: { fn: "ey", config: "u", item: "I", cardItem: "e", lineItem: "e", lines: "w", itemTotal: "oe", subtotal: "de", quantity: "ae", urgency: "M", discount: "L", calculateCard: "or", payment: "P", cardRate: "me", money: "Q" },
    detail: { fn: "ny", notes: "t" },
});
clientApp.swap(assets.registration[0], assets.registration[1], 2);
await writePublic(assets.clientApp[1], clientApp.finish().text);
await server("ssr/assets/cloriva-app-DKfy1OhA.js", "system", (module) => updateQuoteUi(module, {
    jsx: "e", react: "l", validator: "Nc",
    catalog: { fn: "Bj", cardItem: "P", editItem: "H", categoryIndex: "$", itemIndex: "ee", updateItem: "Z", setOpen: "k", saving: "E" },
    builder: { fn: "Xj", config: "p", item: "re", cardItem: "q", lineItem: "q", lines: "b", itemTotal: "ge", subtotal: "ae", quantity: "pe", urgency: "W", discount: "J", calculateCard: "Ld", payment: "B", cardRate: "ne", money: "se" },
    detail: { fn: "ab", notes: "A" },
}));

const registration = new Module("client-registration.js", await readFile(join(baseline, "system/client-registration.js"), "utf8"));
addPdfGallery(registration, "ne", { pdf: "o", notes: "c", quote: "e" });
await writePublic(assets.registration[1], registration.finish().text);
await server("ssr/assets/registration-lookup-Bj7rQPFS.js", "system", (module) => {
    const fn = module.find(module.tree, (n) => ts.isFunctionDeclaration(n) &&
        n.body && n.body.statements.some((statement) => ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some((entry) => {
                const init = entry.initializer;
                return init && ts.isPropertyAccessExpression(init) && init.name.text === "details";
            })) && module.text(n).includes("getNumberOfPages") && module.text(n).includes("poolItems"), "PDF da proposta");
    const details = fn.body.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
        .find((entry) => entry.initializer && ts.isPropertyAccessExpression(entry.initializer) && entry.initializer.name.text === "details");
    const pages = fn.body.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
        .find((entry) => entry.initializer && ts.isCallExpression(entry.initializer) && ts.isPropertyAccessExpression(entry.initializer.expression) &&
            entry.initializer.expression.name.text === "getNumberOfPages");
    assert(pages && details);
    addPdfGallery(module, fn.name.text, {
        pdf: module.text(pages.initializer.expression.expression),
        notes: module.text(details.name),
        quote: module.text(fn.parameters[0].name),
    });
});

for (const name of ["index.js", "__vite_rsc_assets_manifest.js", "ssr/__vite_rsc_assets_manifest.js"]) {
    await server(name, "system", (module) => {
        for (const [before, after] of [assets.clientApp, assets.registration]) module.swap(before, after, 1);
        if (name === "index.js") addServerPhotos(module);
    });
}
for (const role of ["system", "control"]) {
    await server("water-brand-core.mjs", role, (module) => {
        module.swap("export const VERSION = '15.23.32';", `export const VERSION = '${version}';`, 1);
        module.swap(oldRelease, release, 1);
    });
}
const css = await source("apps/system/app/globals.css");
const photoCss = css.slice(css.lastIndexOf("\n.quote-product-photo {"));
assert(photoCss.trimStart().startsWith(".quote-product-photo {"));
await writePublic(assets.css, photoCss, "text/css; charset=utf-8");
await writeFile(join(output, "release.json"), JSON.stringify({ version, release, serverPatches, publicAssets }, null, 2));
console.log(JSON.stringify({ version, serverModules: Object.fromEntries(Object.entries(serverPatches).map(([role, patches]) => [role, Object.keys(patches)])), publicAssets }, null, 2));

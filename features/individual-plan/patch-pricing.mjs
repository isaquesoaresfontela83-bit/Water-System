import { individualPlan } from "./catalog.mjs";

export const pricingBrowserAsset = "/assets/plans-view-D-cAa3s9.js";
export const pricingServerModule = "ssr/assets/plans-view-DDXMRDt8.js";
export const pricingAssetRevision = "individual-15.23.37";

export function updatePricingView(code) {
    const grid = code.indexOf("plans-public-grid");
    if (grid < 0 || grid !== code.lastIndexOf("plans-public-grid")) throw new Error("Grade de planos não identificada.");
    const end = /\]\}\),\(0,([\w$]+)\.jsxs\)\(["`]section["`],\{className:["`]surface plans-public-note["`]/.exec(code.slice(grid));
    if (!end) throw new Error("O fim da grade de planos mudou.");
    const runtime = end[1];
    const element = (tag, properties, method = "jsx") => `(0,${runtime}.${method})(${JSON.stringify(tag)},${properties})`;
    const text = value => `{children:${JSON.stringify(value)}}`;
    const check = label => element("li", text(label));
    const card = element("article", `{
      className:"plans-public-card individual-plan-card",
      children:[
        ${element("h2", text(individualPlan.name))},
        ${element("strong", '{className:"individual-price",children:"Sob consulta"}')},
        ${element("p", '{className:"product-cycle-note",children:"Módulos para a sua empresa"}')},
        ${element("ul", `{className:"plans-card-highlights",children:[${individualPlan.highlights.map(check).join(",")}]}`, "jsxs")},
        ${element("a", `{className:"button",href:${JSON.stringify(individualPlan.consultationUrl)},children:"Montar plano Individual"}`)},
        ${element("p", '{className:"product-cycle-note",children:"A equipe confirma os recursos e o valor na consultoria."}')}
      ]
    },"individual"`, "jsxs");
    const position = grid + end.index;
    return code.slice(0, position) + "," + card + code.slice(position);
}

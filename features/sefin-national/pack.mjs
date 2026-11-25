import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { patchFinanceWorkspace, patchFiscalSettings } from "./release.mjs";

const [financePath, companyPath] = process.argv.slice(2);
if (!financePath || !companyPath) throw new Error("Informe os módulos de navegador ativos do Financeiro e das Configurações.");
const read = name => readFileSync(new URL(name, import.meta.url), "utf8");
const moduleNames = {
    "catalog.mjs": "water-individual-catalog.mjs",
    "booking.mjs": "water-individual-booking.mjs",
    "page.mjs": "water-individual-page.mjs",
    "patch-pricing.mjs": "water-individual-pricing.mjs",
};
let individual = read("../individual-plan/worker.mjs");
for (const [source, target] of Object.entries(moduleNames))
    individual = individual.replaceAll('"./' + source + '"', '"./' + target + '"');

const portable = ["../individual-plan/connected.mjs", "../individual-plan/booking-release.mjs", "./worker.mjs", "./release.mjs"]
    .map(name => read(name).replace(/^(?:import [^\n]+\n)+/, "").replace(/^export (?=(?:async )?function |const )/gm, ""))
    .join("\n");
const payload = {
    common: {
        "water-individual-worker.mjs": individual,
        "water-sefin-worker.mjs": read("./worker.mjs"),
    },
    system: {
        "water-sefin-document.mjs": read("./document.mjs"),
        "water-sefin-api.mjs": read("./api.mjs").replace('"./document.mjs"', '"./water-sefin-document.mjs"'),
        "water-sefin-ui.mjs": read("./ui.mjs"),
    },
    browser: {
        "/assets/finance-workspace-5oFyX2xt.js": readFileSync(financePath, "utf8"),
        "/assets/company-settings-panel-Dzoh68dy.js": readFileSync(companyPath, "utf8"),
    },
};
for (const code of [portable, ...Object.values(payload.common), ...Object.values(payload.system),
    patchFinanceWorkspace(payload.browser["/assets/finance-workspace-5oFyX2xt.js"], false),
    patchFiscalSettings(payload.browser["/assets/company-settings-panel-Dzoh68dy.js"], false)])
    execFileSync(process.execPath, ["--input-type=module", "--check"], { input: code });
process.stdout.write(JSON.stringify({ portable, payload }));

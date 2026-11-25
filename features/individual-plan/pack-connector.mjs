import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { individualControlPage, individualControlClient } from "./page.mjs";
import { pricingBrowserAsset, updatePricingView } from "./patch-pricing.mjs";
import { patchBillingView, patchFeatureGate, systemBrowserBilling, systemBrowserFeatures } from "./patch-platform.mjs";

const [pricingPath, featurePath, billingPath] = process.argv.slice(2);
if (!pricingPath || !featurePath || !billingPath) throw new Error("Informe os três módulos públicos da base ativa.");
const local = name => readFileSync(new URL(name, import.meta.url), "utf8");
const moduleFiles = {
    "catalog.mjs": "water-individual-catalog.mjs",
    "page.mjs": "water-individual-page.mjs",
    "patch-pricing.mjs": "water-individual-pricing.mjs",
    "company.mjs": "water-individual-company.mjs",
    "worker.mjs": "water-individual-worker.mjs",
};
const modules = Object.fromEntries(Object.entries(moduleFiles).map(([from, to]) => {
    let source = local(from);
    for (const [original, deployed] of Object.entries(moduleFiles))
        source = source.replaceAll('"./' + original + '"', '"./' + deployed + '"');
    return [to, source];
}));
const browser = {
    [pricingBrowserAsset]: updatePricingView(readFileSync(pricingPath, "utf8")),
    [systemBrowserFeatures]: patchFeatureGate(readFileSync(featurePath, "utf8")),
    [systemBrowserBilling]: patchBillingView(readFileSync(billingPath, "utf8")),
};
const portableFiles = ["catalog.mjs", "patch-pricing.mjs", "patch-platform.mjs", "connected.mjs"];
const portable = portableFiles.map(name => local(name).replace(/^import [^\n]+\n/gm, "").replace(/^export /gm, "")).join("\n");
for (const code of [...Object.values(modules), ...Object.values(browser), portable, local("control-client.js")])
    execFileSync(process.execPath, ["--input-type=module", "--check"], { input: code });
const css = local("styles.css");
const resources = {
    system: {
        css, browser,
        importers: [
            "/assets/cloriva-app-weekly-agenda-15.23.36.js",
            "/assets/registration-lookup-water-quote-15.23.33.js",
        ],
    },
    control: { css, adminLink: Boolean(individualControlClient), adminPage: individualControlPage(), adminClient: local("control-client.js") },
};
process.stdout.write(JSON.stringify({ modules, portable, resources }));

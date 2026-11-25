import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { updateBookingEntry } from "./booking-release.mjs";
import { buildIndividualEntry } from "./connected.mjs";

const local = name => readFileSync(new URL(name, import.meta.url), "utf8");
const themeOnly = process.argv.includes("--theme");
const moduleFiles = {
    "catalog.mjs": "water-individual-catalog.mjs",
    "booking.mjs": "water-individual-booking.mjs",
    "page.mjs": "water-individual-page.mjs",
    "worker.mjs": "water-individual-worker.mjs",
    "patch-pricing.mjs": "water-individual-pricing.mjs",
};
const modules = Object.fromEntries(Object.entries(moduleFiles)
    .filter(([name]) => themeOnly ? ["page.mjs", "worker.mjs"].includes(name) : name !== "patch-pricing.mjs")
    .map(([name, target]) => {
        let code = local(name);
        for (const [file, deployed] of Object.entries(moduleFiles))
            code = code.replaceAll('"./' + file + '"', '"./' + deployed + '"');
        return [target, code];
    }));
const css = local("styles.css");
const system = themeOnly ? { css } : { css, bookingClient: local("booking-client.js") };
const control = themeOnly ? { css } : { css, adminClient: local("control-client.js") };
const portable = ["connected.mjs", "booking-release.mjs"].map(name => local(name)
    .replace(/^(?:import [^\n]+\n)+/, "")
    .replace(/^export (?=(?:async )?function |const )/gm, "")).join("\n");
const packedEntry = new Function(portable + "\nreturn updateBookingEntry;")();
for (const [role, bundle] of Object.entries({ system, control })) {
    const initial = buildIndividualEntry(role, { css: "previous", keepThis: true });
    const previous = themeOnly ? updateBookingEntry(initial, role, { css: "previous" }) : initial;
    const next = packedEntry(previous, role, bundle);
    if (next !== updateBookingEntry(previous, role, bundle)) throw new Error("Entrada da publicação inconsistente.");
    execFileSync(process.execPath, ["--input-type=module", "--check"], { input: next });
}
for (const code of [...Object.values(modules), system.bookingClient, control.adminClient, portable].filter(Boolean))
    execFileSync(process.execPath, ["--input-type=module", "--check"], { input: code });
process.stdout.write(JSON.stringify({ portable, bundle: { modules, system, control } }));

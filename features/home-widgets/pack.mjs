import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const portable = ["../individual-plan/connected.mjs", "./patch.mjs", "./release.mjs"]
    .map(path => read(path).replace(/^(?:import [^\n]+\n)+/, "").replace(/^export (?=(?:async )?function |const )/gm, ""))
    .join("\n");
const modules = Object.fromEntries(["catalog", "client", "patch", "api", "worker", "variants"]
    .map(name => ["water-home-widgets-" + name + ".mjs", read("./" + name + ".mjs")
        .replace(/"\.\/(catalog|client|patch|variants)\.mjs"/g, '"./water-home-widgets-$1.mjs"')]));
process.stdout.write(JSON.stringify({ portable, modules, schema: read("./schema.sql"), migration: read("./add-sizes.sql") }));

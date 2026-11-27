import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { handleHomeWidgets } from "./api.mjs";
import { createHomeWidgets } from "./client.mjs";
import { widgets } from "./catalog.mjs";
import { patchHomeBrowser } from "./patch.mjs";
import { withHomeWidgets } from "./worker.mjs";

function testService() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    const db = {
        prepare(sql) {
            const statement = sqlite.prepare(sql);
            return {
                bind(...parameters) {
                    return { first: async () => statement.get(...parameters), run: async () => statement.run(...parameters) };
                },
            };
        },
    };
    class RequestError extends Error {
        status = 401;
    }
    return (body, { user = "alice", company = "studio", selected = company, origin = "https://watersystem.online" } = {}) => {
        const request = new Request("https://watersystem.online/api/home-widgets", {
            method: body === undefined ? "GET" : "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: { "x-organization-id": selected, "Content-Type": "application/json", Origin: origin },
        });
        return handleHomeWidgets(request, db, async () => {
            if (!user) throw new RequestError("Sessão necessária.");
            return { user: { id: user }, organization: { id: company } };
        }, async () => {}, RequestError);
    };
}

test("as escolhas ficam na sessão da conta e são isoladas entre usuários e empresas", async () => {
    const call = testService();
    assert.deepEqual(await (await call()).json(), { hidden: [] });
    assert.equal((await call({ hidden: ["week", "stock", "week"] })).status, 200);
    assert.deepEqual(await (await call()).json(), { hidden: ["week", "stock"] });
    assert.deepEqual(await (await call(undefined, { user: "bob" })).json(), { hidden: [] });
    assert.deepEqual(await (await call(undefined, { company: "outro" })).json(), { hidden: [] });
    assert.equal((await call({ hidden: [] })).status, 200);
    assert.deepEqual(await (await call()).json(), { hidden: [] });
});

test("protege a sessão e rejeita empresas divergentes, origens externas e widgets desconhecidos", async () => {
    const call = testService();
    assert.equal((await call(undefined, { user: "" })).status, 401);
    assert.equal((await call({ hidden: ["week"] }, { selected: "outro" })).status, 403);
    assert.equal((await call({ hidden: ["week"] }, { origin: "https://other.example" })).status, 403);
    assert.equal((await call({ hidden: ["unknown"] })).status, 400);
    assert.equal((await call({ hidden: ["x".repeat(2000)] })).status, 413);
    assert.deepEqual(await (await call()).json(), { hidden: [] });
});

test("a montagem mantém o asset original e aplica o editor ao endereço versionado", {
    skip: !process.env.WATER_ACTIVE_HOME_ASSET,
}, async () => {
    const source = readFileSync(process.env.WATER_ACTIVE_HOME_ASSET, "utf8");
    const output = patchHomeBrowser(source, widgets, createHomeWidgets);
    for (const [id] of widgets) assert.ok(output.includes("'" + id + "'") || output.includes('waterVisible("' + id + '")'));
    const app = withHomeWidgets({ fetch: async () => new Response(source) });
    const response = await app.fetch(new Request("https://watersystem.online/assets/cloriva-app-home-widgets-15.23.42.js"));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), output);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { handleHomeWidgets } from "./api.mjs";
import { createWidgetVariants } from "./variants.mjs";
import { createHomeWidgets } from "./client.mjs";
import { widgets, widgetVariants } from "./catalog.mjs";
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
    assert.deepEqual(await (await call()).json(), { hidden: [], sizes: null });
    assert.equal((await call({ hidden: ["week", "stock", "week"], sizes: { week: "large" } })).status, 200);
    assert.deepEqual(await (await call()).json(), { hidden: ["week", "stock"], sizes: { week: "large" } });
    assert.deepEqual(await (await call(undefined, { user: "bob" })).json(), { hidden: [], sizes: null });
    assert.deepEqual(await (await call(undefined, { company: "outro" })).json(), { hidden: [], sizes: null });
    assert.equal((await call({ hidden: [] })).status, 200);
    assert.deepEqual(await (await call()).json(), { hidden: [], sizes: null });
});

test("protege a sessão e rejeita empresas divergentes, origens externas e widgets desconhecidos", async () => {
    const call = testService();
    assert.equal((await call(undefined, { user: "" })).status, 401);
    assert.equal((await call({ hidden: ["week"] }, { selected: "outro" })).status, 403);
    assert.equal((await call({ hidden: ["week"] }, { origin: "https://other.example" })).status, 403);
    assert.equal((await call({ hidden: ["unknown"] })).status, 400);
    assert.equal((await call({ hidden: [], sizes: { week: "giant" } })).status, 400);
    assert.equal((await call({ hidden: [], sizes: { unknown: "large" } })).status, 400);
    assert.equal((await call({ hidden: ["x".repeat(2000)] })).status, 413);
    assert.deepEqual(await (await call()).json(), { hidden: [], sizes: null });
});

test("a montagem mantém o asset original e aplica o editor ao endereço versionado", {
    skip: !process.env.WATER_ACTIVE_HOME_ASSET,
}, async () => {
    const source = readFileSync(process.env.WATER_ACTIVE_HOME_ASSET, "utf8");
    const output = patchHomeBrowser(source, widgets, createHomeWidgets, widgetVariants, createWidgetVariants);
    for (const [id] of widgets) assert.ok(output.includes("'" + id + "'") || output.includes('waterVisible("' + id + '")'));
    const app = withHomeWidgets({ fetch: async () => new Response(source) });
    const response = await app.fetch(new Request("https://watersystem.online/assets/cloriva-app-widget-gallery-15.23.44.js"));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), output);
});

test("a prévia mantém os cartões reais e aplica três larguras no celular e no desktop", () => {
    const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
    const cloneElement = (element, props, children) => createElement(element.type, { ...element.props, ...props }, ...children);
    const { applyHomeLayout } = createHomeWidgets({ createElement, cloneElement }, widgets, widgetVariants, createWidgetVariants);
    const week = createElement("section", { name: "Agenda da semana" });
    const radar = createElement("section", { name: "Atenção agora" });
    const original = createElement("div", {}, createElement("div", { className: "ops-grid" }, week, false, false, radar));
    assert.equal(applyHomeLayout(original, { sizes: null }, false), original);
    const defaults = applyHomeLayout(original, { sizes: {} }, true).props.children[0].props.children;
    assert.equal(defaults[0].props.style["--water-widget-span"], 6);
    assert.equal(defaults[1].props.style["--water-widget-mobile-span"], 2);
    const resized = applyHomeLayout(original, { sizes: { week: "medium" } }, true).props.children[0].props.children;
    assert.equal(resized[0].props.children[0], week);
    assert.equal(resized[0].props.style["--water-widget-span"], 3);
    assert.equal(resized[0].props.style["--water-widget-mobile-span"], 3);
    assert.equal(resized.length, 2);
});

test("modelos financeiros coexistem, mantêm tamanhos independentes e validam tamanhos permitidos", async () => {
    const call = testService();
    const sizes = { "finance-bars": "large", "finance-ring": "small", "finance-due": "medium" };
    assert.equal((await call({ hidden: [], sizes })).status, 200);
    assert.deepEqual(await (await call()).json(), { hidden: [], sizes });
    assert.equal((await call({ hidden: [], sizes: { "finance-bars": "small" } })).status, 400);
    const createElement = (type, props, ...children) => ({ type, props, children });
    const { ExtraHomeWidgets } = createHomeWidgets({ createElement }, widgets, widgetVariants, createWidgetVariants);
    assert.equal(ExtraHomeWidgets({ layout: { sizes }, allowed: [], data: {} }), null);
    const output = ExtraHomeWidgets({ layout: { sizes }, allowed: ["finance"], data: {} });
    assert.deepEqual(output.children[0].map(child => child.props.key), Object.keys(sizes));
    assert.deepEqual(output.children[0].map(child => child.props.style["--water-widget-span"]), [6, 2, 3]);
    const Widget = createWidgetVariants(createElement);
    const finance = widgetVariants.filter(item => item.module === "finance");
    const previews = finance.map(variant => Widget({ variant, preview: true }).children[1].props.className);
    assert.deepEqual(previews, ["water-variant-bars", "water-variant-ring", "water-variant-list"]);
});

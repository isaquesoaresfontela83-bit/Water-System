import assert from "node:assert/strict";
import test from "node:test";
import { configureIndividualCompany, individualCompanyPlan, readIndividualCompany } from "./company.mjs";
import { individualFeatures } from "./catalog.mjs";
import { withIndividualPlan } from "./worker.mjs";

const standard = { name: "Plus", priceCents: 19900 };
const original = {
    async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/api/public/plans") return Response.json({ plans: { intermediario: standard } });
        if (path === "/api/health") return Response.json({ status: "ok", baselineVersion: "15.23.36" });
        return new Response("original");
    },
};
const system = withIndividualPlan(original, "system", { css: "styles" });
const request = (path, init) => new Request("https://watersystem.online" + path, init);

test("adds a consultative offer and preserves the paid plan catalog", async () => {
    const response = await system.fetch(request("/api/public/plans"));
    const { plans } = await response.json();
    assert.deepEqual(plans.intermediario, standard);
    assert.equal(plans.individual.priceCents, null);
    assert.equal(plans.individual.checkout, "consultation");
    const direct = await system.fetch(request("/assinar/individual"));
    assert.equal(direct.status, 302);
    assert.equal(direct.headers.get("location"), "/plano-individual");
});

test("consultation works for chosen resources and for undecided visitors", async () => {
    const page = await system.fetch(request("/plano-individual"));
    const html = await page.text();
    assert.equal((html.match(/name="features"/g) ?? []).length, individualFeatures.length);
    const response = await system.fetch(request("/plano-individual", {
        method: "POST", body: new URLSearchParams({ features: "agenda", notes: "Visitas semanais" }),
    }));
    const chat = new URL(response.headers.get("location"));
    assert.equal(response.status, 303);
    assert.equal(chat.origin, "https://wa.me");
    assert.match(chat.searchParams.get("text"), /Agenda e visitas.*Visitas semanais/s);
    const undecided = await system.fetch(request("/plano-individual", { method: "POST", body: new URLSearchParams() }));
    assert.match(new URL(undecided.headers.get("location")).searchParams.get("text"), /ajuda para escolher/);
    const invalid = await system.fetch(request("/plano-individual", {
        method: "POST", body: new URLSearchParams([["features", "agenda"], ["features", "agenda"]]),
    }));
    assert.equal(invalid.status, 400);
});

test("a company keeps its capacity and receives only the selected features and dependencies", () => {
    const plan = individualCompanyPlan({ plan: "profissional" }, ["invoices", "quotes"]);
    assert.deepEqual(readIndividualCompany(plan), {
        selection: ["quotes", "invoices"],
        limitPlan: "profissional",
        features: ["dashboard", "quotes", "financeBasic", "finance", "invoices"],
    });
    const another = individualCompanyPlan({ plan: "inicial" }, ["agenda"]);
    assert.deepEqual(readIndividualCompany(another).features, ["dashboard", "agenda"]);
    assert.equal(readIndividualCompany('{"selection":["admin"],"limitPlan":"profissional"}'), null);
    assert.equal(readIndividualCompany(null), null);
});

test("approved settings save atomically while existing billing and other companies are untouched", async () => {
    class RequestError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }
    const current = { status: "active", plan: "intermediario", updated_at: "2026-11-25T12:00:00Z" };
    let saved;
    const input = {
        body: { selection: ["agenda"], updatedAt: current.updated_at }, current, admin: { id: "owner" }, id: "company-a", RequestError,
        updateRows: async (table, changes, filter) => { saved = { table, changes, filter }; return [changes]; },
        async logAudit() {},
    };
    const answer = await configureIndividualCompany(input);
    assert.equal((await answer.json()).plan, "individual");
    assert.deepEqual(saved.filter, { id: "company-a", updated_at: current.updated_at });
    assert.deepEqual(Object.keys(saved.changes).sort(), ["individual_plan", "plan", "updated_at"]);
    await assert.rejects(configureIndividualCompany({ ...input, body: { ...input.body, updatedAt: "2026-11-22T12:00:00Z" } }), { status: 409 });
    await assert.rejects(configureIndividualCompany({ ...input, current: { ...current, pending_plan: "profissional" } }), { status: 409 });
});

test("both health endpoints report the same identified release and keep other responses", async () => {
    const control = withIndividualPlan(original, "control", {});
    const [one, two] = await Promise.all([system, control].map(app => app.fetch(request("/api/health")).then(result => result.json())));
    assert.deepEqual(one, two);
    assert.equal(one.baselineVersion, "15.23.36");
    assert.equal(await (await system.fetch(request("/api/other"))).text(), "original");
});

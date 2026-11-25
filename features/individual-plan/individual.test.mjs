import assert from "node:assert/strict";
import test from "node:test";
import { configureIndividualCompany, individualCompanyPlan, readIndividualCompany } from "./company.mjs";
import { individualFeatures } from "./catalog.mjs";
import { handleConsultationAdmin, meetingInBrasilia, validateBooking } from "./booking.mjs";
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

const consultationId = "4bf2107b-2b04-48e1-9718-818794ac6baf";
const bookingValues = {
    requestId: consultationId, name: "Lia de Teste", email: "LIA@example.invalid",
    phone: "(61) 99999-0000", date: "2099-03-02", time: "14:30", notes: "Visitas semanais",
};

test("the site holds a consultation request with chosen or undecided resources", async () => {
    const records = [];
    const bookingWorker = withIndividualPlan(original, "system", {}, {
        async assertRateLimit() {},
        async callRpc(name, { p_record }) {
            assert.equal(name, "water_book_individual_consultation");
            records.push(p_record);
            return p_record.id;
        },
    });
    const page = await system.fetch(request("/plano-individual"));
    const html = await page.text();
    assert.equal((html.match(/name="features"/g) ?? []).length, individualFeatures.length);
    assert.match(html, /autocomplete="name".*autocomplete="email".*autocomplete="tel"/s);
    assert.match(html, /type="date".*type="time"/s);
    const send = body => bookingWorker.fetch(request("/plano-individual", { method: "POST", body: new URLSearchParams(body) }));
    const response = await send({ ...bookingValues, features: "agenda" });
    assert.equal(response.status, 201);
    assert.match(await response.text(), /Solicitação recebida.*14:30.*confirma/s);
    assert.deepEqual(records[0].modules, ["agenda"]);
    assert.equal(records[0].contact_email, "lia@example.invalid");
    assert.equal(records[0].contact_phone, "+5561999990000");
    assert.equal(records[0].meeting_at, "2099-03-02T17:30:00.000Z");
    assert.equal((await send(bookingValues)).status, 201);
    assert.deepEqual(records[1].modules, []);
    const invalid = await send({ ...bookingValues, email: "inválido", name: '<img src="">' });
    assert.equal(invalid.status, 400);
    const retry = await invalid.text();
    assert.match(retry, /Informe um e-mail válido/);
    assert.match(retry, /&lt;img src=&quot;&quot;&gt;/);
    assert.doesNotMatch(retry, /<img src="">/);
    assert.equal(records.length, 2);
});

test("validates real future wall-clock times in Brasília", () => {
    const now = new Date("2026-11-25T15:00:00.000Z");
    assert.equal(meetingInBrasilia("2026-11-25", "12:01", now), "2026-11-25T15:01:00.000Z");
    assert.throws(() => meetingInBrasilia("2026-11-25", "11:59", now), /já passou|não passou/);
    assert.throws(() => meetingInBrasilia("2026-11-31", "12:01", now), /válidos/);
    assert.throws(() => validateBooking(new URLSearchParams({ ...bookingValues, phone: "texto" }), now), /DDD/);
});

test("the agenda enforces admin access and revises a pending meeting with an exact checkpoint", async () => {
    const record = {
        ...validateBooking(new URLSearchParams({ ...bookingValues, features: "quotes" })),
        status: "pending", updated_at: "2026-11-25T12:00:00Z",
    };
    const input = { id: record.id, status: "confirmed", updatedAt: record.updated_at };
    const requestStaff = (method, data) => new Request("https://control.watersystem.online/api/admin/individual-consultations", {
        method, body: data ? JSON.stringify(data) : undefined,
    });
    const services = {
        async requireAdmin() { return { id: "platform-owner" }; },
        isTrustedMutation() { return true; },
        async selectRows() { return [record]; },
        async selectOne() { return record; },
        async updateRows(table, changes, where) {
            assert.equal(table, "water_individual_consultations");
            assert.deepEqual(where, { id: record.id, updated_at: record.updated_at, status: "pending" });
            return [{ ...record, ...changes }];
        },
    };
    const unauthorized = await handleConsultationAdmin(requestStaff("GET"), {
        async requireAdmin() { throw Object.assign(new Error("admin only"), { status: 401 }); },
        async selectRows() { assert.fail("A consulta não deve executar para uma visita pública."); },
    });
    assert.equal(unauthorized.status, 401);
    const agenda = await handleConsultationAdmin(requestStaff("GET"), services);
    assert.deepEqual((await agenda.json()).consultations[0].modules, ["Orçamentos em PDF"]);
    const published = await handleConsultationAdmin(requestStaff("PATCH", input), services);
    assert.equal((await published.json()).consultation.status, "confirmed");
    assert.equal((await handleConsultationAdmin(requestStaff("PATCH", { ...input, updatedAt: "outra revisão" }), services)).status, 409);
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

test("styles the fourth card when the home page serves the pricing grid", async () => {
    const home = withIndividualPlan({
        async fetch() {
            return new Response('<html><head></head><body><article class="individual-plan-card"></article></body></html>',
                { headers: { "Content-Type": "text/html" } });
        },
    }, "system", { css: "styles" });
    assert.match(await (await home.fetch(request("/"))).text(), /<link rel="stylesheet" href="\/assets\/water-individual/);
});

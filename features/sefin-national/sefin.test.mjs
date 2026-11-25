import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { handleSefinRequest } from "./api.mjs";
import { dpsDocument, fiscalDate, gzipXml, inflateXml, sefinCompanySettings, sefinDraft, sefinSigner, signFiscalDocument } from "./document.mjs";
import { withSefinWorker } from "./worker.mjs";

const storage = mkdtempSync(join(tmpdir(), "water-sefin-test-"));
const cnpj = "12345678000195";
const key = "1".repeat(50);
const orgId = "company-test";
const settings = {
    cnpj, cityCode: "5300108", serviceCode: "070501", regime: "2", specialRegime: "0", series: "48152", environment: "test",
};
const draft = {
    amount: "180,25", customerName: "João & Maria", customerDocument: "529.982.247-25",
    serviceDescription: "Limpeza & manutenção <teste>", issueDate: "2026-10-15", retention: "1",
    customerCity: "5300108", customerZip: "70000000", customerStreet: "Quadra de teste", customerNumber: "10",
    customerDistrict: "Bairro", customerEmail: "cliente@example.test",
};
const originalSchema = `
    CREATE TABLE fiscal_invoices (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'nfse',
        status TEXT NOT NULL DEFAULT 'rascunho', customer_name TEXT NOT NULL, customer_document TEXT NOT NULL DEFAULT '',
        customer_email TEXT NOT NULL DEFAULT '', service_description TEXT NOT NULL, city TEXT NOT NULL DEFAULT '',
        amount_cents INTEGER NOT NULL DEFAULT 0, issue_date TEXT NOT NULL DEFAULT '', official_number TEXT NOT NULL DEFAULT '',
        access_key TEXT NOT NULL DEFAULT '', xml_url TEXT NOT NULL DEFAULT '', pdf_url TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '', provider_reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE organization_settings (organization_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL, updated_at TEXT NOT NULL);
`;
const authorization = { organization: { id: orgId, role: "owner" }, user: { id: "user-test" } };
class RequestError extends Error {
    constructor(message, status) { super(message); this.status = status; }
}
let secrets;

before(() => {
    const cert = join(storage, "test-cert.pem");
    const privateKey = join(storage, "test-key.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=Water System SEFIN Test", "-addext", "basicConstraints=critical,CA:FALSE",
        "-keyout", privateKey, "-out", cert], { stdio: "ignore" });
    secrets = { WATER_SEFIN_SIGNING_KEY: readFileSync(privateKey, "utf8"), WATER_SEFIN_CERTIFICATE: readFileSync(cert, "utf8") };
});
after(() => rmSync(storage, { recursive: true, force: true }));

function database(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    sqlite.exec(originalSchema + readFileSync(new URL("schema.sql", import.meta.url), "utf8"));
    const adapter = {
        prepare(sql) {
            return { bind(...args) {
                const statement = sqlite.prepare(sql);
                return {
                    run() { return { meta: { changes: statement.run(...args).changes } }; },
                    first() { return statement.get(...args) ?? null; },
                    all() { return { results: statement.all(...args) }; },
                };
            } };
        },
        batch(statements) {
            sqlite.exec("BEGIN");
            try {
                const output = statements.map(statement => statement.run());
                sqlite.exec("COMMIT");
                return output;
            } catch (error) {
                sqlite.exec("ROLLBACK");
                throw error;
            }
        },
    };
    return { sqlite, adapter };
}

function fixture(t, { emitters = { [orgId]: { cnpj, production: true } }, binding, auth = authorization } = {}) {
    const { sqlite, adapter } = database(t);
    const env = {
        ...secrets,
        WATER_SEFIN_TLS: binding,
        WATER_SEFIN_EMITTERS: JSON.stringify(emitters),
    };
    const services = {
        requireTenant: request => {
            if (request.headers.get("X-Test-Authenticated") !== "1") throw new RequestError("Acesso não autorizado.", 401);
            return auth;
        },
        assertPlanFeature: (organization, feature) => {
            if (organization.excluded === feature) throw new RequestError("Recurso fora do plano.", 403);
        },
        canFinance: role => role !== "technician",
        database: () => adapter,
        assertRateLimit: () => {},
        RequestError,
    };
    async function request(input, options = {}) {
        const response = await handleSefinRequest(new Request("https://watersystem.example.test/api/finance/sefin" + (options.query ?? ""), {
            method: input ? "POST" : "GET",
            headers: { "Content-Type": "application/json", "x-organization-id": options.organization ?? auth.organization.id,
                "X-Test-Authenticated": options.authenticated === false ? "0" : "1", ...(options.headers ?? {}) },
            body: input ? JSON.stringify(input) : undefined,
        }), env, services);
        return { status: response.status, response,
            data: response.headers.get("Content-Type")?.includes("json") ? await response.clone().json() : null };
    }
    return { request, sqlite, env };
}

async function prepare(request, configuration = settings) {
    assert.equal((await request({ action: "saveSettings", ...configuration })).status, 200);
    const response = await request({ action: "saveDraft", ...draft });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data.invoice.id;
}

async function authorizedXml(signed, accessKey = key) {
    const idDps = /<infDPS Id="(DPS[0-9]{42})"/.exec(signed)?.[1];
    assert.ok(idDps);
    const nfse = '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS' + accessKey +
        '"><nNFSe>123</nNFSe>' + signed + '</infNFSe></NFSe>';
    return { idDps, chaveAcesso: accessKey, nfseXmlGZipB64: await gzipXml(nfse) };
}

test("the fiscal screen has no data or configuration before authorization", async t => {
    const { request } = fixture(t);
    assert.equal((await request(null, { authenticated: false })).status, 401);
    assert.equal((await request(null, { organization: "different" })).status, 403);
    const data = await request();
    assert.equal(data.status, 200);
    assert.deepEqual(data.data.invoices, []);
    assert.equal(data.data.settings, null);
    assert.equal(data.data.certificateInstalled, false);
    assert.equal(data.data.emitterApproved, false);
    assert.equal(JSON.stringify(data.data).includes("PRIVATE KEY"), false);
});

test("the tenant must have the fiscal module and a company administrator configures issuance", async t => {
    const membership = { ...authorization, organization: { ...authorization.organization, role: "member" } };
    const { request } = fixture(t, { auth: membership });
    assert.equal((await request()).status, 200);
    assert.equal((await request({ action: "saveSettings", ...settings })).status, 403);
    const blocked = fixture(t, { auth: { ...authorization, organization: { ...authorization.organization, excluded: "invoices" } } });
    assert.equal((await blocked.request()).status, 403);
    const origin = fixture(t);
    assert.equal((await origin.request({ action: "saveSettings", ...settings }, { headers: { Origin: "https://different.example.test" } })).status, 403);
});

test("drafts and legacy records stay visible while the certificate is pending", async t => {
    const { request, sqlite } = fixture(t, { emitters: {} });
    sqlite.exec(`
        INSERT INTO fiscal_invoices(id, organization_id, type, status, customer_name, service_description, pdf_url, provider, created_at, updated_at)
        VALUES('legacy', 'company-test', 'nfe', 'registrada', 'Cliente Antigo', 'Venda', 'https://old.example.test/nota.pdf', 'portal_estadual', '2026-10-01', '2026-10-01'),
        ('other', 'other-company', 'nfe', 'registrada', 'Outra Empresa', 'Venda', '', 'portal_estadual', '2026-10-01', '2026-10-01');
    `);
    const id = await prepare(request);
    assert.equal((await request({ action: "issue", id, environment: "test" })).status, 409);
    assert.equal((await request({ action: "discard", id: "other" })).status, 404);
    const result = await request();
    assert.equal(result.data.invoices.length, 2);
    assert.equal(result.data.invoices.find(row => row.id === "legacy").pdfUrl, "https://old.example.test/nota.pdf");
    assert.equal(result.data.invoices.find(row => row.id === id).status, "rascunho");
});

test("issues once concurrently, downloads the authorized files and confirms cancellation", async t => {
    const calls = [];
    const { request } = fixture(t, { binding: {
        async fetch(url, options) {
            calls.push({ url, method: options.method });
            assert.equal(options.redirect, "error");
            if (url.endsWith("/nfse")) {
                assert.match(url, /^https:\/\/sefin\.producaorestrita\.nfse\.gov\.br\/SefinNacional\//);
                const signed = await inflateXml(JSON.parse(options.body).dpsXmlGZipB64);
                assert.match(signed, /<tpAmb>2<\/tpAmb>/);
                assert.match(signed, /João &amp; Maria/);
                assert.match(signed, /<vServ>180\.25<\/vServ>/);
                assert.match(signed, /<cLocEmi>5300108<\/cLocEmi>/);
                return Response.json(await authorizedXml(signed), { status: 201 });
            }
            if (url.endsWith("/eventos")) {
                const xml = await inflateXml(JSON.parse(options.body).pedidoRegistroEventoXmlGZipB64);
                assert.match(xml, /<CNPJAutor>12345678000195<\/CNPJAutor>/);
                return Response.json({ eventoXmlGZipB64: await gzipXml("<evento>" + xml + "</evento>") }, { status: 201 });
            }
            assert.equal(url, "https://adn.producaorestrita.nfse.gov.br/danfse/" + key);
            return new Response("%PDF-1.7\n", { headers: { "Content-Type": "application/pdf" } });
        },
    } });
    const id = await prepare(request);
    const outputs = await Promise.all([
        request({ action: "issue", id, environment: "test" }),
        request({ action: "issue", id, environment: "test" }),
    ]);
    assert.deepEqual(outputs.map(item => item.status).sort(), [200, 409]);
    assert.equal(calls.filter(call => call.url.endsWith("/nfse")).length, 1);
    let [row] = (await request()).data.invoices;
    assert.equal(row.status, "homologada");
    assert.equal(row.officialNumber, "123");
    const xml = await request(null, { query: "?file=xml&id=" + id });
    assert.equal(xml.response.headers.get("Cache-Control"), "private, no-store");
    assert.match(await xml.response.text(), /<nNFSe>123<\/nNFSe>/);
    const pdf = await request(null, { query: "?file=pdf&id=" + id });
    assert.equal(pdf.status, 200);
    assert.equal(await pdf.response.text(), "%PDF-1.7\n");
    assert.equal((await request({ action: "cancel", id, reason: "1", description: "Descrição de cancelamento de homologação" })).status, 200);
    [row] = (await request()).data.invoices;
    assert.equal(row.status, "cancelada");
    assert.equal((await request(null, { query: "?file=xml&id=" + id })).status, 200);
});

test("a lost response is reconciled using the same declaration without another issuance", async t => {
    let authorized;
    let count = 0;
    const { request } = fixture(t, { binding: {
        async fetch(url, options) {
            if (options.method === "POST") {
                count++;
                authorized = await authorizedXml(await inflateXml(JSON.parse(options.body).dpsXmlGZipB64));
                throw new Error("simulated timeout");
            }
            if (url.endsWith("/" + authorized.idDps)) return Response.json({ chaveAcesso: key });
            assert.ok(url.endsWith("/" + key));
            return Response.json(authorized);
        },
    } });
    const id = await prepare(request);
    assert.equal((await request({ action: "issue", id, environment: "test" })).status, 202);
    assert.equal((await request({ action: "issue", id, environment: "test" })).status, 409);
    assert.equal((await request({ action: "refresh", id })).data.status, "homologada");
    assert.equal(count, 1);
});

test("treats a definitive rejection as correctable and does not credit a different DPS", async t => {
    let rejected = true;
    const { request } = fixture(t, { binding: {
        async fetch(url, options) {
            if (rejected) return Response.json({ erros: [{ codigo: "E0120", descricao: "Conferir inscrição municipal." }] }, { status: 400 });
            const xml = await inflateXml(JSON.parse(options.body).dpsXmlGZipB64);
            return Response.json(await authorizedXml(xml.replace(/<DigestValue>[^<]+<\/DigestValue>/, "<DigestValue>AAAA</DigestValue>")), { status: 201 });
        },
    } });
    const id = await prepare(request);
    assert.equal((await request({ action: "issue", id, environment: "test" })).status, 422);
    assert.equal((await request()).data.invoices[0].status, "erro");
    assert.equal((await request({ action: "saveDraft", id, ...draft })).status, 200);
    rejected = false;
    assert.equal((await request({ action: "issue", id, environment: "test" })).status, 202);
    assert.equal((await request()).data.invoices[0].status, "processando");
});

test("production requires a production approval for the exact company and explicit confirmation", async t => {
    let count = 0;
    const binding = {
        async fetch(url, options) {
            count++;
            assert.equal(url, "https://sefin.nfse.gov.br/SefinNacional/nfse");
            const xml = await inflateXml(JSON.parse(options.body).dpsXmlGZipB64);
            assert.match(xml, /<tpAmb>1<\/tpAmb>/);
            return Response.json(await authorizedXml(xml), { status: 201 });
        },
    };
    const blocked = fixture(t, { binding, emitters: { [orgId]: { cnpj, production: false } } });
    const id = await prepare(blocked.request, { ...settings, environment: "production" });
    assert.equal((await blocked.request({ action: "issue", id, environment: "production" })).status, 409);
    assert.equal(count, 0);

    const allowed = fixture(t, { binding });
    const approved = await prepare(allowed.request, { ...settings, environment: "production" });
    assert.equal((await allowed.request({ action: "issue", id: approved, environment: "test" })).status, 409);
    assert.equal((await allowed.request({ action: "issue", id: approved, environment: "production" })).data.status, "emitida");
    assert.equal(count, 1);
});

test("signs a domestic Simples declaration with scheme-compatible dates and fields", async () => {
    const form = sefinCompanySettings({ ...settings, regime: "3", taxAssessment: "1", totalTaxRate: "6,25" });
    const normalized = sefinDraft(draft, form, new Date("2026-10-15T11:00:00Z"));
    const signing = await sefinSigner({ ...secrets, WATER_SEFIN_TLS: { fetch() {} } });
    const xml = await signFiscalDocument(dpsDocument(form, normalized, 30, new Date("2026-10-15T11:00:00Z")), signing);
    assert.match(xml, /<dhEmi>2026-10-15T11:00:00\+00:00<\/dhEmi>/);
    assert.match(xml, /<opSimpNac>3<\/opSimpNac><regApTribSN>1<\/regApTribSN>/);
    assert.match(xml, /<pTotTribSN>6\.25<\/pTotTribSN>/);
    assert.match(xml, /<Reference URI="#DPS[0-9]{42}">/);
    assert.equal(fiscalDate(new Date("2026-11-26T02:59:00Z")), "2026-11-25");
    assert.throws(() => sefinDraft({ ...draft, issueDate: "2026-10-16" }, form, new Date("2026-10-15T11:00:00Z")), /competência/);
});

test("only the retired fiscal webhook is blocked and Asaas billing stays delegated", async () => {
    const app = withSefinWorker({ fetch: request => Response.json({ path: new URL(request.url).pathname }) }, "system");
    const makeRequest = path => new Request("https://watersystem.example.test" + path, { method: "POST" });
    assert.equal((await (await app.fetch(makeRequest("/api/finance/sefin"))).json()).path, "/api/finance/sefin");
    assert.equal((await app.fetch(makeRequest("/api/finance/asaas-webhook"))).status, 410);
    assert.equal((await app.fetch(makeRequest("/api/billing/asaas-webhook"))).status, 200);
});

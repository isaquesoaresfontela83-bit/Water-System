import {
    authorizedInvoice, cancellationDocument, dpsDocument, fiscalDigits, gzipXml, inflateXml,
    sefinCompanySettings, sefinDraft, SefinError, sefinSigner, signFiscalDocument,
} from "./document.mjs";

const apiRoots = {
    test: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    production: "https://sefin.nfse.gov.br/SefinNacional",
};
const pdfRoots = {
    test: "https://adn.producaorestrita.nfse.gov.br/danfse",
    production: "https://adn.nfse.gov.br/danfse",
};
const pageSize = 50;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status = 200) => Response.json(data, { status, headers });
const invoiceColumns = `
    SELECT i.id, i.type, i.status, i.customer_name AS customerName, i.customer_document AS customerDocument,
        i.customer_email AS customerEmail, i.service_description AS serviceDescription, i.city,
        i.amount_cents AS amountCents, i.issue_date AS issueDate, i.notes, i.created_at AS createdAt,
        i.official_number AS officialNumber, i.access_key AS accessKey, i.xml_url AS xmlUrl, i.pdf_url AS pdfUrl,
        i.provider, i.provider_reference AS providerReference, d.environment, d.message, d.dps_id AS dpsId,
        d.draft_json AS draftJson, d.settings_json AS settingsJson, d.revision
    FROM fiscal_invoices i LEFT JOIN water_sefin_documents d
    ON d.invoice_id = i.id AND d.organization_id = i.organization_id`;

function approvedEmitter(env, organizationId) {
    try {
        const entries = JSON.parse(env.WATER_SEFIN_EMITTERS || "{}");
        if (!Object.hasOwn(entries, organizationId)) return null;
        const value = entries[organizationId];
        return /^\d{14}$/.test(value?.cnpj) ? { cnpj: value.cnpj, production: value.production === true } : null;
    } catch {
        return null;
    }
}

function assertApproval(env, organizationId, settings) {
    const approved = approvedEmitter(env, organizationId);
    if (approved?.cnpj !== settings.cnpj || settings.environment === "production" && !approved.production)
        throw new SefinError("O Water System precisa confirmar o credenciamento deste CNPJ e a procuração para este ambiente.", 409);
}

function assertRegisteredCnpj(companyDocument, cnpj) {
    if (companyDocument && companyDocument !== cnpj)
        throw new SefinError("O CNPJ emissor deve corresponder ao cadastro da empresa.", 409);
}

async function businessDocument(db, organizationId) {
    const company = await db.prepare("SELECT settings_json FROM organization_settings WHERE organization_id = ?").bind(organizationId).first();
    return fiscalDigits(company ? JSON.parse(company.settings_json).document : "");
}

async function readSettings(db, organizationId) {
    const row = await db.prepare("SELECT settings_json FROM water_sefin_settings WHERE organization_id = ?").bind(organizationId).first();
    return row ? JSON.parse(row.settings_json) : null;
}

function fileName(value) {
    return /^[\w.-]{1,130}$/.test(value) ? value : "";
}

function historicalUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch { /* A legacy row may have neither file. */ }
    return "";
}

function publicInvoice(row) {
    const { providerReference, draftJson, settingsJson, revision, ...invoice } = row;
    let attachmentId = "";
    if (invoice.provider.startsWith("portal_")) {
        try { attachmentId = fileName(JSON.parse(providerReference || "{}").attachmentId ?? ""); } catch { /* Older references may be empty. */ }
    }
    return { ...invoice, attachmentId, pdfUrl: historicalUrl(invoice.pdfUrl), xmlUrl: historicalUrl(invoice.xmlUrl),
        draft: row.status === "rascunho" || row.status === "erro" ? (draftJson ? JSON.parse(draftJson) : null) : null };
}

async function listInvoices(context, query) {
    const { db, env, organization, canManage } = context;
    const page = Number(query.get("page") || 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new SefinError("Página inválida.");
    const [invoices, settings, companyDocument] = await Promise.all([
        db.prepare(invoiceColumns + " WHERE i.organization_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?")
            .bind(organization.id, pageSize + 1, page * pageSize).all(),
        readSettings(db, organization.id),
        businessDocument(db, organization.id),
    ]);
    const approved = approvedEmitter(env, organization.id);
    const signerCnpj = fiscalDigits(env.WATER_SEFIN_SIGNER_CNPJ);
    const certificateInstalled = Boolean(env.WATER_SEFIN_TLS?.fetch && env.WATER_SEFIN_SIGNING_KEY && env.WATER_SEFIN_CERTIFICATE);
    return json({
        canManage, settings, companyDocument, signerCnpj: signerCnpj.length === 14 ? signerCnpj : "",
        certificateInstalled, emitterApproved: Boolean(approved && settings && approved.cnpj === settings.cnpj &&
            (!companyDocument || companyDocument === settings.cnpj) && (settings.environment === "test" || approved.production)),
        invoices: invoices.results.slice(0, pageSize).map(publicInvoice), hasMore: invoices.results.length > pageSize,
    });
}

async function saveSettings({ db, env, organization, canManage }, input) {
    if (!canManage) throw new SefinError("Somente a administração da empresa pode configurar a emissão.", 403);
    const settings = sefinCompanySettings(input);
    assertRegisteredCnpj(await businessDocument(db, organization.id), settings.cnpj);
    const approval = approvedEmitter(env, organization.id);
    if (approval && approval.cnpj !== settings.cnpj)
        throw new SefinError("Este CNPJ difere do emitente habilitado para a empresa.", 409);
    await db.prepare(`
        INSERT INTO water_sefin_settings(organization_id, settings_json, updated_at) VALUES(?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    `).bind(organization.id, JSON.stringify(settings), new Date().toISOString()).run();
    return json({ settings });
}

async function findInvoice({ db, organization }, id) {
    if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) throw new SefinError("Selecione uma nota fiscal.");
    const row = await db.prepare(invoiceColumns + " WHERE i.id = ? AND i.organization_id = ?")
        .bind(id, organization.id).first();
    if (!row) throw new SefinError("Nota fiscal não encontrada nesta empresa.", 404);
    return row;
}

async function saveDraft(context, input) {
    const { db, organization } = context;
    const previous = input.id ? await findInvoice(context, input.id) : null;
    if (previous && !(previous.type === "nfse" &&
        (previous.status === "rascunho" && !previous.provider || previous.status === "erro" && previous.provider === "sefin")))
        throw new SefinError("Esta nota já foi enviada. Consulte a situação.", 409);
    const settings = await readSettings(db, organization.id);
    if (!settings) throw new SefinError("Salve a configuração fiscal da empresa antes de preparar a nota.", 409);
    assertRegisteredCnpj(await businessDocument(db, organization.id), settings.cnpj);
    const now = new Date();
    const draft = sefinDraft(input, settings, now);
    const id = previous?.id ?? crypto.randomUUID();
    const stamp = now.toISOString();
    const revision = crypto.randomUUID();
    const values = [draft.customerName, draft.customerDocument, draft.customerEmail, draft.serviceDescription,
        draft.cityCode, draft.amountCents, draft.issueDate, draft.notes];
    const write = previous ? db.prepare(`
        UPDATE fiscal_invoices SET customer_name = ?, customer_document = ?, customer_email = ?, service_description = ?,
            city = ?, amount_cents = ?, issue_date = ?, notes = ?, updated_at = ?, status = 'rascunho', provider = '', provider_reference = ''
        WHERE id = ? AND organization_id = ? AND status = ? AND provider = ?
    `).bind(...values, stamp, id, organization.id, previous.status, previous.provider) : db.prepare(`
        INSERT INTO fiscal_invoices (id, organization_id, type, status, customer_name, customer_document, customer_email,
            service_description, city, amount_cents, issue_date, notes, created_at, updated_at)
        VALUES (?, ?, 'nfse', 'rascunho', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, organization.id, ...values, stamp, stamp);
    const [result] = await db.batch([
        write,
        db.prepare(`
            INSERT INTO water_sefin_documents(invoice_id, organization_id, environment, draft_json, settings_json, revision)
            SELECT id, organization_id, ?, ?, ?, ? FROM fiscal_invoices
            WHERE id = ? AND organization_id = ? AND status = 'rascunho' AND updated_at = ?
            ON CONFLICT(invoice_id) DO UPDATE SET environment = excluded.environment, draft_json = excluded.draft_json,
                settings_json = excluded.settings_json, revision = excluded.revision,
                dps_id = NULL, dps_payload = NULL, submitted_at = NULL, message = ''
        `).bind(settings.environment, JSON.stringify(draft), JSON.stringify(settings), revision, id, organization.id, stamp),
    ]);
    if (!result.meta.changes) throw new SefinError("A situação da nota mudou. Atualize a lista.", 409);
    return json({ invoice: publicInvoice(await findInvoice(context, id)) }, previous ? 200 : 201);
}

async function providerResponse(env, root, path, options) {
    if (!env.WATER_SEFIN_TLS?.fetch) throw new SefinError("A conexão com a SEFIN Nacional aguarda o certificado do servidor.", 503);
    const signal = AbortSignal.timeout(18000);
    return env.WATER_SEFIN_TLS.fetch(root + path, { ...options, signal, redirect: "error" });
}

async function readBounded(response, maxBytes) {
    if (!response.body) return new Uint8Array();
    const stream = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { value, done } = await stream.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
            await stream.cancel();
            throw new SefinError("O documento retornado pela SEFIN excede o limite de leitura.", 502);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}

async function sefinRequest(env, environment, path, body) {
    const response = await providerResponse(env, apiRoots[environment], path, {
        method: body ? "POST" : "GET",
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.headers.get("Content-Type")?.includes("json")) return { status: response.status, data: null };
    const bytes = await readBounded(response, 600000);
    try {
        return { status: response.status, data: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
        return { status: response.status, data: null };
    }
}

function rejection(result) {
    const errors = Array.isArray(result.data?.erros) ? result.data.erros : result.data?.erro ? [result.data.erro] : [];
    const codes = errors.map(item => String(item?.codigo ?? ""));
    const message = errors.slice(0, 3).map(error => [error?.codigo, error?.descricao, error?.complemento]
        .filter(part => typeof part === "string").join(" ")).join(" ").slice(0, 480);
    return { codes, message };
}

async function persistIssuance({ db, organization }, row, response) {
    const submitted = await db.prepare("SELECT dps_payload FROM water_sefin_documents WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
        .bind(row.id, organization.id, row.dpsId).first();
    const result = await authorizedInvoice(response, {
        dps_id: row.dpsId, environment: row.environment, sentXml: await inflateXml(submitted?.dps_payload),
    });
    const status = row.environment === "production" ? "emitida" : "homologada";
    await db.batch([
        db.prepare(`
            UPDATE water_sefin_documents SET authorized_xml = ?, message = '' WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?
        `).bind(result.compressedXml, row.id, organization.id, row.dpsId),
        db.prepare(`
            UPDATE fiscal_invoices SET status = ?, access_key = ?, official_number = ?, updated_at = ?
            WHERE id = ? AND organization_id = ? AND provider = 'sefin' AND provider_reference = ? AND status = 'processando'
        `).bind(status, result.key, result.number, new Date().toISOString(), row.id, organization.id, row.dpsId),
    ]);
    return json({ status, message: status === "emitida" ? "NFS-e autorizada pela SEFIN Nacional." : "NFS-e de teste autorizada. Documento sem validade fiscal." });
}

async function consultDps({ env }, row) {
    const result = await sefinRequest(env, row.environment, "/dps/" + row.dpsId);
    if (result.status === 404) return null;
    const key = String(result.data?.chaveAcesso ?? "");
    if (result.status !== 200 || !/^\d{50}$/.test(key))
        throw new SefinError("A SEFIN Nacional ainda não confirmou a declaração. Consulte novamente.", 502);
    const note = await sefinRequest(env, row.environment, "/nfse/" + key);
    if (note.status !== 200 || !note.data) throw new SefinError("A SEFIN Nacional ainda não devolveu o XML da nota.", 502);
    return { ...note.data, chaveAcesso: note.data.chaveAcesso ?? key };
}

async function persistMessage({ db, organization }, row, message) {
    await db.prepare("UPDATE water_sefin_documents SET message = ? WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
        .bind(message, row.id, organization.id, row.dpsId).run();
}

async function sendDps(context, row, compressed) {
    let result;
    try {
        result = await sefinRequest(context.env, row.environment, "/nfse", { dpsXmlGZipB64: compressed });
        if (result.status === 201 && result.data) return await persistIssuance(context, row, result.data);
    } catch {
        await persistMessage(context, row, "Envio sem confirmação. Consulte a situação antes de reenviar a mesma declaração.");
        return json({ status: "processando", message: "A SEFIN Nacional ainda não confirmou o envio." }, 202);
    }
    const { codes, message } = rejection(result);
    // A repeated DPS can be authorized even when the original HTTPS response was lost.
    const possibleDuplicate = result.status === 409 || codes.includes("E0014") ||
        /duplic|j[aá]\s+existe|j[aá]\s+(foi\s+)?(emitida|processada|recepcionada)/iu.test(message);
    if (result.status === 400 && message && !possibleDuplicate) {
        await context.db.batch([
            context.db.prepare(`
                UPDATE fiscal_invoices SET status = 'erro', updated_at = ? WHERE organization_id = ? AND id = ?
                AND provider_reference = ? AND provider = 'sefin' AND status = 'processando'
            `).bind(new Date().toISOString(), context.organization.id, row.id, row.dpsId),
            context.db.prepare("UPDATE water_sefin_documents SET message = ? WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
                .bind(message, row.id, context.organization.id, row.dpsId),
        ]);
        return json({ status: "erro", message }, 422);
    }
    const statusMessage = message || "A resposta da SEFIN Nacional ficou pendente. Consulte a situação.";
    await persistMessage(context, row, statusMessage);
    return json({ status: "processando", message: statusMessage }, 202);
}

async function issueInvoice(context, row, input) {
    const { db, env, organization } = context;
    if (row.type !== "nfse" || row.status !== "rascunho" || row.provider || !row.draftJson)
        throw new SefinError("Prepare a declaração antes de enviar a nota.", 409);
    if (input.environment !== row.environment) throw new SefinError("Confirme o ambiente da nota antes de enviar.", 409);
    const settings = JSON.parse(row.settingsJson);
    assertRegisteredCnpj(await businessDocument(db, organization.id), settings.cnpj);
    assertApproval(env, organization.id, settings);
    const signer = await sefinSigner(env);
    const allocated = await db.prepare(`
        INSERT INTO water_sefin_sequences(environment, cnpj, city_code, series, last_number) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(environment, cnpj, city_code, series) DO UPDATE SET last_number = last_number + 1
        RETURNING last_number
    `).bind(settings.environment, settings.cnpj, settings.cityCode, settings.series).first();
    const document = dpsDocument(settings, JSON.parse(row.draftJson), allocated?.last_number);
    const payload = await gzipXml(await signFiscalDocument(document, signer));
    const stamp = new Date().toISOString();
    const [claim, documentWrite] = await db.batch([
        db.prepare(`
            UPDATE fiscal_invoices SET status = 'processando', provider = 'sefin', provider_reference = ?, updated_at = ?
            WHERE id = ? AND organization_id = ? AND type = 'nfse' AND status = 'rascunho' AND provider = ''
            AND EXISTS (SELECT 1 FROM water_sefin_documents d
                WHERE d.invoice_id = ? AND d.organization_id = ? AND d.revision = ? AND d.dps_id IS NULL)
        `).bind(document.id, stamp, row.id, organization.id, row.id, organization.id, row.revision),
        db.prepare(`
            UPDATE water_sefin_documents SET dps_id = ?, dps_payload = ?, submitted_at = ?, message = ''
            WHERE invoice_id = ? AND organization_id = ? AND revision = ? AND dps_id IS NULL
            AND EXISTS (SELECT 1 FROM fiscal_invoices i WHERE i.id = ? AND i.organization_id = ? AND i.provider_reference = ? AND i.status = 'processando')
        `).bind(document.id, payload, stamp, row.id, organization.id, row.revision, row.id, organization.id, document.id),
    ]);
    if (!claim.meta.changes || !documentWrite.meta.changes)
        throw new SefinError("O rascunho mudou ou já foi enviado. Atualize a lista.", 409);
    return sendDps(context, { ...row, dpsId: document.id }, payload);
}

async function retryDps(context, row) {
    const { db, env, organization } = context;
    const settings = JSON.parse(row.settingsJson);
    assertApproval(env, organization.id, settings);
    const found = await consultDps(context, row);
    if (found) return persistIssuance(context, row, found);
    const threshold = new Date(Date.now() - 60_000).toISOString();
    const stored = await db.prepare(`
        UPDATE water_sefin_documents SET submitted_at = ? WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?
        AND submitted_at <= ? AND EXISTS (SELECT 1 FROM fiscal_invoices i
            WHERE i.id = ? AND i.organization_id = ? AND i.status = 'processando' AND i.provider_reference = ?)
        RETURNING dps_payload
    `).bind(new Date().toISOString(), row.id, organization.id, row.dpsId, threshold, row.id, organization.id, row.dpsId).first();
    if (!stored?.dps_payload) throw new SefinError("Aguarde um minuto após o envio e consulte novamente.", 409);
    return sendDps(context, row, stored.dps_payload);
}

function assertSefinRow(row) {
    if (row.provider !== "sefin" || !Object.hasOwn(apiRoots, row.environment) || !/^DPS\d{42}$/.test(row.dpsId || ""))
        throw new SefinError("Selecione uma nota da SEFIN Nacional.", 409);
}

async function confirmCancellation({ db, organization }, row, result, expectedStatus) {
    const payload = result.data?.eventoXmlGZipB64;
    if (!payload) return false;
    const xml = await inflateXml(payload);
    if (!xml.includes("PRE" + row.accessKey + "101101") || !/<(?:[\w.-]+:)?e101101[\s>]/.test(xml))
        throw new SefinError("A SEFIN Nacional retornou um evento diferente do cancelamento solicitado.", 502);
    await db.batch([
        db.prepare("UPDATE water_sefin_documents SET cancellation_xml = ?, message = '' WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
            .bind(payload, row.id, organization.id, row.dpsId),
        db.prepare("UPDATE fiscal_invoices SET status = 'cancelada', updated_at = ? WHERE id = ? AND organization_id = ? AND provider_reference = ? AND status = ?")
            .bind(new Date().toISOString(), row.id, organization.id, row.dpsId, expectedStatus),
    ]);
    return true;
}

async function refreshInvoice(context, row) {
    assertSefinRow(row);
    if (row.status === "processando") {
        const found = await consultDps(context, row);
        return found ? persistIssuance(context, row, found) :
            json({ status: row.status, message: "A SEFIN Nacional ainda não localizou essa declaração." }, 202);
    }
    if (["cancelando", "emitida", "homologada"].includes(row.status) && /^\d{50}$/.test(row.accessKey)) {
        const event = await sefinRequest(context.env, row.environment, "/nfse/" + row.accessKey + "/eventos/101101/1");
        if (event.status === 200 && await confirmCancellation(context, row, event, row.status))
            return json({ status: "cancelada", message: "Cancelamento confirmado pela SEFIN Nacional." });
        if (event.status !== 404 && event.status !== 200)
            throw new SefinError("Não foi possível consultar os eventos da nota na SEFIN Nacional.", 502);
    }
    return json({ status: row.status, message: row.status === "cancelando" ? "A SEFIN Nacional ainda não confirmou o cancelamento." : "Situação atualizada." });
}

async function cancelInvoice(context, row, input) {
    const { db, env, organization } = context;
    assertSefinRow(row);
    if (!["emitida", "homologada"].includes(row.status))
        throw new SefinError("O cancelamento só pode ser solicitado para uma nota autorizada.", 409);
    const settings = JSON.parse(row.settingsJson);
    assertApproval(env, organization.id, settings);
    const event = cancellationDocument(row.environment, row.accessKey, settings.cnpj, input);
    const payload = await gzipXml(await signFiscalDocument(event, await sefinSigner(env)));
    const [claim] = await db.batch([
        db.prepare("UPDATE fiscal_invoices SET status = 'cancelando', updated_at = ? WHERE id = ? AND organization_id = ? AND provider_reference = ? AND status = ?")
            .bind(new Date().toISOString(), row.id, organization.id, row.dpsId, row.status),
        db.prepare(`
            UPDATE water_sefin_documents SET cancellation_payload = ?, message = ''
            WHERE invoice_id = ? AND organization_id = ? AND dps_id = ? AND cancellation_payload IS NULL
            AND EXISTS (SELECT 1 FROM fiscal_invoices i WHERE i.id = ? AND i.organization_id = ? AND i.status = 'cancelando')
        `).bind(payload, row.id, organization.id, row.dpsId, row.id, organization.id),
    ]);
    if (!claim.meta.changes) throw new SefinError("O cancelamento já está em andamento.", 409);
    let result;
    try {
        result = await sefinRequest(env, row.environment, "/nfse/" + row.accessKey + "/eventos", { pedidoRegistroEventoXmlGZipB64: payload });
        if (result.status === 201 && await confirmCancellation(context, row, result, "cancelando"))
            return json({ status: "cancelada", message: "Cancelamento confirmado pela SEFIN Nacional." });
    } catch {
        return json({ status: "cancelando", message: "A SEFIN Nacional ainda não confirmou o cancelamento." }, 202);
    }
    const { message } = rejection(result);
    if (result.status === 400 && message && !/duplic|j[aá]\s+(existe|registrad)/iu.test(message)) {
        await db.batch([
            db.prepare("UPDATE fiscal_invoices SET status = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND provider_reference = ? AND status = 'cancelando'")
                .bind(row.status, new Date().toISOString(), row.id, organization.id, row.dpsId),
            db.prepare("UPDATE water_sefin_documents SET cancellation_payload = NULL, message = ? WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
                .bind(message, row.id, organization.id, row.dpsId),
        ]);
        return json({ status: row.status, message }, 422);
    }
    return json({ status: "cancelando", message: message || "Consulte a situação do cancelamento." }, 202);
}

async function discardDraft(context, row) {
    if (row.status !== "rascunho" || row.provider)
        throw new SefinError("Somente um rascunho pode ser descartado.", 409);
    const result = await context.db.prepare("UPDATE fiscal_invoices SET status = 'cancelada', updated_at = ? WHERE id = ? AND organization_id = ? AND status = 'rascunho' AND provider = ''")
        .bind(new Date().toISOString(), row.id, context.organization.id).run();
    if (!result.meta.changes) throw new SefinError("A situação da nota mudou. Atualize a lista.", 409);
    return json({ status: "cancelada", message: "Rascunho descartado." });
}

async function download(context, row, format) {
    assertSefinRow(row);
    if (!/^\d{50}$/.test(row.accessKey)) throw new SefinError("O documento fica disponível após a autorização.", 409);
    const fileHeaders = { ...headers, "Content-Security-Policy": "default-src 'none'; sandbox" };
    if (format === "xml") {
        const saved = await context.db.prepare("SELECT authorized_xml FROM water_sefin_documents WHERE invoice_id = ? AND organization_id = ? AND dps_id = ?")
            .bind(row.id, context.organization.id, row.dpsId).first();
        if (!saved?.authorized_xml) throw new SefinError("O XML da nota está indisponível.", 404);
        return new Response(await inflateXml(saved.authorized_xml), { headers: { ...fileHeaders,
            "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFSe-${row.accessKey}.xml"` } });
    }
    if (format !== "pdf") throw new SefinError("Selecione PDF ou XML.");
    const result = await providerResponse(context.env, pdfRoots[row.environment], "/" + row.accessKey, {
        method: "GET", headers: { Accept: "application/pdf" },
    });
    if (result.status !== 200 || !result.headers.get("Content-Type")?.toLowerCase().includes("application/pdf"))
        throw new SefinError("O PDF ainda está indisponível no Portal Nacional.", 502);
    const bytes = await readBounded(result, 2_000_000);
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new SefinError("O Portal Nacional retornou um arquivo fora do formato PDF.", 502);
    return new Response(bytes, { headers: { ...fileHeaders, "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DANFSe-${row.accessKey}.pdf"` } });
}

function actions(context, row, body) {
    if (body.action === "issue") return issueInvoice(context, row, body);
    if (body.action === "refresh") return refreshInvoice(context, row);
    if (body.action === "cancel") return cancelInvoice(context, row, body);
    if (body.action === "discard") return discardDraft(context, row);
    if (body.action === "retry") {
        assertSefinRow(row);
        if (row.status !== "processando") throw new SefinError("Somente uma declaração pendente pode ser reenviada.", 409);
        return retryDps(context, row);
    }
    throw new SefinError("Ação fiscal inválida.");
}

export async function handleSefinRequest(request, env, services) {
    try {
        const { organization, user } = await services.requireTenant(request);
        if (request.headers.get("x-organization-id") !== organization.id)
            throw new SefinError("Selecione a empresa para acessar as notas fiscais.", 403);
        await services.assertPlanFeature(organization, "finance");
        await services.assertPlanFeature(organization, "invoices");
        if (!services.canFinance(organization.role, organization.permissions, "finance", organization.moduleAccess))
            throw new SefinError("Seu perfil não possui acesso às notas fiscais.", 403);
        const canManage = ["owner", "admin"].includes(organization.role);
        const context = { db: services.database(), env, organization, canManage };
        const url = new URL(request.url);
        if (request.method === "GET") {
            const format = url.searchParams.get("file");
            return format ? await download(context, await findInvoice(context, url.searchParams.get("id")), format)
                : await listInvoices(context, url.searchParams);
        }
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin) throw new SefinError("Abra a tela do Water System para continuar.", 403);
        if (!request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase().match(/^application\/json$/))
            throw new SefinError("Use o formulário fiscal do Water System.", 415);
        await services.assertRateLimit(request, "sefin_mutation", user.id, 35, 60);
        const bytes = await readBounded(request, 24000);
        let body;
        try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new SefinError("Confira os dados do formulário fiscal."); }
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new SefinError("Confira os dados do formulário fiscal.");
        if (body.action === "saveSettings") return await saveSettings(context, body);
        if (body.action === "saveDraft") return await saveDraft(context, body);
        return await actions(context, await findInvoice(context, body.id), body);
    } catch (error) {
        if (error instanceof SefinError) return json({ error: error.message }, error.status);
        if (error instanceof services.RequestError) return json({ error: error.message }, error.status);
        return json({ error: "Não foi possível concluir a operação fiscal. Consulte a situação antes de enviar novamente." }, 503);
    }
}

import { individualFeatures, individualNotesLimit, selectIndividualFeatures } from "./catalog.mjs";

export const bookingZone = "America/Sao_Paulo";
export const bookingPath = "/plano-individual";
export const bookingTable = "water_individual_consultations";
export const bookingAdminApi = "/api/admin/individual-consultations";
const bookingId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wallClock = new Intl.DateTimeFormat("en-CA", {
    timeZone: bookingZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const displayMeeting = new Intl.DateTimeFormat("pt-BR", {
    timeZone: bookingZone, dateStyle: "full", timeStyle: "short",
});

export class ConsultationError extends Error {
    constructor(message, status = 400, field = "") {
        super(message);
        this.status = status;
        this.field = field;
    }
}

function partsAt(timestamp) {
    const parts = Object.fromEntries(wallClock.formatToParts(timestamp).map(part => [part.type, part.value]));
    return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute };
}

export function bookingToday(now = Date.now()) {
    return partsAt(now).date;
}

export function describeMeeting(iso) {
    return displayMeeting.format(new Date(iso));
}

export function meetingInBrasilia(date, time, now = Date.now()) {
    const wanted = date + "T" + time;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wanted) || !Number.isFinite(Date.parse(wanted + ":00Z")))
        throw new ConsultationError("Informe uma data e um horário válidos.", 400, "date");
    const localAsUtc = Date.parse(wanted + ":00Z");
    let timestamp = localAsUtc;
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = partsAt(timestamp);
        const observed = current.date + "T" + current.time;
        if (observed === wanted) {
            if (timestamp <= now) throw new ConsultationError("Escolha um horário que ainda não passou.", 400, "time");
            return new Date(timestamp).toISOString();
        }
        timestamp += localAsUtc - Date.parse(observed + ":00Z");
    }
    throw new ConsultationError("Informe uma data e um horário válidos.", 400, "date");
}

export function bookingDraft(form) {
    const fields = { name: 100, email: 254, phone: 32, date: 10, time: 5, notes: individualNotesLimit };
    const result = Object.fromEntries(Object.entries(fields).map(([field, limit]) => [
        field, (form.get(field) ?? "").trim().slice(0, limit),
    ]));
    result.id = bookingId.test(form.get("requestId") ?? "") ? form.get("requestId") : crypto.randomUUID();
    try { result.features = selectIndividualFeatures(form.getAll("features")); }
    catch { result.features = []; }
    return result;
}

export function validateBooking(form, now = Date.now()) {
    const draft = bookingDraft(form);
    for (const [field, limit] of Object.entries({ name: 100, email: 254, phone: 32, date: 10, time: 5, notes: individualNotesLimit })) {
        const values = form.getAll(field);
        if (values.length > 1 || (values[0]?.trim().length ?? 0) > limit || values[0]?.includes("\0"))
            throw new ConsultationError("Confira os dados informados.", 400, field);
    }
    if (!bookingId.test(form.get("requestId") ?? "") || form.getAll("requestId").length !== 1 || form.get("website"))
        throw new ConsultationError("Atualize o formulário e tente novamente.");
    if (draft.name.length < 2) throw new ConsultationError("Informe seu nome.", 400, "name");
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(draft.email))
        throw new ConsultationError("Informe um e-mail válido.", 400, "email");
    const phone = draft.phone.replace(/\D/g, "");
    if (!/^\+?[0-9().\s-]+$/.test(draft.phone) || phone.length < 10 || phone.length > 15)
        throw new ConsultationError("Informe um telefone com DDD.", 400, "phone");
    let features;
    try { features = selectIndividualFeatures(form.getAll("features")); }
    catch { throw new ConsultationError("Confira os recursos escolhidos.", 400); }
    const meeting = meetingInBrasilia(draft.date, draft.time, now);
    return {
        id: draft.id, contact_name: draft.name, contact_email: draft.email.toLowerCase(),
        contact_phone: "+" + (draft.phone.startsWith("+") || phone.length > 11 ? phone : "55" + phone),
        meeting_at: meeting, modules: features, notes: draft.notes,
    };
}

export async function saveConsultation(request, record, { callRpc, assertRateLimit }) {
    await assertRateLimit(request, "individual_consultation", "form", 12, 3600);
    const inserted = await callRpc("water_book_individual_consultation", { p_record: record });
    if (inserted !== record.id) throw new ConsultationError("O pedido mudou. Revise os dados e tente novamente.", 409);
}

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const staffStatuses = ["pending", "confirmed", "cancelled"];
const staffFields = "id,contact_name,contact_email,contact_phone,meeting_at,modules,notes,status,created_at,updated_at";
const moduleLabels = new Map(individualFeatures.map(([id, label]) => [id, label]));
const withModuleLabels = row => ({ ...row, modules: row.modules.map(id => moduleLabels.get(id) ?? id) });

export async function handleConsultationAdmin(request, services) {
    const reply = (body, status = 200) => Response.json(body, { status, headers: privateHeaders });
    try {
        const actor = await services.requireAdmin();
        if (request.method === "GET") {
            const status = new URL(request.url).searchParams.get("status");
            if (status && !staffStatuses.includes(status)) return reply({ error: "Situação inválida." }, 400);
            const consultations = await services.selectRows(bookingTable, status ? { status } : {}, {
                select: staffFields, order: "created_at.desc",
            });
            return reply({ consultations: consultations.map(withModuleLabels) });
        }
        if (request.method !== "PATCH") return reply({ error: "Método inválido." }, 405);
        if (!services.isTrustedMutation(request)) return reply({ error: "Origem da solicitação inválida." }, 403);
        const body = await request.json().catch(() => null);
        if (!bookingId.test(body?.id ?? "") || !["confirmed", "cancelled"].includes(body?.status) || typeof body?.updatedAt !== "string")
            return reply({ error: "Confira a consulta e a atualização solicitada." }, 400);
        const existing = await services.selectOne(bookingTable, { id: body.id }, { select: staffFields });
        if (!existing) return reply({ error: "Consultoria não encontrada." }, 404);
        if (existing.status === body.status) return reply({ consultation: withModuleLabels(existing) });
        if (existing.updated_at !== body.updatedAt || existing.status === "cancelled")
            return reply({ error: "A consultoria mudou. Atualize a agenda e tente novamente." }, 409);
        if (body.status === "confirmed" && Date.parse(existing.meeting_at) <= Date.now())
            return reply({ error: "O horário solicitado já passou." }, 409);

        const [consultation] = await services.updateRows(bookingTable, {
            status: body.status, updated_at: new Date().toISOString(), reviewed_by: actor.id,
        }, { id: body.id, updated_at: body.updatedAt, status: existing.status });
        if (!consultation) return reply({ error: "A consultoria mudou. Atualize a agenda e tente novamente." }, 409);
        delete consultation.reviewed_by;
        return reply({ consultation: withModuleLabels(consultation) });
    } catch (error) {
        if (error.status === 401 || error.status === 403) return reply({ error: "Entre com uma conta de administração." }, error.status);
        if (error.code === "23505") return reply({ error: "Já existe uma consultoria confirmada nesse horário." }, 409);
        return reply({ error: "Não foi possível concluir a operação. Tente novamente." }, 503);
    }
}

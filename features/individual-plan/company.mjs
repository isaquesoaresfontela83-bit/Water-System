import { individualFeatures, selectIndividualFeatures } from "./catalog.mjs";

const regularPlans = new Set(["inicial", "intermediario", "profissional"]);
const dependencies = {
    finance: ["financeBasic"],
    invoices: ["finance", "financeBasic"],
    branches: ["team"],
    mobile: ["agenda", "orders"],
};

export function individualAccessFeatures(selection) {
    const chosen = new Set(selectIndividualFeatures(selection));
    for (const [module, requirements] of Object.entries(dependencies)) {
        if (chosen.has(module)) requirements.forEach(id => chosen.add(id));
    }
    return ["dashboard", ...individualFeatures.map(([id]) => id).filter(id => chosen.has(id))];
}

export function readIndividualCompany(configuration) {
    try {
        const value = typeof configuration === "string" ? JSON.parse(configuration) : configuration;
        if (!value || !regularPlans.has(value.limitPlan) || !Array.isArray(value.selection) || !value.selection.length) return null;
        const selection = selectIndividualFeatures(value.selection);
        return { selection, limitPlan: value.limitPlan, features: individualAccessFeatures(selection) };
    } catch {
        return null;
    }
}

export function individualCompanyPlan(current, selection) {
    const modules = selectIndividualFeatures(selection);
    if (!modules.length) throw new TypeError("Selecione ao menos um recurso acordado na consultoria.");
    const limitPlan = current.plan === "individual"
        ? readIndividualCompany(current.individual_plan)?.limitPlan
        : current.plan;
    return JSON.stringify({ selection: modules, limitPlan: regularPlans.has(limitPlan) ? limitPlan : "inicial" });
}

export async function configureIndividualCompany({ body, current, admin, id, updateRows, logAudit, RequestError }) {
    if (current.status === "deleted" || current.parent_organization_id)
        throw new RequestError("Configure o plano Individual em uma matriz cadastrada.", 400);
    if (typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt)))
        throw new RequestError("Recarregue a empresa antes de salvar.", 400);
    if (Date.parse(current.updated_at) !== Date.parse(body.updatedAt))
        throw new RequestError("A empresa foi atualizada. Recarregue a lista para continuar.", 409);
    if (current.pending_plan || current.plan_status === "pending_payment" && current.billing_payment_id)
        throw new RequestError("Conclua a cobrança pendente da empresa antes de mudar o plano.", 409);
    let configuration;
    try {
        configuration = individualCompanyPlan(current, body.selection);
    } catch (error) {
        throw new RequestError(error.message, 400);
    }
    if (current.plan === "individual" && current.individual_plan === configuration)
        return Response.json({ verified: true, id, plan: current.plan, individualPlan: configuration, updatedAt: current.updated_at });
    const updatedAt = new Date().toISOString();
    const changes = { plan: "individual", individual_plan: configuration, updated_at: updatedAt };
    const [updated] = await updateRows("organizations", changes, { id, updated_at: current.updated_at });
    if (!updated || updated.plan !== "individual" || updated.individual_plan !== configuration)
        throw new RequestError("A empresa mudou enquanto você salvava. Recarregue a lista.", 409);
    await logAudit({
        organizationId: id, actorUserId: admin.id, eventType: "security", entityType: "organizations",
        recordId: id, metadata: { action: "admin_individual_plan", features: readIndividualCompany(configuration).features },
    }).catch(() => console.warn("admin_individual_plan_audit_unavailable"));
    return Response.json({ verified: true, id, plan: updated.plan, individualPlan: configuration, updatedAt: updated.updated_at });
}

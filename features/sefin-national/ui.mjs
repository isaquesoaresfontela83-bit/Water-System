const endpoint = "/api/finance/sefin";
const labels = {
    rascunho: "Rascunho", processando: "Aguardando confirmação", emitida: "Autorizada",
    homologada: "Teste autorizado", erro: "Rejeitada", cancelando: "Cancelamento em análise",
    cancelada: "Cancelada", registrada: "Registrada",
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brazilDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : "—";

function messageFrom(payload, fallback) {
    return payload?.error || payload?.message || fallback;
}

export function createSefinUi(React) {
    const { createElement: h, useEffect, useState } = React;

    function button(label, action, props = {}) {
        return h("button", { type: "button", className: "button", onClick: action, ...props }, label);
    }

    function field(name, label, { value = "", required = false, options, multiline, ...props } = {}) {
        const input = { name, defaultValue: value, required, ...props };
        const control = options ? h("select", input, options.map(([id, text]) => h("option", { key: id, value: id }, text))) :
            multiline ? h("textarea", input) : h("input", { type: "text", ...input });
        return h("label", { className: "form-field" }, h("span", null, label), control);
    }

    function SefinSettingsShortcut() {
        return h("section", { className: "surface settings-section" },
            h("div", { className: "panel-heading" }, h("h2", null, "SEFIN Nacional")),
            h("p", { className: "finance-help" }, "Configure a emissão de NFS-e para esta empresa na área de notas fiscais."),
            h("a", { href: "#invoices", className: "button" }, "Abrir notas fiscais"));
    }

    function SettingsForm({ data, disabled, onSave }) {
        const current = data.settings ?? {};
        const [regime, setRegime] = useState(current.regime ?? "");
        return h("form", { className: "finance-form", onSubmit: onSave },
            field("cnpj", "CNPJ do prestador", { value: current.cnpj ?? data.companyDocument, required: true, inputMode: "numeric", maxLength: 18 }),
            field("cityCode", "Município emissor (código IBGE)", { value: current.cityCode, required: true, inputMode: "numeric", maxLength: 7 }),
            field("municipalRegistration", "Inscrição municipal", { value: current.municipalRegistration, maxLength: 15 }),
            field("serviceCode", "Código nacional do serviço", { value: current.serviceCode, required: true, inputMode: "numeric", maxLength: 10 }),
            field("municipalServiceCode", "Especialização municipal", { value: current.municipalServiceCode, inputMode: "numeric", maxLength: 3 }),
            field("nbs", "Código NBS", { value: current.nbs, inputMode: "numeric", maxLength: 12 }),
            field("regime", "Enquadramento", { value: regime, required: true, onChange: event => setRegime(event.target.value),
                options: [["", "Selecione"], ["2", "MEI"], ["3", "Simples Nacional (ME/EPP)"]] }),
            regime === "3" && field("taxAssessment", "Apuração no Simples Nacional", { value: current.taxAssessment, required: true,
                options: [["", "Selecione"], ["1", "Tributos federais e ISS no Simples"], ["2", "Tributos federais no Simples e ISS fora"], ["3", "Tributos federais e ISS fora"]] }),
            regime === "3" && field("totalTaxRate", "Percentual aproximado de tributos (%)", {
                value: current.totalTaxRate, required: true, inputMode: "decimal", maxLength: 5,
            }),
            field("specialRegime", "Regime especial", { value: current.specialRegime ?? "0",
                options: [["0", "Nenhum"], ["1", "Ato cooperado"], ["2", "Estimativa"], ["3", "Microempresa municipal"],
                    ["4", "Notário ou registrador"], ["5", "Profissional autônomo"], ["6", "Sociedade de profissionais"], ["9", "Outros"]] }),
            field("series", "Série DPS reservada para o Water System", { value: current.series, required: true, type: "number", min: 1, max: 49999 }),
            field("environment", "Ambiente", { value: current.environment ?? "test", required: true,
                options: [["test", "Homologação"], ["production", "Produção"]] }),
            h("p", { className: "finance-help" }, "Confirme o enquadramento e os códigos do serviço com a contabilidade."),
            h("button", { type: "submit", className: "button", disabled }, "Salvar configuração"));
    }

    function DraftForm({ settings, invoice, disabled, onSave, onClose }) {
        const draft = invoice?.draft ?? invoice ?? {};
        const address = draft.customerAddress ?? {};
        return h("form", { className: "finance-form", onSubmit: onSave },
            field("customerName", "Cliente ou razão social", { value: draft.customerName, required: true, maxLength: 150 }),
            field("customerDocument", "CPF ou CNPJ do cliente", { value: draft.customerDocument, required: true, inputMode: "numeric", maxLength: 18 }),
            field("customerEmail", "E-mail do cliente", { value: draft.customerEmail, type: "email", maxLength: 80 }),
            field("issueDate", "Data de competência", { value: draft.issueDate ?? brazilDate.format(new Date()), required: true, type: "date" }),
            field("amount", "Valor do serviço (R$)", { value: draft.amountCents ? (draft.amountCents / 100).toFixed(2) : "", required: true, inputMode: "decimal" }),
            field("cityCode", "Município do serviço (código IBGE)", { value: draft.cityCode ?? settings.cityCode, required: true, inputMode: "numeric", maxLength: 7 }),
            field("serviceCode", "Código nacional do serviço", { value: draft.serviceCode ?? settings.serviceCode, required: true, inputMode: "numeric", maxLength: 10 }),
            field("municipalServiceCode", "Especialização municipal", { value: draft.municipalServiceCode ?? settings.municipalServiceCode, maxLength: 3 }),
            field("nbs", "Código NBS", { value: draft.nbs ?? settings.nbs, inputMode: "numeric", maxLength: 12 }),
            field("serviceDescription", "Descrição do serviço", { value: draft.serviceDescription, required: true, multiline: true, maxLength: 2000 }),
            field("notes", "Informações complementares", { value: draft.notes, multiline: true, maxLength: 500 }),
            field("retention", "Retenção do ISS", { value: draft.retention ?? "1",
                options: settings.regime === "2" ? [["1", "Sem retenção"]] : [["1", "Sem retenção"], ["2", "Retido pelo cliente"]] }),
            settings.regime !== "2" && field("issRate", "Alíquota de ISS, se aplicável", { value: draft.issRate, inputMode: "decimal", maxLength: 4 }),
            h("details", { open: Boolean(draft.customerAddress) || undefined },
                h("summary", null, "Endereço do cliente"),
                h("div", { className: "settings-grid" },
                    field("customerCity", "Município (código IBGE)", { value: address.city, inputMode: "numeric", maxLength: 7 }),
                    field("customerZip", "CEP", { value: address.zip, inputMode: "numeric", maxLength: 9 }),
                    field("customerStreet", "Logradouro", { value: address.street, maxLength: 255 }),
                    field("customerNumber", "Número", { value: address.number, maxLength: 60 }),
                    field("customerDistrict", "Bairro", { value: address.district, maxLength: 60 }),
                    field("customerComplement", "Complemento", { value: address.complement, maxLength: 156 }))),
            h("div", { className: "finance-shortcuts" },
                h("button", { type: "submit", className: "button", disabled }, "Salvar rascunho"),
                button("Fechar", onClose, { disabled })));
    }

    function CancelForm({ disabled, invoice, onSave, onClose }) {
        return h("form", { className: "finance-form", onSubmit: onSave },
            h("h3", null, "Cancelar NFS-e " + invoice.officialNumber),
            field("reason", "Motivo", { required: true, options: [["", "Selecione"], ["1", "Erro na emissão"], ["2", "Serviço não prestado"], ["9", "Outros"]] }),
            field("description", "Justificativa", { multiline: true, minLength: 15, maxLength: 255, required: true }),
            h("div", { className: "finance-shortcuts" },
                h("button", { type: "submit", className: "button", disabled }, "Solicitar cancelamento"),
                button("Voltar", onClose, { disabled })));
    }

    function WhenAvailable({ data }) {
        if (!data.certificateInstalled)
            return h("p", { className: "finance-help" }, "Emissão aguardando instalação do certificado digital no Water System.");
        if (data.settings && !data.emitterApproved)
            return h("p", { className: "finance-help" }, "Emissão aguardando confirmação do credenciamento e da procuração para esta empresa.");
        if (data.settings?.environment === "test")
            return h("p", { className: "finance-help" }, "Ambiente de homologação. As notas de teste ficam identificadas e sem validade fiscal.");
        return null;
    }

    function SefinWorkspace({ organizationId }) {
        const [data, setData] = useState(null);
        const [page, setPage] = useState(0);
        const [revision, reload] = useState(0);
        const [view, setView] = useState(null);
        const [busy, setBusy] = useState(false);
        const [feedback, setFeedback] = useState(null);
        const [loading, setLoading] = useState(true);
        const activeData = data?.organizationId === organizationId ? data : null;

        useEffect(() => {
            const controller = new AbortController();
            setLoading(true);
            fetch(endpoint + "?page=" + page, {
                headers: { "x-organization-id": organizationId }, cache: "no-store", signal: controller.signal,
            }).then(async response => {
                const result = await response.json();
                if (!response.ok) throw new Error(messageFrom(result, "Não foi possível carregar as notas."));
                if (!controller.signal.aborted) setData({ ...result, organizationId });
            }).catch(error => {
                if (!controller.signal.aborted) setFeedback({ error: true, text: error.message });
            }).finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
            return () => controller.abort();
        }, [organizationId, page, revision]);

        async function mutation(action, data, close = false) {
            setBusy(true);
            setFeedback(null);
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-organization-id": organizationId },
                    body: JSON.stringify({ ...data, action }),
                });
                const result = await response.json();
                setFeedback({ error: !response.ok, text: messageFrom(result, "Dados salvos.") });
                if (response.ok && close) setView(null);
            } catch {
                setFeedback({ error: true, text: "Falha na conexão. Atualize as notas para conferir a situação." });
            } finally {
                setBusy(false);
                reload(current => current + 1);
            }
        }

        function submit(action, extra = {}) {
            return event => {
                event.preventDefault();
                const form = Object.fromEntries(new FormData(event.currentTarget));
                if (action === "cancel" && !window.confirm("Solicitar o cancelamento desta NFS-e na SEFIN Nacional?")) return;
                void mutation(action, { ...form, ...extra }, true);
            };
        }

        async function saveFile(invoice, format) {
            setBusy(true);
            try {
                const params = new URLSearchParams({ id: invoice.id, file: format });
                const result = await fetch(endpoint + "?" + params, { headers: { "x-organization-id": organizationId } });
                if (!result.ok) throw new Error(messageFrom(await result.json(), "Arquivo indisponível."));
                const file = URL.createObjectURL(await result.blob());
                const link = document.createElement("a");
                link.download = (format === "pdf" ? "DANFSe-" : "NFSe-") + invoice.accessKey + "." + format;
                link.href = file;
                link.click();
                setTimeout(() => URL.revokeObjectURL(file), 30000);
            } catch (error) {
                setFeedback({ error: true, text: error.message });
            } finally {
                setBusy(false);
            }
        }

        async function openAttachment(invoice) {
            try {
                const query = new URLSearchParams({ entity: "fiscalInvoices", entityId: invoice.id });
                const response = await fetch("/api/attachments?" + query, { headers: { "x-organization-id": organizationId } });
                const payload = await response.json();
                const url = payload.attachments?.find(item => item.id === invoice.attachmentId)?.downloadUrl;
                if (!response.ok || !url || !url.startsWith("https://"))
                    throw new Error(messageFrom(payload, "Documento indisponível."));
                const link = document.createElement("a");
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.click();
            } catch (error) {
                setFeedback({ error: true, text: error.message });
            }
        }

        function send(invoice, retry = false) {
            const production = invoice.environment === "production";
            const prompt = retry ? "Reenviar a mesma declaração à SEFIN Nacional?" :
                production ? "Confirmar emissão oficial desta NFS-e em produção?" : "Enviar esta NFS-e para homologação?";
            if (window.confirm(prompt)) void mutation(retry ? "retry" : "issue", { id: invoice.id, environment: invoice.environment });
        }

        function row(invoice) {
            const own = invoice.provider === "sefin";
            const draft = !invoice.provider && invoice.status === "rascunho";
            const canSend = activeData.certificateInstalled && activeData.emitterApproved;
            const canEdit = activeData.settings && invoice.type === "nfse" && (draft || own && invoice.status === "erro");
            const authorized = own && ["emitida", "homologada"].includes(invoice.status);
            const status = invoice.status === "cancelada" && !invoice.accessKey ? "Rascunho descartado" : labels[invoice.status] ?? invoice.status;
            return h("tr", { key: invoice.id },
                h("td", null, h("strong", null, invoice.customerName), h("div", { className: "block-muted" }, invoice.serviceDescription),
                    invoice.officialNumber && h("small", { className: "block-muted" }, "Nº " + invoice.officialNumber),
                    invoice.message && h("small", { className: "block-muted" }, invoice.message)),
                h("td", null, (invoice.type === "nfe" ? "NF-e" : "NFS-e") + (invoice.environment === "test" ? " · teste" : "")),
                h("td", null, dateLabel(invoice.issueDate)),
                h("td", null, currency.format(invoice.amountCents / 100)),
                h("td", null, status),
                h("td", null, h("div", { className: "finance-shortcuts" },
                    canEdit && button(invoice.status === "erro" ? "Corrigir" : "Editar", () => setView({ kind: "draft", invoice }), { disabled: busy }),
                    draft && invoice.draft && canSend && button(invoice.environment === "test" ? "Enviar teste" : "Emitir NFS-e", () => send(invoice), { disabled: busy }),
                    draft && invoice.type === "nfse" && button("Descartar", () => {
                        if (window.confirm("Descartar este rascunho?")) void mutation("discard", { id: invoice.id });
                    }, { disabled: busy }),
                    own && ["processando", "cancelando", "emitida", "homologada"].includes(invoice.status) &&
                        button("Consultar situação", () => void mutation("refresh", { id: invoice.id }), { disabled: busy }),
                    own && invoice.status === "processando" && canSend && button("Reenviar mesma declaração", () => send(invoice, true), { disabled: busy }),
                    authorized && button("Cancelar nota", () => setView({ kind: "cancel", invoice }), { disabled: busy }),
                    own && invoice.accessKey && button("PDF", () => void saveFile(invoice, "pdf"), { disabled: busy }),
                    own && invoice.accessKey && button("XML", () => void saveFile(invoice, "xml"), { disabled: busy }),
                    invoice.pdfUrl && h("a", { href: invoice.pdfUrl, target: "_blank", rel: "noopener noreferrer" }, "PDF"),
                    invoice.xmlUrl && h("a", { href: invoice.xmlUrl, target: "_blank", rel: "noopener noreferrer" }, "XML"),
                    invoice.attachmentId && button("Documento anexado", () => void openAttachment(invoice)))));
        }

        return h("section", { className: "surface finance-snapshot", "aria-label": "Notas fiscais pela SEFIN Nacional" },
            h("div", { className: "panel-heading" },
                h("div", null, h("h2", null, "Notas fiscais"), h("p", { className: "finance-help" }, "NFS-e de serviços pela SEFIN Nacional")),
                h("div", { className: "finance-shortcuts" },
                    button("Atualizar notas", () => reload(current => current + 1), { disabled: busy || loading }),
                    activeData?.canManage && button("Configurar emissão", () => setView(view?.kind === "settings" ? null : { kind: "settings" }), { disabled: busy }),
                    activeData?.settings && button("Preparar NFS-e", () => setView({ kind: "draft" }), { disabled: busy }))),
            feedback && h("p", { className: "finance-help", role: feedback.error ? "alert" : "status" }, feedback.text),
            loading && !activeData && h("p", { className: "finance-help", role: "status" }, "Carregando notas fiscais…"),
            activeData && h(WhenAvailable, { data: activeData }),
            activeData && view?.kind === "settings" && h("div", null,
                h("h3", null, "Configuração fiscal"),
                activeData.signerCnpj && h("p", { className: "finance-help" }, "CNPJ para a procuração eletrônica " + activeData.signerCnpj),
                h(SettingsForm, { data: activeData, disabled: busy, onSave: submit("saveSettings") })),
            activeData?.settings && view?.kind === "draft" && h("div", null, h("h3", null, view.invoice ? "Revisar NFS-e" : "Preparar NFS-e"),
                h(DraftForm, { key: view.invoice?.id ?? "new", settings: activeData.settings, invoice: view.invoice, disabled: busy,
                    onSave: submit("saveDraft", view.invoice ? { id: view.invoice.id } : {}), onClose: () => setView(null) })),
            view?.kind === "cancel" && h(CancelForm, { key: view.invoice.id, invoice: view.invoice, disabled: busy,
                onSave: submit("cancel", { id: view.invoice.id }), onClose: () => setView(null) }),
            activeData && !activeData.invoices.length && h("p", { className: "finance-empty" }, "Nenhuma nota fiscal nesta página."),
            activeData?.invoices.length > 0 && h("div", { style: { overflowX: "auto" } }, h("table", { className: "data-table" },
                h("thead", null, h("tr", null, ["Cliente ou serviço", "Documento", "Competência", "Valor", "Situação", "Ações"]
                    .map(label => h("th", { scope: "col", key: label }, label)))),
                h("tbody", null, activeData.invoices.map(row)))),
            activeData && (page > 0 || activeData.hasMore) && h("div", { className: "finance-shortcuts" },
                button("Anterior", () => setPage(current => current - 1), { disabled: loading || page === 0 }),
                button("Próxima", () => setPage(current => current + 1), { disabled: loading || !activeData.hasMore })));
    }

    return { SefinWorkspace, SefinSettingsShortcut };
}

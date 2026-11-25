const form = document.querySelector("#individual-company-form");
const agenda = document.querySelector("#booking-agenda");

if (agenda) {
    const endpoint = "/api/admin/individual-consultations";
    const status = agenda.querySelector("#booking-agenda-status");
    const enter = agenda.querySelector("#booking-agenda-enter");
    const toolbar = agenda.querySelector(".booking-agenda-toolbar");
    const filter = agenda.querySelector("#booking-agenda-filter");
    const list = agenda.querySelector("#booking-agenda-list");
    const meetingTime = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short",
    });
    const statusLabels = { pending: "Pendente", confirmed: "Confirmada", cancelled: "Cancelada" };
    let requestVersion = 0;

    const element = (tag, text, style) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (style) el.className = style;
        return el;
    };

    async function review(item, next, actions) {
        for (const button of actions.querySelectorAll("button")) button.disabled = true;
        try {
            const response = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, status: next, updatedAt: item.updated_at }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o pedido.");
            await refresh(next === "confirmed" ? "Horário marcado como confirmado." : "Solicitação cancelada.");
        } catch (error) {
            status.textContent = error.message || "Não foi possível atualizar o pedido.";
            for (const button of actions.querySelectorAll("button")) button.disabled = false;
        }
    }

    function renderConsultation(item) {
        const card = element("article", "", "booking-card booking-agenda-item");
        const time = element("time", meetingTime.format(new Date(item.meeting_at)) + " (Brasília)");
        time.dateTime = item.meeting_at;
        card.append(element("h2", item.contact_name), time,
            element("p", statusLabels[item.status] + " · " + item.contact_email + " · " + item.contact_phone));
        if (item.modules.length) card.append(element("p", "Recursos: " + item.modules.join(", ")));
        if (item.notes) card.append(element("p", item.notes));
        const actions = element("div", "", "booking-agenda-actions");
        if (item.status !== "cancelled") {
            const email = element("a", "E-mail", "booking-light-button");
            email.href = "mailto:" + encodeURIComponent(item.contact_email);
            const phone = element("a", "WhatsApp", "booking-light-button");
            phone.href = "https://wa.me/" + item.contact_phone.replace(/\D/g, "");
            phone.target = "_blank";
            phone.rel = "noopener noreferrer";
            actions.append(email, phone);
            if (item.status === "pending" && Date.parse(item.meeting_at) > Date.now()) {
                const accept = element("button", "Confirmar horário", "booking-primary");
                accept.type = "button";
                accept.addEventListener("click", () => void review(item, "confirmed", actions));
                actions.append(accept);
            }
            const cancel = element("button", "Cancelar", "booking-light-button");
            cancel.type = "button";
            cancel.addEventListener("click", () => void review(item, "cancelled", actions));
            actions.append(cancel);
        }
        card.append(actions);
        return card;
    }

    async function refresh(message = "") {
        const version = ++requestVersion;
        status.textContent = "Carregando consultorias…";
        list.replaceChildren();
        try {
            const url = new URL(endpoint, location.origin);
            if (filter.value) url.searchParams.set("status", filter.value);
            const response = await fetch(url, { cache: "no-store" });
            if (version !== requestVersion) return;
            if (response.status === 401 || response.status === 403) {
                status.textContent = "Entre com uma conta de administração para ver a agenda.";
                enter.hidden = false;
                toolbar.hidden = true;
                return;
            }
            if (!response.ok) throw new Error("Não foi possível carregar as consultorias.");
            const { consultations } = await response.json();
            if (version !== requestVersion) return;
            toolbar.hidden = false;
            enter.hidden = true;
            status.textContent = message || (consultations.length ? "" : "Nenhuma consultoria nesta situação.");
            list.replaceChildren(...consultations.map(renderConsultation));
        } catch (error) {
            if (version === requestVersion) {
                status.textContent = error.message;
                toolbar.hidden = false;
            }
        }
    }
    filter.addEventListener("change", () => void refresh());
    agenda.querySelector("#booking-agenda-refresh").addEventListener("click", () => void refresh());
    void refresh();
} else if (form) {
    const access = document.querySelector("#individual-access");
    const enter = document.querySelector("#individual-enter");
    const company = form.querySelector("#individual-company");
    const fieldset = form.querySelector("#individual-agreed-features");
    const button = form.querySelector("button[type=submit]");
    const feedback = form.querySelector("#individual-company-feedback");
    const choices = [...form.querySelectorAll('input[name="features"]')];
    let organizations = new Map();
    let saving = false;

    function loadSelection() {
        const target = organizations.get(company.value);
        let selected = [];
        try { selected = JSON.parse(target?.individualPlan ?? "null")?.selection ?? []; }
        catch { /* A configuração atual pode não ter sido preenchida. */ }
        for (const input of choices) input.checked = target?.plan === "individual" && selected.includes(input.value);
        fieldset.disabled = !target;
        button.disabled = !target;
        feedback.textContent = "";
    }

    async function loadCompanies() {
        const response = await fetch("/api/admin/organizations", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
            access.textContent = "Entre com uma conta de administração para configurar o plano.";
            enter.hidden = false;
            return;
        }
        if (!response.ok) throw new Error("Não foi possível carregar as empresas. Recarregue a página.");
        const data = await response.json();
        const list = (data.organizations ?? []).filter(item => item.status !== "deleted" && !item.parentOrganizationId);
        organizations = new Map(list.map(item => [item.id, item]));
        const placeholder = new Option("Selecione uma empresa", "", true, true);
        company.replaceChildren(placeholder, ...list.map(item => new Option(
            item.name + (item.plan === "individual" ? " · Individual" : ""), item.id,
        )));
        access.hidden = list.length > 0;
        access.textContent = "Cadastre a matriz no Water Control antes de configurar o plano.";
        form.hidden = !list.length;
        loadSelection();
    }

    company.addEventListener("change", loadSelection);
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const target = organizations.get(company.value);
        if (saving || !target) return;
        const selection = choices.filter(input => input.checked).map(input => input.value);
        if (!selection.length) {
            feedback.textContent = "Selecione ao menos um recurso acordado na consultoria.";
            choices[0]?.focus();
            return;
        }
        saving = true;
        const originalName = target.name;
        button.disabled = company.disabled = fieldset.disabled = true;
        feedback.textContent = "Salvando os recursos...";
        try {
            const result = await fetch("/api/admin/organizations/" + encodeURIComponent(target.id), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "configureIndividualPlan", selection, updatedAt: target.updatedAt }),
            });
            const data = await result.json();
            if (!result.ok || data.verified !== true) throw new Error(data.error ?? "A configuração não foi confirmada.");
            organizations.set(target.id, { ...target, ...data });
            company.options[company.selectedIndex].text = originalName + " · Individual";
            feedback.textContent = "Plano Individual salvo. Os recursos estão disponíveis conforme o acesso da empresa.";
        } catch (error) {
            feedback.textContent = error.message ?? "Não foi possível salvar a configuração.";
        } finally {
            button.disabled = company.disabled = fieldset.disabled = false;
            saving = false;
        }
    });
    loadCompanies().catch(error => { access.textContent = error.message; });
} else {
    function showIndividualLink() {
        const target = document.querySelector("#companies .control-panel-heading");
        if (!target) return;
        for (const [href, label] of [["/plano-individual", "Configurar plano Individual"], ["/consultorias-individual", "Agenda de consultorias"]]) {
            if (target.querySelector(`[href="${href}"]`)) continue;
            const link = document.createElement("a");
            link.href = href;
            link.className = "button secondary";
            link.textContent = label;
            target.append(link);
        }
    }

    showIndividualLink();
    const observer = new MutationObserver(showIndividualLink);
    observer.observe(document.body, { childList: true, subtree: true });
}

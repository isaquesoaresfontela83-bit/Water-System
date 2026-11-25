const form = document.querySelector("#individual-company-form");

if (form) {
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
        if (!target || target.querySelector('[href="/plano-individual"]')) return;
        const link = document.createElement("a");
        link.href = "/plano-individual";
        link.className = "button secondary";
        link.textContent = "Configurar plano Individual";
        target.append(link);
    }

    showIndividualLink();
    const observer = new MutationObserver(showIndividualLink);
    observer.observe(document.body, { childList: true, subtree: true });
}

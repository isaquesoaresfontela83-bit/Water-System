export function createHomeWidgets({ createElement: h, useEffect, useState }, catalog) {
    function useHomeWidgets(organizationId) {
        const [hidden, setHidden] = useState([]);
        const [draft, setDraft] = useState(null);
        const [ready, setReady] = useState(false);
        const [saving, setSaving] = useState(false);
        const [message, setMessage] = useState("");
        const [attempt, setAttempt] = useState(0);
        const endpoint = "/api/home-widgets";
        const headers = { "x-organization-id": organizationId };

        useEffect(() => {
            const controller = new AbortController();
            setMessage("");
            fetch(endpoint, { headers, signal: controller.signal, cache: "no-store" })
                .then(async response => {
                    if (!response.ok) throw new Error();
                    const result = await response.json();
                    if (controller.signal.aborted) return;
                    setHidden(result.hidden);
                    setReady(true);
                })
                .catch(() => {
                    if (!controller.signal.aborted)
                        setMessage("Não foi possível carregar seus widgets.");
                });
            return () => controller.abort();
        }, [organizationId, attempt]);

        async function save(event) {
            event.preventDefault();
            setSaving(true);
            setMessage("");
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { ...headers, "Content-Type": "application/json" },
                    body: JSON.stringify({ hidden: draft }),
                });
                if (!response.ok) throw new Error();
                setHidden((await response.json()).hidden);
                setDraft(null);
                setMessage("Widgets salvos.");
            } catch {
                setMessage("Não foi possível salvar. Suas escolhas continuam abertas para tentar novamente.");
            } finally {
                setSaving(false);
            }
        }

        return {
            hidden, draft, setDraft, ready, saving, message, save,
            retry: () => setAttempt(value => value + 1),
            edit: () => { setMessage(""); setDraft(hidden); },
            cancel: () => { setMessage(""); setDraft(null); },
        };
    }

    function HomeWidgetEditor({ preferences: p, allowed }) {
        const options = catalog.filter(([, , module]) => !module || allowed.includes(module));
        if (!p.ready && !p.message) return null;
        const button = (label, onClick) => h("button", {
            type: "button", className: "button secondary", disabled: p.saving, onClick,
        }, label);

        return h("section", {
            className: "surface",
            "aria-label": "Personalização da página inicial",
            style: { padding: "12px 16px", marginBottom: 12 },
        },
        p.draft ? h("form", { onSubmit: p.save },
            h("fieldset", { disabled: p.saving, style: { border: 0, padding: 0 } },
                h("legend", { style: { fontWeight: 600, marginBottom: 8 } }, "Escolha os widgets da página inicial"),
                h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 } },
                    options.map(([id, label]) => h("label", {
                        key: id, style: { display: "flex", gap: 8, alignItems: "center", minHeight: 32, cursor: "pointer" },
                    }, h("input", {
                        type: "checkbox", checked: !p.draft.includes(id),
                        onChange: event => {
                            const visible = event.currentTarget.checked;
                            p.setDraft(previous => visible ? previous.filter(value => value !== id) : [...previous, id]);
                        },
                    }), label))),
                h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 } },
                    h("button", { type: "submit", className: "button primary" }, p.saving ? "Salvando…" : "Salvar widgets"),
                    button("Restaurar padrão", () => p.setDraft([])),
                    button("Cancelar", p.cancel))))
            : button(p.ready ? "Personalizar widgets" : "Tentar novamente", p.ready ? p.edit : p.retry),
        p.message && h("p", { role: "status" }, p.message));
    }

    return { useHomeWidgets, HomeWidgetEditor };
}

export function createHomeWidgets({ createElement: h, cloneElement, useEffect, useState }, catalog) {
    const sizes = { small: "Pequeno", medium: "Médio", large: "Grande" };
    const defaults = { hidden: [], sizes: null };
    const models = [
        { label: "Completo", description: "Todos os widgets à disposição", show: null, sizes: {}, sample: [3, 3, 6, 2, 2, 2] },
        { label: "Operação", description: "Agenda, atendimentos e equipe", show: ["services", "stock", "week", "next", "today", "attention", "team"], sizes: { week: "large", today: "medium" }, sample: [3, 3, 6, 4, 2] },
        { label: "Financeiro", description: "Recebimentos, caixa e propostas", show: ["received", "receivable", "quotes", "cashflow", "pipeline", "indicators"], sizes: { cashflow: "large", pipeline: "medium" }, sample: [2, 2, 2, 6, 3, 3] },
        { label: "Compacto", description: "Indicadores e agenda de hoje", show: ["received", "services", "quotes", "today", "attention"], sizes: { today: "medium", attention: "medium" }, sample: [2, 2, 2, 3, 3] },
    ];
    const css = `
        .water-widget-editor{padding:16px;margin-bottom:14px;min-width:0}
        .water-widget-toolbar,.water-widget-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .water-widget-editor h2,.water-widget-editor h3{margin:0;font-size:1rem;font-weight:650}
        .water-widget-editor p{margin:5px 0 0;font-size:.85rem;opacity:.8}
        .water-widget-editor button,.water-widget-editor select{min-height:38px;border:1px solid var(--border);border-radius:9px;padding:6px 10px;color:inherit;background:var(--background);font:inherit}
        .water-widget-editor button{cursor:pointer}
        .water-widget-editor button:disabled{cursor:default;opacity:.55}
        .water-widget-editor button:focus-visible,.water-widget-editor select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
        .water-widget-editor button[type=submit],.water-widget-editor button[aria-pressed=true]{background:var(--primary);color:var(--primary-foreground)}
        .water-widget-models,.water-widget-gallery{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,165px),1fr));margin:10px 0 16px}
        .water-widget-models button{text-align:left;display:grid;gap:5px;padding:10px;align-content:start;min-width:0}
        .water-widget-models small{line-height:1.3;opacity:.8}
        .water-widget-model-preview{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:7px;height:58px;background:var(--muted);border-radius:6px;color:var(--primary)}
        .water-widget-model-preview i{display:block;border-radius:3px;background:currentColor;opacity:.23}
        .water-widget-model-preview i:nth-child(3){opacity:.55}
        .water-widget-tile{display:grid;gap:8px;align-content:start;min-width:0;border:1px solid var(--border);border-radius:10px;padding:9px}
        .water-widget-tile.is-hidden .water-widget-thumbnail{opacity:.55}
        .water-widget-tile b{font-size:.85rem;line-height:1.25}
        .water-widget-tile select,.water-widget-tile button{width:100%;font-size:.82rem;min-width:0}
        .water-widget-thumbnail{height:58px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:var(--muted);color:var(--primary)}
        .water-widget-thumbnail svg{width:100%;height:100%;max-width:145px}
        .water-widget-editor fieldset{border:0;margin:12px 0 0;padding:0;min-width:0}
        .water-widget-editor legend{padding:0;font-weight:650;margin-bottom:4px}
        .water-widget-editor .water-widget-actions{justify-content:flex-start}
        .water-widget-custom-grid.water-widget-custom-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));align-items:start}
        .water-widget-custom-item{grid-column:span var(--water-widget-span);min-width:0;max-width:100%;overflow:auto}
        .water-widget-custom-item>section,.water-widget-custom-item>button{width:100%;min-width:0}
        .water-widget-custom-item>.ops-panel,.water-widget-custom-item>.ops-kpi{display:revert}
        .water-widget-custom-item>.ops-kpi{display:flex}
        .water-widget-indicators{width:calc(var(--water-widget-span) * 100% / 6);max-width:100%;overflow:auto}
        @media(max-width:767px){
            .water-widget-editor{padding:12px}
            .water-widget-models,.water-widget-gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
            .water-widget-custom-grid.water-widget-custom-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
            .water-widget-custom-item{grid-column:span var(--water-widget-mobile-span);width:100%}
            .water-widget-indicators{width:calc(var(--water-widget-mobile-span) * 100% / 4)}
        }`;

    function useHomeWidgets(organizationId) {
        const [saved, setSaved] = useState(defaults);
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
                    setSaved(result);
                    setReady(true);
                })
                .catch(() => {
                    if (!controller.signal.aborted) setMessage("Não foi possível carregar seus widgets.");
                });
            return () => controller.abort();
        }, [organizationId, attempt]);

        async function save(event) {
            event.preventDefault();
            setSaving(true);
            setMessage("");
            try {
                const response = await fetch(endpoint, {
                    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
                    body: JSON.stringify(draft),
                });
                if (!response.ok) throw new Error();
                setSaved(await response.json());
                setDraft(null);
                setMessage("Página inicial salva.");
            } catch {
                setMessage("Não foi possível salvar. Suas escolhas continuam abertas para tentar novamente.");
            } finally {
                setSaving(false);
            }
        }

        return {
            current: draft ?? saved, draft, setDraft, ready, saving, message, save,
            retry: () => setAttempt(value => value + 1),
            edit: () => { setMessage(""); setDraft({ ...saved, sizes: saved.sizes ?? {} }); },
            cancel: () => { setMessage(""); setDraft(null); },
        };
    }

    function thumbnail(kind) {
        const line = (x, y, width, height = 3) => h("rect", { x, y, width, height, rx: 1.5, fill: "currentColor" });
        const shapes = {
            metric: () => [line(12, 9, 36), line(12, 17, 58, 11), line(12, 34, 46)],
            calendar: () => [line(8, 6, 35), ...Array.from({ length: 5 }, (_, i) =>
                h("g", { key: i, opacity: i % 2 ? .45 : .75 }, line(8 + i * 19, 15, 15, 4), line(8 + i * 19, 23, 15, 16)))],
            chart: () => [line(8, 7, 36), h("polyline", {
                points: "10,36 27,30 45,32 60,20 77,23 99,13", stroke: "currentColor", fill: "none", strokeWidth: 2,
            })],
            list: () => [line(9, 7, 40), ...[16, 24, 32].map((y, i) =>
                h("g", { key: y, opacity: .65 }, line(9, y, 5, 5), line(19, y + 1, 60 - i * 9), line(79, y + 1, 19)))],
        };
        return h("div", { className: "water-widget-thumbnail", "aria-hidden": true },
            h("svg", { viewBox: "0 0 108 46" }, ...shapes[kind]()));
    }

    function HomeWidgetEditor({ preferences: p, allowed }) {
        const options = catalog.filter(([, , module]) => !module || allowed.includes(module));
        if (!p.ready && !p.message) return null;
        function applyModel(model) {
            const available = options.map(([id]) => id);
            const selected = model.show?.filter(id => available.includes(id)) ?? available;
            if (!selected.length) return;
            p.setDraft({ hidden: catalog.map(([id]) => id).filter(id => available.includes(id) && !selected.includes(id)),
                sizes: Object.fromEntries(Object.entries(model.sizes).filter(([id]) => selected.includes(id))) });
        }
        function toggle(id) {
            p.setDraft(previous => ({ ...previous, hidden: previous.hidden.includes(id)
                ? previous.hidden.filter(value => value !== id) : [...previous.hidden, id] }));
        }
        function changeSize(id, size) {
            p.setDraft(previous => ({ ...previous, sizes: { ...previous.sizes, [id]: size } }));
        }
        return h("section", { className: "surface water-widget-editor", "aria-label": "Personalização da página inicial" },
            h("style", null, css),
            p.draft ? h("form", { onSubmit: p.save },
                h("div", { className: "water-widget-toolbar" },
                    h("div", null, h("h2", null, "Personalizar página inicial"),
                        h("p", null, "As mudanças aparecem na página abaixo enquanto você edita.")),
                    h("button", { type: "button", onClick: () => document.getElementById("water-widget-live")?.scrollIntoView({ block: "start" }) }, "Ver prévia ao vivo")),
                h("fieldset", { disabled: p.saving },
                    h("legend", null, "Modelos de layout"),
                    h("div", { className: "water-widget-models" }, models.map(model =>
                        h("button", { key: model.label, type: "button", onClick: () => applyModel(model),
                            disabled: model.show && !options.some(([id]) => model.show.includes(id)) },
                            h("span", { className: "water-widget-model-preview", "aria-hidden": true },
                                model.sample.map((span, index) => h("i", { key: index, style: { gridColumn: "span " + span } }))),
                            h("strong", null, model.label), h("small", null, model.description)))),
                    h("h3", null, "Galeria de widgets"),
                    h("div", { className: "water-widget-gallery" }, options.map(([id, label, , fallbackSize, kind]) => {
                        const visible = !p.draft.hidden.includes(id);
                        return h("article", { key: id, className: "water-widget-tile" + (visible ? "" : " is-hidden") },
                            thumbnail(kind), h("b", null, label),
                            h("select", { "aria-label": "Tamanho de " + label, value: p.draft.sizes?.[id] ?? fallbackSize,
                                onChange: event => changeSize(id, event.currentTarget.value) },
                                Object.entries(sizes).map(([value, name]) => h("option", { key: value, value }, name))),
                            h("button", { type: "button", "aria-label": (visible ? "Remover " : "Adicionar ") + label,
                                onClick: () => toggle(id) }, visible ? "Remover" : "Adicionar"));
                    })),
                    h("div", { className: "water-widget-actions" },
                        h("button", { type: "submit" }, p.saving ? "Salvando…" : "Salvar layout"),
                        h("button", { type: "button", onClick: p.cancel }, "Cancelar"),
                        h("button", { type: "button", onClick: () => p.setDraft(defaults) }, "Restaurar padrão"))))
                : h("button", { type: "button", onClick: p.ready ? p.edit : p.retry }, p.ready ? "Personalizar widgets" : "Tentar novamente"),
            p.message && h("p", { role: "status" }, p.message));
    }

    function widgetStyle(id, layout) {
        const entry = catalog.find(([key]) => key === id);
        if (!entry) throw new Error("Widget desconhecido: " + id);
        const size = layout.sizes[id] ?? entry[3];
        return { "--water-widget-span": { small: 2, medium: 3, large: 6 }[size],
            "--water-widget-mobile-span": { small: 2, medium: 3, large: 4 }[size] };
    }

    function applyHomeLayout(element, layout, editing) {
        if (!editing && layout.sizes == null) return element;
        const groups = {
            "ops-kpis": ["received", "services", "receivable", "quotes", "stock"],
            "ops-grid": ["week", "next", "today", "attention", "cashflow", "pipeline", "activity", "team"],
        };
        const children = element.props.children.map(child => {
            const ids = groups[child?.props?.className];
            if (!ids || layout.sizes == null) return child;
            const cards = child.props.children.flatMap((card, index) => card ? [h("div", {
                className: "water-widget-custom-item", key: ids[index], style: widgetStyle(ids[index], layout),
            }, card)] : []);
            return cards.length ? cloneElement(child, { className: child.props.className + " water-widget-custom-grid" }, cards) : null;
        });
        return cloneElement(element, { id: "water-widget-live" }, children);
    }

    function sizeHomeIndicators(element, layout) {
        if (!element || layout.sizes == null) return element;
        return h("div", { className: "water-widget-indicators", style: widgetStyle("indicators", layout) }, element);
    }

    return { useHomeWidgets, HomeWidgetEditor, applyHomeLayout, sizeHomeIndicators };
}

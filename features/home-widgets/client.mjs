export function createHomeWidgets({ createElement: h, cloneElement, useEffect, useRef, useState }, catalog, variants, createVariants) {
    const sizes = { small: "Pequeno", medium: "Médio", large: "Grande" };
    const defaults = { hidden: [], sizes: null };
    const Variant = createVariants(h);
    const categoryNames = { agenda: "Agenda", finance: "Financeiro", quotes: "Comercial", crm: "Comercial", inventory: "Estoque", team: "Equipe" };
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
        .water-widget-categories{display:flex;gap:8px;overflow:auto;padding:4px 2px 8px;margin:5px 0;white-space:nowrap}
        .water-widget-gallery{display:grid;grid-auto-flow:column;grid-auto-columns:min(82%,260px);gap:10px;overflow:auto;scroll-snap-type:x mandatory;padding:3px 2px 10px;margin:8px 0 12px}
        .water-widget-gallery>*{scroll-snap-align:start}
        .water-widget-gallery-help{margin-bottom:8px!important}
        .water-extra-widgets{display:grid;gap:12px;margin-bottom:12px;grid-template-columns:repeat(6,minmax(0,1fr));align-items:stretch;scroll-margin-top:90px}
        .water-extra-widgets>.water-widget-custom-item{display:flex}
        .water-variant{padding:12px;min-width:0;width:100%;border-radius:12px}
        .water-variant-switch{margin-top:8px;max-width:100%;min-height:35px;padding:3px 6px;border:1px solid var(--border);border-radius:7px;background:var(--background);color:inherit;font-size:.76rem}
        .water-variant h3{font-size:.91rem;font-weight:650;margin:0 0 8px;line-height:1.3}
        .water-variant-preview{background:var(--muted);min-height:145px;overflow:hidden}
        .water-variant-preview .water-variant-list li:nth-child(n+3){display:none}
        .water-variant-empty{font-size:.83rem;opacity:.75}
        .water-variant-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:.72rem}
        .water-variant-legend span:first-child{color:var(--primary)}
        .water-variant-legend span:last-child{color:#7c90ae}
        .water-variant-bar-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;text-align:center;margin-top:6px}
        .water-variant-columns{height:60px;display:flex;gap:3px;align-items:flex-end;justify-content:center;border-bottom:1px solid var(--border)}
        .water-variant-columns i{width:min(22px,42%);border-radius:3px 3px 0 0;background:var(--primary)}
        .water-variant-columns i+ i{background:#7c90ae}
        .water-variant-bar-group small{font-size:.68rem}
        .water-variant-ring{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
        .water-variant-donut{width:54px;height:54px;border-radius:50%;background:var(--border);mask:radial-gradient(farthest-side,transparent 58%,#000 60%)}
        .water-variant-ring dl{margin:0;font-size:.73rem}
        .water-variant-ring dd{font-weight:650;margin:0 0 3px;white-space:nowrap}
        .water-variant-list,.water-variant-progress{list-style:none;padding:0;margin:0;font-size:.76rem}
        .water-variant-list li,.water-variant-progress li{display:flex;align-items:center;gap:6px;justify-content:space-between;border-bottom:1px solid var(--border);padding:5px 0}
        .water-variant-list li span{display:grid;min-width:0;overflow-wrap:anywhere}
        .water-variant-list small{opacity:.75}
        .water-variant-list b{flex-shrink:0}
        .water-variant-list .is-overdue{color:#c55252}
        .water-variant-progress progress{min-width:14px;width:48%;accent-color:var(--primary)}
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
            .water-extra-widgets{grid-template-columns:repeat(4,minmax(0,1fr))}
            .water-widget-custom-grid.water-widget-custom-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
            .water-widget-custom-item{grid-column:span var(--water-widget-mobile-span);width:100%}
            .water-widget-indicators{width:calc(var(--water-widget-mobile-span) * 100% / 4)}
        }`;

    function createSaveQueue(write, report) {
        let active = false;
        let pending = null;
        async function flush() {
            if (active || !pending) return;
            active = true;
            report("saving");
            try {
                while (pending) {
                    const layout = pending;
                    pending = null;
                    try { await write(layout); }
                    catch (error) {
                        pending ??= layout;
                        throw error;
                    }
                }
                report("saved");
            } catch {
                report("error");
            } finally {
                active = false;
            }
        }
        return { update(layout) { pending = layout; void flush(); }, retry: flush };
    }

    function useHomeWidgets(organizationId) {
        const [current, setCurrent] = useState(defaults);
        const [editing, setEditing] = useState(false);
        const [ready, setReady] = useState(false);
        const [status, setStatus] = useState("");
        const [attempt, setAttempt] = useState(0);
        const endpoint = "/api/home-widgets";
        const headers = { "x-organization-id": organizationId };
        const latest = useRef(defaults);
        const [queue] = useState(() => createSaveQueue(async layout => {
            const response = await fetch(endpoint, {
                method: "POST", headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify(layout), keepalive: true,
            });
            if (!response.ok) throw new Error();
        }, setStatus));

        useEffect(() => {
            const controller = new AbortController();
            setStatus("");
            fetch(endpoint, { headers, signal: controller.signal, cache: "no-store" })
                .then(async response => {
                    if (!response.ok) throw new Error();
                    const result = await response.json();
                    if (controller.signal.aborted) return;
                    latest.current = result;
                    setCurrent(result);
                    setReady(true);
                })
                .catch(() => {
                    if (!controller.signal.aborted) setStatus("load-error");
                });
            return () => controller.abort();
        }, [organizationId, attempt]);

        function update(change) {
            const next = typeof change === "function" ? change(latest.current) : change;
            if (next === latest.current) return;
            latest.current = next;
            setCurrent(next);
            queue.update(next);
        }

        return {
            current, editing, update, ready, status,
            retry: () => ready ? queue.retry() : setAttempt(value => value + 1),
            edit: () => setEditing(true), close: () => setEditing(false),
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
        const [category, setCategory] = useState("Financeiro");
        const [previewSizes, setPreviewSizes] = useState({});
        const eligible = item => !item.module || allowed.includes(item.module);
        const options = [...variants, ...catalog.map(([id, label, module, size, kind]) =>
            ({ id, label, module, size, kind, category: categoryNames[module] ?? "Geral", sizes: Object.keys(sizes) }))].filter(eligible);
        const categories = [...new Set(options.map(item => item.category))];
        const active = categories.includes(category) ? category : categories[0];
        if (!p.ready && !p.status) return null;

        function toggle(item) {
            const { id, kind, size } = item;
            p.update(previous => {
                if (kind) {
                    return { ...previous, sizes: previous.sizes ?? {}, hidden: previous.hidden.includes(id)
                        ? previous.hidden.filter(value => value !== id) : [...previous.hidden, id] };
                }
                const next = { ...previous.sizes };
                if (Object.hasOwn(next, id)) delete next[id];
                else next[id] = previewSizes[id] ?? size;
                return { ...previous, sizes: next };
            });
        }

        function tile(item) {
            const { id, label, kind, size, description } = item;
            const variant = !kind;
            const visible = variant ? Object.hasOwn(p.current.sizes ?? {}, id) : !p.current.hidden.includes(id);
            const currentSize = p.current.sizes?.[id] ?? previewSizes[id] ?? size;
            return h("article", { key: id, className: "water-widget-tile" + (visible ? "" : " is-hidden") },
                variant ? h(Variant, { variant: item, preview: true }) : thumbnail(kind),
                variant ? h("small", null, description) : h("b", null, label),
                h("select", { "aria-label": "Tamanho de " + label, value: currentSize,
                    onChange: event => {
                        const value = event.currentTarget.value;
                        if (variant && !visible) setPreviewSizes(previous => ({ ...previous, [id]: value }));
                        else p.update(previous => ({ ...previous, sizes: { ...previous.sizes, [id]: value } }));
                    } },
                    item.sizes.map(value => h("option", { key: value, value }, sizes[value]))),
                h("button", { type: "button", "aria-label": (visible ? "Remover " : "Adicionar ") + label,
                    onClick: () => toggle(item) }, visible ? "Remover" : "Adicionar"));
        }

        return h("section", { className: "surface water-widget-editor", "aria-label": "Personalização da página inicial" },
            h("style", null, css),
            p.editing ? h("div", null,
                h("div", { className: "water-widget-toolbar" },
                    h("div", null, h("h2", null, "Galeria de widgets"),
                        h("p", null, "As mudanças aparecem na hora e são salvas automaticamente.")),
                    h("button", { type: "button", onClick: () => (document.getElementById("water-extra-widgets") ?? document.getElementById("water-widget-live"))?.scrollIntoView({ block: "start" }) }, "Ver na página")),
                h("fieldset", null,
                    h("div", { className: "water-widget-categories", role: "group", "aria-label": "Categorias de widgets" },
                        categories.map(name => h("button", { key: name, type: "button", "aria-pressed": name === active,
                            onClick: () => setCategory(name) }, name))),
                    h("p", { className: "water-widget-gallery-help" }, "As prévias da galeria usam dados de exemplo."),
                    h("div", { key: active, className: "water-widget-gallery", "aria-label": "Modelos de " + active },
                        options.filter(item => item.category === active).map(tile)),
                    h("div", { className: "water-widget-actions" },
                        h("button", { type: "button", onClick: p.close }, "Concluir"),
                        h("button", { type: "button", onClick: () => p.update(defaults) }, "Restaurar padrão"))))
                : h("button", { type: "button", onClick: p.ready ? p.edit : p.retry }, p.ready ? "Personalizar widgets" : "Tentar novamente"),
            p.status && h("p", { role: "status" }, {
                saving: "Salvando alterações…", saved: "Alterações salvas.",
                error: "As mudanças aparecem nesta tela, mas o salvamento falhou.",
                "load-error": "Não foi possível carregar seus widgets.",
            }[p.status]),
            p.status === "error" && h("button", { type: "button", onClick: p.retry }, "Tentar salvar novamente"));
    }

    function swapVariant(layout, current, target) {
        if (!Object.hasOwn(layout.sizes ?? {}, current.id) || Object.hasOwn(layout.sizes, target.id)) return layout;
        return { ...layout, sizes: Object.fromEntries(Object.entries(layout.sizes).map(([id, size]) =>
            id === current.id ? [target.id, target.sizes.includes(size) ? size : target.size] : [id, size])) };
    }

    function ExtraHomeWidgets({ layout, allowed, data, lowStock, update }) {
        const available = variants.filter(item => allowed.includes(item.module));
        const selected = Object.keys(layout.sizes ?? {}).flatMap(id => {
            const item = available.find(candidate => candidate.id === id);
            return item?.sizes.includes(layout.sizes[id]) ? [item] : [];
        });
        if (!selected.length) return null;
        return h("section", { className: "water-extra-widgets", id: "water-extra-widgets", "aria-label": "Widgets adicionados" },
            selected.map(item => {
                const models = available.filter(model => model.category === item.category && model.id !== item.id &&
                    !Object.hasOwn(layout.sizes, model.id));
                return h("div", { className: "water-widget-custom-item", key: item.id,
                    style: spanStyle(layout.sizes[item.id]) },
                    h(Variant, { variant: item, data, lowStock },
                        update && models.length > 0 && h("select", {
                            className: "water-variant-switch", value: item.id, "aria-label": "Trocar modelo de " + item.label,
                            onChange: event => {
                                const target = models.find(model => model.id === event.currentTarget.value);
                                if (target) update(previous => swapVariant(previous, item, target));
                            },
                        }, h("option", { value: item.id }, "Trocar modelo"),
                        models.map(model => h("option", { key: model.id, value: model.id }, model.label)))));
            }));
    }

    function spanStyle(size) {
        return { "--water-widget-span": { small: 2, medium: 3, large: 6 }[size],
            "--water-widget-mobile-span": { small: 2, medium: 3, large: 4 }[size] };
    }

    function widgetStyle(id, layout) {
        const entry = catalog.find(([key]) => key === id);
        if (!entry) throw new Error("Widget desconhecido: " + id);
        const size = layout.sizes[id] ?? entry[3];
        return spanStyle(size);
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

    return { useHomeWidgets, HomeWidgetEditor, applyHomeLayout, sizeHomeIndicators, ExtraHomeWidgets, createSaveQueue, swapVariant };
}

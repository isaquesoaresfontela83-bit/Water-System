export function createWidgetVariants(h) {
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
    const cents = row => Number(row.amountCents) || 0;
    const currency = value => money.format(value / 100);
    const isDateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const asDate = value => new Date(isDateOnly(value) ? value + "T12:00:00-03:00" : value);
    const shortDate = value => Number.isFinite(Date.parse(value)) ? date.format(asDate(value)) : "—";
    const empty = message => h("p", { className: "water-variant-empty" }, message);
    const sum = rows => rows.reduce((total, row) => total + cents(row), 0);
    const day = offset => {
        const key = dayKey.format(new Date());
        return new Date(Date.parse(key + "T12:00:00-03:00") + offset * 86400000);
    };
    const demo = {
        transactions: [
            ...[0, 1, 2, 3].flatMap(index => [
                { type: "receita", status: "pago", amountCents: [185000, 302000, 256000, 425000][index], dueDate: day(-25 + index * 7).toISOString() },
                { type: "despesa", status: "pago", amountCents: [106000, 161000, 98000, 220000][index], dueDate: day(-25 + index * 7).toISOString() },
            ]),
            { type: "receita", status: "atrasado", description: "Manutenção mensal", dueDate: day(-2).toISOString(), amountCents: 148000 },
            { type: "despesa", status: "pendente", description: "Compra de materiais", dueDate: day(2).toISOString(), amountCents: 96000 },
            { type: "receita", status: "pendente", description: "Instalação de filtro", dueDate: day(4).toISOString(), amountCents: 260000 },
        ],
        appointments: [
            { title: "Limpeza de piscina", clientName: "Área de lazer", startAt: day(1).toISOString(), status: "agendado" },
            { title: "Visita técnica", clientName: "Condomínio Jardins", startAt: day(2).toISOString(), status: "agendado" },
        ],
        quotes: ["rascunho", "enviado", "enviado", "enviado", "aprovado", "aprovado", "recusado"].map(status => ({ status })),
        inventory: [{ name: "Cloro granulado", quantity: 2, minimumQuantity: 6, unit: "kg" },
            { name: "Filtro de reposição", quantity: 0, minimumQuantity: 3, unit: "un" }],
    };
    const list = (rows, fallback) => rows.length ? h("ul", { className: "water-variant-list" }, rows.map((row, index) =>
        h("li", { key: index }, h("span", null, h("strong", null, row.title), h("small", null, row.detail)),
            row.value && h("b", { className: row.overdue ? "is-overdue" : undefined }, row.value)))) : empty(fallback);

    function financeBars(transactions) {
        const paid = transactions.filter(row => row.status === "pago" && Number.isFinite(Date.parse(row.dueDate)))
            .map(row => ({ ...row, date: dayKey.format(asDate(row.dueDate)) }));
        const groups = Array.from({ length: 4 }, (_, index) => {
            const start = day(-27 + index * 7);
            const end = day(-21 + index * 7);
            const rows = paid.filter(row => row.date >= dayKey.format(start) && row.date <= dayKey.format(end));
            return { label: date.format(start), in: sum(rows.filter(row => row.type === "receita")), out: sum(rows.filter(row => row.type === "despesa")) };
        });
        const max = Math.max(...groups.flatMap(group => [group.in, group.out]));
        if (!max) return empty("Nenhum lançamento pago nos últimos 28 dias.");
        return h("div", { className: "water-variant-bars" },
            h("div", { className: "water-variant-legend" }, h("span", null, "● Entradas"), h("span", null, "● Saídas")),
            h("div", { className: "water-variant-bar-grid" }, groups.map(group =>
                h("div", { key: group.label, className: "water-variant-bar-group",
                    title: group.label + " · Entradas " + currency(group.in) + " · Saídas " + currency(group.out) },
                    h("div", { className: "water-variant-columns", "aria-label": "Semana de " + group.label + ": entradas " + currency(group.in) + ", saídas " + currency(group.out), role: "img" },
                        h("i", { style: { height: group.in / max * 100 + "%" } }), h("i", { style: { height: group.out / max * 100 + "%" } })),
                    h("small", null, group.label)))));
    }

    function render(id, data, lowStock) {
        const open = () => data.transactions.filter(row => row.status === "pendente" || row.status === "atrasado");
        switch (id) {
            case "finance-bars": return financeBars(data.transactions);
            case "finance-ring": {
                const rows = open();
                const incoming = sum(rows.filter(row => row.type === "receita"));
                const outgoing = sum(rows.filter(row => row.type === "despesa"));
                const ratio = incoming + outgoing ? Math.max(0, Math.min(100, incoming / (incoming + outgoing) * 100)) : 0;
                return h("div", { className: "water-variant-ring" },
                    h("div", { className: "water-variant-donut", "aria-hidden": true,
                        style: incoming + outgoing ? { background: "conic-gradient(var(--primary) " + ratio + "%, #7c90ae 0)" } : undefined }),
                    h("dl", null, h("dt", null, "A receber"), h("dd", null, currency(incoming)),
                        h("dt", null, "A pagar"), h("dd", null, currency(outgoing))));
            }
            case "finance-due": return list(open().filter(row => Number.isFinite(Date.parse(row.dueDate)))
                .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate)).slice(0, 5).map(row => ({
                    title: row.description, detail: shortDate(row.dueDate) + (row.status === "atrasado" ? " · Em atraso" : ""),
                    value: (row.type === "despesa" ? "−" : "+") + currency(cents(row)), overdue: row.status === "atrasado",
                })), "Nenhum lançamento em aberto.");
            case "agenda-upcoming": return list(data.appointments.filter(row => ["agendado", "em_rota", "remarcado"].includes(row.status) &&
                Date.parse(row.startAt) >= Date.now()).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).slice(0, 5)
                .map(row => ({ title: row.title, detail: row.clientName, value: shortDate(row.startAt) })), "Nenhum compromisso próximo.");
            case "quotes-status": {
                const statuses = [["rascunho", "Rascunhos"], ["enviado", "Enviados"], ["aprovado", "Aprovados"], ["recusado", "Recusados"]];
                const counts = statuses.map(([status, label]) => [label, data.quotes.filter(row => row.status === status).length]);
                const max = Math.max(1, ...counts.map(([, count]) => count));
                return h("ul", { className: "water-variant-progress" }, counts.map(([label, count]) =>
                    h("li", { key: label }, h("span", null, label), h("progress", { value: count, max, "aria-label": label }), h("b", null, count))));
            }
            case "inventory-reorder": return list(data.inventory.filter(row => row.quantity <= Math.max(row.minimumQuantity, lowStock || 0))
                .sort((a, b) => a.quantity - b.quantity).slice(0, 5)
                .map(row => ({ title: row.name, detail: "Mínimo: " + row.minimumQuantity + " " + row.unit, value: row.quantity + " " + row.unit })),
            "Nenhum produto abaixo do limite.");
            default: return null;
        }
    }

    return function WidgetVariant({ variant, data = demo, lowStock, preview }) {
        return h("article", { className: "surface water-variant" + (preview ? " water-variant-preview" : "") },
            h("h3", null, variant.label), render(variant.id, data, lowStock));
    };
}

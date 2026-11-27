export const widgets = [
    ["received", "Recebido no mês", "finance", "small", "metric"],
    ["services", "Serviços hoje", "agenda", "small", "metric"],
    ["receivable", "A receber", "finance", "small", "metric"],
    ["quotes", "Orçamentos abertos", "quotes", "small", "metric"],
    ["stock", "Estoque baixo", "inventory", "small", "metric"],
    ["week", "Agenda da semana", "agenda", "large", "calendar"],
    ["next", "Próximo atendimento", "agenda", "small", "list"],
    ["today", "Agenda de hoje", "agenda", "medium", "list"],
    ["attention", "Atenção agora", null, "small", "list"],
    ["cashflow", "Fluxo financeiro", "finance", "medium", "chart"],
    ["pipeline", "Pipeline comercial", "crm", "medium", "chart"],
    ["activity", "Últimos registros", null, "small", "list"],
    ["team", "Equipe em campo", "team", "small", "list"],
    ["indicators", "Indicadores detalhados", null, "large", "metric"],
];

export const widgetVariants = [
    { id: "finance-bars", label: "Entradas e saídas", category: "Financeiro", module: "finance", size: "large", sizes: ["medium", "large"], description: "Gráfico de pagamentos dos últimos 28 dias." },
    { id: "finance-ring", label: "Saldo em aberto", category: "Financeiro", module: "finance", size: "medium", sizes: ["small", "medium", "large"], description: "Gráfico de rosca com valores a receber e a pagar." },
    { id: "finance-due", label: "Próximos vencimentos", category: "Financeiro", module: "finance", size: "medium", sizes: ["medium", "large"], description: "Lista de lançamentos em aberto, dos mais antigos aos próximos." },
    { id: "agenda-upcoming", label: "Próximos compromissos", category: "Agenda", module: "agenda", size: "medium", sizes: ["medium", "large"], description: "Lista dos próximos atendimentos, em ordem de horário." },
    { id: "quotes-status", label: "Orçamentos por status", category: "Comercial", module: "quotes", size: "medium", sizes: ["small", "medium", "large"], description: "Barras com a quantidade de propostas em cada etapa." },
    { id: "inventory-reorder", label: "Reposição de estoque", category: "Estoque", module: "inventory", size: "medium", sizes: ["small", "medium", "large"], description: "Produtos no limite de estoque ou abaixo dele." },
];

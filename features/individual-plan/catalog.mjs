export const individualPlan = Object.freeze({
    code: "individual",
    name: "Individual",
    priceCents: null,
    checkout: "consultation",
    consultationUrl: "/plano-individual",
    description: "Escolha os recursos da sua empresa e solicite uma consultoria para definir o plano e o valor.",
    highlights: ["Módulos escolhidos por você", "Consultoria com a equipe Water System", "Proposta de acordo com a sua operação"],
});

export const individualFeatures = [
    ["customers", "Clientes e piscinas", "Cadastre os clientes e as piscinas atendidas."],
    ["crm", "CRM e vendas", "Acompanhe oportunidades e negociações."],
    ["quotes", "Orçamentos em PDF", "Monte propostas e compartilhe com seus clientes."],
    ["agenda", "Agenda e visitas", "Organize a semana e os serviços recorrentes."],
    ["orders", "Ordens de serviço", "Registre a execução e os checklists da equipe."],
    ["contracts", "Contratos", "Organize os documentos dos serviços."],
    ["warranties", "Garantias", "Acompanhe prazos e atendimentos de garantia."],
    ["inventory", "Estoque", "Controle os produtos e os movimentos de estoque."],
    ["financeBasic", "Financeiro básico", "Registre entradas, saídas e acompanhe o saldo."],
    ["finance", "Financeiro e cobranças", "Gerencie pagamentos, recebimentos e cobranças."],
    ["team", "Gestão de equipe", "Organize responsáveis e acessos."],
    ["branches", "Filiais", "Gerencie o trabalho por unidade."],
    ["mobile", "Modo técnico", "Consulte e registre os serviços no celular."],
    ["chat", "Chat interno", "Centralize as conversas da equipe."],
    ["assistant", "Water IA", "Consulte informações e planeje com apoio da IA."],
    ["freight", "Cálculo de frete", "Calcule a distância entre CEPs e o valor do frete."],
    ["invoices", "Notas fiscais", "Organize notas e emita NFS-e com a integração configurada."],
];

export const individualNotesLimit = 600;

export function selectIndividualFeatures(values) {
    if (!Array.isArray(values)) throw new TypeError("Confira os recursos selecionados.");
    const requested = new Set(values);
    const selection = individualFeatures.map(([id]) => id).filter(id => requested.has(id));
    if (selection.length !== requested.size || selection.length !== values.length) {
        throw new TypeError("Confira os recursos selecionados.");
    }
    return selection;
}

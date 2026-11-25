import { individualFeatures, individualNotesLimit } from "./catalog.mjs";
import { bookingToday, describeMeeting } from "./booking.mjs";

export const individualStylesheet = "/assets/water-individual-15.23.39.css";
export const individualControlClient = "/assets/water-individual-control-15.23.38.js";
export const bookingPublicClient = "/assets/water-individual-booking-15.23.38.js";
export const consultationAgendaPath = "/consultorias-individual";
const groupings = [
    ["Clientes e serviços", ["customers", "crm", "quotes", "agenda", "orders"]],
    ["Equipe e operação", ["inventory", "team", "branches", "mobile", "chat"]],
    ["Financeiro e documentos", ["financeBasic", "finance", "contracts", "warranties", "invoices"]],
    ["IA e frete", ["assistant", "freight"]],
];
const names = new Map(individualFeatures.map(feature => [feature[0], feature]));

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function featureOptions() {
    return individualFeatures.map(([id, label, description]) => `
        <label class="individual-option">
          <input type="checkbox" name="features" value="${id}">
          <span><strong>${label}</strong><small>${description}</small></span>
        </label>`).join("");
}

function bookingGroups(selection) {
    return groupings.map(([group, keys]) => {
        const options = keys.map(id => {
            const [, label, description] = names.get(id);
            return `<label class="booking-resource">
                <input type="checkbox" name="features" value="${id}" ${selection.includes(id) ? "checked" : ""}>
                <span><strong>${label}</strong><small>${description}</small></span>
            </label>`;
        }).join("");
        return `<details class="booking-group" ${keys.some(id => selection.includes(id)) ? "open" : ""}>
            <summary><span>${group}</span><span class="booking-group-count" aria-hidden="true"></span></summary>
            <div class="booking-resources">${options}</div>
        </details>`;
    }).join("");
}

function bookingInput({ key, label, attributes, draft, error }) {
    return `<label class="booking-field">
        <span>${label}</span>
        <input name="${key}" value="${escape(draft[key])}" ${attributes} required
            ${error?.field === key ? 'aria-invalid="true" aria-describedby="booking-error"' : ""}>
    </label>`;
}

export function individualPage({ draft = {}, error = null, scheduled = "" } = {}) {
    const selection = draft.features ?? [];
    const input = (key, label, attributes) => bookingInput({ key, label, attributes, draft, error });
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Escolha os módulos do plano Individual e solicite uma consultoria para a sua empresa de piscinas.">
  <title>Plano Individual | Water System</title>
  <link rel="canonical" href="https://watersystem.online/plano-individual">
  <link rel="icon" href="/assets/water-brand-15.23.21/icon.webp" type="image/webp">
  <link rel="stylesheet" href="${individualStylesheet}">
  <script type="module" src="${bookingPublicClient}"></script>
</head>
<body class="individual-page booking-page">
  <header class="individual-nav">
    <a class="individual-brand" href="/">
      <img src="/assets/water-brand-15.23.21/icon.webp" alt="" width="38" height="38">
      <span>Water System</span>
    </a>
    <a class="booking-back" href="/#planos">Ver planos</a>
  </header>
  <main class="individual-layout booking-layout">
    ${scheduled ? `<section class="booking-sent" aria-labelledby="booking-sent-title">
      <p class="booking-kicker">Plano Individual</p>
      <h1 id="booking-sent-title">Solicitação recebida</h1>
      <p>Horário sugerido: <strong>${escape(describeMeeting(scheduled))}</strong> (Brasília).</p>
      <p>A equipe Water System vai entrar em contato para confirmar a reunião.</p>
      <a class="booking-primary" href="/#planos">Voltar aos planos</a>
    </section>` : `<header class="booking-hero">
      <div>
        <p class="booking-kicker">Plano Individual</p>
        <h1>Seu sistema, do jeito que sua empresa precisa</h1>
        <p>Escolha os recursos que fazem sentido para você. Na consultoria, montamos uma proposta para sua operação.</p>
      </div>
      <a class="booking-primary" href="#agendar-consultoria">Agendar consultoria</a>
    </header>
    <form class="booking-grid" action="/plano-individual" method="post">
      <input type="hidden" name="requestId" value="${escape(draft.id || crypto.randomUUID())}">
      <div class="booking-trap" aria-hidden="true"><label>Site <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <section class="booking-card booking-module-card" aria-labelledby="booking-module-title">
        <div class="booking-card-heading">
          <div><h2 id="booking-module-title">Recursos do plano</h2><p>Marque o que quer conhecer. A seleção é opcional.</p></div>
          <output id="booking-count" aria-live="polite">${selection.length} selecionado${selection.length === 1 ? "" : "s"}</output>
        </div>
        <div class="booking-groups">${bookingGroups(selection)}</div>
      </section>
      <section class="booking-card booking-appointment-card" id="agendar-consultoria" aria-labelledby="booking-appointment-title">
        <h2 id="booking-appointment-title">Agende sua consultoria</h2>
        <p>Indique um horário para a reunião. Nossa equipe confirma o agendamento com você.</p>
        ${error ? `<p id="booking-error" class="individual-error booking-error" role="alert">${escape(error.message)}</p>` : ""}
        ${input("name", "Nome", 'type="text" autocomplete="name" maxlength="100"')}
        ${input("email", "E-mail", 'type="email" autocomplete="email" maxlength="254"')}
        ${input("phone", "Telefone / WhatsApp", 'type="tel" autocomplete="tel" maxlength="32" placeholder="(61) 99999-9999"')}
        <div class="booking-date-row">
          ${input("date", "Data da reunião", `type="date" min="${bookingToday()}"`)}
          ${input("time", "Horário de Brasília", 'type="time" step="60"')}
        </div>
        <label class="booking-field"><span>O que você quer organizar? <small>(opcional)</small></span>
          <textarea name="notes" rows="2" maxlength="${individualNotesLimit}">${escape(draft.notes)}</textarea>
        </label>
        <button class="booking-primary" type="submit">Solicitar agendamento</button>
        <p class="booking-privacy">Usaremos seus contatos para falar sobre a consultoria. <a href="/privacidade">Privacidade</a></p>
      </section>
    </form>
    `}
  </main>
</body>
</html>`;
}

export function individualControlPage() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Configurar plano Individual | Water Control</title>
  <link rel="stylesheet" href="${individualStylesheet}">
  <script type="module" src="${individualControlClient}"></script>
</head>
<body class="individual-page">
  <header class="individual-nav">
    <a class="individual-brand" href="/">Water Control</a>
    <a href="${consultationAgendaPath}">Agenda de consultorias</a>
  </header>
  <main class="individual-layout">
    <header class="individual-hero">
      <h1>Configurar plano Individual</h1>
      <p>Aplique os recursos acordados na consultoria à empresa selecionada.</p>
    </header>
    <p id="individual-access" role="status">Conferindo o acesso ao Water Control…</p>
    <a id="individual-enter" href="/entrar" hidden>Entrar no Water Control</a>
    <form id="individual-company-form" class="individual-form" hidden>
      <label class="individual-notes" for="individual-company">Empresa</label>
      <select id="individual-company" name="company" required></select>
      <fieldset id="individual-agreed-features" disabled>
        <legend>Recursos acordados</legend>
        <p class="individual-help">Notas fiscais também liberam o financeiro. Filiais incluem gestão de equipe. O modo técnico usa agenda e ordens de serviço.</p>
        <div class="individual-options">${featureOptions()}</div>
      </fieldset>
      <div class="individual-submit">
        <p>O preço é negociado na consultoria. A cobrança segue os prazos registrados para a empresa.</p>
        <button type="submit" disabled>Salvar plano Individual</button>
      </div>
      <p id="individual-company-feedback" role="status" aria-live="polite"></p>
    </form>
  </main>
</body>
</html>`;
}

export function individualAgendaPage() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Agenda de consultorias | Water Control</title>
  <link rel="stylesheet" href="${individualStylesheet}">
  <script type="module" src="${individualControlClient}"></script>
</head>
<body class="individual-page">
  <header class="individual-nav">
    <a class="individual-brand" href="/">Water Control</a>
    <a href="/plano-individual">Configurar plano Individual</a>
  </header>
  <main class="individual-layout">
    <header class="individual-hero"><h1>Agenda de consultorias</h1><p>Veja os pedidos do plano Individual e confirme os horários com os clientes.</p></header>
    <div id="booking-agenda">
      <p id="booking-agenda-status" role="status">Carregando consultorias…</p>
      <a id="booking-agenda-enter" href="/entrar" hidden>Entrar no Water Control</a>
      <div class="booking-agenda-toolbar" hidden>
        <label>Situação <select id="booking-agenda-filter"><option value="pending">Pendentes</option><option value="confirmed">Confirmadas</option><option value="cancelled">Canceladas</option><option value="">Todas</option></select></label>
        <button class="booking-light-button" id="booking-agenda-refresh" type="button">Atualizar</button>
      </div>
      <div id="booking-agenda-list" class="booking-agenda-list"></div>
    </div>
  </main>
</body>
</html>`;
}

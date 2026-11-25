import { individualFeatures, individualNotesLimit } from "./catalog.mjs";

export const individualStylesheet = "/assets/water-individual-15.23.37.css";
export const individualControlClient = "/assets/water-individual-control-15.23.37.js";

function featureOptions() {
    return individualFeatures.map(([id, label, description]) => `
        <label class="individual-option">
          <input type="checkbox" name="features" value="${id}">
          <span><strong>${label}</strong><small>${description}</small></span>
        </label>`).join("");
}

export function individualPage(error = "") {
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
</head>
<body class="individual-page">
  <header class="individual-nav">
    <a class="individual-brand" href="/">
      <img src="/assets/water-brand-15.23.21/icon.webp" alt="" width="38" height="38">
      <span>Water System</span>
    </a>
    <a href="/planos#planos">Ver todos os planos</a>
  </header>
  <main class="individual-layout">
    <header class="individual-hero">
      <p class="individual-kicker">Plano Individual</p>
      <h1>Monte o plano da sua empresa</h1>
      <p>Marque os recursos que você quer usar. Na consultoria, vamos entender sua rotina, revisar as escolhas e preparar uma proposta.</p>
    </header>
    <form class="individual-form" action="/plano-individual" method="post">
      ${error ? '<p class="individual-error" role="alert">Confira os recursos selecionados e tente novamente.</p>' : ""}
      <fieldset>
        <legend>Quais recursos você quer usar?</legend>
        <div class="individual-options">${featureOptions()}</div>
      </fieldset>
      <label class="individual-notes" for="individual-notes">O que você quer organizar na sua empresa? <span>(opcional)</span></label>
      <textarea id="individual-notes" name="notes" rows="3" maxlength="${individualNotesLimit}" placeholder="Exemplo: quero acompanhar as visitas e os pagamentos dos clientes."></textarea>
      <div class="individual-submit">
        <div><strong>Valor sob consulta</strong><p>Se estiver em dúvida, envie a solicitação com a seleção em branco.</p></div>
        <button type="submit">Solicitar consultoria no WhatsApp</button>
      </div>
    </form>
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
    <a href="/#companies">Empresas e usuários</a>
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

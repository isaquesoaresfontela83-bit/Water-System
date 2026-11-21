# Orçamentos com fotos e resumo ao vivo

A versão 15.23.33 usa como base os pacotes 15.23.32 de Water System e Water Control recuperados da Cloudflare. As alterações nos orçamentos passam pelo catálogo, pelo formulário de proposta, pela geração de prévia e pelo PDF salvo. Os modelos de documento, os cálculos de comissão e as regras comerciais do pacote ativo integram a versão conjunta.

## Preparação

`prepare.mjs` recebe o diretório da base recuperada e o diretório de saída. Use `system/` e `control/` para os módulos dos Workers. Os dois arquivos públicos de origem ficam em `system/client-app.js` e `system/client-registration.js`. Para o segundo, use a consulta de versão de plano já presente no import do módulo principal.

```sh
node features/quote-photo-release/prepare.mjs <base> <saida>
```

O manifesto gerado contém edições localizadas, hashes dos módulos e os três arquivos públicos. O publicador compara o pacote com a impressão digital da produção recuperada. `connected.mjs` prepara e verifica os arquivos versionados na base estática existente, envia as duas versões com bindings herdados e ativa o conjunto após conferir as versões. Se uma ativação falhar, restaura o par anterior.

A receita se aplica aos dois pacotes 15.23.32 identificados no publicador. Para uma versão posterior, recupere o estado ativo e confira os módulos e suas referências novamente.

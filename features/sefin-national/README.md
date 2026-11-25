# Emissão pela SEFIN Nacional

O Water System prepara e transmite NFS-e nacionais de serviços no menu **Gestão → Notas fiscais**. A configuração inicial cobre serviços prestados no Brasil por MEI e ME/EPP do Simples Nacional. Administradores da empresa configuram o prestador, a série DPS, os códigos fiscais e o ambiente. A nota segue em homologação ou produção conforme a configuração salva no rascunho. A lista mantém os documentos históricos com seus arquivos.

A requisição à SEFIN usa mTLS e uma DPS assinada no servidor. A aplicação só confirma a autorização após receber o XML oficial correspondente à declaração original. Se o retorno se perder, a consulta usa a mesma identificação. Um reenvio transmite os mesmos bytes da declaração inicial. O XML autorizado fica no D1 e o PDF é consultado no ADN.

## Habilitar a emissão

1. Vincule ao Worker System um certificado ICP-Brasil válido para autenticação de cliente pelo binding de mTLS `WATER_SEFIN_TLS`.
2. Configure os segredos `WATER_SEFIN_SIGNING_KEY` com a chave RSA em PEM PKCS#8 e `WATER_SEFIN_CERTIFICATE` com o certificado folha PEM correspondente. Instale a chave somente no gerenciador de segredos do servidor. Use o mesmo certificado para transmissão e assinatura.
3. Configure `WATER_SEFIN_SIGNER_CNPJ` com o CNPJ do titular do certificado. Para cada cliente, confirme a procuração eletrônica da NFS-e ou a representação legal do prestador. No segredo `WATER_SEFIN_EMITTERS`, vincule o ID verificado de cada empresa ao CNPJ que ela pode emitir. Use `production: false` durante a homologação.
4. Confira a configuração fiscal no Water System, reserve uma série DPS para uso exclusivo do sistema e homologue uma emissão e seu cancelamento. Depois, libere o CNPJ com `production: true` e configure a empresa para produção.

```json
{
  "id-da-empresa": {
    "cnpj": "00000000000000",
    "production": false
  }
}
```

## Publicação

Aplique `schema.sql` ao D1 do System antes da publicação. `pack.mjs` recebe os módulos ativos do Financeiro e das Configurações do navegador. `release.mjs` valida a base dos dois Workers, preserva os bindings e monta a publicação conjunta. O cliente do módulo trabalha com os recursos e a autenticação existentes.

Rode `npm test` para verificar os fluxos simulados, as permissões e a recuperação de falhas.

[Documentação de integração da NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual) · [Ambientes da SEFIN e do ADN](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)

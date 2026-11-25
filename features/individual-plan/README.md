# Plano Individual

O quarto plano aparece em `/planos` e leva a `/plano-individual`. O cliente indica os módulos de interesse e pode revisar a mensagem no WhatsApp antes de enviá-la. O valor é definido na consultoria.

No Water Control, abra **Empresas e usuários → Configurar plano Individual**. Escolha a matriz cadastrada e confirme os módulos acordados. A configuração é aplicada à empresa e às suas filiais, conforme os recursos escolhidos. A capacidade de usuários e clientes vem do plano anterior. A gravação dos recursos mantém os vencimentos e as permissões já atribuídas às pessoas.

A extensão foi preparada sobre os Workers ativos 15.23.36. `pack-connector.mjs` recebe os módulos públicos de planos, permissões e assinatura dessa versão e prepara o código de publicação. `connected.mjs` confere o estado ativo, os hashes e os bindings dos dois Workers. Antes de ativar o par, aplique a migração `20261125131000_individual_plan` ao Supabase compartilhado.

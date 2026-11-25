# Plano Individual

O quarto plano leva de `/#planos` a `/plano-individual`. A seleção de módulos é opcional. O visitante solicita uma consultoria com nome, e-mail, telefone e data e horário em Brasília. O valor é definido na consultoria.

No Water Control, abra **Empresas e usuários → Agenda de consultorias** para ler os pedidos, entrar em contato e confirmar o horário acordado. A agenda separa pedidos pendentes, confirmados e cancelados. As informações de contato exigem acesso administrativo.

No Water Control, abra **Empresas e usuários → Configurar plano Individual**. Escolha a matriz cadastrada e confirme os módulos acordados. A configuração é aplicada à empresa e às suas filiais, conforme os recursos escolhidos. A capacidade de usuários e clientes vem do plano anterior. A gravação dos recursos mantém os vencimentos e as permissões já atribuídas às pessoas.

`pack-booking.mjs` prepara a atualização dos Workers ativos 15.23.37. `booking-release.mjs` confere a base e prepara a publicação conjunta. A migração `20261125152000_individual_consultation_booking` cria a tabela privada e o registro idempotente dos pedidos no Supabase compartilhado.

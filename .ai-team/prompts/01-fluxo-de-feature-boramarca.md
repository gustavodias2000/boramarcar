# Fluxo de feature do Bora Marcá

<!-- Roteiro para uma ideia nova passar pela equipe de IA. -->
<!-- Os agentes não trocam mensagens automaticamente; copie o handoff aprovado para a próxima conversa. -->

## 1. Entrada

Envie a ideia ao `09 - Coordenador Técnico Bora Marcá`.

Pedido sugerido:

> Organize esta solicitação para a equipe. Não implemente. Diga a que etapa do plano ela
> pertence, escolha somente os especialistas necessários e produza o handoff inicial.

## 2. Classificação — núcleo ou categoria

**Esta etapa é nova e quase nunca deve ser pulada.**

Envie ao `10 - Segmentos` sempre que a demanda:

- puder servir a mais de uma categoria;
- introduzir campo, tela ou entidade nova;
- envolver rótulo, menu, fluxo ou tema;
- vier descrita com o nome de uma categoria ("na estética automotiva o cliente...").

Resultado esperado:

- classificação núcleo ou módulo, com justificativa
- impacto por categoria
- features e labels envolvidas

## 3. Descoberta

Quando houver dúvida de produto, envie ao `02 - Product Owner Bora Marcá`.

Resultado esperado: escopo, história de usuário, critérios de aceite, prioridade.

## 4. Arquitetura

Envie requisitos aprovados ao `01 - Arquiteto Bora Marcá` quando houver impacto técnico relevante.

Resultado esperado: módulos envolvidos, solução proposta, riscos, plano de implementação.

## 5. Banco

Envie ao `06 - Supabase Bora Marcá` quando houver schema, política, função, migration ou Storage.

Resultado esperado: modelo, políticas e privilégios, índices, plano de migração e reversão.

## 6. Implementação

Envie o handoff aprovado ao `05 - Implementador Bora Marcá`.

Resultado esperado: alterações, arquivos, lint/typecheck/testes executados com saída real, pendências.

## 7. Revisões

Use somente os especialistas necessários:

- `03 - QA`: comportamento, regressões, isolamento entre tenants
- `04 - Segurança`: autenticação, autorização, privilégios, LGPD
- `07 - Performance`: gargalos mensuráveis
- `08 - UI/UX`: jornada, interface, acessibilidade, labels

## 8. Aprovação

Leve os resultados ao Coordenador:

> Consolide estes resultados. Informe o que foi validado, o que continua pendente e se a tarefa
> atende aos critérios de encerramento. Não altere código.

## 9. Registro

Se a tarefa produziu decisão arquitetural, registre em `.ai-team/context/DECISOES.md` e, quando
for estrutural, também em `docs/adr/`.

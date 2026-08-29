# ROADMAP

<!-- Direção e prioridades. Detalhe de tarefa fica no plano de execução. -->
<!-- Fonte completa: docs/plano-execucao.md -->

## Horizonte atual

Projeto foco: `Bora Marcá`

A ordem das etapas é **por dependência, não por severidade**. Três regras a governam:

1. Nada se corrige sem uma rede que prove que ficou corrigido.
2. O que fica mais caro a cada commit vem antes do que fica igual.
3. O que desbloqueia várias etapas vem antes do que desbloqueia uma.

## Curto prazo — estabilizar

- Etapa 0 — rede de segurança: pgTAP, isolamento entre tenants, matriz de papéis, CI ✅
- Etapa 1 — fechar os privilégios de tabela e função ✅ *(pendente de execução do CI)*
- Etapa 2 — bugs que corrompem a operação ✅ *(pendente de execução do CI)*
  C-5 box com fim previsto · C-6/C-7 agendamento consumido · C-9 pagamento validado ·
  C-10 mídia órfã inerte · C-13 uma OS ativa por veículo · C-14 estado `unbilled`

## Médio prazo — virar plataforma

- Etapa 3 — plataforma ✅ **completa**
  3.1 workspace npm com `packages/core` · 3.2 fronteira em dois níveis ·
  3.3 segmento lido do banco, navegação por feature, labels do catálogo ·
  3.4 camada de permissões espelhando o banco · 3.5 camada de servidor
  (`createServerClient`, middleware, `onAuthStateChange`, cliente único) ·
  3.7 domínio, formatação e dados no núcleo · 3.8 fixtures isoladas ·
  3.9 formatação (maior linha: 5.642 → 207; avisos: 234 → 0)
  3.6 seis rotas reais (`/patio`, `/agenda`, `/veiculos`, `/relatorios`, `/conta`),
  com sessão e unidade num `TenantProvider` acima delas · C-15 corrigido
- Etapa 4 — **construir o núcleo a partir do domínio do Barbershop** ← em andamento
  ✅ configuração de agenda completa (almoço, antecedência mín./máx., buffer, turno extra)
  ✅ motivo do bloqueio como dado privado — o padrão que também endereça o C-8
  ✅ avaliação de atendimento como entidade própria, não status
  ✅ recorrência (semanal, quinzenal, mensal) com guarda de cadência
  ✅ lista de espera (aguardando → notificado → agendado / expirado)
  ✅ convite por código e vínculo cliente ↔ empresa, determinístico
  **Etapa 4 completa.** O vínculo é a chave que a Etapa 10 (área do cliente) vai usar.
- Etapa 5 — Barbearia como categoria de referência ✅
  catálogo sugerido para as 11 categorias (79 serviços) · `create_business_with_owner`
  numa transação · tela `/comecar` com escolha de segmento · guarda de rota por feature
  (uma barbearia não alcança `/patio`) · fim do bloqueador de abertura de empresa
- Etapa 6 — fechar Agenda ↔ Pátio ✅
  abrir OS a partir do agendamento · atribuir técnico (RPC que não existia) · atribuir e
  liberar box no painel · tela `/boxes` com criar, editar e desativar · disponibilidade
  recorrente por RPC (fim da última escrita direta) · C-22 corrigido
- Etapa 7 — Manicure, salão e maquiagem ✅
  relatórios do núcleo (a tela antiga lia só tabelas automotivas) · "abrir OS" restrito a
  quem tem OS · o dono vira o primeiro profissional, com disponibilidade padrão — sem isso
  a empresa nascia sem conseguir agendar · teste de ponta a ponta nas três categorias,
  com prova negativa de que nada automotivo vaza

**As sete etapas do bloco de plataforma estão fechadas.**

## Longo prazo — completar o SaaS

- ✅ **financeiro do núcleo** — livro único (`finance_entries`), caixa com conferência,
  comissão automática na conclusão, pagamento da OS espelhado. Leitura restrita a
  operador financeiro, que é o C-8 aplicado ao dinheiro.
  Falta: contas a pagar/receber com vencimento e parcelamento.
- ✅ **LGPD e permissões granulares** — dado pessoal do cliente segregado em
  `customer_contacts`, legível só por quem contata (C-8); consentimento por finalidade,
  onde ausência é opt-in pendente; anonimização em vez de exclusão, que preserva o
  registro fiscal (C-12); desligamento de profissional no lugar da política de DELETE
  que o schema sempre recusou (C-11); `delete_business` ordenado das folhas para a raiz,
  que é a outra metade do C-12; trilha de auditoria e prazo de retenção declarado.
  Falta: varredura de descarte por prazo — depende de execução agendada, que chega com
  as notificações.
- notificações com abstração de provider
- área do cliente
- planos e assinaturas
- demais categorias

## Pendências em aberto

- **confirmar se existe uso em produção hoje** — muda a urgência das Etapas 0 e 1
- decidir paridade com o Barbershop: total ou subconjunto (itens 1–14 do §59 primeiro)
- decidir o modelo de duração prevista da ocupação de box
- decidir o fluxo de convite de membros (depende da camada de servidor)
- **confirmar com o jurídico que anonimização atende ao pedido de exclusão do titular** —
  a implementação já assume que sim, porque apagar levaria junto o registro fiscal; se o
  entendimento for outro, muda o desenho, não só o código
- decidir o prazo de retenção padrão por categoria (hoje cada empresa declara o seu)

## Resolvido em 25/08/2026

- ✅ Maquiagem acrescentada ao enum, ao catálogo e ao Contexto Mestre
- ✅ `docs/foundation.md` corrigido — a afirmação de que o Barbershop não existia era falsa
- ✅ Contexto Mestre versionado no repositório e emendado (ver §62)
- ✅ Ordem do núcleo registrada como §59, anterior à ordem automotiva do §53
- ✅ ADR 0004: o Barbershop é o núcleo, a estética automotiva é um módulo

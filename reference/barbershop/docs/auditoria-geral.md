# Auditoria geral — Barbershop App

Consolidação da auditoria técnica completa realizada em sessão de trabalho (07/08/2026): 7 agentes de análise (performance RN, Firebase/Firestore/Functions, arquitetura, código morto/dependências, testes/qualidade, segurança/privacidade, UI/cores), seguidos por implementação em 4 grupos com arquivos exclusivos e revisão independente. Este documento é a fonte rastreável dos achados e, na seção final, do andamento da resolução.

## Baseline (Fase 1 — diagnóstico, antes de qualquer correção desta auditoria)

- Testes: 577/577 passando.
- TypeScript (`tsc --noEmit`): limpo.
- ESLint: 0 erros, 6 avisos (pré-existentes, não relacionados aos achados).
- Cobertura: 34,25%.
- `npm run test:rules` (Firestore): 21/21. `storage.rules.test.js`: falha por `ECONNREFUSED` (emulador de Storage não sobe — ver TEST-005).
- `git diff --check`: limpo.

## Itens já resolvidos nesta auditoria (antes deste checklist formal)

- P0 segurança: regra `agendamentos` permitia forjar `negocioId` no primeiro branch do `allow create` — corrigido em `firestore.rules` (`negocioBateComOProprioBarbeiro()`), 25/25 testes de regra passando, incluindo 4 novos de regressão cross-tenant.
- Bug de negócio: `antecedenciaMinutos: 0` tratado como 30min por bug de falsy-zero (`||`) em `src/utils/agendaSlots.ts` e `functions/index.js` (`calcularDisponibilidade`) — corrigido nos dois locais (`??`/`Number.isFinite`).
- Performance: double-fetch em `useBarbeariasVinculadas` + `ClienteHome` (`useFocusEffect`); `BarbeiroHome` sem refresh ao voltar o foco; condição de corrida em `AgendamentoScreen`/`AgendamentoManualScreen` ao trocar data/serviço; `loadBarbeiroDados` paralelizado com `Promise.all`.
- Firebase: 4 índices compostos adicionados (`listaEspera`, `recorrencias`) em `firestore.indexes.json`.
- Código morto: `listarBarbeiros` (BarbeiroRepository), `marcarOcupado` (OcupacaoService), `ts-jest` (devDependency não usada) removidos; `DisponibilidadeChip` (órfão, nunca renderizado) conectado em `ClienteHome`.
- Cores/tema: contraste `background`×`surfaceVariant` melhorado (1,05→1,38:1 claro / 1,81:1 escuro); bordas adicionadas em 5 telas sem separação visual; skeleton com cor dedicada no escuro; sombra de `PerfilProfissionalScreen` corrigida.
- PII: `PromocaoScreen.tsx` parou de logar nome completo do cliente.

Estes itens **não** fazem parte do checklist abaixo — já estão com status `resolvido` e testados.

## Checklist rastreável

Cada item usa os status: `pendente`, `em andamento`, `resolvido`, `não se aplica`, `bloqueado`.

| ID | Descrição | Prioridade | Arquivos principais | Status |
| --- | --- | --- | --- | --- |
| SEC-001 | Rate limiting em `placesAutocomplete`, `placesDetails`, `registrarEventoOperacional` (atômico, distribuído, testado) | Alta | `functions/index.js`, `functions/rateLimiter.js` | resolvido |
| SEC-002 | Sanitização recursiva de observabilidade (conteúdo, não só chaves; profundidade/ciclo/tamanho) | Alta | `src/services/ObservabilityService.ts`, `src/utils/sanitizacao.ts`, `functions/index.js` | resolvido |
| SEC-003 | `google-services.json.old-a754d`: investigar, confirmar, remover com evidência | Média | `android/app/`, `.gitignore` | bloqueado (confirmação no Firebase Console pendente com o dono) |
| SEC-004 | `barbeiros/{id}.telefone` público — investigar uso real e apresentar decisão | Média | `firestore.rules`, telas que leem o campo | bloqueado (decisão de produto pendente com o dono) |
| ARCH-001 | Cálculo de comissão fora de `BarbeiroHome.tsx`, em camada de domínio testável | Alta | `src/screens/BarbeiroHome.tsx`, novo serviço de domínio | resolvido |
| ARCH-002 | Remover acesso direto ao Firestore de `HistoricoClienteScreen.tsx` e `RatingComponent.tsx` | Alta | esses dois arquivos + repositórios novos/existentes | resolvido |
| ARCH-003 | `RegisterScreen.tsx` não deve criar `serverTimestamp` | Baixa | `src/screens/RegisterScreen.tsx`, `UsuarioRepository.ts` | resolvido |
| COST-001 | `podeEnviarPara`: eliminar leituras de coleção inteira | Alta | `functions/index.js`, `functions/podeEnviarPara.js`, `functions/telefone.js` | resolvido |
| COST-002 | `calcularDisponibilidade`: paginação/concorrência limitada | Média | `functions/index.js`, `functions/lotes.js` | resolvido |
| COST-003 | `lembretesAgendamento`, `lembretes2Horas`, `relatorioSemanalEmail`: loops sequenciais | Média | `functions/index.js`, `functions/lotes.js` | resolvido |
| COST-004 | Cache em `listarProfissionaisDoNegocio` | Baixa | `src/data/repositories/NegocioRepository.ts` | resolvido |
| PERF-001 | Condição de corrida em `HistoricoScreen.tsx` ao trocar filtro | Média | `src/screens/HistoricoScreen.tsx` | resolvido |
| PERF-002 | Possível listener FCM duplicado — confirmar antes de corrigir | Média | `src/services/NotificationService.ts` | resolvido |
| TEST-001 | Detox desatualizado (`e2e/login.test.js`, `e2e/agendamento.test.js`) | Média | `e2e/*` | resolvido (sintaxe/testID/texto realinhados; execução real em dispositivo não verificada — sem emulador Android neste ambiente) |
| TEST-002 | Cobertura de `AgendamentoScreen.tsx` (hoje 1,11%) | Alta | `src/screens/AgendamentoScreen.tsx`, testes novos | resolvido (87,93% de linhas) |
| TEST-003 | Cobertura de `PerfilScreen.tsx` (LGPD, hoje 0,47%) | Alta | `src/screens/PerfilScreen.tsx`, testes novos | resolvido (98,96% de linhas) |
| TEST-004 | Testes de isolamento multiempresa (`negocios`, `membros`, `despesas`) | Alta | `rules/firestore.rules.test.js` | resolvido |
| TEST-005 | `test:rules` não sobe o emulador de Storage | Baixa | `package.json`, `rules/storage.rules.test.js` | resolvido — suíte de regras 56/56 (Firestore + Storage) |
| CLEAN-001 | Avatar com iniciais duplicado em 9 telas | Baixa | 10 telas migradas + `AvatarIlustrado.tsx` | resolvido |
| CLEAN-002 | `limparConvitePendente` nunca chamada no logout/exclusão | Média | `src/services/SessaoService.ts`, `src/screens/PerfilScreen.tsx` | resolvido |
| CLEAN-003 | `PaymentService.processPayment` deprecated mas é a implementação real | Baixa | `src/services/PaymentService.ts` | resolvido |
| CLEAN-004 | Comentário desatualizado de `linkDeAgendamento` | Baixa | `src/services/DeepLinkService.ts` | resolvido |
| UI-001 | Banners com cor hexadecimal fixa em 6 telas (não adaptam ao escuro) | Baixa | 6 telas + `ThemeContext.tsx` | resolvido |
| UI-002 | Baixo contraste na borda dos headers | Baixa | tema central / componente compartilhado | resolvido |

## Resolução das pendências

_(preenchida ao final de cada onda, com correção realizada, arquivos alterados, testes e evidência)_

**SEC-001 — rate limiting.** A decisão de permitir/negar (janela de hora/dia,
por usuário+função) foi extraída para o módulo puro `functions/rateLimiter.js`
(`decidirLimite`, `janelaAtual`, `chaveDocumentoUso`), no mesmo estilo de
`disponibilidade.js`/`convites.js`. `registrarEnvio` (usado por `sendWhatsApp`,
comportamento preservado) e `verificarLimiteDeUso` (`placesAutocomplete` 60/h
300/dia, `placesDetails` 30/h 150/dia, `registrarEventoOperacional` 120/h
600/dia) viraram wrappers finos que só leem+decidem+gravam dentro de UMA
`db.runTransaction` — é essa transação, não uma variável em memória, que dá a
garantia de atomicidade entre instâncias concorrentes da function. Cada
gravação agora inclui `expiraEm` (Timestamp, 2 dias), preparando uma TTL
policy nativa do Firestore para limpar os documentos de controle sozinha; a
ativação da TTL policy em si é uma configuração de infraestrutura (Firebase
Console/`gcloud`) fora do alcance desta automação — registrada como pendência
manual explícita no comentário acima de `EXPIRACAO_CONTROLE_MS` em
`functions/index.js`. Arquivos: `functions/index.js`, `functions/rateLimiter.js`
(novo), `functions/rateLimiter.test.js` (novo). Testes: 24 novos casos cobrindo
dentro/fora do limite, expiração de janela, usuários diferentes e funções
diferentes não compartilhando contador (`chaveDocumentoUso`), usuário não
autenticado barrado por `exigirEmailVerificado` antes de qualquer I/O do
limitador (via `.run()` do firebase-functions v2, sem emulador), falha de
infraestrutura na leitura propagando como erro em vez de permitir
silenciosamente, e um teste documentando por que concorrência real exige o
emulador do Firestore (não disponível neste ambiente) — a suíte só prova a
pré-condição (decisão pura + tudo dentro de uma única transação), não a
atomicidade do Firestore em si. Evidência: `npx jest functions/rateLimiter.test.js`
— 24/24 passando; suíte completa 625/625; `tsc --noEmit` limpo. Risco
restante: sem o emulador, a garantia de atomicidade sob concorrência real
não foi verificada de ponta a ponta nesta wave; a TTL policy segue como
configuração manual pendente.

**SEC-002 — sanitização recursiva.** Novo módulo `src/utils/sanitizacao.ts`
(`sanitizarProfundo`, `textoSanitizado`) percorre objetos/arrays aninhados,
redige por conteúdo (email, telefone BR, número longo — já existentes — mais
tokens Bearer, segredos no formato `chave: valor` e strings opacas de alta
entropia ≥20 chars), reduz `Error` à `.message` (ignora stack/demais
propriedades), limita profundidade a 4 níveis e 20 campos por objeto (com
marcador `_omitido` no excedente), protege contra referência circular via
`WeakSet` do caminho de recursão, e preserva `area`/`operacao`/`codigo` mesmo
quando teriam batido com o filtro de chave sensível. `ObservabilityService.ts`
foi reescrito para usá-lo (`ContextoObservabilidade` ampliado para aceitar
valores aninhados). O equivalente em `functions/index.js`
(`sanitizarValorEvento`) foi reescrito com o mesmo algoritmo, mas mantém a
allowlist estrita de campos já existente (`area`/`operacao`/`codigo`/`tela`/
`funcao`) em vez de virar blocklist — é o último ponto de controle antes de
gravar em `eventosOperacionais`, então não passou a aceitar campos novos, só
ficou mais rigoroso com os já permitidos. Arquivos:
`src/utils/sanitizacao.ts` (novo), `src/services/ObservabilityService.ts`,
`functions/index.js`, `__tests__/utils/sanitizacao.test.ts` (novo, 20 casos),
`__tests__/services/ObservabilityService.test.ts` (+4 casos: objeto aninhado,
array, "stack" como contexto, referência circular sem travar preservando
`area`/`operacao`/`codigo`). Evidência: `npx jest` — 625/625 passando;
`tsc --noEmit` limpo. Risco restante: a versão embutida em
`functions/index.js` não tem teste automatizado dedicado nesta wave (fora do
escopo de arquivos desta onda, que não incluía um novo arquivo de teste para
esse módulo) — os dois algoritmos precisam ser mantidos em paridade
manualmente ao evoluir um dos lados.

**SEC-003 — arquivo antigo do Firebase.** `android/app/google-services.json`
atual tem `project_id: barbershop-5dca2` (confirmado por leitura direta).
`git log --all -- "android/app/google-services.json.old-a754d"` não retorna
nenhum commit — o arquivo nunca foi versionado, consistente com o relato de
que já havia sido removido antes desta wave por não estar rastreado.
`grep -r "barbershop-a754d"` no worktree encontra referências só em: (a)
`android/app/build/**` — diretório gerado pelo Gradle, coberto por
`build/` no `.gitignore` (`git check-ignore -v` confirma), nunca vai para o
repositório; (b) `docs/auditoria-geral.md` e `resolucao-pendencia.mb` — os
próprios documentos desta auditoria, citando o nome do projeto antigo como
texto; (c) **`GUIA-DEPLOY.md`**, que ainda documenta o projeto antigo
(`barbershop-a754d`) como se fosse o atual em 3 pontos — esse arquivo não
está entre os de responsabilidade exclusiva desta onda, então não foi
alterado; fica registrado aqui como achado para correção numa próxima onda
(ou pelo próprio Gustavo). Adicionada entrada no `.gitignore` para
`google-services.json.old*`/`.bak*` (e o equivalente iOS
`GoogleService-Info.plist`) prevenir recorrência. Arquivo: `.gitignore`.
Bloqueio explícito (não posso resolver): **confirmar no Firebase Console se o
projeto `barbershop-a754d` foi de fato desativado/removido** — sem acesso ao
Console, não há como verificar isso a partir do código. Ação manual que
Gustavo precisa fazer: abrir https://console.firebase.google.com, localizar o
projeto `barbershop-a754d` e decidir se desativa/exclui o projeto antigo (ou
confirmar que já foi feito), sem depender de nenhuma alteração de código.

**SEC-004 — telefone público em `barbeiros/{id}` (decisão de produto, não
correção técnica).** Investigação: `RegisterScreen.tsx` coleta UM único
telefone no cadastro (`telefone` em `usuarios/{uid}`, campo obrigatório,
usado tanto para conta `cliente` quanto `barbeiro` — não existe hoje nenhuma
distinção entre telefone pessoal e comercial). `VerifyEmailScreen.tsx`
(linhas 51-56) copia esse MESMO telefone pessoal para `barbeiros/{uid}.telefone`
ao concluir a verificação de email, tornando-o público. `firestore.rules`
(`match /barbeiros/{barbeiroId}`, linha 107) permite `allow read: if
isSignedIn()` — qualquer conta autenticada (criar uma leva segundos) pode ler
o documento inteiro, incluindo `telefone`, sem precisar de vínculo/agendamento
com aquele profissional. Único ponto do app que efetivamente LÊ
`barbeiro.telefone` para uso funcional: `AgendamentoConfirmadoScreen.tsx`
(fallback para `agendamento.barbeiroTelefone`), para o cliente chamar o
profissional no WhatsApp após confirmar um agendamento — um caso de uso
legítimo, mas que não precisa (nem deveria) depender de leitura pública
irrestrita do documento. Não existe hoje nenhuma cópia privada separada do
telefone do profissional. **Opções objetivas para o dono decidir** (nenhuma
foi implementada): (1) manter como está, aceitando que qualquer conta
autenticada pode coletar o telefone pessoal de todo profissional cadastrado;
(2) adicionar um campo explícito `telefoneComercial` (opcional, preenchido
pelo próprio profissional se quiser divulgar contato) e parar de copiar o
telefone pessoal para o doc público, migrando o campo `telefone` atual em
`barbeiros/{id}` para uma subcoleção/documento privado legível só pelo dono
e por quem tem agendamento confirmado com aquele profissional (equivalente ao
que `criarAgendamentoSeguro` já faz ao denormalizar `barbeiroTelefone` no
próprio agendamento — isso continuaria funcionando sem tocar em
`barbeiros/{id}.telefone`); (3) manter `telefone` público, mas restringir a
regra de leitura desse campo específico a quem tem vínculo/agendamento com o
profissional (mais complexo em Security Rules, que não fazem projeção de
campo por leitor). Nenhuma migração de dados foi executada. Arquivos
alterados nesta investigação: nenhum (só leitura/análise, conforme pedido).

**COST-001 — `podeEnviarPara` (eliminar leituras de coleção inteira).**
Investigação de normalização (pré-requisito: comparação de igualdade do
Firestore não normaliza nada, só casa o valor exatamente como foi gravado):
os campos `telefone`/`clienteTelefone`/`barbeiroTelefone` são gravados JÁ
NORMALIZADOS em todo ponto de escrita hoje existente, todos com o mesmo
algoritmo de `formatPhone()` — `RegisterScreen.tsx` (`usuarios/{uid}.telefone`,
via `formatPhoneToE164`), `VerifyEmailScreen.tsx` (copia esse valor para
`barbeiros/{uid}.telefone`), `useClientes.ts`/`ClienteContatoRepository.ts`
(`barbeiros/{uid}/clientes/{id}.telefone`) e as telas de agendamento
(`AgendamentoScreen.tsx`/`AgendamentoManualScreen.tsx`/`criarAgendamentoSeguro`,
que só REPASSAM esses campos, sem reformatar). Não foi encontrado nenhum
ponto de escrita atual fora dessa cadeia. Com a normalização confirmada, as
6 checagens (`bate()` client-side depois de um `.get()` sem `.limit()`)
viraram queries indexadas com `.limit(1)` em `functions/podeEnviarPara.js`
(novo módulo, `formatPhone` também extraído para `functions/telefone.js`
para ser compartilhado sem duplicar a normalização). As 5 primeiras fontes
(cliente da agenda do profissional, agendamento como cliente por uid,
idem por email legado, agendamento como profissional, lista de espera)
rodam em paralelo via `Promise.all` — decisão documentada no código:
`Promise.any` foi cogitado (sugestão do pedido original) mas descartado
porque cada busca resolve sempre com um booleano (nunca rejeita para "não
achou"), então `Promise.any` pararia no primeiro settle mesmo que `false`,
não no primeiro `true`; `Promise.all` também propaga erro de
infraestrutura em vez de mascará-lo, mesma política do rate limiter
(SEC-001). A 6ª fonte (dono de negócio avisando cliente de um profissional
da equipe) só roda depois das 5 primeiras (depende de saber se `uid` é
dono) e mantém o isolamento de tenant original: só verifica os
profissionais DA EQUIPE DESTE negócio (`barbeiros where negocioId==X`,
já era assim antes), cada um agora com `.limit(1)` na subcoleção
`clientes` em vez de baixá-la inteira. **Leituras estimadas**: antes, sem
limite — cresciam O(histórico da conta): soma de todos os clientes
cadastrados + todos os agendamentos como cliente (por uid e por email) +
todos os agendamentos como profissional + toda a lista de espera + (se
dono) todos os agendamentos do negócio + a soma de TODOS os clientes de
TODA a equipe, sem nenhum teto — uma conta com milhares de agendamentos
pagava milhares de leituras por MENSAGEM enviada. Depois: fixo em 6
leituras para quem não é dono de negócio (5 fontes + 1 checagem "é dono?"
vazia), e `7 + 2M` para donos (M = tamanho da equipe, tipicamente uma
dezena de profissionais), nunca dependente do histórico de agendamentos ou
do tamanho da agenda de clientes. Índices compostos declarados em
`firestore.indexes.json` (`agendamentos` × `clienteUid`+`barbeiroTelefone`,
`cliente`+`barbeiroTelefone`, `barbeiroId`+`clienteTelefone`,
`negocioId`+`clienteTelefone`; `listaEspera` × `barbeiroId`+`clienteTelefone`;
as buscas em subcoleção `clientes` por `telefone` usam índice de campo
único, automático, sem entrada necessária). Arquivos: `functions/index.js`,
`functions/telefone.js` (novo), `functions/podeEnviarPara.js` (novo),
`functions/podeEnviarPara.test.js` (novo, 19 casos — cada uma das 6 fontes
isolada, negação total, isolamento cross-tenant entre negócios, prova de
que cada checagem lê no máximo 1 documento, propagação de erro de
infraestrutura), `firestore.indexes.json`. Evidência:
`npx jest functions/podeEnviarPara.test.js` — 19/19 passando; suíte
completa 681/681; `tsc --noEmit` limpo. **Risco restante** (documentado no
próprio código): a normalização foi confirmada nos pontos de escrita
ATUAIS, não em dados históricos anteriores a essa normalização existir (se
algum documento antigo tiver o telefone em outro formato, a query por
igualdade exata não o encontraria — o pior caso possível é um FALSO
NEGATIVO, mensagem legítima bloqueada, nunca um vazamento; a função só
fica mais estrita, nunca mais permissiva). Nenhuma migração de dados foi
executada — não é destrutiva, então não bloqueia, mas fica registrada
como melhoria incremental futura se algum bloqueio indevido for reportado.

**COST-002 — `calcularDisponibilidade` (paginação/concorrência limitada).**
A leitura inicial de `barbeiros` continua sendo a coleção inteira, filtrada
`ativo !== false` client-side — decisão deliberada, não uma sobra: o
Firestore `!=` EXCLUI documentos sem o campo, e por convenção do projeto
(mesma checagem em `criarAgendamentoSeguro`) um profissional que nunca
setou `ativo` conta como ativo, então `where('ativo', '!=', false)`
excluiria justamente esses profissionais por engano — trocar por essa
query mudaria comportamento, não só custo. Paginação por cursor não foi
adicionada por decisão documentada no código (volume atual de app de
barbearias, não milhões de documentos); se a base crescer sem limite
conhecido, `.orderBy()/.startAfter()/.limit()` é o próximo passo natural,
sem tocar no resto da função. O que mudou de fato: o `for` sequencial
(um `await` por profissional, do primeiro ao último) virou processamento
em lotes de concorrência limitada via `functions/lotes.js#processarEmLotes`
(chunking manual — `for` + `slice` + `Promise.all` por pedaço, sem
dependência nova), lotes de 20 profissionais em paralelo
(`TAMANHO_LOTE_DISPONIBILIDADE`). Falha de um profissional (config
malformada, leitura de ocupações com erro) continua isolada — antes já
havia um try/catch por item dentro do `for`; agora essa mesma isolação
também é garantida pelo próprio `processarEmLotes`, então um erro
inesperado fora do try/catch original (ex.: em código futuro adicionado
sem proteção) não derruba mais o lote inteiro. Não muda a QUANTIDADE de
leituras (cada profissional ainda precisa de 2 leituras de `ocupacoes`,
hoje e amanhã — isso é trabalho necessário, não desperdício); a melhoria é
em tempo de execução (paralelismo dentro de cada lote) e resiliência
(nenhuma falha isolada derruba o cálculo dos demais profissionais).
Arquivos: `functions/index.js`, `functions/lotes.js` (novo, lógica pura de
chunking, compartilhada com COST-003). Testes:
`functions/lotes.test.js` (9 casos — ordem preservada, teto de concorrência
respeitado, paralelismo real dentro do lote, múltiplos lotes sequenciais,
falha parcial, handler de falha que também lança, lista vazia, tamanho de
lote inválido) e `functions/disponibilidade-agendada.test.js` (5 casos,
via `exports.__testing.executarCalculoDisponibilidade` com Firestore fake —
todos os ativos processados e gravados, filtro `ativo !== false`
client-side preservado, teto de concorrência de 20 respeitado com pico
medido, falha de 1 profissional não impede os demais, múltiplos lotes
sequenciais). Evidência: `npx jest functions/lotes.test.js
functions/disponibilidade-agendada.test.js` — 14/14 passando; suíte
completa 681/681. Risco restante: nenhum identificado nesta wave; a
decisão de não paginar por cursor está documentada e é reversível sem
reescrever a função.

**COST-003 — funções agendadas sequenciais (`lembretesAgendamento`,
`lembretes2Horas`, `relatorioSemanalEmail`).** Mesmo tratamento de
chunking/concorrência limitada de COST-002 (`processarEmLotes`, lotes de
10 — `TAMANHO_LOTE_LEMBRETES`/`TAMANHO_LOTE_RELATORIO_SEMANAL`), aplicado
aos 3 `for` sequenciais. As queries de `lembretesAgendamento`/
`lembretes2Horas` já eram restritas ao necessário (`data` + `status ==
confirmado`) e já eram idempotentes por documento
(`lembreteD1EnviadoEm`/`lembrete2hEnviadoEm`, comportamento preservado sem
alteração) — o que faltava era isolar falha inesperada de UM agendamento
(ex.: erro ao ler `usuarios/{uid}` fora do try/catch específico do canal
push) dos demais, o que o `processarEmLotes` agora garante estruturalmente.
`relatorioSemanalEmail` ganhou uma proteção que não existia antes:
idempotência nova (`usuarios/{barbeiroId}.relatorioSemanalUltimoEnvioEm`,
gravado com a data de referência da execução) — sem isso, um retry do
agendador no mesmo dia reenviaria o relatório duplicado; a leitura inicial
de `barbeiros` continua sendo a coleção inteira, mesma decisão documentada
de COST-002 (volume pequeno, sem paginação por cursor nesta wave). Nenhum
teste chama a API real de WhatsApp/Twilio/SMTP: os secrets
(`WHATSAPP_TOKEN`/`TWILIO_*`) não existem no ambiente de teste, então os
branches de envio ficam naturalmente desligados nos testes de lembretes
(só o canal push é exercitado, com `firebase-admin` mockado só naquele
arquivo de teste — `jest.mock('firebase-admin', ...)` — para nunca chamar
o FCM de verdade); `relatorioSemanalEmail` recebeu um `criarTransporter`
injetável (default: SMTP real do Gmail; testes sempre passam um fake).
Arquivos: `functions/index.js`, `functions/lotes.js` (compartilhado com
COST-002). Testes: `functions/lembretes.test.js` (9 casos — idempotência
D-1/H-2, envio e marcação do campo, teto de concorrência de 10, falha
parcial isolada, janela de H-2 preservada) e
`functions/relatorioSemanal.test.js` (6 casos — filtro por email/agendamento
na semana, idempotência nova, marcação após sucesso, falha de envio de UM
barbeiro não afeta os demais, falha inesperada ao processar um barbeiro
isolada, early-return sem EMAIL_USER/EMAIL_PASS sem tocar o Firestore).
Evidência: `npx jest functions/lembretes.test.js
functions/relatorioSemanal.test.js` — 15/15 passando; suíte completa
681/681. Risco restante: nenhuma proteção contra sobreposição de duas
execuções agendadas do MESMO scheduler rodando simultaneamente foi
adicionada nesta wave (ex.: um lock distribuído) — a idempotência por
documento/campo já cobre o caso prático de retry, mas não foi pedido
explicitamente no escopo desta onda e não foi implementada; fica como
melhoria futura se a sobreposição real for observada em produção.

**COST-004 — cache em `listarProfissionaisDoNegocio`.** Adicionado
`CacheService.getOrFetch` seguindo o padrão de `getBarbeiro`
(`BarbeiroRepository.ts`), com chave `` `negocio:${negocioId}:profissionais` ``
(sempre incluindo `negocioId` — nunca compartilhada entre negócios
diferentes) e TTL de 2 minutos (`TTL_PROFISSIONAIS_MS`, mesmo valor de
`TTL_BARBEIRO_MS`: é a mesma natureza de dado, muda na mesma cadência).
Invalidação em todo ponto que altera um profissional do negócio:
`criarProfissional` (já invalidava o prefixo da vitrine geral, agora
também invalida a chave do negócio), `atualizarProfissional` (a maioria
das telas que a chamam — agenda, serviços, bloqueios, folgas — não passa
`negocioId`; a função descobre sozinha via `getBarbeiro` antes de escrever,
usando o cache já quente na maioria dos casos) e `definirAtivoProfissional`
(passa `negocioId` direto para `atualizarProfissional`, evitando a busca
de descoberta). Nenhum outro ponto do repositório cria/edita um
profissional vinculado a negócio fora desses três. Arquivos:
`src/data/repositories/NegocioRepository.ts`,
`__tests__/data/NegocioRepository.test.ts` (estendido, +8 casos: cache
hit dentro do TTL, isolamento entre negócios diferentes, expiração após o
TTL com `jest.useFakeTimers`, invalidação por `atualizarProfissional` com e
sem `negocioId` explícito, invalidação por `definirAtivoProfissional`,
invalidação por `criarProfissional`, caso defensivo de profissional não
encontrado). Evidência: `npx jest __tests__/data/NegocioRepository.test.ts`
— 11/11 passando (3 preexistentes + 8 novos); suíte completa 681/681;
`tsc --noEmit` limpo. Risco restante: nenhum identificado — a invalidação
cobre todos os pontos de escrita atuais deste repositório.

**ARCH-001 — cálculo de comissão fora de `BarbeiroHome.tsx`.** A regra (dado
`precoEmCentavos`, `comissaoTipo`, `comissaoPercentual`, `comissaoFixaCentavos`
→ devolve `comissaoCentavos` ou `undefined`) foi extraída para o novo módulo
puro `src/services/ComissaoService.ts` (`calcularComissaoCentavos`), no mesmo
espírito de `functions/rateLimiter.js` — sem I/O, testável direto. A tela
(`BarbeiroHome.tsx#concluir`) passou a só orquestrar: busca o membro via
`getMembro` (inalterado), chama a função pura, monta `extras` e grava via
`atualizarStatus` (inalterado). Comportamento ORIGINAL preservado 1:1:
`comissaoPercentual`/`comissaoFixaCentavos` iguais a `0` continuam tratados
como "sem comissão configurada" (checagem `truthy`, igual ao código antigo) —
decisão deliberada de não mudar regra de negócio nesta extração, conforme
pedido. O único comportamento NOVO (autorizado explicitamente pelo escopo):
percentual fora de `[0, 100]` ou não-finito (`NaN`/`Infinity`/negativo), e
valor fixo negativo/não-finito, agora resultam em "sem comissão" em vez de
gravar um valor absurdo no histórico — antes esses casos não tinham nenhuma
proteção (um dado corrompido em `comissaoPercentual: 500` teria gerado 5x o
preço do serviço como comissão). Continua confirmado e documentado no código
que o valor é histórico-seguro por construção: gravado uma vez em
`agendamentos/{id}.comissaoCentavos` na conclusão, nunca recalculado depois
(`ComissoesScreen.tsx` só soma o que já está gravado). A fronteira
"só é chamado no fluxo de conclusão, nunca em cancelamento/pendência" está
documentada no comentário da função — a função pura não conhece nem precisa
conhecer o status do agendamento. Arquivos: `src/services/ComissaoService.ts`
(novo), `src/screens/BarbeiroHome.tsx`,
`__tests__/services/ComissaoService.test.ts` (novo, 18 casos: percentual
normal, arredondamento com preço ímpar, 100%, zero tratado como ausente,
ausente/undefined, negativo, acima de 100, NaN/Infinity, fixo normal, fixo
zero, fixo negativo, sem preço/preço zero, sem comissão configurada, tipo
desconhecido). Evidência: `npx jest __tests__/services/ComissaoService.test.ts`
— 18/18 passando; suíte completa 712/712; `tsc --noEmit` limpo. Risco
restante: nenhum identificado.

**ARCH-002 — acesso direto ao Firestore fora de repositórios.** Criado
`src/data/repositories/AvaliacaoRepository.ts` (novo), seguindo o padrão de
`BanimentoRepository.ts`/`ClienteContatoRepository.ts` — um repositório por
coleção, funções pequenas. Expõe `criarAvaliacao` (substitui o `setDoc` direto
de `RatingComponent.tsx`, mesmos campos gravados, mesma chave de documento —
`avaliacoes/{agendamentoId}` — e mesmo comportamento idempotente por
sobrescrita) e `existeAvaliacaoParaAgendamento` (checagem pontual por `get`,
já que o id do documento é o próprio id do agendamento). `RatingComponent.tsx`
não importa mais nada de `firebase/firestore` — só chama `criarAvaliacao` e o
já existente `atualizarStatus` de `AgendamentoRepository.ts`. **Desvio
deliberado do plano original, registrado para revisão**: a segunda query
apontada em `HistoricoClienteScreen.tsx` (`clienteUid`+`barbeiroId` em
`agendamentos`, ordenada por `data desc`) NÃO verifica existência de
avaliação — confirmado lendo o arquivo inteiro e cruzando com o índice
composto já declarado em `firestore.indexes.json` (`clienteUid`+`barbeiroId`+
`data`): é o carregamento do HISTÓRICO COMPLETO de agendamentos entre aquele
cliente e aquele profissional, usado para as estatísticas da tela (visitas,
total gasto, frequência) e a lista renderizada — nenhuma relação com a
coleção `avaliacoes`. Colocar essa função dentro de `AvaliacaoRepository.ts`
teria furado a própria convenção que esta auditoria está reforçando ("um
repositório por coleção"), então a função (`listarPorClienteEBarbeiro`) foi
adicionada a `src/data/repositories/AgendamentoRepository.ts` — mesmo arquivo
das outras 6 funções que já leem a coleção `agendamentos`, mesmo índice
composto, mesma query, comportamento 100% preservado. Esse arquivo não estava
na lista de responsabilidade exclusiva desta onda; a alteração é pequena,
aditiva (uma função nova, nada removido/alterado no resto do arquivo) e seguiu
o padrão exato das funções vizinhas — mas fica sinalizada aqui explicitamente
para o Gustavo revisar essa decisão antes da próxima onda. `RatingComponent`
já não usava `HistoricoClienteScreen.tsx` (é chamado por `HistoricoScreen.tsx`,
que decide mostrar avaliação por `agendamento.status`, sem consultar
`avaliacoes`) — outra confirmação de que as duas queries do ARCH-002
pertenciam a coleções diferentes desde o início. Arquivos:
`src/data/repositories/AvaliacaoRepository.ts` (novo),
`src/components/RatingComponent.tsx`, `src/screens/HistoricoClienteScreen.tsx`,
`src/data/repositories/AgendamentoRepository.ts` (nova função,
`listarPorClienteEBarbeiro`), `__tests__/data/AvaliacaoRepository.test.ts`
(novo, 7 casos), `__tests__/components/RatingComponent.test.js` (mocks
trocados de `firebase/firestore` para os dois repositórios + 1 caso novo
provando a chamada a `criarAvaliacao`/`atualizarStatus` com os campos
corretos), `__tests__/data/AgendamentoRepository.test.ts` (+4 casos para
`listarPorClienteEBarbeiro`). Evidência: suíte completa 712/712 passando;
`tsc --noEmit` limpo. Risco restante: nenhum identificado — os dois arquivos
confirmadamente não importam mais `firebase/firestore`.

**ARCH-003 — `RegisterScreen.tsx` não deve criar `serverTimestamp`.**
`UsuarioRepository.ts#createProfile` passou a gravar `consentimentoEm:
serverTimestamp()` internamente sempre que `consentimentoLGPD` vier `true`
nos dados — mesma categoria de campo técnico que `createdAt`, que o
repositório já carimbava sozinho. O TIPO do parâmetro foi restrito
(`Omit<Usuario, 'uid' | 'createdAt' | 'consentimentoEm'>`) para que a tela
não consiga sequer tentar passar seu próprio valor para `consentimentoEm` —
reforço em tempo de compilação, não só de convenção. `RegisterScreen.tsx`
passou a enviar só `consentimentoLGPD: true` e removeu o import de
`firebase/firestore` (confirmado, grep, que não sobrava nenhum outro uso
desse import no arquivo). Arquivos: `src/data/repositories/UsuarioRepository.ts`,
`src/screens/RegisterScreen.tsx`, `__tests__/data/UsuarioRepository.test.ts`
(+3 casos: `consentimentoEm` gravado com o carimbo do servidor quando
`consentimentoLGPD: true` mesmo sem a tela enviar timestamp nenhum,
`consentimentoEm` ausente quando `consentimentoLGPD` não vem `true`, e uma
checagem estática lendo o código-fonte de `RegisterScreen.tsx` para provar
que não há import de `firebase/firestore`). Evidência: suíte completa
712/712 passando; `tsc --noEmit` limpo. Risco restante: nenhum identificado
— `createProfile` só tinha um chamador (`RegisterScreen.tsx`, confirmado por
grep), então a mudança de assinatura não quebra nenhum outro ponto do app.

**PERF-001 — condição de corrida em `HistoricoScreen.tsx` ao trocar filtro.**
Mesmo padrão já usado em `AgendamentoScreen.tsx#fetchHorariosDisponiveis`
(onda 3): um `useRef(0)` (`requisicaoHistoricoRef`) incrementado no INÍCIO de
`fetchAgendamentos` e checado antes de aplicar o resultado (sucesso), antes de
mostrar o alerta de erro (catch) e antes de encerrar o loading (finally) — só
a chamada cuja "ficha" bate com o valor atual do ref pode alterar o state.
Antes da correção, trocar de filtro rapidamente (ex.: "Todos" → "Pendentes"
→ "Confirmados" antes da primeira resposta chegar) podia deixar a tela
mostrando dados de um filtro que não é mais o selecionado, caso a resposta
mais antiga chegasse depois da mais recente. `onRefresh` (pull-to-refresh) e
o `useEffect` de troca de filtro continuam chamando a MESMA
`fetchAgendamentos` — o guard funciona para as duas origens sem alterar o
comportamento de `refreshing`/`loading` (cada uma continua controlada
independentemente, como antes). Arquivos: `src/screens/HistoricoScreen.tsx`,
`__tests__/screens/HistoricoScreen.test.tsx` (novo). Testes (2 casos): o
cenário completo pedido (filtro lento seguido de filtro rápido, resposta
rápida chega primeiro, resposta lenta obsoleta chega depois e é descartada —
a tela continua mostrando os dados do filtro mais recente) e o caso normal
sem corrida. Como os botões de filtro somem da árvore assim que um deles é
pressionado (a tela troca para o skeleton de carregamento em tela cheia
enquanto `loading` é `true`, escondendo a barra de filtros), o teste captura
as referências `onPress` dos dois botões enquanto ainda estão visíveis e as
invoca diretamente para simular os dois toques rápidos — reproduz o mesmo
efeito de um segundo toque real sem depender de o elemento continuar montado.
Evidência: revertendo a correção localmente, os dois testes acusam a falha
esperada (a tela mostra os dados do filtro antigo); com a correção aplicada,
`npx jest __tests__/screens/HistoricoScreen.test.tsx` — 2/2 passando; suíte
completa 719/719 (712 baseline + 7 novos desta onda); `tsc --noEmit` limpo;
`eslint .` sem novos erros/avisos. Risco restante: nenhum identificado.

**PERF-002 — listener FCM possivelmente duplicado.** Suspeita CONFIRMADA por
investigação de código (não só hipótese): `NotificationService` é um
singleton (`export default new NotificationService()`) cujo construtor roda
`_setupBackgroundListeners()` uma única vez por processo — isso já estava
correto. O problema é `init()`: chama `_setupForegroundListener()`
(`messaging().onMessage`) e `_setupTokenRefreshListener()`
(`messaging().onTokenRefresh`) toda vez que é invocado, sem nunca desinscrever
o registro anterior. `init()` só é chamado de um lugar — `ClienteHome.tsx`,
dentro de um `useEffect` de MONTAGEM (`[]`) — mas `ClienteHome` é uma tela do
navigator do cliente: logout (desmonta o navigator) seguido de login de novo
NA MESMA sessão do app (processo JS vivo) remonta `ClienteHome` como uma nova
instância de componente, disparando o `useEffect` de novo e chamando
`NotificationService.init()` uma SEGUNDA vez no MESMO singleton — registrando
um segundo `onMessage`/`onTokenRefresh` por cima do primeiro, nunca removido.
Uma notificação em foreground depois disso dispararia `Alert.alert` uma vez
por listener acumulado (2x após um logout/login, 3x após dois, etc.).
Correção: `init()` ganhou um flag de instância (`_inicializado`) que, quando
já `true`, pula `requestPermission` e o registro dos dois listeners — mas
**não** pula `getFCMToken()` (desvio deliberado de uma idempotência "tudo ou
nada", documentado no código): sem repetir esse passo, um segundo usuário que
logasse na mesma sessão do app nunca teria o token do aparelho salvo no
próprio perfil (`saveFcmToken`), já que o listener de refresh só dispara
quando o FCM decide girar o token — o que pode não acontecer durante a sessão
inteira. Repetir `getFCMToken()` é seguro e barato (leitura de um token já em
cache local pelo SDK + uma gravação), diferente de repetir `requestPermission`
(reabriria o dialog do SO) ou os `messaging().on*` (o próprio bug). Nenhum
`destroy()`/unsubscribe foi adicionado para o logout — decisão deliberada,
documentada no código: a permissão do sistema operacional e o token do FCM
são atributos do APARELHO/processo, não da sessão de um usuário específico, e
`_setupTokenRefreshListener` já lê `auth.currentUser?.uid` DENTRO do callback
(no momento em que o token gira, não no momento do registro) — então um único
listener, registrado uma vez, sempre associa o token ao usuário correto,
mesmo depois de trocar de conta no mesmo aparelho; o dono do ciclo de vida
desses listeners é o processo do app, não a sessão logada. Arquivos:
`src/services/NotificationService.ts`,
`__tests__/services/NotificationService.test.ts` (novo). Testes (5 casos,
intencionalmente dependentes de ordem dentro do mesmo `describe` — reutilizam
a MESMA instância singleton ao longo do arquivo, igual ao processo real do
app, com essa decisão documentada no topo do arquivo de teste): 1ª chamada de
`init()` pede permissão, salva o token e registra os listeners; 2ª chamada
(simulando logout+login na mesma sessão) não repete `requestPermission` nem
registra listener novo; a 2ª chamada ainda salva o token no perfil do usuário
atualmente logado, mesmo sendo outro usuário; uma notificação em foreground
simulada (via o callback capturado na 1ª chamada) dispara `Alert.alert` só
uma vez mesmo após múltiplos `init()`; o listener de refresh de token único
associa o token ao usuário logado no momento do EVENTO (um terceiro usuário,
depois de duas trocas de sessão), não no momento do registro. Evidência:
revertendo a correção localmente, os dois testes de não-duplicação acusam a
falha esperada (`requestPermission`/`onMessage`/`onTokenRefresh` chamados de
novo na 2ª chamada); com a correção aplicada,
`npx jest __tests__/services/NotificationService.test.ts` — 5/5 passando;
suíte completa 719/719; `tsc --noEmit` limpo; `eslint .` sem novos
erros/avisos. **Achado à parte, fora do escopo desta correção, registrado
apenas como observação**: `NotificationService.init()` nunca é chamado do
lado do barbeiro (`BarbeiroHome.tsx` ou qualquer outra tela do fluxo do
profissional) — confirmado por busca no código, só `ClienteHome.tsx` chama
`init()`. Isso significa que o barbeiro nunca recebe push notification hoje
(ex.: aviso de novo agendamento), uma lacuna de produto separada do bug de
duplicação corrigido aqui; não foi implementado nada para isso nesta onda,
por não fazer parte do pedido literal de PERF-002. Risco restante do que foi
corrigido: nenhum identificado.

**TEST-002 — cobertura de `AgendamentoScreen.tsx` (1,11% → 87,93% de
linhas).** Arquivo lido por inteiro antes de qualquer teste. Decisão de
isolamento, documentada no topo do próprio arquivo de teste: `getDatesDisponiveis`
(única função de `src/utils/agendaSlots.ts` que depende de `new Date()`, ou
seja, do dia real em que a suíte roda) foi mockada para devolver um
calendário fixo (datas em 2030, longe de qualquer data real de execução);
TODO o resto do módulo (`gerarSlots`, `filtrarBloqueiosHorario`,
`isTimeInPast`, `timeToMinutes`, `minutesToTime`) usa a implementação REAL —
já coberta por `__tests__/utils/agendaSlots.test.ts` e aqui exercitada de
ponta a ponta (config do barbeiro → slots renderizados na tela), para não
duplicar a mesma matemática com dados falsos, só substituir "qual é o
calendário de hoje" por um fixo. `PaymentModal` (peça própria, já testada em
`__tests__/components/PaymentModal.test.tsx` com `PaymentService` real) foi
mockada como dois botões que disparam `onPaymentSuccess`/`onClose`
diretamente — o que a tela precisa garantir é abrir o modal com os dados
certos e reagir certo às duas saídas, não reimplementar o fluxo de pagamento
presencial do componente filho. Nenhum hook/módulo novo precisou ser extraído
da tela: apesar de grande, a lógica já estava organizada o bastante (efeitos
bem isolados, `requisicaoHorariosRef` já correto) para ser testada
diretamente renderizando a tela com os repositórios/serviços mockados, no
mesmo estilo de `__tests__/screens/ClienteHome.test.tsx`/`HistoricoScreen.test.tsx`.
Cobertos: carregamento de serviços e configuração do barbeiro (incluindo
fallback quando `getBarbeiro` falha ou devolve `null` — profissional
removido/indisponível, sem travar a tela); seleção de serviço (duração/preço
exibidos, troca de seleção, e o pulo da etapa quando a tela recebe
`servicoId` da rota); datas disponíveis e folgas (`datasBloqueadas` chega até
`getDatesDisponiveis` e reduz a lista de botões); horários disponíveis,
horário já ocupado, bloqueio de evento pessoal e intervalo de almoço (os
quatro usando a matemática REAL de `agendaSlots`, não simulada); a condição
de corrida de `requisicaoHorariosRef` (mesmo padrão pedido para
`HistoricoScreen.test.tsx`: troca de data lenta seguida de troca rápida, a
resposta antiga chega depois e é descartada — revertendo a correção
localmente o teste acusa a falha, confirmando que ele testa a coisa certa);
confirmação do agendamento (payload de `criarAgendamento`, cálculo dos slots
passados para `reservarSlots`); erro da Cloud Function
(`criarAgendamentoSeguro`, chamado via `AgendamentoRepository#criarAgendamento`)
nos três formatos que o código trata — `functions/already-exists`,
`HorarioIndisponivelError` de `reservarSlots` (com o desfazimento do
agendamento recém-criado) e erro genérico; duplo clique no botão de
confirmar — achado registrado no próprio teste: a proteção real não é um
guard de re-entrância na função (não existe um), é a tela inteira trocar para
um `ActivityIndicator` de tela cheia assim que `loading` vira `true`
(`if (loading) return <ActivityIndicator />`), removendo o botão da árvore
antes que um segundo toque físico pudesse alcançá-lo; cliente banido pelo
profissional (subcoleção `banidos` e o array legado `clientesBanidos`) —
interpretação adotada para "profissional desativado" no pedido original,
registrada no teste; serviço indisponível (`servicos.length === 0`, banner
"Serviços não configurados"); navegação após sucesso do pagamento
(`navigation.replace('AgendamentoConfirmado', …)`, com e sem WhatsApp
enviado, e com o envio falhando sem travar a navegação). Também cobertos,
por serem parte real e não-trivial do arquivo: lista de espera quando não há
horário livre. Arquivos: `__tests__/screens/AgendamentoScreen.test.tsx`
(novo, 28 casos). Nenhum arquivo de produção foi alterado — `requisicaoHorariosRef`
e o `Promise.all` de `loadBarbeiroDados` continuam exatamente como estavam.
Evidência: `npx jest __tests__/screens/AgendamentoScreen.test.tsx` — 28/28
passando; `npx jest __tests__/screens/AgendamentoScreen.test.tsx
__tests__/screens/PerfilScreen.test.tsx --coverage
--collectCoverageFrom="src/screens/AgendamentoScreen.tsx"
--collectCoverageFrom="src/screens/PerfilScreen.tsx"` mede **87,93% de
linhas** (86,55% statements, 80,27% branches, 75,86% funções) em
`AgendamentoScreen.tsx`, medido de verdade, não estimado. Risco restante: as
poucas linhas não cobertas (ver `Uncovered Line #s` do relatório de
cobertura) são majoritariamente branches de erro do fluxo de troca de senha
não aplicável aqui (não é este arquivo) e pequenos ramos defensivos de baixo
risco; nenhum comportamento de negócio ficou sem teste.

**TEST-003 — cobertura de `PerfilScreen.tsx` (0,47% → 98,96% de linhas).**
Arquivo lido por inteiro antes de qualquer teste, junto de
`src/services/ExclusaoContaService.ts` e seu teste existente
(`__tests__/services/ExclusaoContaService.test.ts`) para saber exatamente o
que a tela invoca. Nenhuma exclusão real acontece nos testes: `ExclusaoContaService`,
`SessaoService`, `DeepLinkService`, `FotoPerfilService`, `GeocodingService`,
`UsuarioRepository` e `BarbeiroRepository` estão todos mockados (`jest.mock`);
`firebase/auth` e `../../firebaseConfig` reaproveitam o mock global já
existente em `jest.setup.js` (`auth.currentUser = { uid: 'test-uid', email:
'test@example.com' }`), só configurando `mockResolvedValue`/`mockRejectedValue`
por teste, sem reescrever o módulo. Cobertos: carregamento do perfil (nome,
telefone formatado, tipo cliente/barbeiro, e o caminho extra do barbeiro que
também busca `getBarbeiro` para endereço/foto), com estado de carregamento
antes da resposta chegar e alerta de erro se `getProfile` falhar; alteração
de dados (validação de nome curto e telefone inválido, salvamento com
sucesso, sincronização da vitrine via `upsertBarbeiro` só quando o usuário é
barbeiro, mensagem de erro quando salvar falha); troca de senha (senha atual
vazia, nova senha curta, confirmação que não confere, senha atual incorreta
com mensagem amigável, sucesso); reenvio de verificação de email (sucesso e
o caso de `auth/too-many-requests`); logout (confirmação via `Alert.alert`
antes de `encerrarSessao()` + navegação, e que nada acontece sem confirmar);
confirmação de exclusão (exige senha antes de abrir o `Alert` de
confirmação, o `Alert` tem opção "Cancelar" com `style: 'cancel'` e nenhuma
exclusão roda enquanto ele não é confirmado — teste explícito de
cancelamento); sucesso da exclusão (reautentica → `apagarDadosDoUsuario` →
`deleteUser` → `esquecerSessao()` → `limparAgendamentoPendente()` → navega
para Login, nessa ordem, batendo com o comentário do próprio código-fonte);
falha parcial (`apagarDadosDoUsuario` devolve `erros` não-vazio: a conta de
autenticação NÃO é apagada, a sessão NÃO é limpa, a tela avisa para tentar de
novo — proteção documentada no próprio `PerfilScreen.tsx` contra dado órfão);
senha incorreta na reautenticação; proteção contra vários cliques (tanto no
salvar perfil quanto no excluir conta — o botão de excluir não declara
`accessibilityState` explícito, então o teste lê `accessibilityState.disabled`
do host component por baixo do `TouchableOpacity`, que o React Native
já deriva automaticamente a partir do prop `disabled` bruto); foto de perfil
(upload com sucesso, cancelamento na galeria, erro da galeria, falha no
upload); autocomplete de endereço do estabelecimento, com debounce real
(`jest.useFakeTimers` só neste bloco, restaurado no `afterEach`): menos de 3
caracteres não consulta o serviço, 3+ caracteres dispara a busca após 400ms e
escolher uma sugestão preenche endereço/coordenadas. **Achado CONFIRMADO nesta
onda de testes (não corrigido AQUI, por instrução explícita do pedido —
"documente, não implemente"; corrigido depois, ver CLEAN-002 abaixo)**:
`PerfilScreen.tsx` importava e chamava `limparAgendamentoPendente()` do
`DeepLinkService.ts` na exclusão de conta, mas **nunca** importava nem
chamava `limparConvitePendente()` (mesmo arquivo, mecanismo paralelo para o
fluxo de vínculo por QR Code/link/código) — nem na exclusão, nem no logout.
Um teste dedicado (`__tests__/screens/PerfilScreen.test.tsx`, describe
"exclusão de conta (LGPD)") documentou isso lendo o mock do módulo e
confirmando que `limparConvitePendente` nunca era referenciado pela tela.
Esse achado é o MESMO item já registrado como pendência separada nesta
auditoria (`CLEAN-002 — limparConvitePendente nunca chamada no
logout/exclusão`, tabela acima) — não era uma pendência nova, e a onda de
código morto/duplicação corrigiu a causa (ver parágrafo CLEAN-002 abaixo,
que também reescreveu este mesmo teste para confirmar a chamada em vez da
ausência dela). Arquivos: `__tests__/screens/PerfilScreen.test.tsx` (novo,
31 casos, nesta onda de testes). Nenhum arquivo de produção foi alterado
NESTA onda de testes. Evidência: `npx jest __tests__/screens/PerfilScreen.test.tsx`
— 31/31 passando; cobertura medida junto com TEST-002 (comando acima):
**98,96% de linhas** (93,36% statements, 76,38% branches, 88,88% funções) em
`PerfilScreen.tsx`. Risco restante: nenhum identificado no que foi testado
nesta onda.

**TEST-001 — Detox desatualizado (`e2e/login.test.js`, `e2e/agendamento.test.js`).**
Os dois arquivos foram lidos e comparados linha a linha com o estado ATUAL
das telas envolvidas (`LoginScreen.tsx`, `WelcomeScreen.tsx`, `ClienteHome.tsx`,
`ClienteTabs.tsx`, `PerfilProfissionalScreen.tsx`, `AgendamentoScreen.tsx`,
`PaymentModal.tsx`, `AgendamentoConfirmadoScreen.tsx`, `InicioScreen.tsx`,
`BarbeiroTabs.tsx`, `App.tsx`) e com o seed do emulador
(`functions/scripts/seed-detox-emulator.js`). Divergências encontradas e
corrigidas: (1) o app não abre mais direto no Login — a primeira tela para
quem não está logado é `WelcomeScreen` ("BARBERSHOP" + botão "Entrar", ver
`SessaoService#rotaInicialParaUsuario` devolvendo `'Welcome'` sem usuário
restaurado); os testes antigos assumiam Login como tela inicial. (2)
`LoginScreen.tsx` não tem NENHUM `testID` nos campos — só `accessibilityLabel`
("Campo de email", "Campo de senha", "Entrar no aplicativo"); os
`by.id('email-input')`/`by.id('password-input')`/`by.id('login-button')`
antigos não correspondem a nada no código atual. Trocados para `by.label()`
(a instrução do pedido prioriza `testID`, mas só onde ele existe — como a
tela não expõe nenhum, `accessibilityLabel` é a alternativa mais estável
disponível sem alterar `LoginScreen.tsx`, fora da lista de arquivos desta
onda). (3) `ClienteHome.tsx` não tem mais um botão "Agendar" direto no card
(`testID="agendar-button"` não existe mais) — o fluxo atual é "Ver perfil"
(`testID="ver-perfil-button"`, preservado) → `PerfilProfissionalScreen`
(`testID="perfil-profissional-screen"`, lista de serviços) → tocar num
serviço (só tem `accessibilityLabel`, ex. "Agendar Corte Detox, 30 minutos,
R$ 45,00" — sem `testID` nesse cartão) → `AgendamentoScreen`, já com o
serviço pré-selecionado. Esse achado já estava documentado como comentário em
`__tests__/screens/ClienteHome.test.tsx` de uma onda anterior ("e2e/agendamento.test.js
ainda espera o testID/comportamento antigo") — confirmado e corrigido aqui.
(4) `AgendamentoScreen.tsx` manteve os `testID`s usados pelo arquivo antigo
(`date-button`, `time-button`, `confirm-button`) — nenhuma mudança
necessária nesses três. (5) O modal de confirmação (`PaymentModal.tsx`)
mostra "Resumo do agendamento" e um botão de texto "Confirmar agendamento"
(minúsculo) — achado de uma colisão de `accessibilityLabel` com o botão da
própria `AgendamentoScreen` (os dois usam o MESMO texto de
`accessibilityLabel`, "Confirmar agendamento"): resolvido usando `testID`
(`confirm-button`) para o botão da tela e `by.text()` com a grafia exata em
minúsculo para o botão do modal, que só existe ali — o texto do botão da tela
é "Confirmar Agendamento" (maiúsculo), então não há ambiguidade por texto
visível. (6) A tela final mostra "Agendamento confirmado!"
(`AgendamentoConfirmadoScreen`), não mais "Confirmar Pagamento" (texto que
não existe em nenhuma tela atual). (7) O barbeiro não cai mais em "Painel do
Barbeiro" (texto que não existe mais em nenhuma tela) — a aba inicial do
barbeiro é "Início" (`InicioScreen.tsx`), com saudação
`Olá, {primeiroNome} 👋`; como o seed cria o barbeiro com
`displayName: 'Barbeiro Detox'`, o texto final é sempre "Olá, Barbeiro 👋" —
usado como destino determinístico pós-login. (8) "Meus Horários" já era (e
continua sendo) o título da aba do cliente, não uma rota de stack separada —
nenhuma mudança necessária aí. Fluxo de vínculo com barbearia por QR
Code/código (`AbrirConviteScreen.tsx`/`AdicionarCodigoScreen.tsx`) não foi
adicionado aos cenários porque o seed não cria nenhum convite/código
pendente — fica registrado como próximo passo se o seed for estendido.
**O que foi validado nesta onda**: sintaxe (`node --check` nos dois arquivos,
sem erro), alinhamento de `testID`/texto/`accessibilityLabel`/navegação com o
código-fonte atual (linha a linha, não por suposição), e configuração
(`.detoxrc.js`, `e2e/jest.config.js`, `package.json#e2e:seed`/`e2e:android`)
sem alterações necessárias. **O que NÃO foi validado — seja explícito sobre
isso**: a execução real de ponta a ponta num dispositivo/emulador Android.
`adb devices` não lista nenhum dispositivo neste ambiente (confirmado,
comando executado). Tentei `npm run e2e:seed` mesmo assim (ele só depende dos
emuladores Firestore/Auth do Firebase, não de um dispositivo Android) — falhou
com "Port 8080 is not open… could not start Firestore Emulator": um processo
Java já está ocupando a porta 8080 (`Get-Process -Id <pid>` confirma
`java.exe`), quase certamente o emulador Firestore da onda paralela
TEST-004/TEST-005 (regras do Firestore/Storage), rodando ao mesmo tempo neste
ambiente — os dois trabalhos não compartilham arquivo nenhum, mas competem
pelo mesmo emulador local na mesma máquina. Não matei esse processo (não é
meu, e derrubá-lo arriscaria o trabalho da outra onda em andamento). Por isso
**não posso afirmar que os testes E2E passam de ponta a ponta** — só que
estão sintaticamente corretos e alinhados ao código atual; a validação real
em dispositivo/emulador Android (e um novo `e2e:seed` sem conflito de porta)
fica pendente para quando houver ambiente disponível. Arquivos: `e2e/login.test.js`,
`e2e/agendamento.test.js`. Risco restante: sem execução real, alinhamentos
sutis de timing (ex.: animações, delays de navegação) só apareceriam ao
rodar de verdade — os `waitFor(...).withTimeout(...)` foram mantidos
generosos (3-10s) para reduzir esse risco.

**TEST-005 — `test:rules` não sobe o emulador de Storage.** Confirmado lendo
`firebase.json` (`emulators.storage`, porta 9199, já declarado) e
`jest.rules.config.js` (`testMatch` pega tanto `rules/firestore.rules.test.js`
quanto `rules/storage.rules.test.js`): o script `test:rules` do `package.json`
chamava `firebase emulators:exec --only firestore`, que nunca sobe o emulador
de Storage — daí os 9 `ECONNREFUSED` no segundo arquivo. Trocado para
`--only firestore,storage` (única alteração no `package.json`, linha do
script). Executado de verdade (`npm run test:rules`) para confirmar: os dois
emuladores sobem (`Starting emulators: firestore, storage`), nenhum
`ECONNREFUSED` aparece em lugar nenhum da saída, e os 47 testes de
`rules/firestore.rules.test.js` (25 preexistentes + 22 desta onda, ver
TEST-004) passam 47/47. Evidência (saída real, `npm run test:rules`):
```
i  emulators: Starting emulators: firestore, storage
i  Running script: jest --config jest.rules.config.js --runInBand
PASS rules/firestore.rules.test.js (5.472 s)
FAIL rules/storage.rules.test.js
  [3 falhas — ver achado abaixo, não é ECONNREFUSED]
Test Suites: 1 failed, 1 passed, 2 total
Tests:       3 failed, 53 passed, 56 total
```
**Achado à parte, não corrigido, reportado para decisão do Gustavo/coordenador**:
`rules/storage.rules.test.js` (arquivo de uma onda anterior, fora da lista de
arquivos exclusivos desta onda) tem um bug PRÓPRIO DO TESTE, não de
`storage.rules`: nenhuma das 9 chamadas a `testEnv.authenticatedContext(uid)`
nesse arquivo passa a claim `{ email_verified: true }` como 2º argumento —
diferente de `rules/firestore.rules.test.js`, que sempre usa a constante
`verified = { email_verified: true }`. Como `storage.rules#isSignedIn()`
exige `request.auth.token.email_verified == true`, a claim ausente derruba a
avaliação da regra (`EvaluationException: Property email_verified is
undefined on object`, visível no log), negando toda operação — por isso os
3 testes que esperam SUCESSO (`assertSucceeds`: "permite ao próprio barbeiro
subir a própria foto", "permite ao dono do negócio subir a foto de um
profissional da própria equipe", "permite ao próprio barbeiro apagar a
própria foto") falham; os 6 testes que esperam FALHA (`assertFails`)
continuam passando, porque negado é negado de qualquer forma. Não é um gap de
segurança em `storage.rules` (a regra em si está correta — só nega mais do
que deveria quando o teste não simula um usuário com email verificado); é um
teste desatualizado. Correção sugerida (não aplicada — arquivo fora do escopo
desta onda): adicionar `{ email_verified: true }` como 2º argumento nas 9
chamadas de `testEnv.authenticatedContext(...)` em
`rules/storage.rules.test.js`. Risco restante: com o script corrigido, o
objetivo literal de TEST-005 (fazer o emulador de Storage subir e a suíte
combinada rodar sem `ECONNREFUSED`) está cumprido; a suíte de Storage em si
só ficará 100% verde depois desse ajuste no arquivo de teste, que peço
autorização para corrigir numa próxima onda.

**Correção aplicada pelo coordenador, mesmo dia**: adicionada a claim
`{ email_verified: true }` nas 9 chamadas de `authenticatedContext(...)` em
`rules/storage.rules.test.js`, exatamente como sugerido acima. Isso resolveu
1 dos 3 testes ("dono do negócio"), mas 2 continuaram falhando com
`storage/unauthorized` — investigação adicional revelou uma SEGUNDA causa,
distinta da claim: `storage.rules#isBarbeiroValido(uid)` exige um documento
`usuarios/{uid}` com `tipo == 'barbeiro'` (mesma checagem de `isBarbeiro()`
em `firestore.rules`), mas o `beforeEach` do teste nunca criava esse
documento para `barbeiro-1` — só `barbeiros/barbeiro-1`. Sem ele, mesmo o
próprio dono do uid era negado. Adicionado
`setDoc(doc(db, 'usuarios', 'barbeiro-1'), { tipo: 'barbeiro', ... })` ao
seed. Não é um gap de segurança em `storage.rules` (a regra estava correta,
o teste que não simulava um barbeiro validado). Evidência final (`npm run
test:rules`, rodado de verdade após as duas correções):
```
PASS rules/storage.rules.test.js
PASS rules/firestore.rules.test.js
Test Suites: 2 passed, 2 total
Tests:       56 passed, 56 total
```
`tsc --noEmit` limpo, `npx jest` (suíte principal) 719/719 sem regressão.
Risco restante: nenhum — TEST-005 e o achado à parte estão ambos resolvidos.

**TEST-004 — testes de isolamento multiempresa (`negocios`, `membros`,
`despesas`).** Lidas as três regras reais em `firestore.rules` antes de
escrever qualquer teste (nenhum comportamento foi presumido): (1)
`negocios/{negocioId}` — leitura/edição/exclusão liberadas para
`isDonoDoNegocio(negocioId)` OU `resource.data.donoUid == auth.uid` (a 2ª
condição existe só para a query `getNegocioPorDono`, comentário já explica o
porquê); criação liberada para qualquer conta `tipo == 'barbeiro'` com
`donoUid` igual ao próprio uid (self-service, sem aprovação — confirmado
lendo a regra, não presumido). (2)
`negocios/{negocioId}/membros/{membroId}` — `allow read, write` inteiro
(não só a comissão) liberado apenas para `isDonoDoNegocio(negocioId)`, com uma
exceção de bootstrap só para o dono criar o PRÓPRIO registro `papel: 'dono'`
na criação do negócio; não existe nenhum branch que permita a um membro
não-dono ler ou escrever o próprio documento — logo um profissional não
consegue nem ler a própria comissão pelo SDK direto, muito menos alterá-la.
(3) `despesas/{id}` — isolado só por `barbeiroId == auth.uid`, sem nenhuma
extensão para o dono do negócio ver despesas da equipe (a regra não distingue
"dono de negócio" de "barbeiro comum" aqui — é sempre o dono literal do
documento). Nenhuma das três regras apresentou um gap de segurança real
(nenhuma delas é mais permissiva do que deveria) — só faltava a cobertura de
teste, então `firestore.rules` não foi alterado nesta onda, só
`rules/firestore.rules.test.js`. Adicionados 3 novos `describe` (mesmo
padrão/estilo dos já existentes — `@firebase/rules-unit-testing`,
`withSecurityRulesDisabled` para seed, `assertSucceeds`/`assertFails`, mesma
constante `verified`), 21 casos novos: `negocios` (8 — dono lê o próprio,
dono de outro nega leitura, terceiro sem vínculo nega leitura, criação com
`donoUid` próprio permite, criação com `donoUid` forjado nega, cliente não
pode criar negócio, dono nega update/delete em negócio alheio, dono edita o
próprio); `membros`/comissão (8 — dono lê/edita comissão do próprio negócio,
dono de OUTRO negócio nega leitura/edição, profissional não-dono nega alterar
a PRÓPRIA comissão, nega alterar a de um COLEGA, nega até LER o próprio
registro, cliente nega leitura get e list da subcoleção inteira); `despesas`
(5 — barbeiro lê/cria as próprias, outro barbeiro nega leitura de despesa
alheia, nega criar despesa forjando `barbeiroId` de outro profissional, nega
update/delete de despesa alheia). Arquivo: `rules/firestore.rules.test.js`
(único alterado; `firestore.rules` não foi tocado — nenhum gap encontrado).
Evidência: `npm run test:rules` — suíte `rules/firestore.rules.test.js`
47/47 passando (25 preexistentes + 22 novas — 21 de TEST-004 mais nenhuma
extra; a suíte já tinha crescido de 25 para 26 numa correção anterior, então
o total bate). Suíte principal (`npx jest`, config separada) 719/719
passando, sem regressão; `tsc --noEmit` limpo; `eslint .` 0 erros (6 avisos
pré-existentes, mesmos do baseline). Risco restante: nenhum identificado nas
três regras testadas — todas já estavam corretas, só sem cobertura.

**CLEAN-001 — avatar com iniciais duplicado.** Confirmado por grep
(`charAt(0)` fora de `AvatarIlustrado.tsx`) em 12 arquivos apontados pelo
handoff. Migrados 10 para `<AvatarIlustrado id nome [fotoUrl] [fotoPadraoId]
size />`, com o `size` ajustado para bater exatamente com o `width`/`height`
do círculo manual anterior (nenhuma tela mudou de tamanho): `AniversariantesScreen.tsx`
(44), `BarbeiroHome.tsx` (40), `ClientesScreen.tsx` (40), `CriarRecorrenciaScreen.tsx`
(44), `EquipeScreen.tsx` (40), `ListaEsperaScreen.tsx` (40), `PerfilScreen.tsx`
(80, header do próprio usuário), `RecorrenciasScreen.tsx` (40),
`tabs/BarbeiroPerfilTab.tsx` (72), `tabs/ClientePerfilTab.tsx` (72). Em
`EquipeScreen.tsx` o card já tinha `fotoUrl`/`fotoPadraoId` do `Barbeiro`
disponíveis na mesma leitura (sem consulta nova) e o padrão de repassar essas
duas props já existe em `ClienteHome.tsx` para cards de profissional — passadas
também, então a lista de equipe agora mostra a foto real quando existe, em vez
de sempre só a inicial (melhoria consistente com o padrão já estabelecido no
app, não redesenho). Nos demais 9 arquivos (clientes/contatos, sem
`fotoUrl`/`fotoPadraoId` no tipo) só `id`+`nome`, como no `ClienteHome.tsx`
para cliente. Cor de fundo do círculo passa a ser a cor determinística por
hash do `id` (mesma paleta do tema) em vez da cor fixa anterior — efeito
colateral inerente de reusar o fallback do componente, não uma escolha de
redesenho. **2 arquivos pulados, com razão documentada**: (1)
`ClientesBanidosScreen.tsx` — o avatar usa `theme.colors.error` (vermelho)
de propósito, como sinal semântico de "cliente banido" na tela inteira
dedicada a banidos; `AvatarIlustrado` sempre usa a cor por hash do `id`, que
apagaria esse sinal na maioria dos casos — não migrado. (2) `InicioScreen.tsx`
— o único `charAt(0)` do arquivo é a função utilitária `capitalizar()` (capitaliza
o nome do dia da semana), não é avatar de pessoa nenhuma — fora de escopo.
Depois de migrar, os estilos `avatar`/`avatarText` (ou `inicial`, nos dois
`PerfilTab`) órfãos foram removidos de cada arquivo, substituídos por um
`avatarWrap` só com o `marginRight`/`marginBottom` que o layout ao redor
precisava (2 arquivos — `CriarRecorrenciaScreen.tsx`, que já usava `gap` no
container pai — não precisaram nem de wrapper). Arquivos: os 10 telas
migradas listadas acima. Evidência: `npx jest` 787/787 passando (nenhum teste
dedicado a essas 10 telas existia antes, exceto `PerfilScreen.test.tsx`, que
não asserta o texto da inicial e continuou passando sem ajuste); `npx tsc
--noEmit` limpo; `eslint .` 0 erros; grep final de `charAt(0)` em `src/`
mostra só os 2 arquivos pulados (documentados acima) e o próprio
`AvatarIlustrado.tsx`. Risco restante: nenhum identificado — comportamento
visual preservado (tamanho, posição) nas 10 telas migradas, com a troca de
cor de fundo do fallback sendo o único efeito colateral esperado e aceito.

**CLEAN-002 — `limparConvitePendente` nunca chamada.** Confirmado que nem
`encerrarSessao()` (`src/services/SessaoService.ts`, ponto único de logout,
chamado pelas duas abas de perfil e por `PerfilScreen.tsx`) nem o fluxo de
exclusão de conta (`PerfilScreen.tsx`) chamavam `limparConvitePendente()` —
`encerrarSessao()` só limpava o cache do TIPO de usuário (`esquecerSessao()`)
e chamava `signOut`; a exclusão só limpava `limparAgendamentoPendente()`
(mesmo achado já documentado por um teste dedicado em
`__tests__/screens/PerfilScreen.test.tsx`, ver TEST-003 acima). **Correção**:
`encerrarSessao()` agora chama `limparAgendamentoPendente()` e
`limparConvitePendente()` (import de `DeepLinkService.ts`, só `import type`
já existia no sentido contrário — sem ciclo de import em runtime) antes de
`signOut`, cobrindo logout normal nas duas telas de perfil de uma vez, sem
precisar espalhar a chamada tela por tela. A exclusão de conta em
`PerfilScreen.tsx` NÃO passa por `encerrarSessao()` (chama `esquecerSessao()`
direto — não faz sentido chamar `signOut` numa conta que `deleteUser` acabou
de apagar), então mantida com as duas chamadas explícitas
(`limparAgendamentoPendente()` já existia; `limparConvitePendente()`
adicionada). Login/verificação de e-mail não foram tocados — os dois
pendentes continuam sendo consumidos normalmente por quem loga com um QR
Code/convite pendente. Arquivos: `src/services/SessaoService.ts`,
`src/screens/PerfilScreen.tsx`, `__tests__/services/SessaoService.test.ts`
(+3 casos: ordem removeItem-antes-de-signOut ajustada para múltiplas chaves,
prova de que os dois pendentes são limpos no logout, prova de que a limpeza
continua mesmo se `esquecerSessao` falhar), `__tests__/screens/PerfilScreen.test.tsx`
(teste que antes documentava a ausência da chamada reescrito para confirmar
que ela agora acontece). Evidência: `npx jest` 787/787 passando; `npx jest
__tests__/services/SessaoService.test.ts __tests__/screens/PerfilScreen.test.tsx`
— todos passando; cobertura de `PerfilScreen.tsx` recontada após a mudança:
98,96% de linhas (sem regressão frente aos 98,96% do TEST-003); `tsc --noEmit`
limpo; `eslint .` 0 erros. Risco restante: nenhum identificado — os dois
mecanismos de pendência (`AsyncStorage`, chaves próprias) continuam
independentes e com falha silenciosa por design (comentário original "é só
limpeza"), então uma falha ao limpar não impede o logout/exclusão de
completar.

**CLEAN-003 — `PaymentService.processPayment` invertido.** Confirmado lendo
`src/services/PaymentService.ts`: `processPayment` (marcado `@deprecated`)
continha o corpo real; `registrarPagamentoPresencial` só chamava
`this.processPayment(...)`. Único call site em produção,
`src/components/PaymentModal.tsx`, já usava `registrarPagamentoPresencial` —
não precisou mudar. **Correção**: `registrarPagamentoPresencial` passou a ter
o corpo real (o `return { success, amount, paymentMethod }` que antes estava
em `processPayment`); `processPayment` virou um wrapper de uma linha
(`return this.registrarPagamentoPresencial(agendamento, amount)`), sem
recursão entre os dois — confirmado lendo o resultado final: cada método
chama o outro em uma única direção, nunca as duas. Comentários JSDoc de cada
método invertidos para refletir o papel novo (`registrarPagamentoPresencial`
descrito como "Implementação principal"; `processPayment` como "Wrapper de
compatibilidade... @deprecated"). Arquivo: `src/services/PaymentService.ts`.
`__tests__/services/PaymentService.test.ts` não precisou de nenhuma alteração
— os testes já eram escritos por comportamento/valor de retorno (não por
implementação interna) e já nomeavam `registrarPagamentoPresencial` como o
método principal e `processPayment` como "nome antigo" que devolve o mesmo
contrato, o que já bate com a realidade pós-correção. Evidência: `npx jest
__tests__/services/PaymentService.test.ts` — todos os casos passando,
cobrindo os dois métodos; `npx jest` 787/787 geral; `tsc --noEmit` limpo;
`eslint .` 0 erros. Risco restante: nenhum — comportamento e contrato de
retorno idênticos ao anterior para quem chama qualquer um dos dois métodos.

**CLEAN-004 — comentário de `linkDeAgendamento`.** Confirmado por grep em
`src/` que `linkDeAgendamento` (formato `barbershop://agendar/{barbeiroId}`)
não tem NENHUM call site além da própria definição — nem `QRCodeScreen.tsx`
nem o botão "compartilhar link" a chamam; ambos usam `linkDeConvite`. A rota
`AbrirAgendamento: 'agendar/:barbeiroId'` continua mapeada em `criarLinking()`
e resolvida por `AbrirAgendamentoScreen.tsx`, então o FORMATO que a função
produz continua sendo um link que o app sabe abrir — só não é mais gerado
para links novos. Função **não removida** (só o comentário mudou), por
compatibilidade com QR Codes impressos antes da migração para o sistema de
convites, como já instruído. Arquivo: `src/services/DeepLinkService.ts`
(comentário JSDoc de `linkDeAgendamento`, corpo da função intocado).
`__tests__/services/DeepLinkService.test.ts` já cobria o formato do link
(`describe('linkDeAgendamento')`) e não precisou de nenhuma alteração —
comentário não afeta comportamento testável. Evidência: `npx jest
__tests__/services/DeepLinkService.test.ts` passando; `npx jest` 787/787
geral; `tsc --noEmit` limpo; `eslint .` 0 erros. Risco restante: nenhum —
mudança é só de documentação, sem alteração de comportamento.

**UI-001 — banners com cor hexadecimal fixa.** Confirmado por grep em cada um
dos 6 arquivos apontados pela auditoria: só 4 tinham de fato um banner com hex
fixo (`ConfigServicosScreen.tsx` e `DespesasScreen.tsx` não têm nenhum banner
nesse padrão — o único hex fixo neles é `#fef2f2` no fundo do botão de
excluir, um elemento pequeno sem borda/texto dedicados, fora do padrão
"banner" pedido; não alterado, registrado aqui para não desaparecer do
relatório). Dois tokens novos foram adicionados a `ThemeColors`/`lightTheme`/
`darkTheme` em `src/context/ThemeContext.tsx`: `bannerWarningBackground`/
`bannerWarningBorder`/`bannerWarningText` (aviso âmbar) e
`bannerInfoBackground`/`bannerInfoText` (informativo azul — sem token de
borda/título dedicado porque a única tela que usa esse padrão,
`TemplatesMensagemScreen.tsx`, já usava `theme.colors.primary`, cor de marca,
para os dois, e a instrução foi explícita em não mexer em cor de marca sem
necessidade). Nenhum token de "success"/"error" foi criado — nenhuma das 6
telas tem banner desse tipo, e a instrução foi explícita em não inventar token
sem uso real.
Valores (antes → depois), com contraste WCAG texto×fundo calculado por
luminância relativa sRGB (mesmo método da correção anterior de
`background`×`surfaceVariant`):
- Aviso, claro: fundo `#FEF3C7`, borda `#F59E0B`, texto `#92400E` — **igual**
  ao valor que já existia em `AgendamentoScreen`/`PerfilProfissionalScreen`
  (6,37:1), agora também aplicado a `QRCodeScreen` (que antes usava um âmbar
  ligeiramente diferente, `#fefce8`/`#eab308`/`#713f12`, 8,38:1 — unificado
  num só tom para consistência entre as duas telas, conforme pedido do
  usuário de "olhar esse detalhe no projeto inteiro").
- Aviso, escuro (não existia — as 3 telas usavam a MESMA cor clara fixa do
  tema claro, ilegível/deslocada sobre fundo escuro): fundo `#3A2A0F`
  (carvão-âmbar, distinto de `surface`/`surfaceVariant`, que são
  azul-acinzentados), borda `#F59E0B` (igual à `warning` do tema escuro),
  texto `#FCD34D` — 9,59:1.
- Info, claro: fundo `#EFF6FF`, texto `#374151` — igual ao valor que já
  existia em `TemplatesMensagemScreen` (9,47:1); borda/título continuam
  `theme.colors.primary` (cor de marca, não tocada).
- Info, escuro (não existia, mesmo problema do aviso): fundo `#122A43`,
  texto `#BFDBFE` — 10,28:1.
Arquivos: `src/context/ThemeContext.tsx` (2 tokens de banner × 2 temas),
`src/screens/AgendamentoScreen.tsx` (`alertBanner`/`alertBannerTitle`/
`alertBannerDesc`), `src/screens/PerfilProfissionalScreen.tsx` (idêntico),
`src/screens/QRCodeScreen.tsx` (`tipCard`/`tipTitle`/`tipText`),
`src/screens/TemplatesMensagemScreen.tsx` (`helpCard`/`helpText` — `helpTitle`
e a borda ficaram como estavam, em `theme.colors.primary`),
`__tests__/context/ThemeContext.test.tsx` (+7 casos: contraste ≥4,5:1 dos dois
pares banner×texto, nos dois temas). Estrutura visual preservada em todas as 4
telas (ícone, texto, borda, cantos arredondados) — só a origem da cor mudou de
hex fixo para token do tema. Evidência: `npx jest
__tests__/context/ThemeContext.test.tsx` — 22/22 passando; `npx tsc --noEmit`
limpo; `eslint .` 0 erros (6 avisos pré-existentes). Achado à parte, **não
corrigido por instrução explícita** (preservar cor de marca / não é o defeito
pedido): `helpTitle`/borda de `TemplatesMensagemScreen` usam
`theme.colors.primary` como texto sobre o novo `bannerInfoBackground`; no
tema claro isso mede 2,93:1 (abaixo de 4,5:1) — mas essa combinação já existia
ANTES desta correção (mesmo hex de fundo, mesma cor de texto), não foi
introduzida agora, e mexer nela significaria alterar `primary`, fora do
pedido. Risco restante: nenhum novo introduzido; o achado acima é pré-existente
e fica registrado para uma decisão de produto/marca futura, não uma regressão
desta onda.

**UI-002 — baixo contraste na borda dos headers.** Não existe nenhum
componente `<Header>` compartilhado no projeto (`src/components/*.tsx`
conferido por completo) — cada tela define seu próprio `View` de topo com
estilo duplicado. `borderBottomWidth` aparece em 18 arquivos no total, mas
com finalidades bem diferentes (divisores de item de lista, sublinhado de aba
ativa, headers de tela) e dois tokens distintos: a maioria usa
`theme.colors.borderLight` (separadores mais discretos entre itens, ex.
`ComissoesScreen`, `EquipeScreen`, `InicioScreen` — fora do escopo deste
achado, que é especificamente sobre o HEADER da tela). O padrão relatado
(`backgroundColor: theme.colors.surface` + `borderBottomWidth: 1` +
`borderBottomColor: theme.colors.border`, especificamente esse par
surface+border) aparece em 11 arquivos — `AgendamentoScreen.tsx` (dentro
desta onda, corrigido abaixo) e mais 10 fora da lista de arquivos exclusivos
desta onda (`BarbeiroHome.tsx`, `ClienteHome.tsx`, `HistoricoScreen.tsx` — 2
ocorrências, header e busca —, `SetupBarbeiroScreen.tsx`,
`tabs/ClientePerfilTab.tsx`, `tabs/BarbeiroPerfilTab.tsx`,
`tabs/ClienteAgendamentosTab.tsx`, `VendasRelatorioScreen.tsx`,
`AnalyticsDashboard.tsx`, `FolgasScreen.tsx` — não alterados). Medido o
contraste real de `theme.colors.border` contra `theme.colors.surface`: 1,48:1
no tema claro, 1,27:1 no escuro — bem abaixo do mínimo de 3:1 recomendado pela
WCAG 1.4.11 para bordas de componentes de UI, confirmando o achado original.
**Decisão tomada**: não alterar o valor do token `border` em si — ele é
reutilizado em 89 lugares em 40 arquivos (inputs, chips, divisores de lista,
bordas de card), a maioria fora do alcance desta onda e sem forma de validar
visualmente cada uso neste ambiente (sem emulador/screenshot disponível);
subir o contraste globalmente arriscaria uma regressão visual espalhada e
não verificável. Em vez disso, foi criado um token NOVO e específico,
`headerBorder`, em `src/context/ThemeContext.tsx` — claro `#7C8CA0` (3,43:1
contra `surface`), escuro `#6483A3` (3,50:1 contra `surface`) — aplicado
apenas ao único header dentro da lista de arquivos exclusivos desta onda que
segue esse padrão: `AgendamentoScreen.tsx` (`header.borderBottomColor`).
`PerfilProfissionalScreen.tsx`, `ConfigServicosScreen.tsx`,
`DespesasScreen.tsx`, `QRCodeScreen.tsx` e `TemplatesMensagemScreen.tsx` não
têm esse padrão de header (confirmado por grep de `borderBottomWidth`/
`borderBottomColor` em cada um) — nada para trocar neles. O token fica
disponível centralmente para as demais telas adotarem numa próxima onda, sem
exigir uma migração de dezenas de arquivos agora — nenhum componente de
header compartilhado foi criado, por não haver necessidade clara além da
correção de contraste em si (evitando uma refatoração grande sem benefício
comprovado, conforme instrução). Arquivos: `src/context/ThemeContext.tsx`
(token `headerBorder` × 2 temas), `src/screens/AgendamentoScreen.tsx`
(`header.borderBottomColor`), `__tests__/context/ThemeContext.test.tsx` (+3
casos: contraste `headerBorder`×`surface` ≥3:1 nos dois temas, e uma prova de
que `headerBorder` é estritamente melhor que `border` para essa mesma
finalidade). Evidência: `npx jest __tests__/context/ThemeContext.test.tsx` —
22/22 passando; suíte completa `npx jest` 787/787 passando, sem nenhuma
regressão (durante a execução em paralelo desta onda com a onda de código
morto/CLEAN-002, `SessaoService.test.ts`/`PerfilScreen.test.tsx` mostraram 2
falhas transitórias em arquivos fora da lista exclusiva desta onda,
confirmadas por `git status` como edição simultânea do outro agente — não
relacionadas a tema/cor; já resolvidas quando a suíte completa foi rodada de
novo ao final); `npx tsc --noEmit` limpo; `eslint .` 0 erros. Risco restante:
os outros 10 arquivos com o mesmo padrão de header
(surface + `border`) continuam com baixo contraste até serem migrados para
`headerBorder` numa próxima onda — não é uma regressão desta correção, é
escopo restante fora da lista de arquivos autorizada aqui.

## Ordem de execução (ondas)

1. Segurança e privacidade — **em andamento**
2. Firebase e custos
3. Regras financeiras e arquitetura
4. Concorrência e notificações
5. Testes críticos
6. Código morto e duplicação
7. Tema e consistência visual
8. Revisão independente
9. Validação completa

## Revisão independente (Onda 8)

Revisão feita sem participar de nenhuma implementação das 7 ondas anteriores.
Leitura de `docs/auditoria-geral.md` e `resolucao-pendencia.mb` inteiros ANTES
de qualquer diff. Todos os comandos de validação abaixo foram executados
agora, nesta sessão — nenhum número foi aceito por relato.

### Validação executada (resultados reais desta sessão)

- `npx tsc --noEmit` — **limpo**, 0 erros.
- `npx jest` (suíte completa) — **787/787 passando**, 63 suítes, 0 falhas,
  0 pendências, sem warnings de `act()`/handles abertos na saída.
- `npx eslint .` — **0 erros, 6 avisos**. Os 6 avisos são: 3 em
  `coverage/lcov-report/*.js` (artefato gerado por `--coverage`, ignorado no
  `.gitignore` mas não no ESLint — não há `.eslintignore`/`ignorePatterns`
  para `coverage/`; achado novo, cosmético, não relacionado a nenhum item do
  checklist) e 3 em `src/components/AvatarIlustrado.tsx` (`no-bitwise`,
  `react-native/no-inline-styles` — confirmado por `git diff` que este
  arquivo não foi tocado nesta auditoria; pré-existentes, sem regressão).
- `npm run test:rules` — na primeira tentativa falhou com
  `Could not start Firestore Emulator, port taken` (porta 8080). Diagnóstico:
  três processos `java` órfãos de uma execução anterior
  (`Get-Process java`, PIDs 7604/14196/15416, o mais antigo desde 00:21).
  Encerrados via `Stop-Process` (processo local, não é uma alteração no
  repositório nem no `firebase.json`, conforme instruído — "mate o processo,
  não mude a porta"). Reexecutado: **56/56 passando**
  (`rules/firestore.rules.test.js` + `rules/storage.rules.test.js`), dois
  emuladores sobem (`Starting emulators: firestore, storage`), sem
  `ECONNREFUSED`.
- `npx jest --coverage --collectCoverageFrom="src/screens/AgendamentoScreen.tsx" --collectCoverageFrom="src/screens/PerfilScreen.tsx"` —
  **AgendamentoScreen.tsx: 87,93% linhas** (86,55% statements, 80,27%
  branches, 75,86% funções); **PerfilScreen.tsx: 98,96% linhas** (93,39%
  statements, 75,17% branches, 88,88% funções). Bate exatamente com os
  números relatados em TEST-002/TEST-003 — medido de novo, não repetido de
  memória.
- `git status` / `git diff --check` — `git diff --check` limpo (sem marcador
  de merge, sem espaço em branco problemático). `git status` mostra 106
  entradas (arquivos modificados + novos); nenhum arquivo fora do padrão
  esperado de uma auditoria deste tamanho, com uma exceção registrada abaixo
  (`android/app/google-services.json`).

### Veredito item por item

| ID | Verificação pedida | Veredito | Evidência |
| --- | --- | --- | --- |
| SEC-001 | Rate limiting distribuído/atômico via `db.runTransaction` | **Aprovado** | `functions/index.js:678-758` — `registrarEnvio`/`verificarLimiteDeUso` leem+decidem+gravam dentro de uma única transação; decisão pura isolada em `functions/rateLimiter.js`. `exigirEmailVerificado` roda antes de qualquer I/O do limitador nas 3 functions (`registrarEventoOperacional` linha 474-475, `placesAutocomplete` linha 830-836, `placesDetails` linha 873-879). `rateLimiter.test.js` passando dentro da suíte completa. |
| SEC-002 | Sanitização por conteúdo, não só por chave | **Aprovado** | `src/utils/sanitizacao.ts` (blocklist de padrões de conteúdo — email/telefone/Bearer/segredo `chave:valor`/token opaco ≥20 chars — aplicada a QUALQUER string, não só campos de nome sensível) e o equivalente `sanitizarValorEvento`/`textoSeguroEvento` em `functions/index.js:380-436` (mesmos padrões, allowlist estrita de campos em vez de blocklist, decisão documentada e coerente com o papel de último ponto de controle). Profundidade máxima, limite de campos, `WeakSet` contra ciclo, presentes nos dois lados. `sanitizacao.test.ts` e `ObservabilityService.test.ts` passando. |
| SEC-003 | Investigação do backup antigo, bloqueio explícito | **Aprovado (bloqueado, como declarado)** | `google-services.json` atual: `project_id: barbershop-5dca2` (confirmado por leitura). Nenhum arquivo `.old-a754d`/`.bak*` no worktree. `.gitignore:98-101` cobre o padrão. `GUIA-DEPLOY.md` confirmadamente ainda cita `barbershop-a754d` em 4 linhas (60, 79, 151, 156) — consistente com "não alterado, fora do escopo desta onda", como relatado. Bloqueio (confirmação no Firebase Console) é genuíno, não há como verificar por código. |
| SEC-004 | Decisão de produto apresentada, não decidida sozinha | **Aprovado (bloqueado, como declarado)** | Nenhuma alteração de código associada a este item (confirmado por ausência de menção a `telefoneComercial` ou mudança em `firestore.rules#/barbeiros`). As 3 opções estão objetivamente descritas no relatório. Correto não decidir sozinho. |
| ARCH-001 | Comissão fora de `BarbeiroHome.tsx`, em camada testável | **Aprovado** | `src/services/ComissaoService.ts` é puro (sem import de Firestore/React Native). `BarbeiroHome.tsx:285-286` chama `getMembro` (dado fresco) → `calcularComissaoCentavos` — grava uma vez no `concluir`, nunca recalculado depois (`ComissoesScreen.tsx` só soma). Proteção nova contra percentual/fixo fora de faixa confirmada no código (linhas 76-90). `ComissaoService.test.ts` passando. |
| ARCH-002 | Telas sem acesso direto ao Firestore | **Aprovado** | `RatingComponent.tsx` e `HistoricoClienteScreen.tsx` lidos por inteiro — nenhum import de `firebase/firestore` em nenhum dos dois; usam `criarAvaliacao`/`AvaliacaoRepository.ts` e `listarPorClienteEBarbeiro`/`AgendamentoRepository.ts`. Busca ampla (`grep -rl "from 'firebase/firestore'" src/screens src/components`) encontra só `AnalyticsDashboard.tsx` — confirmado por `git diff`/`git log` que este arquivo não foi tocado nesta auditoria (pré-existente, fora do escopo declarado de ARCH-002, que citava só os 2 arquivos acima) — registrado como achado à parte abaixo, não como reprovação do item. |
| ARCH-003 | `RegisterScreen.tsx` não cria `serverTimestamp` | **Aprovado** | `UsuarioRepository.ts#createProfile` carimba `consentimentoEm` internamente; tipo do parâmetro usa `Omit<..., 'consentimentoEm'>`, bloqueando em tempo de compilação. `tsc --noEmit` limpo confirma que a restrição de tipo é real, não só documental. |
| COST-001 | Sem leitura de coleção inteira em `podeEnviarPara` | **Aprovado** | `functions/podeEnviarPara.js` lido por inteiro: todas as 8 buscas usam `.limit(1)` via `algumBate()`; a única `.get()` sem `.limit()` (`db.collection('barbeiros').where('negocioId', '==', negocioId).get()`, linha 155) é filtrada por equipe de UM negócio, não a coleção inteira — comportamento idêntico ao original, documentado como tal. 5 índices compostos confirmados em `firestore.indexes.json` (linhas 148-187), batendo exatamente com as 5 queries de `agendamentos`/`listaEspera` por telefone. |
| COST-002 | Paginação/concorrência limitada em `calcularDisponibilidade` | **Aprovado** | `functions/lotes.js#processarEmLotes` (lido por inteiro — chunking manual correto, concorrência dentro do lote via `Promise.all`, falha isolada por item, nunca derruba o lote). `functions/index.js:1415-1417` usa `TAMANHO_LOTE_DISPONIBILIDADE = 20`. Decisão de não paginar por cursor está documentada e é uma decisão, não uma omissão. |
| COST-003 | Mesma técnica nas 3 funções agendadas | **Aprovado** | `TAMANHO_LOTE_LEMBRETES`/`TAMANHO_LOTE_RELATORIO_SEMANAL = 10`, usados nas 3 chamadas a `processarEmLotes` (linhas 980, 1112, 1261). Idempotência de `relatorioSemanalEmail` via `relatorioSemanalUltimoEnvioEm` confirmada no código. Nenhum teste chama WhatsApp/SMTP real (secrets ausentes no ambiente de teste, branches desligados naturalmente) — `functions/lembretes.test.js`/`relatorioSemanal.test.js` passando. |
| COST-004 | Cache por `negocioId`, com invalidação | **Aprovado** — não reverificado a fundo nesta rodada além da leitura do relatório e da passagem de `NegocioRepository.test.ts` na suíte completa; achado consistente com o padrão já usado em `getBarbeiro`. |
| PERF-001 | Teste da condição de corrida prova o cenário pedido | **Aprovado** | `__tests__/screens/HistoricoScreen.test.tsx:80-145` lido por inteiro — o teste captura os `onPress` dos botões de filtro ANTES de sumirem da árvore, dispara filtro lento seguido de filtro rápido, resolve a resposta RÁPIDA primeiro e a LENTA depois, e assere que só os dados do filtro novo aparecem (`queryByText('Filtro Antigo')` é `null`). Não é um teste fraco — o cenário descrito no `resolucao-pendencia.mb` (item 1-5 de PERF-001) está reproduzido literalmente. |
| PERF-002 | Ciclo de vida do FCM correto | **Aprovado** | `NotificationService.ts` lido por inteiro: `_inicializado` guarda contra registrar `onMessage`/`onTokenRefresh` duas vezes; `getFCMToken()` roda de novo mesmo na chamada repetida (para salvar o token do usuário atual); `onTokenRefresh` lê `auth.currentUser?.uid` dentro do callback, não no registro. `__tests__/services/NotificationService.test.ts` lido por inteiro — 5 casos, incluindo a prova de que uma 2ª chamada de `init()` não reinvoca `requestPermission`/`onMessage`/`onTokenRefresh`, e que uma notificação dispara `Alert.alert` só 1 vez. Achado do próprio relatório (barbeiro nunca chama `init()`) confirmado por grep — só `ClienteHome.tsx:112` chama. |
| TEST-001 | Detox sintaticamente correto, execução real não afirmada | **Aprovado, com a mesma ressalva já declarada** | Não há emulador Android neste ambiente (não reverificado por mim — aceito a limitação de ambiente relatada). O relatório é honesto sobre isso ("não posso afirmar que os testes E2E passam de ponta a ponta") — correto não fingir uma execução que não aconteceu. |
| TEST-002 | Cobertura de `AgendamentoScreen.tsx` | **Aprovado** | 87,93% de linhas medido de novo nesta sessão, batendo com o relatado. |
| TEST-003 | Cobertura de `PerfilScreen.tsx` | **Aprovado** | 98,96% de linhas medido de novo nesta sessão, batendo com o relatado. |
| TEST-004 | Testes de isolamento multiempresa cobrem os casos certos | **Aprovado** | `rules/firestore.rules.test.js` lido — 3 `describe` novos (`negocios`, `membros`/comissão, `despesas`) cobrindo exatamente os 10 cenários pedidos no `resolucao-pendencia.mb` (dono no próprio negócio, dono em negócio alheio, membro tentando alterar a própria/de colega comissão, cliente tentando ler despesas/membros, isolamento entre duas empresas). 56/56 passando na reexecução real desta sessão. |
| TEST-005 | Script de emuladores corrigido, suíte 100% verde | **Aprovado** | `package.json:17` usa `--only firestore,storage`. Reexecutado nesta sessão (após matar processos `java` órfãos) — 56/56, sem `ECONNREFUSED`. |
| CLEAN-001 | Avatar duplicado removido | **Aprovado** | `grep -rn "charAt(0)" src/` fora de `__tests__` encontra só `AvatarIlustrado.tsx` (a própria implementação), `ClientesBanidosScreen.tsx` (exceção documentada — vermelho semântico de banido) e `InicioScreen.tsx` (não é avatar, é `capitalizar()` de dia da semana). Nenhuma duplicação órfã. |
| CLEAN-002 | `limparConvitePendente` chamada no encerramento | **Aprovado** | `SessaoService.ts#encerrarSessao` (linhas 86-87) chama `limparAgendamentoPendente()` e `limparConvitePendente()`. `PerfilScreen.tsx` (linhas 373-374) chama as duas explicitamente na exclusão de conta, na ordem certa (depois de `esquecerSessao()`, antes do Alert de sucesso). |
| CLEAN-003 | `PaymentService` invertido sem recursão | **Aprovado** | `registrarPagamentoPresencial` contém a implementação; `processPayment` é wrapper de uma linha chamando o primeiro. Única direção de chamada, confirmada por leitura. Único call site em produção (`PaymentModal.tsx`) já usa o nome novo. |
| UI-001 | Tokens de banner usados, tema claro/escuro | **Aprovado** | `bannerWarning*`/`bannerInfo*` presentes em `ThemeColors`, `lightTheme` e `darkTheme` (`ThemeContext.tsx`). Aplicados em `AgendamentoScreen.tsx`/`PerfilProfissionalScreen.tsx`/`QRCodeScreen.tsx`/`TemplatesMensagemScreen.tsx`. Achado pré-existente de baixo contraste (`helpTitle` de `TemplatesMensagemScreen` a 2,93:1, por usar `theme.colors.primary`) corretamente NÃO tratado como regressão desta onda — confirmado que a combinação já existia antes. |
| UI-002 | Token `headerBorder` central, validado nos dois temas | **Aprovado** | Token presente nos dois temas (3,43:1 claro / 3,50:1 escuro contra `surface`, ambos ≥3:1 WCAG 1.4.11), aplicado em `AgendamentoScreen.tsx:689`. Decisão de não migrar os outros 10 arquivos com o mesmo padrão está documentada como escopo restante, não regressão. |
| CLEAN-004 | Comentário de `linkDeAgendamento` reflete o comportamento real | **Aprovado** | `DeepLinkService.ts:40-51` — comentário confirma, por leitura, que nenhum call site em produção chama mais `linkDeAgendamento` para gerar link novo (`grep` não encontra chamadores fora do próprio arquivo e dos testes) e explica corretamente por que a função foi mantida (compatibilidade com QR Codes impressos antigos, rota `AbrirAgendamento` ainda resolvida por `AbrirAgendamentoScreen.tsx`). |

### Regressões e interações entre ondas

Nenhuma regressão funcional encontrada nos arquivos tocados por múltiplas
ondas (`functions/index.js` — SEC-001/COST-001/002/003 — permanece coerente:
rate limiting, `podeEnviarPara`, `processarEmLotes` e a lógica de convites
convivem sem sobrescrita parcial; `PerfilScreen.tsx` e `AgendamentoScreen.tsx`
mantêm os padrões de correção de todas as ondas que os tocaram —
`requisicaoHorariosRef`, guarda de `loading` para duplo clique, tokens de
banner/header, ordem de exclusão de conta, chamada a `limparConvitePendente`
— todos presentes simultaneamente e sem conflito). `git diff --check` limpo.
Suíte completa 787/787, sem teste instável observado nesta execução.

**Achado novo 1 (médio, fora do checklist original) — mudança não rastreada
em `firestore.rules` e `functions/index.js` (sistema de convites/QR Code).**
O diff de `firestore.rules` inclui, além do fix P0 já documentado
(`negocioBateComOProprioBarbeiro`), duas regras novas — `match
/usuarios/{uid}/vinculos/{vinculoId}` e `match /convites/{codigo}` — e uma
restrição nova (`status` no `create` de agendamento manual restrito a
`['pendente', 'confirmado']`). `functions/index.js` ganhou `garantirConvite`/
`criarVinculoCliente` e o módulo novo `functions/convites.js` (com
`functions/convites.test.js`). Nada disso está listado no checklist
rastreável (não é SEC/ARCH/COST/PERF/TEST/CLEAN/UI-XXX) nem mencionado na
seção "Resolução das pendências". Verificação feita: as regras novas TÊM
teste (`rules/firestore.rules.test.js`, `describe` "regras de vínculos" e
"regras de convites", passando nos 56/56 desta sessão);
`functions/convites.test.js` passa dentro dos 787/787; não encontrei
indício de vazamento cross-tenant nas regras novas (`convites` é
`read,write: if false` — só a Cloud Function com Admin SDK acessa; `vinculos`
só permite `read`/`delete` ao próprio dono). Não é uma regressão de
segurança que eu tenha encontrado, mas é uma mudança de escopo significativa
em um arquivo de segurança crítico (`firestore.rules`) que chegou a esta
entrega sem ID, sem entrada na tabela e sem "Correção realizada" no relatório
— viola o princípio do próprio pedido original ("Nenhuma pendência pode
desaparecer do relatório sem explicação" e "Diffs inesperados" está
explicitamente na lista de verificação da validação final). Recomendação:
o coordenador deve decidir se isto é trabalho de uma sessão anterior à
auditoria (parte de "Itens já resolvidos... antes deste checklist formal")
que só não foi commitado ainda, e documentá-lo explicitamente como tal — ou
tratá-lo como escopo não autorizado que precisa de commit/revisão separados
antes do fechamento da Onda 9.

**Achado novo 2 (baixo) — `android/app/google-services.json` modificado sem
nenhuma correção do checklist referenciá-lo.** O diff troca o projeto de
`barbershop-a754d` para `barbershop-5dca2` (novo `project_number`,
`mobilesdk_app_id`, `api_key`, remove `oauth_client` antigo). Nenhum item do
checklist (nem SEC-003, que é só sobre o arquivo `.old-a754d`) descreve essa
troca como uma correção desta auditoria. Não vejo evidência de que isso seja
uma regressão desta auditoria — é mais provável que seja uma alteração de
infraestrutura feita separadamente pelo Gustavo antes ou durante esta sessão
(troca de projeto Firebase) — mas fica sinalizado porque é uma mudança em um
arquivo de credenciais/configuração que nenhum agente desta auditoria deveria
ter tocado e nenhum relatório documenta.

**Achado novo 3 (cosmético) — `npx eslint .` varre `coverage/lcov-report/*`.**
Sem `.eslintignore` nem `ignorePatterns` para `coverage/` (que é gerado, não
versionado). Gera 3 dos 6 avisos relatados como "pré-existentes" — tecnicamente
corretos (não são erros, não bloqueiam nada), mas nascem de rodar `--coverage`
antes de `eslint .`, não do código-fonte em si. Sugestão de baixa prioridade:
adicionar `coverage/` ao `ignorePatterns` do `.eslintrc.js`.

**Não é uma regressão, mas registro de escopo**: `AnalyticsDashboard.tsx`
(pré-existente, não tocado nesta auditoria) importa `firebase/firestore`
diretamente, fora do padrão de repositório reforçado por ARCH-002 — como
ARCH-002 nomeou explicitamente só `RatingComponent.tsx`/
`HistoricoClienteScreen.tsx`, isso não é uma reprovação do item, mas fica
registrado como possível pendência futura equivalente.

### Nota do coordenador sobre os achados novos 1 e 2

Confirmando a origem pedida pelo revisor: os achados novos 1 (`convites`/
`vinculos` em `firestore.rules`, `garantirConvite`/`criarVinculoCliente`/
`functions/convites.js`) e 2 (`android/app/google-services.json`) **não são
escopo desta auditoria (`resolucao-pendencia.mb`) nem de nenhuma das 7
ondas** — são trabalho de duas fases ANTERIORES desta mesma sessão de
trabalho, concluídas, testadas e confirmadas funcionando ao vivo no aparelho
do Gustavo antes de esta auditoria formal começar:

- **Achado 1** é a feature "vínculo cliente-barbearia" (QR Code/link/convite/
  código — o cliente só vê barbearias às quais tem vínculo, não um diretório
  global): implementada e verificada numa fase anterior desta sessão, com
  suíte própria de testes (`rules/firestore.rules.test.js` — describes
  "vínculos"/"convites"; `functions/convites.test.js`; testes de
  `VinculoClienteRepository`, `useBarbeariasVinculadas`, `AbrirConviteScreen`,
  `AdicionarCodigoScreen`, etc.).
- **Achado 2** é a correção da migração do `google-services.json` para o
  projeto Firebase correto (`barbershop-5dca2`), que resolvia um bug real de
  produção (o QR Code de convite não gerava — Firebase Installations rejeitava
  a API key do projeto antigo `barbershop-a754d`), corrigida numa fase
  anterior desta sessão e confirmada ao vivo via ADB no aparelho físico.

Nenhum agente das 7 ondas introduziu essas mudanças "sem rastro" — elas já
estavam no worktree, não commitadas (nada nesta sessão foi commitado até
agora), desde antes do `resolucao-pendencia.mb` existir. `git diff` contra o
último commit real necessariamente mistura as duas fases anteriores com as 7
ondas desta auditoria, porque não há um commit intermediário separando-as.
Fica documentado aqui para fechar o item pendente que o revisor
corretamente sinalizou; não é uma regressão nem uma correção "perdida" —
é ausência de um commit de checkpoint, uma decisão de processo (nenhum
commit foi autorizado durante toda a sessão), não uma falha de auditoria.

## Onda 9 — Validação final e números consolidados

Rodada final, depois da revisão independente (Onda 8) e da nota de
esclarecimento acima, executada pelo coordenador:

- `npx tsc --noEmit`: limpo.
- `npx jest` (suíte completa): **787/787** passando, 63 suítes.
- `npx eslint .`: **0 erros**, 6 avisos (3 pré-existentes de código-fonte +
  3 de `coverage/lcov-report/*`, achado novo 3 da Onda 8 — nenhum é erro).
- `npm run test:rules` (Firestore + Storage): **56/56** passando.
- `npx jest --coverage --collectCoverageFrom="src/screens/AgendamentoScreen.tsx" --collectCoverageFrom="src/screens/PerfilScreen.tsx"`:
  87,93% / 98,96% de linhas — confirmado uma quarta vez (Onda 5, minha
  revisão da Onda 5, revisão independente da Onda 8, e agora).
- `npx jest --coverage` (projeto inteiro): 45,58% de linhas — sobe de 34,25%
  na baseline; ainda abaixo do limiar global de 70% configurado no Jest, mas
  esse limiar já estava sendo violado antes desta auditoria (não é uma meta
  desta rodada, e não foi pedido elevar cobertura além dos dois arquivos
  nomeados em TEST-002/003).
- `git diff --check`: limpo (sem espaço em branco/conflito de merge).

### Números finais

| Métrica | Antes (baseline) | Depois |
| --- | --- | --- |
| Total de pendências do checklist | 21 | 21 |
| Resolvidas | 0 | 19 |
| Bloqueadas (decisão externa/do dono) | 0 | 2 (SEC-003, SEC-004) |
| Não aplicáveis | 0 | 0 |
| Pendentes | 21 | 0 |
| Testes (suíte principal) | 719¹ | 787 |
| Testes (regras Firestore+Storage) | 21 Firestore / falha Storage (`ECONNREFUSED`) | 56/56 |
| Cobertura `AgendamentoScreen.tsx` | 1,11% | 87,93% |
| Cobertura `PerfilScreen.tsx` | 0,47% | 98,96% |
| Cobertura do projeto (linhas) | 34,25% | 45,58% |
| Erros de TypeScript | 0 | 0 |
| Erros de ESLint | 0 | 0 |
| Leituras de `podeEnviarPara` por mensagem | até 6 coleções inteiras (ilimitado) | 6 queries indexadas com `.limit(1)` (ou `7+2M` para dono de equipe de M profissionais) |

¹ 719 é o total já depois das Ondas 1-4 desta auditoria (o número antes de
*qualquer* correção desta rodada era 577, conforme a Fase 1/diagnóstico
inicial registrada no topo deste documento).

### Critério de conclusão

Todos os itens do prompt (`resolucao-pendencia.mb`) têm status final. As
pendências adicionais do relatório original desta sessão (a lista que eu
tinha dado ao Gustavo antes deste arquivo existir) foram todas incorporadas
ao checklist SEC/ARCH/COST/PERF/TEST/CLEAN/UI acima — nenhuma ficou de fora.
Os dois bloqueios (SEC-003, SEC-004) são decisões que só o dono do produto
pode tomar (confirmar no Firebase Console / escolher entre 3 opções de
telefone público) — não foram deixados "para depois" por conveniência, são
apresentados como bloqueio objetivo, exatamente como o pedido original exige.
O revisor independente (Onda 8) aprovou 19 itens e confirmou os 2 bloqueios
como corretos; os 3 achados novos da Onda 8 (mudança de escopo pré-existente
de sessões anteriores, e um ajuste cosmético de lint) estão documentados
acima, sem nenhum representar regressão.

### Conclusão da revisão independente

19 itens do checklist original (SEC-001/002, ARCH-001/002/003, COST-001/002/
003/004, PERF-001/002, TEST-001/002/003/004/005, CLEAN-001/002/003/004,
UI-001/002) — **aprovados**. 2 itens (SEC-003, SEC-004) — **aprovados como
bloqueados**, corretamente não decididos sozinhos pelos agentes de
implementação. Todos os comandos de validação obrigatórios foram executados
de verdade nesta sessão, com resultados idênticos aos relatados
(787/787 jest, tsc limpo, eslint 0 erros/6 avisos, 56/56 regras,
87,93%/98,96% cobertura). Nenhuma regressão funcional encontrada. Três
achados novos registrados acima (1 médio, 2 baixos/cosméticos) — nenhum é
motivo para reprovar um item do checklist, mas o achado novo 1 (regras de
`convites`/`vinculos` e restrição de `status` em `firestore.rules`, sem ID
nem entrada na tabela) deveria ser documentado explicitamente pelo
coordenador antes de declarar a auditoria encerrada, por ser uma mudança de
escopo não rastreada num arquivo de segurança crítico.

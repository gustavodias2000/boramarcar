# Relatórios, estado técnico e prioridades

Atualizado em 01/08/2026 a partir da configuração e do código presentes no worktree. Este é o índice operacional: ele separa configuração versionada de ações externas ainda não confirmadas.

## Documentos vigentes

| Documento | Uso |
| --- | --- |
| `README.md` | entrada rápida e links operacionais |
| `docs/GUIA_DESENVOLVIMENTO.md` | instalação, emuladores, execução e release local |
| `docs/TESTING_GUIDE.md` | testes unitários, regras e Detox |
| `functions/README.md` | operação das Cloud Functions e inventário de secrets |
| este arquivo | estado técnico, pendências e documentos históricos |

## Documentos históricos

`AUDITORIA.md`, `RELATORIO_ANALISE.md`, `RELATORIO_MELHORIAS_IMPLEMENTADAS.md`, `GUIA-DEPLOY.md`, `INSTRUCOES_BUILD_LOCAL.md`, `ASSINATURA_RELEASE.md` e `docs/PAYMENT_INTEGRATION.md` não são procedimentos atuais. Eles foram preservados por contexto e podem conter instruções ou descrições superadas.

## Estado atual das prioridades

### Alta

- **Ambiente isolado:** `firebase.json` declara emuladores de Auth, Firestore e Functions; `firebaseConfig.ts` conecta builds `__DEV__` a eles. `npm run e2e:seed` limpa e recria fixtures somente nos emuladores locais e `npm run e2e:android` executa Detox com esse ambiente isolado.
- **Observabilidade:** há código para eventos sanitizados e alerta operacional por e-mail. Isso só fica ativo após configuração autorizada de secrets, deploy e teste ponta a ponta; esta documentação não afirma que tais ações ocorreram.
- **Documentação:** os guias vigentes estão consolidados; os relatórios antigos estão identificados como históricos.

### Média

- Clientes foi desacoplada em `useClientes`, com CRUD/importação testados e sem botões aninhados. Agendamento, Perfil e ConfigAgenda continuam extensas e devem seguir o mesmo padrão em mudanças futuras.
- Acessibilidade é parcial; estabelecer padrão para botões, campos, ícones, modais, abas e estados.
- O pagamento é presencial. Não há gateway, PIX online, sinal, webhook ou reembolso; qualquer integração depende de decisão de produto.
- `npm run lint` está sem avisos e erros, sem desabilitações amplas.

### Baixa / processo

- O Gradle bloqueia tarefas release sem `android/keystore.properties`; configurar a chave e os segredos do CI é uma operação externa.
- `.gitattributes` foi adicionado; validar clone limpo antes de considerar resolvido o ruído CRLF/LF.
- Organizar/mover artefatos históricos somente com autorização explícita.

## Itens anteriormente críticos, hoje presentes no código

O repositório contém regras do Firestore, reserva por transação, serviço de exclusão de conta e texto de pagamento presencial. Eles exigem testes de integração, mas não devem ser registrados como falhas abertas sem nova reprodução.

<!-- Conteúdo anterior preservado como histórico de revisão; não é procedimento operacional.

# Índice anterior de relatórios e estado técnico

Atualizado em 01/08/2026 a partir do codigo e da configuracao versionada.

## Para que serve cada documento

| Documento | Finalidade | Situacao |
| --- | --- | --- |
| `README.md` | entrada do projeto e execucao | exige revisao; ainda e o modelo padrao do React Native |
| `docs/GUIA_DESENVOLVIMENTO.md` | procedimento atual de desenvolvimento, teste e release | vigente |
| `docs/RELATORIOS.md` | fonte unica para inventario, achados e prioridades | vigente |
| `docs/TESTING_GUIDE.md` | estrategia e comandos de teste | revisar junto da configuracao de emuladores |
| `docs/PAYMENT_INTEGRATION.md` | escopo real de pagamentos | ainda descreve uma proposta Stripe, nao o codigo entregue |
| `functions/README.md` | deploy e secrets do backend de WhatsApp | vigente, sem alertas operacionais |
| `INSTRUCOES_BUILD_LOCAL.md` | instrucao detalhada de build | legado; consulte o guia de desenvolvimento |
| `GUIA-DEPLOY.md` | checklist de deploy Firebase | legado; consulte o guia de desenvolvimento |
| `ASSINATURA_RELEASE.md` | assinatura Android | legado e contraditorio; nao publicar sem chave real |
| `AUDITORIA.md` | auditoria de 20/07/2026 | historico; muitos itens foram resolvidos depois |
| `RELATORIO_ANALISE.md` e `RELATORIO_MELHORIAS_IMPLEMENTADAS.md` | relatorios da versao JS inicial | historicos; nao usar como estado atual |

## Estrutura e telas principais

O app tem `App.tsx` como entrada, um stack raiz e duas navegacoes por abas:

- Cliente: vitrine de barbeiros, meus agendamentos e perfil; tambem abre fluxo de agendamento por QR Code/deep link.
- Barbeiro: inicio, agenda, relatorios, configuracao e perfil. As telas de apoio incluem clientes, agenda/folgas/bloqueios, servicos, equipe, comissoes, despesas, recorrencias, lista de espera, promocoes, WhatsApp, QR Code e suporte.

A camada de dados esta em `src/data/repositories`; regras reutilizaveis ficam em `src/services` e `src/utils`; Cloud Functions em `functions/index.js` executam lembretes, WhatsApp, Places e relatorio semanal por email.

## Como executar

Prerequisitos: Node 18+, JDK 17, Android Studio/SDK; para iOS, macOS com Xcode e CocoaPods.

```powershell
npm ci
npm start
# em outro terminal, com emulador Android aberto ou celular conectado
npm run android
```

Para iOS: `bundle install`, `bundle exec pod install --project-directory=ios` e `npm run ios`.

Validacao local: `npx tsc --noEmit`, `npm run lint` e `npm test -- --ci`. O Detox esta configurado em `.detoxrc.js`, mas seus E2E ainda dependem de usuarios/dados Firebase reais.

## Achados atuais

### Prioridade alta

1. **Ambientes isolados.** Emulator Suite para Auth, Firestore e Functions foi declarada; builds debug conectam aos emuladores. Ainda falta instalar/executar o Firebase CLI e criar seed/reset deterministico para Detox.
2. **Observabilidade.** Foi criada telemetria sanitizada no app e uma Function para persistir eventos/agregar alertas por e-mail. Ainda e necessario configurar os secrets `EMAIL_USER`, `EMAIL_PASS` e `ALERT_EMAIL`, publicar Functions e migrar gradualmente os `console.*` restantes.
3. **Documentacao antiga ainda dispersa.** `AUDITORIA.md`, `GUIA-DEPLOY.md`, `INSTRUCOES_BUILD_LOCAL.md`, `ASSINATURA_RELEASE.md` e os dois relatorios JS precisam de revisao editorial antes de serem tratados como procedimentos operacionais.

### Prioridade media

4. **Telas extensas e acopladas.** `AgendamentoScreen.tsx` (887 linhas), `PerfilScreen.tsx` (813), `ConfigAgendaScreen.tsx` (682) e `ClientesScreen.tsx` (655) misturam interface, consultas e regras. Extrair hooks e componentes por caso de uso, seguindo `useUserProfile` e `useSessaoRestaurada`.
5. **Acessibilidade parcial.** Existem cerca de 200 ocorrencias de `accessibilityLabel`/`accessibilityRole`, uma melhora relevante sobre a auditoria antiga, mas sem padrao ou cobertura de todos os controles. Criar checklist/testes para botoes, campos, modais, icones e estados de carregamento.
6. **Pagamento online e sinal inexistentes.** E uma lacuna de produto, nao um defeito: o pagamento e presencial e nao ha mecanismo para reduzir no-show via deposito.
7. **Qualidade de lint.** `npm run lint` termina sem erros, mas com 31 avisos: estilos inline, componentes de icone criados durante render e uma regra desabilitada sem efeito.

### Prioridade baixa / processo

8. **Assinatura de release.** Tarefas Android de release agora falham sem `android/keystore.properties`; o CI ainda precisa receber as credenciais por cofre de secrets antes de executar uma publicação.
9. **Higiene do repositorio.** Foi adicionado `.gitattributes` para normalizar fins de linha. Antes de commitar a normalizacao, revisar separadamente o diff mecanico criado por `git add --renormalize .`.

## Itens verificados como corrigidos desde a auditoria anterior

- Regras do Firestore existem e restringem acesso aos dados;
- a reserva de horarios usa transacao Firestore em `OcupacaoService`;
- exclusao de conta tem servico dedicado para os dados do usuario;
- a interface de pagamento informa corretamente que a cobranca e presencial.

Esses itens ainda merecem testes de integracao com regras/emuladores, mas nao devem permanecer listados como falhas abertas sem essa ressalva.
-->

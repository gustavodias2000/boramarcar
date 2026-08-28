# Pesquisa competitiva: InBarber, Corthy, Masters e Barbershop

**Data da pesquisa:** 18 de agosto de 2026  
**Escopo:** produto, mercado, funcionalidades, experiência, gestão, privacidade e comparação com o estado atual do Barbershop.

## 1. Como esta análise foi feita

Foram consultadas somente fontes primárias: Google Play, App Store, sites oficiais, páginas de preços, termos, políticas de privacidade e centrais de ajuda. As funcionalidades dos concorrentes são declarações dos próprios fornecedores; sem acesso ao código-fonte ou a contas completas, não é possível garantir qualidade, estabilidade ou disponibilidade em todos os planos.

O Barbershop foi avaliado pelo código local após atualização dos dados do GitHub. O branch local `auditoria` está um commit à frente de `origin/auditoria` e contém alterações locais ainda não publicadas, portanto não foi executado `pull` nem qualquer operação que pudesse sobrescrevê-las.

Validação executada no Barbershop:

- TypeScript sem erros.
- ESLint sem erros e com 9 avisos de baixa gravidade.
- 91 suítes e 1.366 testes unitários passando.
- Cobertura geral: 64,09% das linhas, 63,35% das declarações, 53,97% dos branches e 55,47% das funções.
- Repositórios com 96,86% das linhas cobertas, serviços com 93,54% e utilitários com 96,51%.
- Telas com 46,49% das linhas cobertas e vários arquivos ainda entre 500 e 854 linhas.
- Os testes das regras Firebase não terminaram nesta rodada porque a porta local 8080 estava ocupada; isso não foi uma falha confirmada das regras.

## 2. Resumo executivo

| Produto | Nota de produto | Melhor característica | Principal limitação |
|---|---:|---|---|
| **Masters** | **8,6** | Profundidade de agenda, CRM e ecossistema profissional/salão/cliente | Adequação ao Brasil, LGPD e transparência de dados |
| **Corthy** | **8,6** | Gestão ampla e arquitetura comercial para várias categorias | Segurança/documentação pouco transparentes e possível excesso de complexidade |
| **InBarber** | **7,9** | Foco direto na barbearia brasileira e operação simples | CRM e gestão menos profundos que Corthy/Masters; privacidade contraditória |
| **Barbershop atual** | **7,6** | Agenda confiável, experiência nativa do cliente e engenharia auditável | Falta web, estoque/POS, pacotes, pré-pagamento e maturidade de mercado |

As notas representam maturidade de produto, não somente qualidade de código. O Barbershop recebe **8,8/10 em engenharia e segurança verificável**, mas perde pontos por ainda não ter distribuição e operação comercial comparáveis às soluções maduras. Já os concorrentes possuem validação de mercado, porém o código deles não é público e suas declarações de segurança não puderam ser auditadas.

### Conclusão principal

- **InBarber é o concorrente direto** a ser superado no nicho de barbearias brasileiras.
- **Masters é a melhor referência de profundidade** para agenda, CRM, página pública e pré-pagamento.
- **Corthy é a melhor referência estratégica para o futuro SuaAgenda**, porque atende beleza, estética, tatuagem, terapias, pet, lava-rápido e outros prestadores.
- O Barbershop não precisa copiar os três. Deve combinar a simplicidade do InBarber, a profundidade de agenda do Masters e o modelo multissetorial do Corthy, mantendo sua vantagem técnica e uma experiência de cliente mais clara.

## 3. Critério das notas

| Dimensão | Peso |
|---|---:|
| Agenda e agendamento | 20% |
| Aquisição e experiência do cliente | 15% |
| CRM e retenção | 10% |
| Equipe e operação | 15% |
| Financeiro e comercial | 15% |
| Plataformas e integrações | 10% |
| Segurança, privacidade e evidências | 10% |
| Maturidade de mercado e suporte | 5% |

| Produto | Agenda | Cliente | CRM | Operação | Financeiro | Plataformas | Segurança | Mercado | Final |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Masters | 9,3 | 9,1 | 9,2 | 8,9 | 8,6 | 8,4 | 5,7 | 9,2 | **8,6** |
| Corthy | 8,7 | 8,5 | 9,0 | 9,2 | 9,2 | 9,0 | 6,0 | 8,3 | **8,6** |
| InBarber | 8,5 | 8,4 | 7,0 | 8,2 | 7,8 | 8,0 | 6,0 | 8,2 | **7,9** |
| Barbershop | 9,0 | 8,3 | 7,5 | 7,8 | 6,5 | 5,8 | 8,8 | 4,8 | **7,6** |

## 4. InBarber

### O que foi confirmado

O InBarber é da YAH SIST LTDA e é direcionado a barbeiros e barbearias. Está no Android, iPhone e declara acesso pelo computador. No Android, possui **100 mil+ downloads** e foi atualizado em **30/07/2026**. Na App Store brasileira, aparecia com **4,8/5 em 544 avaliações**, versão 2.18.7 de 26/06/2026. [Google Play](https://play.google.com/store/apps/details?id=com.inbarberapp.schedule.twa&hl=pt_BR&gl=BR) e [App Store](https://apps.apple.com/br/app/inbarber-agenda-p-barbearias/id1544861726).

O plano anunciado custa **R$ 32,90 por profissional/mês** e oferece **45 dias gratuitos**. A App Store lista valores progressivos até cinco profissionais. [Site oficial](https://www.inbarberapp.com/pt/).

Funcionalidades anunciadas:

- agendamento online 24 horas e link personalizado;
- integração do link com WhatsApp e redes sociais;
- lembretes, confirmações e reagendamentos;
- agenda e histórico por profissional;
- equipe e permissões;
- estoque, movimentações e alerta de nível baixo;
- recebimentos, transações e relatórios;
- backup em nuvem e suporte por chat/WhatsApp.

### Pontos fortes

- Proposta simples e específica para barbearias brasileiras.
- Preço fácil de entender e teste gratuito muito mais longo que os rivais pesquisados.
- Presença Android, iPhone e acesso declarado por computador.
- Estoque e gestão financeira já fazem parte da proposta central.
- Adoção relevante para um produto vertical: 100 mil+ downloads no Android.

### Pontos fracos e riscos

- A página oficial mostra “64 mil+ downloads”, abaixo dos 100 mil+ da Play Store, sinal de conteúdo comercial desatualizado.
- A Play Store declara coleta de informações pessoais e mensagens; a App Store declara “dados não coletados”. As duas declarações são difíceis de conciliar.
- Não foram localizadas evidências públicas de criptografia em repouso, MFA, certificações, testes de invasão, SLA, API ou webhooks.
- Não foram confirmados pré-pagamento, pacotes, lista de espera, recorrência, galeria, anamnese, sincronização bidirecional com calendários ou múltiplas unidades.
- Existe suporte, mas não foi localizada uma central pública aprofundada como a do Masters.

### O que aproveitar no Barbershop

- Precificação clara por profissional.
- Teste gratuito generoso para reduzir barreira de entrada.
- Estoque e vendas de produtos como extensão natural da gestão da barbearia.
- Link de agendamento que funciona fora do aplicativo e pode ser divulgado imediatamente.

## 5. Corthy

### O que foi confirmado

O Corthy é desenvolvido pela Inovhy e possui Android, iPhone/iPad e versão web. A Play Store registra **100 mil+ downloads** e atualização em **04/07/2026**. A App Store brasileira mostrava **4,9/5 em 50 avaliações** e assinatura mensal de **R$ 29,90**. O teste gratuito anunciado é de sete dias. [Google Play](https://play.google.com/store/apps/details?id=com.corthy.management), [App Store](https://apps.apple.com/br/app/corthy-agenda-sal%C3%A3o-e-gest%C3%A3o/id6754831095), [termos](https://corthy.com/terms/).

Funcionalidades anunciadas nas lojas e no [site oficial](https://corthy.com/):

- agenda por profissional e link de agendamento 24 horas;
- cadastro, histórico e fotos de clientes;
- fichas de anamnese e galeria de procedimentos;
- vendas, despesas, fluxo de caixa e relatórios;
- comissões de serviços e produtos;
- pacotes, estoque, fornecedores e catálogo de produtos;
- marketing, aniversariantes, devedores e clientes ausentes;
- agenda compartilhada e acesso individual para equipe;
- backup em nuvem.

O Corthy declara atender salões, barbearias, estética, manicures, podologia, trancistas, tatuagem, terapias, costura, banho e tosa, lava-rápido e estética automotiva. Essa abrangência o torna a referência mais próxima da visão futura do SuaAgenda.

### Pontos fortes

- É o produto mais completo para gestão administrativa entre os brasileiros pesquisados.
- Já trabalha com vários segmentos usando uma base comum de agenda, clientes, profissionais, serviços e financeiro.
- Combina CRM, fotos, anamnese, pacotes, estoque, fornecedores e catálogo.
- Oferece app e web, importante para gestores que trabalham no computador.
- Tem preço inicial competitivo e presença relevante no Android.

### Pontos fracos e riscos

- A amplitude pode gerar interface mais complexa e funções rasas em alguns segmentos.
- Não ficou claro se os lembretes são realmente automáticos ou mensagens pré-preenchidas para envio manual.
- O Google Play declara possível compartilhamento de dados, enquanto a política usa linguagem mais restritiva e também cita analytics/publicidade.
- A [política de privacidade](https://corthy.com/privacy/) não deixa claros retenção, localização de dados, DPO, criptografia em repouso, testes de backup, certificações ou segregação entre empresas.
- Os termos contêm linguagem sobre finalidade “educacional e de entretenimento”, incompatível com um sistema de gestão empresarial e indicativa de documento jurídico genérico.
- Não foi confirmada uma central pública detalhada, API, webhooks, pré-pagamento, sincronização de calendário ou gestão de unidades/recursos.

### O que aproveitar no Barbershop/SuaAgenda

- Modelo genérico de negócio, profissional, serviço, cliente, recurso e categoria.
- Campos e fichas configuráveis por segmento, em vez de telas diferentes copiadas para cada profissão.
- Pacotes, produtos, estoque, fornecedores e fluxo de caixa como módulos opcionais.
- Versão web para o gestor e link público para o cliente.

## 6. Masters

### O que foi confirmado

O Masters funciona como um ecossistema de três produtos:

- **Masters Pro:** profissional autônomo;
- **Masters Salon:** equipe, salão e estações de trabalho;
- **Masters para clientes:** reserva, reagendamento, histórico, lembretes, portfólio, avaliações e chat.

O Masters Pro possui **500 mil+ downloads**, nota **4,6/5 com cerca de 9,9 mil avaliações** no Google Play e atualização em **24/06/2026**. O Salon possui 10 mil+ downloads e o app de clientes também 10 mil+. [Masters Pro](https://play.google.com/store/apps/details?hl=pt_BR&id=ru.jamsoft.masters), [Masters Salon](https://play.google.com/store/apps/details?hl=en_US&id=ru.jamsoft.masters.salon), [Masters Clientes](https://play.google.com/store/apps/details?hl=en_US&id=com.jamsoft.masters.client).

Na App Store brasileira, o Pro aparecia com **4,9/5 e aproximadamente 2 mil avaliações**. Há teste de 14 dias. Os valores em reais exibidos pela loja começam em R$ 29,90/mês para Premium, mas divergem do modelo modular e dos preços em rublos publicados no site; o preço efetivo precisa ser confirmado dentro do app. [App Store](https://apps.apple.com/br/app/masters-pro-agendamento/id1010198076) e [preços oficiais](https://www.masters-app.ru/pricing-plans).

A [central de ajuda](https://faq.masterspro.app/) confirma:

- calendário diário, semanal e mensal;
- horários, pausas, folgas, eventos pessoais e vários locais;
- página pública de agendamento sem instalar o aplicativo;
- histórico, notas, fotos, aniversários e preferências do cliente;
- lista de espera, descontos e mensagens em grupo;
- portfólio, avaliações, serviços e produtos;
- receitas, despesas, ticket médio, relatórios e exportação para Excel no VIP;
- pré-pagamento;
- sincronização com o calendário do telefone;
- estações/cabines, permissões e indicadores por profissional no Salon;
- lembretes por diferentes canais, com automação de WhatsApp vendida separadamente.

### Pontos fortes

- Agenda mais profunda e documentada entre os produtos pesquisados.
- CRM muito bom para retenção: notas, fotos, preferências, histórico e aniversários.
- Página pública permite agendar sem instalar o app.
- Separação clara entre autônomo, salão e cliente.
- Recursos operacionais maduros: lista de espera, estações, permissões, exportação e pré-pagamento.
- Maior validação de mercado do grupo analisado.

### Pontos fracos e riscos

- O ecossistema dividido em três aplicativos pode gerar fragmentação e mais suporte.
- A operação completa continua centrada no celular; o acesso web é limitado.
- Pix, boleto, CPF/CNPJ, NFS-e e conciliação brasileira não foram documentados.
- Pré-pagamento e integrações estão orientados ao mercado russo; o funcionamento brasileiro não ficou comprovado.
- A listagem destaca Yandex Maps, não Google Maps.
- O Google Play declara dados sem criptografia para Pro/Salon, enquanto o app de clientes declara criptografia em trânsito.
- A política prevê coleta ampla, publicidade e compartilhamento com parceiros, sem referência clara à LGPD.
- As entidades exibidas nas lojas, termos e site aparecem em Rússia, Hong Kong, Dubai e App Store sob nomes diferentes, reduzindo transparência jurídica.

### O que aproveitar no Barbershop

- Página pública de agendamento sem instalação.
- CRM com notas, fotos e preferências.
- Sinal/pré-pagamento para reduzir faltas.
- Lista de espera integrada aos cancelamentos.
- Sincronização de calendário e exportação de relatórios.
- Recursos físicos agendáveis: cadeira, sala, cabine ou equipamento.

## 7. Matriz funcional

Legenda: **Sim** = confirmado; **Parcial** = existe de forma limitada ou diferente; **Não localizado** = não apareceu nas fontes oficiais pesquisadas.

| Recurso | Barbershop | InBarber | Corthy | Masters |
|---|---|---|---|---|
| Agenda online | Sim | Sim | Sim | Sim |
| Link público sem instalar app | Parcial | Sim | Sim | Sim |
| Jornada nativa do cliente | Sim | Não localizado | Não localizado | Sim, app separado |
| Pausas, folgas e bloqueios | Sim | Parcial | Parcial | Sim |
| Agendamento manual | Sim | Sim | Sim | Sim |
| Lista de espera | Sim | Não localizado | Não localizado | Sim |
| Recorrência | Sim | Não localizado | Não localizado | Não localizado |
| WhatsApp, SMS e push | Sim | Parcial | Parcial | Sim, módulos/custos variam |
| Equipe e permissões | Parcial | Sim | Sim | Sim |
| Comissão | Sim | Parcial | Sim | Sim |
| Despesas e relatórios | Sim | Sim | Sim | Sim |
| Produtos e estoque | Não | Sim | Sim | Parcial: produtos confirmados |
| Pacotes de serviços | Não | Não localizado | Sim | Não localizado |
| CRM com notas e fotos | Parcial | Parcial | Sim | Sim |
| Anamnese configurável | Não | Não localizado | Sim | Não localizado |
| Galeria/portfólio | Não | Não localizado | Sim | Sim |
| Avaliações | Sim | Não localizado | Não localizado | Sim |
| Pré-pagamento online | Não | Não localizado | Não localizado | Sim, Brasil não comprovado |
| Calendário externo | Parcial: adiciona evento | Não localizado | Não localizado | Sim |
| Web para gestor | Não | Declarado | Sim | Parcial |
| Estações/recursos/unidades | Não | Não localizado | Não localizado | Sim |
| Exclusão de conta/dados | Sim, implementada | Solicitação declarada | Solicitação declarada | Solicitação declarada |
| Várias categorias | Futuro | Não | Sim, amplo | Sim, beleza/bem-estar |
| Descoberta pública por localização | Não | Não localizado | Não localizado | Não comprovado no Brasil |

## 8. Estado atual do Barbershop

### Onde ele já está forte

- Jornada separada e coerente para cliente e gestor no mesmo aplicativo.
- Agenda configurável com serviços, profissionais, intervalos, folgas, bloqueios e horários extras.
- Reserva atômica para reduzir conflitos de horário.
- Agendamento manual, recorrência e lista de espera.
- Vínculo cliente-barbearia por convite, QR Code e App Link.
- Histórico, avaliações, clientes, aniversários e campanhas.
- Equipe, comissões, despesas e relatórios.
- Avisos por WhatsApp, SMS e push, configuráveis pelo gestor.
- Exclusão de conta e dados, regras Firebase, limitação de abuso e observabilidade.
- Tema claro/escuro, acessibilidade, ícones consistentes, animações e feedback tátil.
- Base técnica forte: TypeScript estrito, repositórios, serviços, regras, CI e 1.366 testes.

### Onde ainda perde para os concorrentes

- O cliente depende demais do aplicativo; falta uma reserva web leve e sem cadastro obrigatório.
- Não existe estoque, produtos, fornecedores, venda no caixa ou baixa automática de insumos.
- Não existem pacotes, assinaturas, créditos ou programas de fidelidade.
- O CRM não possui a profundidade de notas, preferências, fotos, anexos, devedores e segmentação.
- O pagamento continua presencial; não há sinal, Pix/cartão online, política de falta ou conciliação.
- Não existe painel web/desktop para o gestor.
- Não há sincronização bidirecional com Google/Apple/Outlook Calendar.
- Não existem múltiplas unidades nem recursos físicos, como cadeiras, salas e equipamentos.
- Ainda não há modelo genérico para segmentos diferentes, necessário ao SuaAgenda.
- A cobertura das telas é bem menor que a das camadas de lógica e as telas grandes ainda elevam o custo de manutenção.
- Não há validação pública de mercado, suporte operacional, cobrança SaaS e telemetria comparável aos produtos maduros.

## 9. Prioridades recomendadas

### Fase 1: reduzir atrito e aumentar receita

1. **Agendamento web pelo link/QR Code:** permitir que o cliente abra a barbearia vinculada, escolha serviço, profissional e horário sem instalar o app. A descoberta continua controlada por convite; isso não obriga a mostrar todas as barbearias.
2. **CRM enriquecido:** notas internas, preferências, fotos autorizadas, etiquetas e histórico consolidado.
3. **Produtos, estoque e venda no atendimento:** cadastro, entrada/saída, estoque mínimo e venda vinculada ao profissional/cliente.
4. **Pacotes e créditos:** corte mensal, combos, sessões e validade.
5. **Sinal/pré-pagamento brasileiro:** Pix e cartão por provedor externo, com webhook, reembolso e política de cancelamento.

### Fase 2: operação profissional

1. Painel web para agenda, equipe, financeiro e relatórios.
2. Permissões detalhadas por função e auditoria de ações sensíveis.
3. Sincronização com calendários externos.
4. Contas a receber, devedores, fluxo de caixa e exportação CSV/Excel.
5. Unidades e recursos agendáveis, como cadeira, sala, box ou equipamento.

### Fase 3: transformar em SuaAgenda

1. Tornar `negocio`, `profissional`, `servico`, `cliente`, `recurso` e `agendamento` entidades genéricas.
2. Criar módulos opcionais por categoria, não cópias completas do aplicativo.
3. Adicionar campos personalizados e formulários/anamnese por segmento.
4. Implementar geohash e descoberta pública como uma seção separada de “Minhas empresas”.
5. Preparar cobrança multi-tenant por plano, profissional, unidade e módulos contratados.

## 10. Recomendação final

O caminho mais seguro é manter o **Barbershop como produto vertical e campo de prova** antes de renomear tudo para SuaAgenda. Primeiro, ele deve alcançar paridade comercial com InBarber em estoque, link público e gestão de receita. Em seguida, deve incorporar do Masters o CRM profundo, o pré-pagamento e a agenda web. Só então vale generalizar o domínio inspirado no Corthy.

O diferencial não deve ser “ter mais telas”. Deve ser:

- agendamento mais simples para o cliente;
- regras de agenda mais confiáveis;
- privacidade e isolamento entre negócios comprováveis;
- comunicação multicanal transparente;
- módulos ativados conforme a categoria, sem transformar a interface em um sistema pesado.

## 11. Fontes principais

### InBarber

- [Site oficial](https://www.inbarberapp.com/pt/)
- [Google Play](https://play.google.com/store/apps/details?id=com.inbarberapp.schedule.twa&hl=pt_BR&gl=BR)
- [App Store Brasil](https://apps.apple.com/br/app/inbarber-agenda-p-barbearias/id1544861726)
- [Política de privacidade](https://schedule.inbarberapp.com/privacy)

### Corthy

- [Site oficial](https://corthy.com/)
- [Google Play](https://play.google.com/store/apps/details?id=com.corthy.management)
- [App Store Brasil](https://apps.apple.com/br/app/corthy-agenda-sal%C3%A3o-e-gest%C3%A3o/id6754831095)
- [Política de privacidade](https://corthy.com/privacy/)
- [Termos](https://corthy.com/terms/)
- [Exclusão de dados](https://corthy.com/deletion/)

### Masters

- [Site oficial](https://www.masters-app.ru/)
- [Central de ajuda](https://faq.masterspro.app/)
- [Preços](https://www.masters-app.ru/pricing-plans)
- [Google Play - Masters Pro](https://play.google.com/store/apps/details?hl=pt_BR&id=ru.jamsoft.masters)
- [Google Play - Masters Salon](https://play.google.com/store/apps/details?hl=en_US&id=ru.jamsoft.masters.salon)
- [Google Play - Masters Clientes](https://play.google.com/store/apps/details?hl=en_US&id=com.jamsoft.masters.client)
- [App Store Brasil - Masters Pro](https://apps.apple.com/br/app/masters-pro-agendamento/id1010198076)
- [Política de privacidade](https://docs.masterspro.app/en/privacy_policy)

# Pesquisa: Cal.com / `calcom/cal.com`

> Pesquisa realizada em 7 de agosto de 2026, usando fontes de primeira parte (repositórios e documentação oficial). A conclusão importante é que o endereço solicitado, [`github.com/calcom/cal.com`](https://github.com/calcom/cal.com), hoje redireciona para [`calcom/cal.diy`](https://github.com/calcom/cal.diy). Portanto, ele **não é mais o código completo do produto hospedado Cal.com**; é a edição comunitária voltada a auto-hospedagem.

## Resumo executivo

Cal.com é uma infraestrutura de agendamento: a pessoa ou empresa configura disponibilidade, conecta calendários e videoconferência, publica um link de reserva e recebe os agendamentos sem conflitos de calendário. A documentação oficial o descreve como uma plataforma de agendamento open source que também pode ser estendida pelo código e pela API ([introdução](https://cal.com/docs/developing/introduction)).

Para uma barbearia, o uso mais direto é criar tipos de evento como **corte (30 min)**, **barba (20 min)** e **corte + barba (50 min)**, definir horários e profissionais, e divulgar/embutir a agenda no site. Para distribuição de clientes entre profissionais, os recursos de equipe e *round-robin* pertencem aos planos colaborativos do serviço hospedado ([planos](https://cal.com/pricing?source=blog)).

## Como o agendamento funciona

1. **Tipo de evento** — representa um serviço reservável e possui nome, URL, duração, disponibilidade e local. Pode ser pessoal ou de equipe; eventos de equipe podem reservar uma ou várias pessoas ([documentação de tipos de evento](https://cal.com/help/event-types/event-types)).
2. **Disponibilidade e conflito** — o Cal.com oferece horários compatíveis ao visitante; calendários integrados podem marcar compromissos existentes como ocupados, reduzindo dupla reserva ([documentação de tipos de evento](https://cal.com/help/event-types/event-types)).
3. **Reserva** — o cliente escolhe um horário, informa seus dados e a reserva é criada. O destino pode ser presencial, vídeo ou outra integração configurada no evento.
4. **Automação e integração** — a aplicação pode consumir API, receber webhooks de eventos de reserva ou mostrar o fluxo de reserva dentro do próprio site.

Em termos de arquitetura de software, a edição comunitária declara uso de **Next.js, React, tRPC, Tailwind CSS, Prisma e Daily** ([README do repositório](https://github.com/calcom/cal.diy#built-with)). A persistência exige PostgreSQL; as integrações dependem das credenciais OAuth/API de cada provedor.

## Formas práticas de usar

### 1. Serviço hospedado (SaaS)

É o caminho mais simples para operar rapidamente: criar conta, conectar o calendário, criar os serviços/tipos de evento e compartilhar o link. A própria ajuda recomenda o serviço hospedado para a maior parte das pessoas e informa plano gratuito individual, enquanto recursos colaborativos são oferecidos em planos de equipe ([criação de conta](https://cal.com/help/quick-start/create-account), [preços e recursos](https://cal.com/pricing?source=blog)).

**Quando escolher:** agenda de uma pessoa, site da barbearia, MVP, ou quando não se deseja administrar servidores, banco, atualizações e segurança.

### 2. Incorporar no site ou app (embed)

Depois de criar o tipo de evento, gere o trecho no **Embed Snippet Generator** do painel e insira-o no site. A documentação suporta:

- calendário embutido (*inline*);
- modal aberto ao clicar em um botão/link;
- botão flutuante que abre modal;
- também é possível embutir perfil ou formulário de roteamento, além de um tipo de evento ([guia oficial de embed](https://cal.com/help/embedding/adding-embed)).

Esse é o melhor encaixe para o app/site da BarberShop: o cliente permanece na sua experiência visual, mas a disponibilidade e a confirmação ficam a cargo do Cal.com. O snippet pode ser obtido também em uma instância auto-hospedada; a ajuda informa que ele se adapta à instância ([guia oficial de embed](https://cal.com/help/embedding/adding-embed)).

### 3. API e webhooks

A API v2 permite criar, consultar e administrar recursos de agendamento programaticamente. As formas de autenticação documentadas são **OAuth**, **chave de API** e a modalidade Platform legada; para novas integrações, a recomendação é OAuth. Chaves são secretos de servidor: devem ir em `Authorization: Bearer ...`, somente por HTTPS e nunca no código do navegador ([introdução da API v2](https://cal.com/docs/api-reference/v2/introduction)).

Casos úteis para a BarberShop:

- criar/atualizar tipos de serviço a partir do painel administrativo próprio;
- consultar slots livres e criar uma reserva a partir de um fluxo já existente;
- sincronizar dados de reserva com Firebase/CRM;
- receber webhooks de criação, cancelamento e reagendamento para atualizar a agenda interna ou disparar WhatsApp.

Há controles de segurança e limites: a documentação indica limite padrão de **120 requisições/minuto** por chave ou sem autenticação, e alerta que limites maiores podem depender de suporte/cobrança ([introdução da API v2](https://cal.com/docs/api-reference/v2/introduction)). Para OAuth, é necessário cadastrar cliente, escolher escopos e redirecionamentos; o cliente passa por revisão antes de ficar utilizável ([guia OAuth](https://cal.com/docs/api-reference/v2/oauth)).

Para eventos, webhooks podem ser assinados com um segredo. No SaaS, URLs de destino precisam usar HTTPS e não podem apontar a IPs privados/localhost; em auto-hospedagem, HTTP e IPs privados são aceitos, mas endpoints de metadados de nuvem continuam bloqueados ([regras oficiais de webhook](https://cal.com/help/webhooks)).

### 4. Auto-hospedagem

Há duas situações distintas:

- **Cal.diy (repositório para o qual o link pedido redireciona):** edição comunitária, totalmente MIT, sem código enterprise/comercial, indicada pelo próprio README para uso pessoal/não produtivo e por pessoas que sabem administrar servidores, banco e dados sensíveis ([aviso e diferenças](https://github.com/calcom/cal.diy#about-cal-diy)).
- **Cal.com comercial/enterprise auto-hospedado:** o posicionamento oficial atual é de um processo voltado a organizações com necessidades avançadas, feito junto ao time Cal.com, e não mais como autoatendimento ([posição oficial sobre self-hosting](https://cal.com/blog/self-hosted-scheduling-platforms-benefits-and-challenges)).

Para experimentar Cal.diy localmente, os pré-requisitos declarados são Node.js 18+, PostgreSQL 13+ e Yarn; há atalho de desenvolvimento que requer Docker/Docker Compose e inicia PostgreSQL local ([README: pré-requisitos e desenvolvimento](https://github.com/calcom/cal.diy#prerequisites)). Em produção, além de banco e aplicação, assumem-se DNS/TLS, backups, monitoramento, atualizações, gestão de segredos e credenciais de cada integração.

**Recomendação:** não usar Cal.diy como base de produção da BarberShop sem alguém responsável por operação e segurança. Para produção, prefira SaaS/Enterprise ou valide formalmente o caminho comercial auto-hospedado com a Cal.com.

## Limitações e decisões relevantes

| Tema | Impacto prático |
| --- | --- |
| Equipe e distribuição | Recursos de colaboração não equivalem ao plano individual; confirme no plano contratado funcionalidades como equipe, *round-robin* e formulários de roteamento ([preços](https://cal.com/pricing?source=blog)). |
| Integrações | Cada calendário, vídeo, pagamento ou CRM pode exigir seu próprio cadastro OAuth/chave. Em auto-hospedagem, essas credenciais e renovações passam a ser responsabilidade da operação. |
| API | Não coloque API key no React Native/site; mantenha-a em função/backend. Prefira OAuth quando o produto agir em nome de clientes. |
| Plataforma antiga | A oferta “Platform” e alguns componentes/rotas associados estão documentados como depreciados/manutenção apenas para clientes existentes; não baseie uma integração nova neles ([API v2](https://cal.com/docs/api-reference/v2/introduction), [Booker Embed](https://cal.com/docs/platform/atoms/booker-embed)). |
| Compliance | Alegações de HIPAA, BAA, SLA e suporte dedicado pertencem à oferta Enterprise e devem ser contratadas/verificadas, não presumidas no repositório comunitário ([Enterprise](https://cal.com/enterprise)). |

## Licenciamento

O repositório atualmente acessível por `github.com/calcom/cal.com` redireciona para `calcom/cal.diy`, cujo README declara **MIT para todo o código** e afirma que os recursos enterprise/comerciais foram removidos ([licença e diferenças](https://github.com/calcom/cal.diy#license)). Isso não concede os recursos, suporte ou serviço hospedado do Cal.com comercial.

Historicamente, o Cal.com original seguia o modelo **open core**: o núcleo sob AGPLv3 e o diretório/recursos Enterprise sob licença comercial. Como o endereço agora aponta para o fork MIT, qualquer decisão jurídica ou de implantação deve usar a licença do artefato/versão exata que será executada e, para o produto comercial, os termos negociados com a Cal.com ([explicação do repositório comunitário](https://github.com/calcom/cal.diy#whats-different-from-calcom)).

## Caminho recomendado para a BarberShop

1. Começar no **SaaS** com um usuário por profissional (ou plano de equipe, caso seja necessário distribuir reservas).
2. Criar os tipos de evento que correspondem aos serviços e conectar os calendários de cada profissional.
3. Inserir um **embed inline** na tela “Agendar” do app/site e manter um link de reserva como alternativa.
4. Só então integrar API/webhook: o backend recebe eventos e atualiza o sistema interno; o front-end nunca manipula chaves secretas.
5. Avaliar auto-hospedagem apenas se houver requisito real de soberania de dados, rede interna ou compliance — e orçamento/competência para operar a plataforma.

## Fontes primárias consultadas

- [Repositório e README atuais: calcom/cal.diy](https://github.com/calcom/cal.diy)
- [Documentação oficial do produto](https://cal.com/docs/developing/introduction)
- [Ajuda oficial de embeds](https://cal.com/help/embedding/adding-embed)
- [Referência oficial da API v2](https://cal.com/docs/api-reference/v2/introduction)
- [Guia oficial OAuth](https://cal.com/docs/api-reference/v2/oauth)
- [Documentação oficial de webhooks](https://cal.com/help/webhooks)

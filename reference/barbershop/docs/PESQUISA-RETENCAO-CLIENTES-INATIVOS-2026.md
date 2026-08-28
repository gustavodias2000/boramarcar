# Pesquisa: lembrete de retorno para clientes inativos

**Data da pesquisa:** 18 de agosto de 2026  
**Escopo:** referências de produto para uma automação que convida o cliente a voltar após ficar um período sem atendimento. Foram usadas apenas fontes primárias: centrais de ajuda e políticas dos próprios produtos, Meta/WhatsApp e ANPD.

## Resumo executivo

A ideia é válida e é um padrão consolidado em produtos de agenda para beleza: Boulevard chama de **Reminder to Book/Rescue Lost Clients**, Timely de **Rebooking Reminder** e Vagaro de **Lost Customer Campaign**. O padrão em comum não é "contar dias desde o cadastro"; é contar a partir do **último atendimento concluído**, somente se o cliente **não tiver agendamento futuro**.

A recomendação para o Barbershop é lançar o recurso como **Lembrete de retorno** dentro de Configurações de notificações, separado dos lembretes operacionais de um agendamento. O padrão pode ser 30 dias, mas a configuração deve poder variar por serviço e/ou profissional. A primeira versão deve privilegiar uma jornada curta, com limites globais contra excesso de mensagens, consentimento por canal e histórico auditável.

## O que os produtos semelhantes fazem

| Produto | Gatilho e elegibilidade | Configuração/cadência | Salvaguardas relevantes |
|---|---|---|---|
| [Boulevard](https://support.boulevard.io/en/articles/10068551-automated-campaigns-overview-setup) | “Reminder to Book” dispara de 0 a 100 dias após o último serviço se não houver reserva futura; “Rescue Lost Clients” atua de 100 a 365 dias. | Canal por SMS, e-mail ou ambos; limites e texto configuráveis. | A [FAQ oficial](https://support.boulevard.io/en/articles/6249878-automated-campaigns-faq) limita cada cliente a no máximo uma comunicação automática por 7 dias (exceto aniversário) e permite pausar campanhas. |
| [Timely](https://help.gettimely.com/hc/en-gb/articles/38728378318103-How-to-set-up-rebooking-reminders) | Envia após um número configurado de semanas do atendimento, se não houver reserva futura. | Permite personalizar regra e mensagem; pode restringir a serviços. | O cliente pode ter rebooking/follow-up desligado individualmente e STOP remove marketing; o produto mantém [histórico de status de envio](https://help.gettimely.com/hc/en-gb/articles/34111746631191-How-to-view-a-client-s-appointment-history). |
| [Vagaro](https://support.vagaro.com/hc/en-us/articles/26168603819547) | Campanha de “Lost Customer” envia automaticamente a quem não retornou; não envia a quem tem agendamento futuro. | Campanha contínua, editável e pausável; pode atuar até 24 semanas após o último atendimento. | Exclui cliente bloqueado, número inválido e quem optou por não receber marketing/mandou STOP. [Também permite segmentar clientes por profissional](https://support.vagaro.com/hc/en-us/articles/26573120674587-Filter-Audience-for-Text-Campaigns). |

Essas referências confirmam que o recurso deve ser uma automação de CRM/retenção, não uma simples nova opção dos lembretes de agendamento.

## Recomendação de experiência para o Barbershop

### Nome e lugar na interface

Em **Configurações → Notificações**, adicionar a seção **Lembrete de retorno**:

- chave geral: “Lembrar clientes que ainda não voltaram”;
- valor padrão: **30 dias** desde o último atendimento concluído;
- seletor de dias (por exemplo, 7–180), com opção avançada “usar intervalo do serviço”; 
- escolha de canais e ordem de tentativa;
- janela de envio (por padrão, dias úteis/horário comercial local da barbearia);
- botão Pausar e uma prévia da mensagem.

Na tela de clientes, mostrar de forma discreta “elegível em X dias” e, depois do disparo, “lembrete enviado em …”, sem expor essa informação ao cliente.

### Regra de elegibilidade

Um cliente só entra na automação quando todas as condições forem verdadeiras:

1. O último evento relevante é um agendamento **concluído/comparecido**; cancelamento, no-show e agendamento criado não reiniciam a contagem.
2. Já passou o intervalo da regra, calculado no fuso local do negócio.
3. Não existe agendamento futuro ativo para aquele mesmo negócio/profissional, conforme o escopo escolhido.
4. O cliente não está bloqueado, não optou por sair de marketing naquele canal e possui contato válido para o canal.
5. Ainda não atingiu o limite global de frequência e não recebeu aquela etapa da mesma jornada.

Isso evita o erro comum de convidar alguém que já agendou novamente ou de premiar/reativar um cliente que faltou.

### Cadência sugerida — não liberar mensagens ilimitadas

O fluxo proposto pelo usuário pode existir, mas como **jornada configurada com proteção**, e não como “enviar duas por dia” livremente:

| Etapa | Momento sugerido | Canal padrão | Objetivo |
|---|---|---|---|
| 1 | Dia X (padrão 30) | Push | Lembrete leve com deep link para agendar. |
| 2 | X + 7 dias, se ainda elegível | WhatsApp | Convite objetivo usando template aprovado e botão/link de reserva. |
| 3 | X + 21 dias, se ainda elegível | WhatsApp ou push, conforme preferência/consentimento | Último lembrete; opcionalmente uma oferta configurada. |
| 4 | X + 45 dias | Push | Encerramento neutro ou não enviar mais até nova visita. |

**Limite recomendado:** no máximo uma comunicação automática de marketing por cliente em qualquer janela de 7 dias, atravessando todas as campanhas e canais. Isso acompanha a trava que o Boulevard documenta para evitar saturação. Duas mensagens no mesmo dia devem ficar bloqueadas por padrão; se forem liberadas no futuro, precisam ser apenas para eventos transacionais diferentes e com justificativa clara.

Para o MVP, a versão mais segura é ainda menor: **uma única etapa** no dia configurado, via push; WhatsApp entra apenas após a infraestrutura de consentimento e templates estar pronta. A jornada de quatro etapas fica como evolução, já modelada desde o início.

### Mensagem e conversão

Cada mensagem deve ter uma única ação: abrir a reserva. O texto precisa ser curto, pessoal e sem tom de cobrança. Exemplo:

> “Oi, {primeiroNome}! Já faz um tempinho desde sua última visita à {barbearia}. Quando quiser dar um trato no visual, veja os horários: {linkDeAgendamento}.”

Evitar “você está atrasado”, supor o motivo da ausência e usar desconto como padrão. A orientação de conteúdo do [Boulevard](https://support.boulevard.io/en/articles/13710138-automated-campaigns-writing-effective-content) recomenda linguagem opcional, neutra e um único CTA; sua orientação de comunicação também recomenda ajustar intervalos ao ciclo do serviço (por exemplo, corte e cor em tempos diferentes) e medir o resultado.

## Consentimento, WhatsApp e privacidade

Lembrete de retorno é comunicação de marketing/retenção, portanto deve ser separado dos avisos transacionais (confirmação, alteração e lembrete do agendamento já marcado).

- Exigir uma preferência explícita por canal para marketing: **push**, **WhatsApp** e, se oferecido, SMS/e-mail. A [ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares) informa que o titular pode revogar consentimento a qualquer momento e que isso deve ser facilitado.
- Registrar prova de consentimento: texto apresentado, versão, canal, data/hora, origem e eventual revogação. O guia da ANPD sobre mensagens instantâneas enfatiza consentimento livre, informado e inequívoco e procedimento fácil de revogação ([guia oficial, itens 150–153](https://www.gov.br/anpd/pt-br/assuntos/noticias/guia_lgpd_final.pdf/%40%40download/file)).
- No WhatsApp, não basta ter o telefone: a [política oficial](https://whatsappbusiness.com/policy/) exige número fornecido e opt-in para mensagens posteriores. Inícios de conversa pela plataforma devem usar template aprovado; a [Meta](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/) também aplica limites a marketing e qualidade/feedback.
- Incluir saída simples no app e no conteúdo quando aplicável: “Parar lembretes de retorno”. A referência de [consentimento do Boulevard](https://support.boulevard.io/en/articles/6574083-marketing-consent-faq) separa recusa de promoções de STOP total; vale reproduzir essa separação para não desativar acidentalmente lembretes operacionais.

Isso precisa ser validado juridicamente antes da ativação comercial; a pesquisa não substitui parecer de LGPD nem requisitos contratuais atualizados de Meta/Twilio.

## Implementação recomendada em fases

### Fase 1 — fundamento seguro

1. Persistir preferências de marketing por cliente e canal, incluindo consentimento/revogação.
2. Criar a configuração de “Lembrete de retorno” por negócio/profissional, desligada por padrão para negócios existentes até haver consentimento válido.
3. Criar uma tarefa diária idempotente que calcula elegibilidade pelo último atendimento concluído e suprime futuros agendamentos.
4. Enviar apenas uma etapa push e guardar log de elegível, enviado, entregue/falhou, clique e agendamento atribuído.
5. Aplicar teto global de 1 comunicação automática de marketing / 7 dias e janela silenciosa.

### Fase 2 — campanhas configuráveis e WhatsApp

1. Liberar uma jornada predefinida de até três etapas, com intervalos mínimos e pausa global.
2. Usar integração oficial do WhatsApp Business Platform, templates aprovados, callback de entrega/falha e opt-out por canal.
3. Permitir regra por serviço/profissional, por exemplo: corte em 21–30 dias, barba em 14 dias; o padrão geral continua simples.
4. Mostrar prévia, estimativa de elegíveis e relatório de conversão antes/depois do disparo.

### Fase 3 — otimização baseada em dados

1. Segmentos: primeira visita, recorrentes, clientes de profissional específico e inativos longos.
2. Teste controlado de intervalo e conteúdo, nunca de consentimento ou limite de frequência.
3. Métricas: clientes elegíveis, enviados, entregues, falhas, descadastros, aberturas/cliques quando suportados, reservas em 7/30 dias e receita atribuída.

## Pontos técnicos específicos do projeto atual

O projeto já possui canais de **push, WhatsApp e SMS**, configuração de eventos/canais e orquestração de notificações. A nova capacidade deve reutilizar essa infraestrutura, mas precisa de um evento próprio, por exemplo `lembreteRetorno`, separado de `lembrete` de agendamento. Também precisa de um registro de campanha por cliente/regra/etapa para idempotência: não marcar como enviado antes de o provedor aceitar a mensagem, e nunca reenviar após sucesso sem nova elegibilidade.

Como há configuração de WhatsApp no servidor, a fase de retenção não deve enviar texto livre como se fosse um lembrete operacional: início de conversa para marketing exige o fluxo oficial de template e consentimento. O agendador deve paginar resultados e manter escopo de negócio rigoroso para impedir comunicação entre carteiras diferentes.

## Decisões de produto recomendadas

1. **Adotar:** 30 dias como valor inicial, a partir do último atendimento concluído.
2. **Adotar:** bloquear automaticamente cliente com agendamento futuro, opt-out, contato inválido ou bloqueado.
3. **Adotar:** uma regra global anti-spam (7 dias), inclusive entre campanhas futuras de promoção/aniversário.
4. **Adotar:** push como primeiro canal e WhatsApp somente com opt-in e template aprovado.
5. **Evitar:** permitir “duas mensagens por dia” como configuração geral; gera fadiga, descadastro e risco de política de canal.
6. **Evitar:** tornar desconto obrigatório. O retorno deve ser útil mesmo sem promoção.
7. **Medir antes de expandir:** taxa de retorno/receita por etapa, opt-outs e falhas de entrega; pausar automaticamente uma campanha com descadastro anormal.

## Fontes primárias

- Boulevard: [Automated Campaigns](https://support.boulevard.io/en/articles/10068551-automated-campaigns-overview-setup), [FAQ e limite de frequência](https://support.boulevard.io/en/articles/6249878-automated-campaigns-faq), [boas práticas de comunicação](https://support.boulevard.io/en/articles/15118477-client-communications-best-practices), [consentimento](https://support.boulevard.io/en/articles/6574083-marketing-consent-faq).
- Timely: [rebooking reminders](https://help.gettimely.com/hc/en-gb/articles/38728378318103-How-to-set-up-rebooking-reminders), [histórico de notificações](https://help.gettimely.com/hc/en-gb/articles/34111746631191-How-to-view-a-client-s-appointment-history), [consentimento de marketing](https://help.gettimely.com/hc/en-gb/articles/4404254387863-How-to-record-marketing-consent-in-Timely).
- Vagaro: [campanha para clientes perdidos](https://support.vagaro.com/hc/en-us/articles/26168603819547), [filtros por público](https://support.vagaro.com/hc/en-us/articles/26573120674587-Filter-Audience-for-Text-Campaigns).
- WhatsApp/Meta: [WhatsApp Business Policy](https://whatsappbusiness.com/policy/), [controles de mensagens de empresas](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/).
- Brasil: [direitos do titular — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares), [guia oficial da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/guia_lgpd_final.pdf/%40%40download/file).

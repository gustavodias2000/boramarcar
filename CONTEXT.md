# Bora Marcá

O Bora Marcá é um SaaS multiempresa para negócios de serviços. Este glossário separa os conceitos compartilhados de agenda dos conceitos próprios da operação Automotive.

## Agenda

**Agendamento**:
Reserva planejada de capacidade para atender um cliente em um intervalo de tempo. Pode existir antes da execução do serviço e não representa, por si só, uma Ordem de Serviço.
_Evitar_: Atendimento, OS

**Recurso de agenda**:
Capacidade exclusiva que pode ser reservada em um intervalo, como um profissional ou, no Automotive, um box.
_Evitar_: Horário, vaga

**Disponibilidade**:
Regra recorrente que informa os períodos em que um profissional pode receber agendamentos.
_Evitar_: Agenda livre

**Bloqueio**:
Intervalo específico que torna um recurso indisponível, independentemente da sua disponibilidade recorrente.
_Evitar_: Folga, exceção

## Operação Automotive

**Entrada do veículo**:
Registro da chegada física do veículo, incluindo seu estado, itens e observações de recebimento.
_Evitar_: Agendamento

**Ordem de Serviço (OS)**:
Registro operacional e financeiro do serviço executado para um veículo, com itens, execução, pagamento e entrega. Uma OS pode nascer de um agendamento ou de uma entrada sem agendamento.
_Evitar_: Agendamento, atendimento

**Pátio**:
Visão operacional das OS ativas por etapa, como aguardando, em serviço, finalizado e aguardando retirada. Não é uma entidade independente.
_Evitar_: Agenda

**Box**:
Espaço físico de atendimento que pode ser usado como recurso de agenda na operação Automotive.
_Evitar_: Vaga

**Entrega**:
Confirmação de devolução do veículo ao cliente. É distinta tanto da conclusão técnica do serviço quanto do pagamento.
_Evitar_: Finalização

**Item de OS**:
Registro imutável de um serviço ou produto cobrado em uma Ordem de Serviço, com descrição, quantidade e preço no momento da operação.
_Evitar_: Serviço cadastrado, produto cadastrado

**Pagamento de OS**:
Registro de uma entrada ou estorno financeiro vinculado a uma Ordem de Serviço. O estado de pagamento é apurado a partir desses registros, sem se confundir com a Entrega.
_Evitar_: Status da OS

**Ocupação de box**:
Bloqueio de agenda aberto enquanto uma OS usa fisicamente um box. Termina quando a equipe libera ou entrega o veículo.
_Evitar_: Agendamento do box

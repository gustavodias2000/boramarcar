# Agendamento e Ordem de Serviço são registros distintos

O Agendamento reserva capacidade de atendimento, enquanto a Ordem de Serviço registra a operação Automotive e seu ciclo financeiro. Escolhemos mantê-los separados porque uma OS pode surgir de uma entrada sem agendamento e porque fundir ambos transformaria requisitos de veículos, box, checklist, pagamento e entrega em acoplamentos do núcleo compartilhado.

## Consequências

Um agendamento pode originar uma OS no módulo Automotive, mas não a substitui. A reserva transacional permanece reutilizável para todos os segmentos e poderá reservar também boxes quando o módulo Automotive os criar.

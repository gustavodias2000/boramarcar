# Módulo Automotive — contrato operacional

O módulo Automotive está implementado no Supabase para empresas do tipo `automotive_aesthetics`. Ele não altera o núcleo de agenda: usa seus recursos e reservas para controlar profissionais e boxes.

## Registros principais

- `automotive_vehicles`: veículo ativo vinculado ao cliente atual. A placa é normalizada e única por empresa.
- `automotive_boxes`: box físico associado a um recurso de agenda.
- `automotive_work_orders`: Ordem de Serviço, com número sequencial por empresa e vínculo opcional ao agendamento de origem.
- `automotive_work_order_intakes` e `automotive_work_order_deliveries`: recebimento e devolução são registros separados.
- `automotive_work_order_items`, `automotive_work_order_payments` e `automotive_work_order_events`: composição financeira e histórico auditável da OS.
- `automotive_work_order_media`: metadados de fotos para entrada, execução e entrega, vinculados ao bucket privado `automotive-work-order-media`.

## Comandos para a interface

Use as funções RPC para qualquer alteração de OS ou box:

1. `create_automotive_box` cria o box e seu recurso de agenda.
2. `assign_automotive_appointment_box` reserva esse box para um agendamento existente.
3. `open_automotive_work_order` registra a entrada e cria a OS; se ela usar um box, transforma a reserva do agendamento em ocupação física.
4. `open_automotive_walk_in_work_order` é a Entrada rápida por placa. Em uma única transação, ela reaproveita o veículo cadastrado ou cria cliente, veículo e OS para um atendimento sem agendamento.
5. `add_automotive_work_order_item` e `remove_automotive_work_order_item` alteram os itens enquanto a OS está em execução.
6. `transition_automotive_work_order` move a OS entre aguardando serviço, em serviço, serviço concluído e aguardando retirada.
7. `record_automotive_work_order_payment` registra recebimento ou estorno sem confundir pagamento com entrega.
8. `deliver_automotive_work_order` confirma a entrega e libera o box. `release_automotive_work_order_box` permite liberar o box antes da entrega quando o veículo é movido.
9. Faça upload da foto para `empresa/OS/etapa/arquivo` e use `register_automotive_work_order_media` para vinculá-la. Para apagar, remova o objeto pela API do Supabase Storage e depois chame `remove_automotive_work_order_media` para retirar o metadado e registrar o evento.

## Leitura do Pátio

A view `automotive_patio` é a fonte da tela operacional. Ela retorna somente OS ativas, com cliente, veículo, técnico, box, total, pago, saldo e estado de pagamento calculado. Ela respeita a RLS do usuário que a consulta.

## Segurança

As tabelas de OS são somente leitura para o cliente. As funções validam empresa Automotive, papel do usuário, transições permitidas e relações no mesmo `tenant_id`. A reserva de box é uma constraint transacional: uma OS ativa bloqueia o recurso do box até a liberação. As fotos usam um bucket privado, sem URLs públicas; a leitura e o upload conferem a empresa e a OS embutidas no caminho.

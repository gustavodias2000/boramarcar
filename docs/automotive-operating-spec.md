# Especificação operacional — Automotive

## Direção do produto

O Bora Marcá Automotive será uma ferramenta de operação do pátio, e não apenas uma agenda. A referência visual analisada contribuiu com boas ideias de fluxo, mas não será copiada visualmente nem em sua modelagem de dados.

## Fluxo principal

1. **Agendar**: reservar profissional e, futuramente, box.
2. **Receber**: registrar entrada do veículo, estado, itens, fotos e observações.
3. **Executar**: acompanhar a OS no Pátio por etapa operacional.
4. **Entregar**: registrar conclusão técnica, pagamento e devolução ao cliente como etapas distintas.

## Entrega inicial do módulo

- Cadastro e histórico de veículos vinculados ao cliente.
- Entrada rápida por placa, cliente, veículo, serviços, observações, fotos e checklist.
- Ordem de Serviço com itens, valores, status, linha do tempo e pagamento.
- Pátio com as etapas aguardando, em serviço, finalizado e aguardando retirada.
- Boxes tratados como recursos de agenda para impedir dupla ocupação.

## Próximas etapas

- Histórico completo do veículo, programa de fidelidade, avaliações e relatórios operacionais.
- Estoque, contas a receber, integrações bancárias e comunicações automatizadas.
- Portal do cliente e funcionalidades de marketplace somente após a operação interna estar consolidada.

## Regras de fronteira

- O Agendamento reserva capacidade; a OS representa a execução e pode existir sem agendamento.
- O Pátio é uma visão das OS ativas, não uma tabela própria.
- A conclusão do serviço, o pagamento e a entrega do veículo são eventos diferentes.

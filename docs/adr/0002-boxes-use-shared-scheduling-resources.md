# Boxes compartilham os recursos de agenda

Cada Box Automotive terá um recurso de agenda correspondente e uma OS em uso bloqueará esse recurso até a liberação. Essa escolha evita que a agenda futura e o Pátio controlem a mesma capacidade por mecanismos separados, o que permitiria reservar um box já ocupado por um veículo.

## Consequências

A OS registra a ocupação física do box, enquanto a constraint transacional de agenda continua sendo a autoridade para impedir sobreposição. A equipe precisa liberar o box ao mover ou entregar o veículo; o histórico permanece na linha do tempo da OS.

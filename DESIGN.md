# Design system — Bora Marcá Automotive

## Direção

**Prancheta de boxes.** O produto deve parecer uma operação real de estética automotiva: informação compacta, legível e sempre orientada à próxima ação. O Pátio é um quadro de trabalho, não uma vitrine de indicadores.

O primeiro viewport preserva três contextos ao mesmo tempo: a navegação da unidade, as etapas físicas do atendimento e o detalhe da OS selecionada. A proposta é permitir que o gestor avance um veículo sem perder o estado do Pátio.

## Fundação visual

| Elemento | Decisão |
| --- | --- |
| Trilho lateral | Verde quase preto `#1b2825`, com marca e navegação persistentes. |
| Área de trabalho | Papel claro `#fafaf6` sobre tela cinza-esverdeada `#e9e9e4`. |
| Tipografia | System sans, títulos compactos, números de OS e placas com maior peso. |
| Etapas | Amarelo para espera, azul para serviço, violeta para concluído e verde para retirada. |
| Unidades operacionais | Faixas de OS, contadores de etapa e boxes. Evitar transformar tudo em cards de métrica. |

## Componentes de operação

- **Faixa de OS:** placa, número da OS, veículo, técnico e box. A seleção cria um contorno escuro, sem abrir uma nova página.
- **Painel da OS:** identidade do veículo, etapa, linha do tempo curta, cliente e fechamento financeiro. A ação principal sempre avança uma etapa ou confirma a entrega.
- **Agenda:** grade diária por profissional. Reservas, bloqueios e indisponibilidade recorrente usam a mesma escala de tempo, para mostrar a capacidade antes de confirmar um novo atendimento.
- **Aviso contextual:** ações ainda não conectadas mostram uma mensagem honesta de próximo fluxo; não simulam alteração de dados.
- **Modo de dados:** sem sessão ou configuração, a interface fica identificada como prévia demonstrativa. Com sessão e variáveis públicas do Supabase, ela consulta `automotive_patio` e chama as RPCs de transição/entrega.

## Responsividade

- Acima de 1220px: trilho, Pátio e painel da OS ficam visíveis lado a lado.
- Entre 980px e 1220px: o trilho reduz a ícones; o painel mantém largura fixa.
- Abaixo de 980px: o painel da OS abre como gaveta lateral.
- Abaixo de 680px: a navegação vira gaveta e o Pátio usa uma coluna, preservando as ações essenciais.

## Próximas superfícies

1. Autenticação, perfil e permissões da unidade.
2. Histórico de veículo, relatórios operacionais e fidelidade.
3. Estoque, contas a receber e comunicações automatizadas.

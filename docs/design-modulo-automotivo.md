# Design system — módulo Estética Automotiva

> **Escopo corrigido em 26/08/2026.** Este documento descreveu-se como o sistema de design do
> Bora Marcá, e nunca foi isso: descreve a **Prancheta de boxes**, que é o tema do módulo de
> Estética Automotiva. Enquanto ele se chamou "o sistema", toda tela nova herdou a premissa de
> uma categoria só — foi a causa raiz do produto abrir no Pátio.
>
> O sistema de design do produto, que serve as onze categorias, será registrado num `DESIGN.md`
> na raiz quando a reconstrução da experiência terminar — escrito a partir do que foi
> construído, não antes dele. A direção comprometida está em `PRODUCT.md` § Brand Commitments.
>
> O que está abaixo **continua válido para o Pátio, a OS, os boxes e os veículos**. A densidade
> de operação descrita aqui é boa e sobrevive; o que não sobrevive é ela definir a landing e as
> demais categorias.

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

## Superfície de conta

**Conta e acesso** mantém a mesma prancheta operacional: uma faixa de identidade da conta, a unidade ativa, a leitura das permissões e um formulário pequeno para o único dado que a própria pessoa pode alterar. Sem sessão, a mesma área oferece entrada real pelo Supabase; sem configuração, explica que a prévia não grava dados.

As permissões mostradas vêm dos papéis já protegidos por RLS e funções do banco. A tela não promete convite ou administração de membros até existir um fluxo seguro para criar e atribuir contas.

## Histórico, relatórios e fidelidade

**Dossiê de rodagem.** Veículos, OS, condição na entrada, entrega e valor ficam na mesma leitura. A lista de veículos é uma chave de consulta; o centro preserva a linha do tempo do carro e o painel final mostra o relacionamento com o cliente.

Os relatórios usam livro de movimentação, não cartões decorativos: recebido registrado, entregas, ticket e tempo de ciclo são cálculos que apontam para as próprias OS. A fidelidade é opt-in: proprietário ou gestor configura a regra; somente entregas posteriores à ativação concedem pontos, e o resgate é registrado transacionalmente.

## Próximas superfícies

1. Estoque, contas a receber e comunicações automatizadas.

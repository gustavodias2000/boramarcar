# O Barbershop é o núcleo da plataforma; a estética automotiva é um módulo

## Contexto

O Contexto Mestre define no §18 que a Barbearia é o primeiro segmento *porque o Barbershop já
existe*, e no §2 lista treze aspectos do projeto anterior que devem servir de referência.

A implementação seguiu o caminho oposto: onze de onze commits atenderam a estética automotiva,
a Fase 2 (Barbearia) ficou em 0% e `docs/foundation.md` afirmava que o repositório havia sido
iniciado "sem uma cópia do Barbershop" — afirmação falsa que sustentou a inversão.

A extração de domínio de 25/08/2026 (`docs/barbershop-extracao-dominio.md`) mediu o projeto
anterior: 30.111 linhas, 49 telas, 14 repositories, 420 testes. Mapeadas contra as sete
categorias-alvo, **praticamente todas as 49 telas são núcleo**. Específico de barbearia no
projeto inteiro: o nome "Barbeiro" nas telas e uma pasta de imagens padrão.

## Decisão

O domínio do Barbershop é o **núcleo** da plataforma. A estética automotiva é o **primeiro
módulo**, não o produto.

Reuso de código é próximo de zero — React Native não roda em Next.js e Firestore não vira SQL.
Reuso de domínio é de 80% ou mais: modelo, regras de negócio, decisões de privacidade e
problemas já resolvidos.

A Barbearia passa a ser a implementação de referência da qual as demais categorias derivam, e
sai da última posição do plano de execução.

## Motivo

O inventário de funcionalidades de um SaaS de serviços já existe e está validado em produção.
Construir a exceção antes da regra encarece cada categoria seguinte: cada tela automotiva nova
aumenta o preço de tornar o produto multi-categoria.

A leitura inversa também pesa: veículo, box, ordem de serviço, checklist e fotos antes/depois
são o único conjunto que não deriva do Barbershop — e hoje ocupam 100% da interface.

## Consequências

- Manicure, salão e maquiagem passam a custar configuração e rótulo, não desenvolvimento.
- `docs/barbershop-extracao-dominio.md` vira leitura obrigatória antes de modelar algo novo.
- A reestruturação do frontend em núcleo e módulos deixa de ser dívida técnica e passa a ser
  pré-requisito: com ~49 telas de núcleo a caminho, construí-las sem a fronteira seria
  catastrófico.
- Onze funcionalidades ausentes do Contexto Mestre entram no escopo do núcleo — entre elas
  agendamento recorrente, lista de espera, avaliação, vínculo cliente ↔ empresa e convite.
- O plano ganha uma ordem própria para o núcleo (§59 do Contexto Mestre), anterior à ordem
  automotiva do §53.
- Nada do módulo automotivo é descartado: o banco e a interface existentes continuam válidos
  como o primeiro módulo da plataforma.

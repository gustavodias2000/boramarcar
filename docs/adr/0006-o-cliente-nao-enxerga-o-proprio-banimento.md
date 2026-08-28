# O cliente não enxerga o próprio banimento

## Contexto

No Barbershop a lista de banidos começou dentro do documento `barbeiros/{uid}`, que é a
vitrine pública — qualquer usuário logado lia nome e e-mail de todos os clientes banidos
de todos os profissionais. A auditoria apontou, e a correção moveu a lista para uma
subcoleção privada, `barbeiros/{id}/banidos/{clienteUid}`.

As regras do Firestore mantiveram, de propósito, **uma** porta aberta para o titular: o
cliente podia fazer `get` do próprio documento. Isso servia à `AgendamentoScreen`, que
chamava `estaBanido` antes de gravar para mostrar uma mensagem melhor que um erro cru.

O modelo novo não reproduziu essa porta. `customer_bans` tem uma política só —
`customer_bans_select_scheduler` — e o cliente final não é agendador. `estaBanido`
devolve falso para ele, e a recusa vem do gatilho `reject_banned_customer`, que rejeita
o INSERT em `appointments`.

Isso ficou registrado como decisão em aberto no commit `c353b8a`.

## Decisão

**Fica fechado.** O cliente não lê `customer_bans`, nem a própria linha.

## Motivo

**O motivo do banimento é texto livre que uma empresa escreve sobre uma pessoa.** É o
campo do schema com maior chance de conter algo que ninguém quer ver vazado — julgamento,
desabafo, acusação. A coluna já está atrás de política restrita pela mesma razão que
`scheduling_block_notes` e `customer_contacts` estão. Abrir a linha para o titular abriria
o motivo junto, e separar os dois exigiria política por coluna para ganhar pouco.

**Avisar "você está banido daqui" é decisão da empresa, não do sistema.** Um sistema que
notifica sozinho tira da empresa uma conversa que às vezes ela quer ter pessoalmente — e
às vezes não quer ter. O produto não deve tomar essa decisão por ela.

**A defesa não depende disso.** No Barbershop a recusa dependia de a tela chamar
`estaBanido` antes de gravar, e tela se contorna: quem chamasse a API direto agendava. Aqui
a recusa está no gatilho, então ela vale venha de onde vier. A leitura pelo cliente nunca
foi a proteção — era só a mensagem.

## Consequência que aceitamos

Quem está banido tenta agendar e recebe a mensagem do banco —
*"Este cliente está impedido de agendar nesta empresa."* — sem saber que está banido nem
por quê. É uma experiência pior que a do Barbershop nesse ponto específico, e é o preço
consciente de não vazar o motivo e de não notificar em nome da empresa.

Se um dia isso precisar melhorar, o caminho **não** é abrir a política: é a empresa poder
escrever uma mensagem voltada ao cliente, separada do motivo interno, e o gatilho devolver
essa mensagem. Aí o que o cliente lê é o que a empresa escolheu dizer.

## Alternativas descartadas

**Reproduzir a porta do Firestore** — política de SELECT permitindo
`customer_id = current_customer_id(tenant_id)`. Descartada porque expõe `reason` junto.

**Uma RPC `am_i_banned()` devolvendo só booleano.** Tecnicamente resolve o vazamento do
motivo, e foi a alternativa mais séria. Descartada porque não resolve a segunda razão: a
notificação continuaria sendo do sistema, e não da empresa. Se a decisão de produto mudar,
esta é a implementação a usar.

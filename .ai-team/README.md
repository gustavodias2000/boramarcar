# AI-Team do Bora Marcá

Equipe de dez especialistas de IA para o Bora Marcá. Derivada da equipe do Barbershop e
**re-escopada** para este projeto: multi-categoria, Supabase/PostgreSQL e Next.js.

## Diferença em relação ao Barbershop

No Barbershop, `.ai-team` era espelho de uma pasta externa sincronizada por script. Aqui **esta
pasta é a fonte de verdade**, versionada com o código. O script apenas gera os subagentes do
Claude Code a partir dela.

O motivo está em `context/DECISOES.md`: os agentes foram re-escopados para este projeto, e um
espelho externo genérico voltaria a divergir da realidade.

## Estrutura

- `agents/` — os dez especialistas
- `context/` — contexto, regras, decisões e roadmap compartilhados
- `prompts/` — fluxos operacionais reutilizáveis
- `templates/` — modelos de handoff
- `generate-claude-agents.ps1` — gera `../.claude/agents`

## Os dez especialistas

| # | Agente | Cuida de |
| --- | --- | --- |
| 01 | Arquiteto | fronteira núcleo × módulo, riscos, planos |
| 02 | Product Owner | backlog multi-categoria, critérios de aceite |
| 03 | QA | testes, regressões, isolamento entre tenants |
| 04 | Segurança | RLS, privilégios, autorização, LGPD |
| 05 | Implementador | escrever o código aprovado |
| 06 | **Supabase** | schema, RLS, funções, migrations, Storage |
| 07 | Performance | gargalos medidos |
| 08 | UI/UX | jornada, interface, acessibilidade, labels |
| 09 | Coordenador | roteamento e handoff |
| 10 | **Segmentos** | o que é núcleo e o que é de categoria |

Mudanças em relação aos nove herdados: **06 deixou de ser Firebase** e **10 é novo**.

O 10 existe porque nenhum dos nove cuidava da fronteira núcleo × módulo — e essa ausência é a
causa raiz do maior desvio já encontrado no projeto: o catálogo de segmentos foi escrito e
nunca consumido.

## Fluxo recomendado

1. Comece pelo `09 - Coordenador` quando a tarefa ainda não estiver organizada.
2. Passe pelo `10 - Segmentos` sempre que a demanda puder servir a mais de uma categoria.
3. Use `templates/HANDOFF.md` para passar resultado entre especialistas.
4. Registre decisão relevante em `context/DECISOES.md`.

O roteiro completo está em `prompts/01-fluxo-de-feature-boramarca.md`.

## Regenerar os subagentes

Depois de editar qualquer arquivo em `agents/`:

```powershell
powershell -ExecutionPolicy Bypass -File .\.ai-team\generate-claude-agents.ps1
```

Os subagentes de `../.claude/agents` aparecem no seletor do Claude Code e da extensão do VS Code.

## Observação

Os arquivos desta pasta são operacionais. Não alteram o aplicativo e não substituem o
`CONTEXTO_MESTRE_BORA_MARCA.md`, que continua sendo a fonte funcional e arquitetural do produto.

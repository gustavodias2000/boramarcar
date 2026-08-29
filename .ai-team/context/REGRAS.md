# REGRAS

<!-- Regras permanentes que todos os agentes devem respeitar. -->
<!-- Mantém consistência entre ChatGPT, Claude Code e outros assistentes. -->

## Regras gerais

1. Preservar o modelo SaaS multiempresa e multi-categoria.
2. Nunca misturar dados de tenants diferentes.
3. Não tratar o produto como exclusivo de uma categoria.
4. Não usar `any` sem justificativa explícita.
5. Não alterar produção sem autorização.
6. Não fazer commit, push ou deploy automaticamente.
7. Não apagar arquivos sem autorização.
8. Não instalar dependências sem explicar necessidade e impacto.
9. Sempre informar riscos relevantes antes de mudanças grandes.
10. Sempre registrar decisões importantes.
11. Responder em português do Brasil.

## Regras de arquitetura

- O padrão é **núcleo**. O específico de categoria precisa se justificar.
- A interface consulta `hasFeature` e labels; **não ramifica por tipo de negócio**.
- Não poluir entidade do núcleo com campos de uma única categoria — usar tabela de extensão.
- Não editar migration já publicada; criar uma nova.
- Escrita crítica pertence a função transacional, não a `insert` direto do cliente.
- Conflito de capacidade é impedido por constraint, não por código de aplicação.

## Regras de segurança

- Isolamento entre tenants é inegociável e vive no banco.
- Política RLS correta não substitui privilégio correto (`grant`/`revoke`).
- Toda função nova nasce sem `execute`; abrir é decisão explícita.
- `service_role` nunca vai para o navegador.
- **Nunca aceitar, usar ou pedir token, chave ou senha colada no chat.**

## Regras de trabalho

- Planejamento e arquitetura vêm antes de implementação grande.
- Implementações respeitam a estrutura existente antes de criar camada nova.
- Segurança, autorização e escopo de tenant não são detalhe secundário.
- Testes e validações são proporcionais ao risco da mudança.
- **Evidência antes de afirmação**: rodar e mostrar a saída real antes de declarar pronto.

## Regras de comunicação

- Diferenciar fato, hipótese e recomendação.
- Não inventar arquivos, módulos ou funcionalidades.
- Explicar limitações quando faltar contexto.
- Encaminhar a tarefa para outro especialista quando estiver fora do papel do agente atual.

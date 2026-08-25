# Bora Marcá — Web

Interface operacional do módulo de Estética Automotiva. O **Pátio** acompanha as OS por etapa, abre seus detalhes e avança o atendimento. A **Entrada rápida** consulta a placa e abre uma OS para atendimento sem agendamento.

## Executar localmente

```powershell
cd D:\Claude\BoraMarcar\web
npm install
npm run dev
```

Abra `http://localhost:3000` no navegador.

Sem configuração, a aplicação abre em **prévia demonstrativa**. Ela permite conhecer o fluxo sem gravar qualquer dado.

## Conectar ao Supabase

1. Copie `.env.example` para `.env.local`.
2. No dashboard do projeto Supabase, abra **Connect** e copie a URL e a chave pública/publicável.
3. Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica
```

Após existir uma sessão autenticada, o Pátio consulta a view `automotive_patio`. Os botões de avanço chamam `transition_automotive_work_order` e `deliver_automotive_work_order`; a Entrada rápida chama `open_automotive_walk_in_work_order`. Na OS completa, os itens, recebimentos e fotos privadas usam as respectivas funções transacionais e o bucket privado `automotive-work-order-media`. Todas as operações passam pelas políticas e funções transacionais do banco.

> Não use a chave `service_role` no navegador nem em qualquer variável `NEXT_PUBLIC_*`.

## Verificações

```powershell
npm run lint
npm run build
```

O desenho, os componentes e as regras de responsividade estão documentados em [`../DESIGN.md`](../DESIGN.md).

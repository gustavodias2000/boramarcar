-- As rotas de operação também são endereços reservados.
--
-- Com a empresa na raiz (`boramarca.com/barbearia-do-ze/agenda`), o nome dela divide
-- espaço com TODA rota do produto — inclusive as de operação, que passaram a existir
-- quando as telas de Início, Clientes, Serviços e Equipe foram portadas do Barbershop.
--
-- Uma empresa chamada "Agenda" ou "Clientes" quebraria a rota correspondente. Reservar
-- custa uma linha; descobrir depois custa migração de dados e link quebrado.

create or replace function public.endereco_reservado(p_slug text)
returns boolean
language sql
immutable
strict
as $$
  select lower(trim(p_slug)) in (
    -- superfície pública e conta
    'e', 'entrar', 'sair', 'cadastro', 'comecar', 'inicio', 'conta', 'privacidade',
    'perfil', 'segmento',
    -- rotas de operação, portadas do Barbershop
    'inicio-empresa', 'agenda', 'clientes', 'servicos', 'equipe', 'relatorios',
    'patio', 'veiculos', 'boxes', 'os',
    -- o que provavelmente vai existir
    'precos', 'planos', 'assinatura', 'cobranca', 'faturas', 'ajuda', 'suporte',
    'contato', 'sobre', 'termos', 'blog', 'novidades', 'status', 'docs', 'painel',
    'config', 'configuracoes', 'notificacoes', 'buscar', 'explorar', 'convite',
    'onboarding',
    -- técnico e reservado por convenção da web
    'api', 'admin', 'app', 'auth', 'login', 'logout', 'static', 'assets', 'public',
    '_next', 'favicon', 'robots', 'sitemap', 'well-known', 'novo', 'nova'
  );
$$;

-- Adiciona a categoria Maquiagem ao catálogo de segmentos.
--
-- O Contexto Mestre listava dez categorias e o enum nasceu com as mesmas dez.
-- Maquiagem faltava nos dois. Esta migration fecha a lacuna no banco; o catálogo
-- TypeScript (src/config/segments.ts) e o documento foram emendados junto.
--
-- `ADD VALUE` é aditivo e não reescreve nenhuma linha existente. O valor não é
-- usado nesta mesma transação, então não há restrição de uso imediato.

alter type public.business_type add value if not exists 'makeup';

comment on type public.business_type is
  'Categorias de negócio atendidas pela plataforma. Adicionar uma categoria é aditivo: '
  'nunca remova nem renomeie um valor já publicado, porque businesses.business_type o referencia.';

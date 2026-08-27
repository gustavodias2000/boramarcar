/**
 * O catálogo que o empresário vê ao escolher o segmento.
 *
 * É deliberadamente SEPARADO de `BUSINESS_TYPES`, e a separação é a ideia inteira:
 *
 *   `BUSINESS_TYPES` são os valores que o BANCO aceita — um enum do PostgreSQL, com
 *   catálogo de serviços semente e políticas por trás. Acrescentar um custa migration.
 *
 *   `CATALOGO` é o que a TELA oferece. Uma categoria pode aparecer aqui como "Em breve"
 *   sem existir no banco, porque ninguém vai conseguir escolhê-la.
 *
 * Sem essa separação, prometer "Dentista — em breve" exigiria criar o valor no enum, o
 * catálogo de serviços dele e as políticas — trabalho real para uma categoria que não
 * abre. Com ela, prometer custa uma linha, e a promessa não vira dívida no schema.
 *
 * A REGRA: `disponivel: true` exige `businessType`. Uma categoria disponível sem valor
 * de banco seria um cartão que leva a lugar nenhum, e o teste afirma que não existe.
 */

import type { BusinessType } from "./index";

export interface CategoriaDoCatalogo {
  /** Identificador estável da vitrine. Vira o segmento da URL quando a categoria abre. */
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  /** Só existe quando a categoria realmente abre. `undefined` é "Em breve". */
  readonly businessType?: BusinessType;
  readonly disponivel: boolean;
}

export const CATALOGO: readonly CategoriaDoCatalogo[] = [
  {
    id: "barbeiro",
    nome: "Barbeiro",
    descricao: "Barbearias e profissionais barbeiros",
    businessType: "barbershop",
    disponivel: true,
  },
  {
    id: "salao-de-beleza",
    nome: "Salão de Beleza",
    descricao: "Cabelo, coloração e tratamentos",
    disponivel: false,
  },
  {
    id: "massagista",
    nome: "Massagista",
    descricao: "Massagem terapêutica e relaxante",
    disponivel: false,
  },
  {
    id: "personal-trainer",
    nome: "Personal Trainer",
    descricao: "Treino individual e acompanhamento",
    disponivel: false,
  },
  {
    id: "manicure",
    nome: "Manicure",
    descricao: "Unhas, esmaltação e alongamento",
    disponivel: false,
  },
  {
    id: "pedicure",
    nome: "Pedicure",
    descricao: "Cuidados com os pés",
    disponivel: false,
  },
  {
    id: "tatuador",
    nome: "Tatuador",
    descricao: "Estúdio de tatuagem e piercing",
    disponivel: false,
  },
  {
    id: "estetica",
    nome: "Estética",
    descricao: "Procedimentos estéticos e faciais",
    disponivel: false,
  },
  {
    /**
     * MARCADA COMO "EM BREVE" POR DECISÃO DE PRODUTO, NÃO POR FALTA DE CÓDIGO.
     *
     * É hoje a categoria mais completa do sistema — pátio, ordem de serviço, boxes,
     * veículos, mídia e pagamento, tudo funcionando e coberto por teste. O `business_type`
     * `automotive_aesthetics` existe no banco e continua operando para quem já tem
     * empresa aberta nele.
     *
     * O que muda é só a vitrine: o produto escolheu abrir por Barbeiro, e oferecer as
     * duas ao mesmo tempo diluiria essa escolha. Reabrir custa trocar este `false`.
     */
    id: "estetica-automotiva",
    nome: "Estética Automotiva",
    descricao: "Lavagem, polimento e vitrificação",
    businessType: "automotive_aesthetics",
    disponivel: false,
  },
  {
    id: "dentista",
    nome: "Dentista",
    descricao: "Consultório odontológico",
    disponivel: false,
  },
];

export function categoriaPorId(id: string): CategoriaDoCatalogo | undefined {
  return CATALOGO.find((categoria) => categoria.id === id);
}

/** As que realmente abrem. Hoje é uma só, e isso é honesto em vez de constrangedor. */
export function categoriasDisponiveis(): readonly CategoriaDoCatalogo[] {
  return CATALOGO.filter((categoria) => categoria.disponivel);
}

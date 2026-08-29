"use client";

import {
  CalendarDays,
  Car,
  ClipboardList,
  Grid2x2,
  Scissors,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useId, useState } from "react";

import {
  BUSINESS_TYPES,
  getSegmentConfig,
  navegacaoDoSegmento,
  type BusinessType,
  type FeatureKey,
} from "@boramarca/core";

/**
 * A prova, não o enfeite.
 *
 * Esta é a única coisa da landing que um concorrente não copia de uma captura de tela,
 * porque não é arte: é o `SEGMENT_CONFIGS` do núcleo — o mesmo objeto que a aplicação
 * autenticada consulta — virando argumento de venda. Trocar a categoria aqui reescreve
 * os rótulos desta página exatamente como reescreve os da operação.
 *
 * Se alguém acrescentar uma categoria ao catálogo, ela aparece aqui sem ninguém editar
 * este arquivo. Se o rótulo de "Barbeiro" mudar, muda aqui junto.
 */

const ICONES: Record<string, typeof CalendarDays> = {
  patio: Grid2x2,
  agenda: CalendarDays,
  clientes: Users,
  servicos: Scissors,
  equipe: Users,
  veiculos: Car,
  boxes: Wrench,
  relatorios: Wallet,
};

/** Uma demonstração precisa parecer real sem afirmar nada sobre ninguém. */
const HORARIOS = [
  { hora: "09:00", quem: "Marina A." },
  { hora: "09:45", quem: "Rogério P." },
  { hora: "10:30", quem: null },
  { hora: "11:15", quem: "Denise C." },
];

export function SegmentSwitch() {
  const [tipo, setTipo] = useState<BusinessType>("barbershop");
  const rotuloId = useId();

  const config = getSegmentConfig(tipo);
  const navegacao = navegacaoDoSegmento(tipo);

  return (
    <div className="ss">
      <fieldset className="ss-picker">
        <legend className="ss-legend">Escolha o seu ramo e veja a página mudar</legend>

        <div className="ss-options" role="radiogroup" aria-labelledby={rotuloId}>
          <span id={rotuloId} className="sr-only">
            Categoria do negócio
          </span>
          {BUSINESS_TYPES.map((valor) => {
            const item = getSegmentConfig(valor);
            const ativo = valor === tipo;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                className={ativo ? "ss-option ss-option-on" : "ss-option"}
                onClick={() => setTipo(valor)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="ss-proof" aria-live="polite">
        <div className="ss-terms">
          <p className="ss-terms-title">Numa {config.label.toLowerCase()}, o sistema chama de:</p>
          <dl className="ss-terms-list">
            <div>
              <dt>Quem atende</dt>
              <dd>{config.labels.professional}</dd>
            </div>
            <div>
              <dt>Quem é atendido</dt>
              <dd>{config.labels.customer}</dd>
            </div>
            <div>
              <dt>O compromisso</dt>
              <dd>{config.labels.appointment}</dd>
            </div>
            {config.labels.vehicle && (
              <div>
                <dt>O que recebe o serviço</dt>
                <dd>{config.labels.vehicle}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="ss-screens">
          <p className="ss-terms-title">E abre com estas telas:</p>
          <ul className="ss-screen-list">
            {navegacao.map((item) => {
              const Icone = ICONES[item.caminho] ?? ClipboardList;
              return (
                <li key={item.caminho}>
                  <Icone size={15} aria-hidden />
                  {item.rotulo}
                </li>
              );
            })}
          </ul>
          <p className="ss-note">
            {temFeature(navegacao, "workOrders")
              ? "Pátio, boxes e ordem de serviço só aparecem em estética automotiva."
              : `Sem pátio, sem box, sem ordem de serviço — uma ${config.label.toLowerCase()} não precisa disso.`}
          </p>
        </div>
      </div>

      <figure className="ss-demo">
        <figcaption className="ss-demo-cap">
          <span className="ss-tag">demonstração</span>
          Agenda de terça — dados fabricados
        </figcaption>
        <ul className="ss-agenda">
          {HORARIOS.map((linha) => (
            <li key={linha.hora} className={linha.quem ? undefined : "ss-free"}>
              <span className="ss-hora">{linha.hora}</span>
              {linha.quem ? (
                <>
                  <span className="ss-quem">{linha.quem}</span>
                  <span className="ss-papel">{config.labels.professional}</span>
                </>
              ) : (
                <span className="ss-vago">horário livre</span>
              )}
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}

function temFeature(
  navegacao: readonly { readonly feature: FeatureKey }[],
  chave: FeatureKey,
): boolean {
  return navegacao.some((item) => item.feature === chave);
}

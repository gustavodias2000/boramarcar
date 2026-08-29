import { ArrowRight, Ban, Building2, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SegmentSwitch } from "@/components/landing/segment-switch";
import { MARCA } from "@/core/marca";
import { BUSINESS_TYPES } from "@boramarca/core";

/**
 * A porta do produto.
 *
 * Até 26/08/2026 esta rota era `redirect("/patio")` — sete linhas que mandavam todo
 * visitante para a operação de estética automotiva, uma das onze categorias.
 *
 * REGRA DESTA PÁGINA: nada aqui pode afirmar o que o repositório não prova. Não há
 * cliente, faturamento, depoimento, nota nem preço — e por isso nenhum aparece. O que
 * ela mostra é o sistema fazendo o que faz, que é mais forte e é verdade.
 */
export default function Landing() {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1>Um sistema que fala a língua do seu ramo.</h1>
          <p className="lp-lead">
            Agenda, clientes, serviços, equipe e caixa para {BUSINESS_TYPES.length} categorias de
            negócio de serviço. A categoria que você escolhe muda os nomes, as telas e o catálogo
            inicial — não é o mesmo sistema genérico com outra logomarca.
          </p>
          <div className="lp-actions">
            <Link href="/comecar" className="lp-primary">
              Começar agora
              <ArrowRight size={17} aria-hidden />
            </Link>
            <Link href="/entrar" className="lp-secondary">
              Já tenho conta
            </Link>
          </div>
        </div>

        <SegmentSwitch />
      </section>

      <section className="lp-band">
        <h2>Duas coisas que o banco de dados garante, não a tela.</h2>
        <p className="lp-band-lead">
          A diferença importa: validação de tela se contorna recarregando a página. Estas duas são
          impostas pelo PostgreSQL e valem para qualquer caminho — site, aplicativo ou integração
          futura.
        </p>

        <div className="lp-pair">
          <article className="lp-guarantee">
            <Ban size={20} aria-hidden className="lp-guarantee-icon" />
            <h3>Ninguém é prometido duas vezes</h3>
            <p>
              Dois atendimentos não ocupam o mesmo profissional no mesmo horário. Quando a recepção
              tenta encaixar por cima, o segundo é recusado no banco — não fica aceito para ser
              descoberto depois, com o cliente no balcão.
            </p>
            <div
              className="lp-demo"
              role="img"
              aria-label="Demonstração: o segundo agendamento no mesmo horário é recusado"
            >
              <span className="lp-tag">demonstração</span>
              <div className="lp-slot lp-slot-ok">
                <span>14:00</span> Corte · Ricardo
              </div>
              <div className="lp-slot lp-slot-no">
                <span>14:00</span> Barba · Ricardo
                <em>recusado — horário ocupado</em>
              </div>
            </div>
          </article>

          <article className="lp-guarantee">
            <Lock size={20} aria-hidden className="lp-guarantee-icon" />
            <h3>O dado de uma empresa é inalcançável por outra</h3>
            <p>
              Cada empresa é isolada por política no próprio banco, não por filtro na consulta. Um
              erro de programação numa tela não vaza a agenda do vizinho, porque a tela nunca teve
              acesso para vazar.
            </p>
            <p className="lp-fine">
              O mesmo vale dentro da empresa: quem trabalha no atendimento não alcança o documento e
              o telefone dos clientes, e quem opera o caixa não vê dado pessoal.
            </p>
          </article>
        </div>
      </section>

      <section className="lp-day">
        <h2>No primeiro minuto, a empresa já agenda.</h2>
        <div className="lp-steps">
          <div className="lp-step">
            <h3>Você escolhe a categoria</h3>
            <p>
              E o sistema já sabe que numa barbearia quem atende é barbeiro, e numa estética
              automotiva o serviço acontece sobre um veículo, num box.
            </p>
          </div>
          <div className="lp-step">
            <h3>O catálogo nasce pronto</h3>
            <p>
              Os serviços mais comuns do ramo já vêm cadastrados, com duração sugerida. Você ajusta
              o preço, que é a única coisa que ninguém pode adivinhar por você.
            </p>
          </div>
          <div className="lp-step">
            <h3>Você já é o primeiro profissional</h3>
            <p>
              Com horário de segunda a sábado, das 9h às 18h, pronto para mudar. Sem isso a agenda
              nasceria recusando tudo — e é o tipo de detalhe que só aparece quando alguém tenta
              usar de verdade.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-band lp-band-quiet">
        <h2>Dado de cliente tratado como dado de cliente.</h2>
        <div className="lp-privacy">
          <div>
            <ShieldCheck size={18} aria-hidden />
            <h3>Separado de quem não precisa</h3>
            <p>
              Documento, telefone, e-mail e aniversário ficam fora do cadastro que a operação
              enxerga. Quem atende vê o nome, que é o que o trabalho exige.
            </p>
          </div>
          <div>
            <ShieldCheck size={18} aria-hidden />
            <h3>Consentimento por finalidade</h3>
            <p>
              Aceitar receber a confirmação do horário não é aceitar receber promoção. E silêncio
              nunca conta como autorização.
            </p>
          </div>
          <div>
            <ShieldCheck size={18} aria-hidden />
            <h3>Esquecimento sem perder o histórico fiscal</h3>
            <p>
              Quando o cliente pede para ser esquecido, o dado pessoal some e o registro do que foi
              vendido permanece — porque a lei exige as duas coisas ao mesmo tempo.
            </p>
          </div>
          <div>
            <ShieldCheck size={18} aria-hidden />
            <h3>Aniversário sem o ano</h3>
            <p>
              Dá para lembrar do aniversário de quem você atende sem guardar a idade de ninguém.
              Guardar menos é a primeira defesa.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-honest">
        <h2>O que ainda não existe.</h2>
        <p>
          O {MARCA.nome} está em construção e não tem cliente em operação. Preferimos dizer isso a
          publicar número inventado — se você encontrar depoimento, nota ou faturamento em página de
          produto novo, desconfie.
        </p>
        <ul>
          <li>
            <strong>Preço e planos.</strong> Ainda não foram definidos. Não há teste grátis porque
            não há o que testar contra.
          </li>
          <li>
            <strong>Aplicativo de celular.</strong> Planejado, com o núcleo já preparado para ele.
            Não publicado.
          </li>
          <li>
            <strong>Envio de mensagem e lembrete.</strong> Em construção.
          </li>
          <li>
            <strong>Área do cliente final.</strong> O vínculo já existe no sistema; a tela não.
          </li>
        </ul>
      </section>

      <section className="lp-close">
        <Building2 size={22} aria-hidden />
        <h2>Abra a sua empresa e veja com os seus serviços.</h2>
        <p>Escolher a categoria leva menos de um minuto e não pede cartão.</p>
        <Link href="/comecar" className="lp-primary lp-primary-lg">
          Começar agora
          <ArrowRight size={18} aria-hidden />
        </Link>
      </section>
    </>
  );
}

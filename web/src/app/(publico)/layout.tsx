import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A superfície pública. Sem sessão, sem empresa ativa, sem `TenantProvider`.
 *
 * Ela existe fisicamente separada de `(operacao)` para que a fronteira seja verificável
 * e não uma promessa: nada aqui importa componente do módulo automotivo, e o grupo de
 * rota é o que torna isso visível numa revisão.
 */
export default function PublicoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pub">
      <header className="pub-top">
        <Link href="/" className="pub-brand" aria-label="Bora Marcá, página inicial">
          {/* O nome é provisório e vive num ponto só — trocar é uma linha. */}
          <span className="pub-brand-mark" aria-hidden />
          <span className="pub-brand-name">
            bora <strong>marcá</strong>
          </span>
        </Link>

        <nav className="pub-nav">
          <Link href="/entrar" className="pub-link">
            Entrar
          </Link>
          <Link href="/comecar" className="pub-cta">
            Começar agora
          </Link>
        </nav>
      </header>

      <main className="pub-main">{children}</main>

      <footer className="pub-foot">
        <p className="pub-foot-name">
          bora <strong>marcá</strong>
        </p>
        <p className="pub-foot-note">Agenda e gestão para negócios de serviço. Feito no Brasil.</p>
      </footer>
    </div>
  );
}

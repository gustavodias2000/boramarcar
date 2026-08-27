"use client";

import { CircleAlert, Loader2, Scissors, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@boramarca/core";

/**
 * Serviços — portado da `ConfigServicosScreen` do Barbershop.
 *
 * É a tela que faltava para a categoria existir como produto. `create_business_with_owner`
 * semeia o catálogo da categoria com **preço zero**, de propósito: duração dá para
 * sugerir, preço ninguém adivinha pelo dono. Sem esta tela, o zero ficava lá — e preço
 * zero quebra recebimento, comissão e relatório na origem, porque é o número que o
 * gatilho de comissão multiplica.
 *
 * Serviço sem preço aparece MARCADO, não escondido. Esconder faria a pessoa achar que
 * está tudo certo; marcar diz o que falta fazer.
 *
 * Escrita direta em `services`, sem RPC: `services_manage_administrator` já cobre, e não
 * há invariante transacional aqui — mudar um preço não precisa coordenar com nada.
 */

interface Servico {
  id: string;
  name: string;
  duration_minutes: number;
  base_price: number;
  active: boolean;
}

export function CoreServicos() {
  const { tenantId, mode } = useTenant();
  const segment = useSegment();
  const supabase = createClient();

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const aoVivo = mode === "live";

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!aoVivo || !tenantId) {
        setCarregando(false);
        return;
      }

      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes, base_price, active")
        .eq("tenant_id", tenantId)
        .order("name");

      if (cancelado) return;

      if (error) {
        setErro("Não foi possível carregar o catálogo.");
      } else {
        setServicos((data ?? []) as Servico[]);
      }
      setCarregando(false);
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [supabase, tenantId, aoVivo]);

  async function salvarPreco(servico: Servico) {
    const bruto = (rascunho[servico.id] ?? "").replace(/\./g, "").replace(",", ".").trim();
    const valor = Number(bruto);

    if (bruto === "" || !Number.isFinite(valor) || valor < 0) {
      setErro("Informe um valor válido, como 45 ou 45,50.");
      return;
    }

    setErro(null);
    setSalvandoId(servico.id);

    const { error } = await supabase
      .from("services")
      .update({ base_price: valor })
      .eq("id", servico.id);

    setSalvandoId(null);

    if (error) {
      setErro("Não foi possível salvar. Só proprietário e gerência alteram o catálogo.");
      return;
    }

    setServicos((atual) =>
      atual.map((item) => (item.id === servico.id ? { ...item, base_price: valor } : item)),
    );
    setRascunho((atual) => {
      const proximo = { ...atual };
      delete proximo[servico.id];
      return proximo;
    });
  }

  const semPreco = servicos.filter((servico) => Number(servico.base_price) === 0).length;

  return (
    <section className="lista">
      <header className="lista-topo">
        <div>
          <h1>Serviços</h1>
          <p>O que a sua {segment.label.toLowerCase()} oferece, quanto dura e quanto custa.</p>
        </div>
      </header>

      {erro && (
        <p className="lista-erro" role="alert">
          <CircleAlert size={15} />
          <span>{erro}</span>
        </p>
      )}

      {aoVivo && semPreco > 0 && (
        <p className="lista-aviso" role="status">
          <TriangleAlert size={15} />
          <span>
            {semPreco === 1
              ? "Um serviço ainda está sem preço."
              : `${semPreco} serviços ainda estão sem preço.`}{" "}
            Enquanto estiverem em zero, o recebimento e a comissão saem errados.
          </span>
        </p>
      )}

      {carregando ? (
        <p className="lista-estado">
          <Loader2 className="spin" size={16} /> Carregando…
        </p>
      ) : !aoVivo ? (
        <p className="lista-estado">Entre com a sua conta para ver o catálogo da sua empresa.</p>
      ) : servicos.length === 0 ? (
        <p className="lista-estado">Nenhum serviço cadastrado.</p>
      ) : (
        <ul className="lista-itens lista-servicos">
          {servicos.map((servico) => {
            const zerado = Number(servico.base_price) === 0;
            const emEdicao = rascunho[servico.id] !== undefined;

            return (
              <li key={servico.id} className={servico.active ? undefined : "lista-inativo"}>
                <span className="lista-avatar" aria-hidden>
                  <Scissors size={16} />
                </span>
                <span className="lista-nome">
                  {servico.name}
                  {zerado && <em className="lista-alerta">sem preço</em>}
                </span>
                <span className="lista-duracao">{servico.duration_minutes} min</span>

                <span className="lista-preco">
                  <input
                    value={emEdicao ? rascunho[servico.id] : ""}
                    onChange={(e) =>
                      setRascunho((atual) => ({ ...atual, [servico.id]: e.target.value }))
                    }
                    placeholder={zerado ? "0,00" : formatCurrency(Number(servico.base_price))}
                    inputMode="decimal"
                    aria-label={`Preço de ${servico.name}`}
                  />
                  {emEdicao && (
                    <button
                      type="button"
                      onClick={() => void salvarPreco(servico)}
                      disabled={salvandoId === servico.id}
                    >
                      {salvandoId === servico.id ? (
                        <Loader2 className="spin" size={14} />
                      ) : (
                        "Salvar"
                      )}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

"use client";

import { Ban, CircleAlert, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient } from "@/lib/supabase/client";
import {
  banCustomer,
  can,
  formatBirthdayMd,
  listCustomerBans,
  saveCustomerContact,
  toBirthdayMd,
  unbanCustomer,
  type BusinessRole,
} from "@boramarca/core";

/**
 * Clientes — portado da `ClientesScreen` do Barbershop.
 *
 * O que veio de lá, e é o motivo de a tela existir assim: lista com busca, "Novo
 * cliente", e um formulário de três campos — nome, telefone e aniversário no formato
 * `DD/MM`, **sem ano**. Aquele `placeholder="DD/MM"` não era economia de espaço: é
 * minimização de dado pessoal, e a decisão já está no nosso schema como `birthday_md`,
 * com CHECK que recusa o formato com ano.
 *
 * O que NÃO veio: "Importar contatos". Depende da agenda telefônica do aparelho
 * (`react-native-contacts`) e não tem equivalente na web. Fica para o aplicativo, e não
 * vira botão que não funciona.
 *
 * O CONTATO SE ESCREVE POR RPC. `customer_contacts` teve INSERT e UPDATE diretos
 * revogados na `20260826000200`, porque a escrita direta contornava a guarda que impede
 * reidentificar um cliente anonimizado.
 */

interface Cliente {
  id: string;
  name: string;
  active: boolean;
}

interface Contato {
  whatsapp: string | null;
  phone: string | null;
  birthday_md: string | null;
}

export function CoreClientes() {
  const { tenantId, mode, membershipRole } = useTenant();
  const segment = useSegment();
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contatos, setContatos] = useState<Record<string, Contato>>({});
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aniversario, setAniversario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [banidos, setBanidos] = useState<Set<string>>(new Set());
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const aoVivo = mode === "live";
  const podeBanir = can(membershipRole as BusinessRole | null, "anonymizeCustomers");

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!aoVivo || !tenantId) {
        setCarregando(false);
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, active")
        .eq("tenant_id", tenantId)
        .order("name");

      if (cancelado) return;

      if (error) {
        setErro("Não foi possível carregar a lista.");
        setCarregando(false);
        return;
      }

      const lista = (data ?? []) as Cliente[];
      setClientes(lista);

      // Quem não tem permissão de ver contato recebe ausência, não erro — a política
      // filtra a linha em vez de recusar a consulta, e a tela funciona mesmo assim.
      const { data: dadosContato } = await supabase
        .from("customer_contacts")
        .select("customer_id, whatsapp, phone, birthday_md")
        .eq("tenant_id", tenantId);

      if (cancelado) return;

      const mapa: Record<string, Contato> = {};
      for (const linha of (dadosContato ?? []) as (Contato & { customer_id: string })[]) {
        mapa[linha.customer_id] = linha;
      }
      setContatos(mapa);

      // Banido é a empresa recusando a pessoa; inativo é o cadastro fora de circulação.
      // São coisas diferentes e aparecem diferentes.
      const { data: bans } = await listCustomerBans(supabase, tenantId);
      if (cancelado) return;
      setBanidos(new Set((bans ?? []).map((ban) => ban.customer_id)));

      setCarregando(false);
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [supabase, tenantId, aoVivo]);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2) {
      setErro("Informe o nome do cliente.");
      return;
    }

    if (!tenantId) return;
    setSalvando(true);

    const { data: criado, error } = await supabase
      .from("customers")
      .insert({ tenant_id: tenantId, name: nomeLimpo })
      .select("id, name, active")
      .single();

    if (error || !criado) {
      setErro("Não foi possível salvar. Confira se você tem permissão para cadastrar.");
      setSalvando(false);
      return;
    }

    const aniversarioMd = toBirthdayMd(aniversario);

    if (telefone.trim() || aniversarioMd) {
      const { error: erroContato } = await saveCustomerContact(supabase, {
        customerId: criado.id,
        whatsapp: telefone.trim() || null,
        birthdayMd: aniversarioMd,
      });

      // O cliente já existe; o contato é o que falhou. Dizer qual das duas coisas deu
      // errado importa — senão a pessoa cadastra de novo e cria um duplicado.
      if (erroContato) {
        setErro("O cliente foi salvo, mas o contato não. Edite para tentar de novo.");
      } else {
        setContatos((atual) => ({
          ...atual,
          [criado.id]: {
            whatsapp: telefone.trim() || null,
            phone: null,
            birthday_md: aniversarioMd,
          },
        }));
      }
    }

    setClientes((atual) =>
      [...atual, criado as Cliente].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
    setNome("");
    setTelefone("");
    setAniversario("");
    setFormAberto(false);
    setSalvando(false);
  }

  async function alternarBanimento(cliente: Cliente) {
    setErro(null);
    setOcupadoId(cliente.id);

    const banido = banidos.has(cliente.id);
    const { error } = banido
      ? await unbanCustomer(supabase, cliente.id)
      : await banCustomer(supabase, cliente.id);

    setOcupadoId(null);

    if (error) {
      setErro("Só proprietário e gerência podem impedir um cliente de agendar.");
      return;
    }

    setBanidos((atual) => {
      const proximo = new Set(atual);
      if (banido) proximo.delete(cliente.id);
      else proximo.add(cliente.id);
      return proximo;
    });
  }

  const filtrados = clientes.filter((cliente) =>
    cliente.name.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <section className="lista">
      <header className="lista-topo">
        <div>
          <h1>{segment.labels.customerPlural}</h1>
          <p>Quem você atende, e como falar com cada um.</p>
        </div>
        <button className="lista-acao" type="button" onClick={() => setFormAberto((v) => !v)}>
          <Plus size={16} />
          Novo {segment.labels.customer.toLowerCase()}
        </button>
      </header>

      {erro && (
        <p className="lista-erro" role="alert">
          <CircleAlert size={15} />
          <span>{erro}</span>
        </p>
      )}

      {formAberto && (
        <form className="lista-form" onSubmit={salvar}>
          <label className="lista-campo">
            <span>Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={`Nome do ${segment.labels.customer.toLowerCase()}`}
              autoFocus
            />
          </label>
          <label className="lista-campo">
            <span>Telefone</span>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />
          </label>
          <label className="lista-campo">
            <span>Aniversário</span>
            <input
              value={aniversario}
              onChange={(e) => setAniversario(e.target.value)}
              placeholder="DD/MM"
              inputMode="numeric"
            />
            <small>Sem o ano — dá para lembrar da data sem guardar a idade de ninguém.</small>
          </label>
          <div className="lista-form-acoes">
            <button type="button" className="lista-cancelar" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className="lista-salvar" disabled={salvando}>
              {salvando ? <Loader2 className="spin" size={15} /> : null}
              Salvar
            </button>
          </div>
        </form>
      )}

      <div className="lista-busca">
        <Search size={16} aria-hidden />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${segment.labels.customerPlural.toLowerCase()}`}
          aria-label={`Buscar ${segment.labels.customerPlural.toLowerCase()}`}
        />
        {busca && (
          <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca">
            <X size={15} />
          </button>
        )}
      </div>

      {carregando ? (
        <p className="lista-estado">
          <Loader2 className="spin" size={16} /> Carregando…
        </p>
      ) : !aoVivo ? (
        <p className="lista-estado">
          Entre com a sua conta para ver os {segment.labels.customerPlural.toLowerCase()} da sua
          empresa.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="lista-estado">
          {clientes.length === 0
            ? `Nenhum ${segment.labels.customer.toLowerCase()} cadastrado ainda. O primeiro agendamento precisa de um.`
            : "Nenhum resultado para esta busca."}
        </p>
      ) : (
        <ul className="lista-itens">
          {filtrados.map((cliente) => {
            const contato = contatos[cliente.id];
            const telefoneVisivel = contato?.whatsapp ?? contato?.phone ?? null;
            const aniversarioVisivel = formatBirthdayMd(contato?.birthday_md);

            return (
              <li key={cliente.id} className={cliente.active ? undefined : "lista-inativo"}>
                <span className="lista-avatar" aria-hidden>
                  <UserRound size={16} />
                </span>
                <span className="lista-nome">
                  {cliente.name}
                  {!cliente.active && <em>inativo</em>}
                  {banidos.has(cliente.id) && <em className="lista-alerta">impedido</em>}
                </span>
                <span className="lista-meta">
                  {telefoneVisivel ?? "—"}
                  {aniversarioVisivel && (
                    <span className="lista-aniversario">{aniversarioVisivel}</span>
                  )}
                </span>
                {podeBanir && (
                  <button
                    type="button"
                    className="lista-desligar"
                    onClick={() => void alternarBanimento(cliente)}
                    disabled={ocupadoId === cliente.id}
                    title={
                      banidos.has(cliente.id)
                        ? "Liberar para agendar de novo"
                        : "Impedir de agendar"
                    }
                    aria-label={
                      banidos.has(cliente.id)
                        ? `Liberar ${cliente.name} para agendar`
                        : `Impedir ${cliente.name} de agendar`
                    }
                  >
                    {ocupadoId === cliente.id ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      <Ban size={14} />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

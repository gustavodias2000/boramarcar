"use client";

/**
 * Gestão de boxes.
 *
 * `create_automotive_box` existia desde a primeira migration automotiva e nunca teve
 * consumidor: o Pátio exibia o box da OS, mas não havia como criar nenhum. Na prática,
 * boxes só existiam se alguém rodasse SQL.
 *
 * `update_automotive_box` é da Etapa 6 — editar e desativar não existiam nem no banco.
 *
 * Esta tela só aparece para categorias com a feature `boxes`. Numa barbearia, o item
 * de navegação e a rota somem sozinhos, sem nenhuma ramificação por tipo de negócio.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, CircleAlert, Loader2, Plus, RotateCcw } from "lucide-react";

import { can } from "@boramarca/core";

import { useSegment } from "@/core/segment";
import { useTenant } from "@/core/tenant";
import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";

interface Box {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
}

export function AutomotiveBoxes() {
  const { tenantId, membershipRole, mode } = useTenant();
  const segment = useSegment();

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeGerenciar = can(membershipRole, "manageWorkOrders");
  const conectado = mode === "live" && Boolean(tenantId);

  const carregar = useCallback(async (unidade: string) => {
    const { data, error } = await createClient()
      .from("automotive_boxes")
      .select("id, code, name, display_order, active")
      .eq("tenant_id", unidade)
      .order("display_order", { ascending: true });

    if (error) {
      setErro(error.message);
      return;
    }

    setBoxes((data ?? []) as Box[]);
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfiguration() || !tenantId) return;

    let cancelado = false;

    async function buscar(unidade: string) {
      await carregar(unidade);
      if (cancelado) return;
    }

    void buscar(tenantId);

    return () => {
      cancelado = true;
    };
  }, [tenantId, carregar]);

  async function criarBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !tenantId) return;

    if (!conectado) {
      setErro("Os boxes são criados somente com sessão e unidade ativas.");
      return;
    }

    setIsSaving(true);
    setErro(null);

    const { error } = await createClient().rpc("create_automotive_box", {
      p_tenant_id: tenantId,
      p_code: code.trim(),
      p_name: name.trim() || code.trim(),
      p_display_order: boxes.length + 1,
    });

    setIsSaving(false);

    if (error) {
      setErro(error.message);
      return;
    }

    setCode("");
    setName("");
    await carregar(tenantId);
  }

  async function alternarAtivo(box: Box) {
    if (!tenantId || isSaving) return;

    setIsSaving(true);
    setErro(null);

    const { error } = await createClient().rpc("update_automotive_box", {
      p_box_id: box.id,
      p_active: !box.active,
    });

    setIsSaving(false);

    if (error) {
      // O banco recusa desativar um box com carro dentro — a mensagem explica por quê.
      setErro(error.message);
      return;
    }

    await carregar(tenantId);
  }

  if (!segment.hasFeature("boxes")) {
    return (
      <section className="account-state">
        <CircleAlert size={25} />
        <h1>Sem boxes nesta categoria</h1>
        <p>Boxes são espaços físicos de atendimento, usados na estética automotiva.</p>
      </section>
    );
  }

  return (
    <section className="account-workspace">
      <header className="account-heading">
        <div>
          <h1>Boxes</h1>
          <p>
            Cada box é um recurso de agenda: dois atendimentos não podem ocupar o mesmo box no mesmo
            horário, e o banco recusa a sobreposição.
          </p>
        </div>
      </header>

      {podeGerenciar && (
        <form className="account-form" onSubmit={criarBox}>
          <label>
            <span>Código</span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="B01"
              maxLength={12}
              required
            />
          </label>
          <label>
            <span>Nome</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Box de lavagem"
              maxLength={80}
            />
          </label>
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            <span>Criar box</span>
          </button>
        </form>
      )}

      {erro && (
        <p className="account-error" role="alert">
          <CircleAlert size={15} /> {erro}
        </p>
      )}

      <ul className="box-list">
        {boxes.length === 0 && (
          <li className="box-empty">
            <Boxes size={18} />
            <span>Nenhum box cadastrado ainda.</span>
          </li>
        )}
        {boxes.map((box) => (
          <li key={box.id} className={box.active ? "" : "box-inactive"}>
            <strong>{box.code}</strong>
            <span>{box.name}</span>
            {podeGerenciar && (
              <button type="button" onClick={() => void alternarAtivo(box)} disabled={isSaving}>
                <RotateCcw size={14} />
                {box.active ? "Desativar" : "Reativar"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

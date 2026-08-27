"use client";

import { CircleAlert, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient, hasSupabaseConfiguration } from "@/lib/supabase/client";
import { destinoSeguro } from "@boramarca/core";

/**
 * MENSAGEM DE ERRO — a especificação vem da revisão de segurança, e a regra é uma só:
 * nunca repassar `error.message` cru.
 *
 * Hoje o GoTrue devolve "Invalid login credentials" tanto para senha errada quanto para
 * e-mail inexistente, então não há oráculo de existência de conta. Mas o repasse é
 * frágil por três motivos concretos: o texto não está sob controle deste projeto e muda
 * entre versões; `Email not confirmed` vira vazamento de estado de conta no dia em que a
 * confirmação for ligada; e o 429 conta ao atacante exatamente quando parar e voltar.
 */
function mensagemDeErro(status: number | undefined, code: string | undefined): string {
  if (status === 429) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }

  if (status === 400 || code === "invalid_credentials" || code === "email_not_confirmed") {
    return "E-mail ou senha incorretos.";
  }

  return "Não foi possível entrar agora. Tente novamente.";
}

export function FormularioDeEntrada() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const configurado = hasSupabaseConfiguration();

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      // O erro real vai para o console; o que a pessoa lê é a mensagem mapeada.
      console.error("Falha de autenticação", error);
      setErro(mensagemDeErro(error.status, error.code));
      setEnviando(false);
      return;
    }

    // O `?proximo=` é validado na LEITURA, não na escrita: quem escreve o parâmetro é o
    // produto, quem manda o link pronto é o atacante. `destinoSeguro` vive no núcleo e
    // tem uma implementação só — duas divergem, e a que divergir é a explorada.
    router.replace(destinoSeguro(searchParams.get("proximo")));
  }

  if (!configurado) {
    return (
      <p className="ent-aviso" role="status">
        Esta instalação ainda não tem as chaves do Supabase configuradas, então não há onde
        autenticar. Preencha <code>web/.env.local</code> para entrar com uma conta real.
      </p>
    );
  }

  return (
    <form className="ent-form" onSubmit={entrar} noValidate>
      {erro && (
        <p className="ent-erro" role="alert">
          <CircleAlert size={15} aria-hidden />
          <span>{erro}</span>
        </p>
      )}

      <label className="ent-campo" htmlFor="entrar-email">
        <span>E-mail</span>
        <input
          id="entrar-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
        />
      </label>

      <label className="ent-campo" htmlFor="entrar-senha">
        <span>Senha</span>
        <input
          id="entrar-senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
        />
      </label>

      <button className="ent-botao" type="submit" disabled={enviando}>
        {enviando ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="ent-rodape">
        Ainda não tem empresa? <Link href="/comecar">Abra a sua agora</Link>.
      </p>
    </form>
  );
}

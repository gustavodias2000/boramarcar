/**
 * DeepLinkService — links `barbershop://` que abrem o app numa tela específica.
 *
 * Hoje existe um único link: `barbershop://agendar/{barbeiroId}`, que é o
 * conteúdo do QR Code impresso na barbearia (ver QRCodeScreen). A auditoria
 * apontou que esse link era gerado mas NÃO funcionava — não havia
 * intent-filter no Android, URL scheme no iOS nem configuração de `linking`
 * no React Navigation. Escanear o QR Code não abria nada.
 *
 * Peças da correção:
 *  - android/app/src/main/AndroidManifest.xml → <intent-filter> do esquema
 *  - ios/BarbershopApp/Info.plist + AppDelegate.swift → URL scheme
 *  - este arquivo + App.tsx → mapeamento URL → rota
 *  - src/screens/AbrirAgendamentoScreen.tsx → resolve o barbeiro e navega
 *
 * Link pendente: se o app abre pelo QR Code com ninguém logado, guardamos o
 * barbeiroId aqui e o LoginScreen retoma o agendamento assim que o cliente
 * entra — senão o QR Code perderia o efeito justamente para quem ainda não
 * tem conta, que é o caso mais comum na porta da barbearia.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '../types';
import type { RotaInicial } from './SessaoService';

/** Esquema registrado no Android e no iOS. */
export const ESQUEMA = 'barbershop';

/**
 * Domínio do App Link (Android) — Firebase Hosting do mesmo projeto
 * (`barbershop-5dca2`), com `public/.well-known/assetlinks.json` verificando
 * a assinatura do app. É o único jeito de um link de convite ter fallback
 * automático pra Play Store quando o app não está instalado: um esquema
 * próprio (`barbershop://...`) nunca cai em navegador nenhum, só https com
 * Digital Asset Links verificado abre o app OU a página, dependendo se o app
 * está instalado. iOS ainda não tem o equivalente (Universal Links exige o
 * Team ID da conta Apple Developer — pendência, ver CLAUDE.md).
 */
export const DOMINIO_APP_LINK = 'barbershop-5dca2.web.app';

const CHAVE_PENDENTE = '@barbershop:deeplink-pendente';

/** Quanto tempo um link pendente continua valendo (o cliente pode demorar
 *  para criar a conta, mas não faz sentido retomar isso dias depois). */
const VALIDADE_PENDENTE_MS = 60 * 60 * 1000; // 1 hora

interface LinkPendente {
  barbeiroId: string;
  em: number;
}

/**
 * Monta o link `barbershop://agendar/{barbeiroId}` — formato ORIGINAL do QR
 * Code, anterior ao sistema de convites (`linkDeConvite`).
 *
 * Hoje NINGUÉM mais chama esta função para GERAR link novo: o QR Code e o
 * botão "compartilhar link" usam `linkDeConvite`. Ainda assim ela não é
 * código morto para remover — o FORMATO que ela produz continua sendo um
 * link válido que o app sabe abrir (rota `AbrirAgendamento`, mapeada em
 * `criarLinking` abaixo, resolvida por `AbrirAgendamentoScreen.tsx`).
 * Mantida só por compatibilidade com QR Codes impressos antes da migração
 * para convites — trocar a placa da barbearia não é imediato.
 */
export function linkDeAgendamento(barbeiroId: string): string {
  return `${ESQUEMA}://agendar/${barbeiroId}`;
}

/**
 * Monta o link de convite (QR Code, "compartilhar link", ou link antigo
 * convertido) — `origem` distingue a fonte só quando ela é conhecida na
 * origem (QR impresso vs. botão de compartilhar link); ausente = deep link
 * genérico.
 *
 * Usa o domínio do App Link (https://), não mais o esquema próprio: só assim
 * o link tem fallback automático pra Play Store quando o app não está
 * instalado (ver `DOMINIO_APP_LINK`). Links antigos em `barbershop://convite/...`
 * já compartilhados continuam funcionando — `criarLinking` abaixo aceita os
 * dois prefixos.
 */
export function linkDeConvite(codigo: string, origem?: 'qr' | 'link'): string {
  const query = origem ? `?origem=${origem}` : '';
  return `https://${DOMINIO_APP_LINK}/convite/${codigo}${query}`;
}

/** Link do botão "Abrir relatório" no e-mail financeiro. O caminho aponta
 * para uma tela intermediária autenticada; ele nunca revela relatório a uma
 * sessão pública ou de cliente. */
export function linkDeRelatorios(): string {
  return `https://${DOMINIO_APP_LINK}/relatorios`;
}

/**
 * Configuração de `linking` do NavigationContainer.
 *
 * `initialRouteName` é a tela que fica EMBAIXO da tela aberta pelo link, para
 * o botão voltar não cair numa pilha vazia. Passamos a mesma rota inicial
 * resolvida pela sessão restaurada.
 */
export function criarLinking(
  rotaInicial: RotaInicial,
): LinkingOptions<RootStackParamList> {
  return {
    // Os dois prefixos resolvem pras mesmas rotas abaixo — o esquema próprio
    // continua para o link de agendamento (barbershop://agendar/...) e para
    // convites antigos já compartilhados; o https é o formato novo de
    // convite, com App Link verificado (ver DOMINIO_APP_LINK acima).
    prefixes: [`${ESQUEMA}://`, `https://${DOMINIO_APP_LINK}`],
    config: {
      initialRouteName: rotaInicial,
      screens: {
        AbrirAgendamento: 'agendar/:barbeiroId',
        AbrirConvite: 'convite/:codigo',
        AbrirRelatorios: 'relatorios',
      },
    },
  };
}

/** Guarda o agendamento que o cliente tentou abrir antes de estar logado. */
export async function guardarAgendamentoPendente(barbeiroId: string): Promise<void> {
  if (!barbeiroId) return;
  try {
    const pendente: LinkPendente = { barbeiroId, em: Date.now() };
    await AsyncStorage.setItem(CHAVE_PENDENTE, JSON.stringify(pendente));
  } catch (error) {
    // Sem o cache o cliente só precisa escanear o QR Code de novo depois de
    // entrar — chato, mas não quebra nada.
    console.warn('[deeplink] não foi possível guardar o link pendente.', error);
  }
}

/**
 * Lê e APAGA o agendamento pendente. Retorna null se não houver nenhum ou se
 * já passou da validade.
 */
export async function consumirAgendamentoPendente(): Promise<string | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_PENDENTE);
    if (!bruto) return null;
    await AsyncStorage.removeItem(CHAVE_PENDENTE);
    const pendente = JSON.parse(bruto) as LinkPendente;
    if (!pendente?.barbeiroId) return null;
    if (Date.now() - (pendente.em ?? 0) > VALIDADE_PENDENTE_MS) return null;
    return pendente.barbeiroId;
  } catch {
    return null;
  }
}

/** Descarta qualquer link pendente (logout, exclusão de conta). */
export async function limparAgendamentoPendente(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_PENDENTE);
  } catch {
    // silencioso de propósito: é só limpeza
  }
}

// ─── Convite pendente ───────────────────────────────────────────────────────
// Mecanismo paralelo ao de agendamento pendente acima, mas para o fluxo de
// vínculo (QR Code/link/convite de barbearia). Chave própria — os dois
// pendentes podem coexistir (ex.: cliente abre um link de convite e depois,
// antes de logar, um link de agendamento).

const CHAVE_CONVITE_PENDENTE = '@barbershop:convite-pendente';
const CHAVE_RELATORIO_PENDENTE = '@barbershop:relatorio-pendente';

interface ConvitePendente {
  codigo: string;
  origem: string;
  em: number;
}

/** Guarda o convite que o cliente tentou resgatar antes de estar logado. */
export async function guardarConvitePendente(codigo: string, origem: string): Promise<void> {
  if (!codigo) return;
  try {
    const pendente: ConvitePendente = { codigo, origem, em: Date.now() };
    await AsyncStorage.setItem(CHAVE_CONVITE_PENDENTE, JSON.stringify(pendente));
  } catch (error) {
    // Sem o cache o cliente só precisa abrir o link/QR Code de novo depois de
    // entrar — chato, mas não quebra nada.
    console.warn('[deeplink] não foi possível guardar o convite pendente.', error);
  }
}

/**
 * Lê e APAGA o convite pendente. Retorna null se não houver nenhum ou se já
 * passou da validade.
 */
export async function consumirConvitePendente(): Promise<{ codigo: string; origem: string } | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_CONVITE_PENDENTE);
    if (!bruto) return null;
    await AsyncStorage.removeItem(CHAVE_CONVITE_PENDENTE);
    const pendente = JSON.parse(bruto) as ConvitePendente;
    if (!pendente?.codigo) return null;
    if (Date.now() - (pendente.em ?? 0) > VALIDADE_PENDENTE_MS) return null;
    return { codigo: pendente.codigo, origem: pendente.origem };
  } catch {
    return null;
  }
}

/** Descarta qualquer convite pendente (logout, exclusão de conta). */
export async function limparConvitePendente(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_CONVITE_PENDENTE);
  } catch {
    // silencioso de propósito: é só limpeza
  }
}

// ─── Relatório pendente ────────────────────────────────────────────────────
// A intenção não carrega identificador ou dado do negócio. Depois do login,
// a tela de entrada confirma novamente que o perfil é de barbeiro.

interface RelatorioPendente {
  em: number;
}

export async function guardarRelatorioPendente(): Promise<void> {
  try {
    const pendente: RelatorioPendente = { em: Date.now() };
    await AsyncStorage.setItem(CHAVE_RELATORIO_PENDENTE, JSON.stringify(pendente));
  } catch (error) {
    console.warn('[deeplink] não foi possível guardar o link de relatório.', error);
  }
}

/** Lê e consome a intenção; ela expira para não afetar logins futuros. */
export async function consumirRelatorioPendente(): Promise<boolean> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_RELATORIO_PENDENTE);
    if (!bruto) return false;
    await AsyncStorage.removeItem(CHAVE_RELATORIO_PENDENTE);
    const pendente = JSON.parse(bruto) as RelatorioPendente;
    return typeof pendente?.em === 'number'
      && Date.now() - pendente.em <= VALIDADE_PENDENTE_MS;
  } catch {
    return false;
  }
}

export async function limparRelatorioPendente(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_RELATORIO_PENDENTE);
  } catch {
    // limpeza silenciosa, como os outros links pendentes
  }
}

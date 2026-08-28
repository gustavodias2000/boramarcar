/**
 * WhatsAppService — envio de mensagens via WhatsApp.
 *
 * SEGURANÇA (item 5 da auditoria): o token da WhatsApp Business API vive
 * APENAS no servidor (Cloud Function `sendWhatsApp`, com secrets). O app
 * nunca carrega credenciais. Se a função estiver indisponível, o fallback
 * abre o WhatsApp do aparelho com a mensagem pronta.
 */
import { Alert, Linking } from 'react-native';
import { httpsCallable } from './CloudFunctionsClient';
import { functions } from '../../firebaseConfig';

interface PessoaInfo {
  nome: string;
  telefone?: string;
  email?: string;
}

interface BarbeiroInfo extends PessoaInfo {
  especialidade?: string;
}

const DEBUG_MODE: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const USE_DIRECT_LINK = true;

/**
 * Códigos em que a Cloud Function recusou o envio de propósito — não são
 * falha de infraestrutura, então NÃO devem cair no fallback local.
 * (O SDK entrega no formato `functions/permission-denied`.)
 */
const RECUSAS_DO_SERVIDOR = [
  'permission-denied',
  'resource-exhausted',
  'invalid-argument',
  'unauthenticated',
];

/**
 * `failed-precondition` — o servidor NÃO tem a WhatsApp Business API
 * configurada (sem `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`).
 *
 * De propósito FORA de `RECUSAS_DO_SERVIDOR`: quando a Cloud Function
 * responde isso, o vínculo com o destinatário JÁ foi validado no servidor
 * (`podeEnviarPara` roda antes). Não há trava anti-abuso sendo contornada
 * — o servidor apenas não tem por onde enviar. Num envio avulso
 * (Aniversários, Lista de espera), abrir o WhatsApp do aparelho com a
 * mensagem pronta continua sendo o plano B legítimo, e é o único jeito de
 * o app funcionar numa barbearia que nunca contratou a API da Meta.
 *
 * O que NÃO pode: isso ser contado como "mensagem enviada" (o humano ainda
 * precisa tocar em enviar dentro do WhatsApp) nem se repetir 200 vezes num
 * envio em lote. Por isso o caso ganhou status próprio em `ResultadoEnvio`
 * e a opção `permitirFallback: false`, usada pela tela de Promoções.
 */
const SERVIDOR_SEM_WHATSAPP = 'failed-precondition';

const MOTIVO_RECUSA_PADRAO = 'O servidor não autorizou o envio desta mensagem.';
const MOTIVO_SEM_WHATSAPP = 'O WhatsApp Business não está configurado no servidor.';

/**
 * O que realmente aconteceu com uma tentativa de envio.
 *
 * `enviado` e `link-aberto` são coisas MUITO diferentes e um booleano não
 * consegue separar as duas — era exatamente essa confusão que fazia a tela
 * de Promoções relatar "mensagem enviada para 200 clientes" sem que uma
 * única mensagem tivesse saído.
 *
 *  - `enviado`         — a Cloud Function confirmou o envio pela WhatsApp
 *                        Business API. É o único status que significa entrega.
 *  - `link-aberto`     — fallback: abrimos o WhatsApp do aparelho com a
 *                        mensagem pronta. Falta o humano tocar em enviar.
 *  - `nao-configurado` — o servidor não tem WhatsApp Business. Condição
 *                        GLOBAL: não adianta tentar o próximo destinatário.
 *  - `recusado`        — o servidor recusou de propósito (trava anti-abuso).
 *  - `falhou`          — não deu para enviar nem para abrir o link.
 */
export type StatusEnvio =
  | 'enviado'
  | 'link-aberto'
  | 'nao-configurado'
  | 'recusado'
  | 'falhou';

export interface ResultadoEnvio {
  status: StatusEnvio;
  motivo?: string;
}

export interface OpcoesEnvio {
  /**
   * Padrão `true`. Passe `false` em envio EM LOTE: abrir o WhatsApp do
   * aparelho joga o app para segundo plano no primeiro destinatário e
   * perde todos os seguintes — num lote o fallback nunca ajuda, só
   * mascara o problema.
   */
  permitirFallback?: boolean;
}

const INTERVALO_ENTRE_ALERTAS_MS = 10000;
let ultimoAlertaDeRecusaEm = 0;

class WhatsAppService {
  /**
   * Envia uma mensagem de texto via Cloud Function (token no servidor) e
   * devolve o que REALMENTE aconteceu — ver `ResultadoEnvio`.
   *
   * @param to - Número do destinatário (ex.: 5511999999999)
   * @param message - Mensagem a ser enviada
   * @param opcoes - `permitirFallback: false` para envio em lote
   */
  async enviarTexto(
    to: string,
    message: string,
    opcoes: OpcoesEnvio = {},
  ): Promise<ResultadoEnvio> {
    const permitirFallback = opcoes.permitirFallback !== false;

    try {
      const sendWhatsApp = httpsCallable(functions, 'sendWhatsApp');
      await sendWhatsApp({ to, message });
      return { status: 'enviado' };
    } catch (error: any) {
      const codigo: string = error?.code || '';

      // O servidor RECUSOU o envio (limite de mensagens atingido, número sem
      // vínculo com quem está enviando, dados inválidos). Cair no fallback
      // aqui abriria o WhatsApp do aparelho e devolveria `true` — ou seja,
      // contornaria justamente a trava anti-abuso e ainda mentiria para a
      // tela dizendo que a mensagem saiu. Só usamos o fallback quando a
      // falha é de infraestrutura (função fora do ar, sem internet).
      if (RECUSAS_DO_SERVIDOR.some((c) => codigo.endsWith(c))) {
        this.avisarRecusa(error?.message);
        return { status: 'recusado', motivo: error?.message || MOTIVO_RECUSA_PADRAO };
      }

      // Servidor sem WhatsApp Business configurado — ver
      // `SERVIDOR_SEM_WHATSAPP`. Não alerta aqui: num envio avulso o
      // fallback resolve em silêncio; num lote quem avisa é a tela, uma
      // vez só, com o número honesto.
      if (codigo.endsWith(SERVIDOR_SEM_WHATSAPP)) {
        const motivo: string = error?.message || MOTIVO_SEM_WHATSAPP;
        if (!permitirFallback) {
          return { status: 'nao-configurado', motivo };
        }
        return this.abrirLinkComoPlanoB(to, message, motivo);
      }

      if (DEBUG_MODE) {
        console.warn(
          'Cloud Function do WhatsApp indisponível, usando fallback:',
          error?.message,
        );
      }
      // Fallback: abre o WhatsApp no aparelho com a mensagem pronta.
      if (permitirFallback && USE_DIRECT_LINK) {
        return this.abrirLinkComoPlanoB(to, message, error?.message);
      }
      return { status: 'falhou', motivo: error?.message };
    }
  }

  /**
   * Retorno booleano histórico, mantido para os envios AVULSOS
   * (Aniversários, Lista de espera), em que "enviado" e "link aberto"
   * atendem igualmente a intenção do profissional. Envio EM LOTE deve usar
   * `enviarTexto`: lá essa diferença é o problema inteiro.
   */
  async sendTextMessage(to: string, message: string): Promise<boolean> {
    const resultado = await this.enviarTexto(to, message);
    return resultado.status === 'enviado' || resultado.status === 'link-aberto';
  }

  /**
   * Alerta de recusa com intervalo: envio em lote pode recusar dezenas de
   * vezes seguidas; sem o intervalo, o barbeiro receberia uma pilha de
   * alertas idênticos para fechar um a um.
   */
  private avisarRecusa(mensagemDoServidor?: string): void {
    const agora = Date.now();
    if (agora - ultimoAlertaDeRecusaEm > INTERVALO_ENTRE_ALERTAS_MS) {
      ultimoAlertaDeRecusaEm = agora;
      Alert.alert('Mensagem não enviada', mensagemDoServidor || MOTIVO_RECUSA_PADRAO);
    }
  }

  private async abrirLinkComoPlanoB(
    to: string,
    message: string,
    motivo?: string,
  ): Promise<ResultadoEnvio> {
    const abriu = await this.fallbackToDirectLink(to, message);
    return abriu ? { status: 'link-aberto' } : { status: 'falhou', motivo };
  }

  /**
   * Fallback: abre o WhatsApp instalado no aparelho com a mensagem pronta.
   *
   * NOTA: Linking.canOpenURL('whatsapp://...') retorna false no Android 11+
   * sem a declaração <queries> no AndroidManifest (já adicionada).
   * Mesmo assim preferimos abrir diretamente via openURL e capturar o erro:
   * é mais robusto e evita falso-negativo em alguns dispositivos.
   */
  async fallbackToDirectLink(phone: string, message: string): Promise<boolean> {
    try {
      const fullPhone = this.formatPhoneNumber(phone);
      const url = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;

      await Linking.openURL(url);
      return true;
    } catch (error) {
      console.error('Erro no fallback WhatsApp:', error);
      // Se o WhatsApp não estiver instalado, tenta o link web como último recurso
      try {
        const fullPhone = this.formatPhoneNumber(phone);
        const webUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
        await Linking.openURL(webUrl);
        return true;
      } catch {
        Alert.alert(
          'WhatsApp não encontrado',
          'Não foi possível abrir o WhatsApp. Verifique se ele está instalado.',
        );
        return false;
      }
    }
  }

  /**
   * Formata número de telefone para o padrão internacional brasileiro.
   */
  formatPhoneNumber(phone: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
      return cleanPhone;
    }
    if (cleanPhone.length === 11 || cleanPhone.length === 10) {
      return `55${cleanPhone}`;
    }
    return cleanPhone;
  }

  /**
   * Gera mensagem de solicitação de agendamento (cliente → barbeiro).
   */
  gerarMensagemAgendamento(
    barbeiro: BarbeiroInfo,
    cliente: PessoaInfo,
    data: string,
    horario: string,
  ): string {
    return `Olá ${barbeiro.nome}! 👋

Sou ${cliente.nome} e gostaria de agendar um horário.

📅 Data: ${data}
🕐 Horário: ${horario}
💰 Serviço: ${barbeiro.especialidade || 'Corte e barba'}

Aguardo confirmação. Obrigado! 🙏`;
  }

  /**
   * Gera mensagem de confirmação (barbeiro → cliente).
   */
  gerarMensagemConfirmacao(
    cliente: PessoaInfo,
    data: string,
    horario: string,
    barbeiroNome: string,
  ): string {
    return `Olá ${cliente.nome}! 👋

Seu agendamento foi confirmado! ✅

👨‍💼 Barbeiro: ${barbeiroNome}
📅 Data: ${data}
🕐 Horário: ${horario}

📍 Endereço: [Inserir endereço da barbearia]

Nos vemos em breve! 💪`;
  }

  /**
   * Gera mensagem de cancelamento (barbeiro → cliente).
   */
  gerarMensagemCancelamento(
    cliente: PessoaInfo,
    data: string,
    horario: string,
    motivo: string = '',
  ): string {
    let mensagem = `Olá ${cliente.nome}! 👋

Infelizmente precisamos cancelar seu agendamento:

📅 Data: ${data}
🕐 Horário: ${horario}`;

    if (motivo) {
      mensagem += `\n\n❗ Motivo: ${motivo}`;
    }

    mensagem += `\n\nPor favor, reagende quando for conveniente. Obrigado pela compreensão! 🙏`;

    return mensagem;
  }

  /**
   * Gera mensagem de lembrete (barbeiro → cliente).
   */
  gerarMensagemLembrete(
    cliente: PessoaInfo,
    data: string,
    horario: string,
    barbeiroNome: string,
  ): string {
    return `Olá ${cliente.nome}! 👋

🔔 Lembrete do seu agendamento:

👨‍💼 Barbeiro: ${barbeiroNome}
📅 Data: ${data}
🕐 Horário: ${horario}

📍 Endereço: [Inserir endereço da barbearia]

Te esperamos! 💪`;
  }

  /**
   * Gera mensagem de parabéns de aniversário (barbeiro → cliente).
   */
  gerarMensagemAniversario(cliente: PessoaInfo, barbeiroNome: string): string {
    return `Feliz aniversário, ${cliente.nome}! 🎉🎂

A equipe ${barbeiroNome} deseja a você um dia repleto de alegria!

Como presente, que tal passar aqui para dar um trato no visual? Estamos te esperando! 💈`;
  }

  /**
   * Gera mensagem promocional (barbeiro → cliente), a partir do texto livre
   * digitado pelo barbeiro. Se {nome_cliente} estiver presente, é
   * substituído; caso contrário a mensagem é enviada como está.
   */
  gerarMensagemPromocional(cliente: PessoaInfo, textoLivre: string): string {
    if (textoLivre.includes('{nome_cliente}')) {
      return textoLivre.replace(/{nome_cliente}/g, cliente.nome);
    }
    return textoLivre;
  }

  /**
   * Interpola variáveis em um template customizado do barbeiro.
   *
   * Variáveis suportadas:
   *   {nome_barbeiro}  {nome_cliente}  {data}  {horario}  {servico}
   */
  gerarMensagemComTemplate(
    template: string,
    vars: {
      nome_barbeiro: string;
      nome_cliente: string;
      data: string;
      horario: string;
      servico: string;
    },
  ): string {
    return template
      .replace(/{nome_barbeiro}/g, vars.nome_barbeiro)
      .replace(/{nome_cliente}/g, vars.nome_cliente)
      .replace(/{data}/g, vars.data)
      .replace(/{horario}/g, vars.horario)
      .replace(/{servico}/g, vars.servico);
  }
}

// Exportar instância singleton
export default new WhatsAppService();

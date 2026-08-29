/**
 * Tipos de domínio do Barbershop (item 16 da auditoria — migração TS).
 *
 * Fonte única de verdade para os modelos que circulam entre telas,
 * repositories e Firestore.
 */
import type { Timestamp, FieldValue } from 'firebase/firestore';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { FotoPadraoId } from './assets/barbeirosPadrao';

// ─── Primitivos de domínio ───────────────────────────────────────────────────

export type TipoUsuario = 'cliente' | 'barbeiro';

// ─── Serviços do barbeiro ─────────────────────────────────────────────────────

export interface ServicoBarbeiro {
  id: string;
  nome: string;
  duracaoMinutos: number;   // Ex.: 30, 45, 60, 90
  precoEmCentavos: number;  // Ex.: 4500 = R$ 45,00
}

// ─── Configuração de agenda ───────────────────────────────────────────────────

export interface ConfiguracaoAgenda {
  horaInicio: string;           // "09:00"
  horaFim: string;              // "18:00"
  almocoInicio: string;         // "12:00" — "" desativa o almoço
  almocoFim: string;            // "13:00"
  antecedenciaMinutos: number;  // 0 = sem restrição, 30 = mínimo 30min de antecedência
  antecedenciaMaximaDias: number; // 7 a 120 dias à frente; 0 = sem limite
  diasAtendimento: number[];    // 0=dom, 1=seg, ..., 6=sab; ex.: [1,2,3,4,5,6]
  /** Intervalo de descanso/limpeza após cada atendimento (minutos). 0 = sem buffer. */
  intervaloAposAtendimentoMinutos?: number;
  /**
   * Turno extra opcional (ex.: período noturno), além do horário principal
   * (horaInicio–horaFim). Gera slots adicionais nesse segundo bloco, sem
   * intervalo de almoço aplicado a ele.
   */
  turnoExtraAtivo?: boolean;
  turnoExtraInicio?: string;    // "19:00"
  turnoExtraFim?: string;       // "21:00"
}

// ─── Bloqueio de horário específico ("evento pessoal") ───────────────────────

/**
 * Bloqueia um intervalo de horário dentro de um dia específico (ex.: consulta
 * médica das 14h às 15h) — diferente de `datasBloqueadas` (folga o dia
 * inteiro). Guardado como array denormalizado no doc do Barbeiro, no mesmo
 * padrão de `datasBloqueadas`.
 *
 * SEM `motivo`: este array vive no doc público `barbeiros/{id}` (a vitrine,
 * lida por qualquer cliente logado). O motivo é dado pessoal do barbeiro e
 * fica na subcoleção privada `barbeiros/{id}/bloqueiosPrivados` — ver
 * `BloqueioMotivo` e `BloqueioRepository`.
 */
export interface BloqueioHorario {
  id: string;
  data: DataISO;       // "2026-07-23"
  horaInicio: Horario; // "14:00"
  horaFim: Horario;    // "15:00"
}

/**
 * Motivo de um `BloqueioHorario`, guardado separadamente do array público
 * (ver comentário acima). A chave do doc na subcoleção já é o `id` do
 * bloqueio, então não precisa duplicá-lo aqui.
 */
export interface BloqueioMotivo {
  motivo: string;
}

// ─── Banner promocional ───────────────────────────────────────────────────────

/** Aviso/promoção exibido ao cliente na tela de agendamento deste barbeiro. */
export interface BannerPromocional {
  texto: string;
  ativo: boolean;
}

// ─── Templates de mensagem WhatsApp ──────────────────────────────────────────

export interface TemplatesMensagem {
  agendamento: string;    // Variáveis: {nome_barbeiro}, {nome_cliente}, {data}, {horario}, {servico}
  confirmacao: string;
  cancelamento: string;
  lembrete: string;
}

export type StatusAgendamento =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'avaliado';

/** Data no formato local YYYY-MM-DD (ex.: "2026-07-21") */
export type DataISO = string;

/** Horário no formato HH:mm (ex.: "09:30") */
export type Horario = string;

/** Campo de data vindo do Firestore: Timestamp ao ler, FieldValue ao gravar */
export type FirestoreDate = Timestamp | FieldValue;

// ─── Agenda de clientes do barbeiro (cadastro manual/importado) ──────────────

/**
 * Contato de cliente cadastrado pelo barbeiro (manualmente ou importado da
 * agenda do telefone). Independente de `Usuario` — não exige que o cliente
 * tenha conta no app. Serve como base para futuro agendamento manual.
 */
export interface ClienteContato {
  id: string;
  nome: string;
  telefone?: string;
  /** Formato "MM-DD" (mês 1-indexado), sem ano — ex.: "07-23" para 23/07. */
  aniversario?: string;
  origem: 'manual' | 'contatos';
  createdAt?: FirestoreDate;
}

// ─── Negócio / equipe multi-profissional ──────────────────────────────────────

/**
 * Um negócio agrupa vários profissionais (Barbeiro) sob um dono único.
 * Opcional: barbeiros solo (sem equipe) nunca têm `negocioId` e continuam
 * funcionando exatamente como antes.
 */
export interface Negocio {
  id: string;
  donoUid: string;
  nome: string;
  endereco?: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export type PapelEquipe = 'dono' | 'profissional';
export type TipoComissao = 'percentual' | 'fixo';

/**
 * Membro da equipe de um negócio — dado privado (nunca exposto na vitrine
 * pública do barbeiro). Guarda o papel e a configuração de comissão.
 * O id do documento é sempre igual ao `barbeiroId`.
 */
export interface MembroEquipe {
  id: string;
  barbeiroId: string;
  papel: PapelEquipe;
  ativo: boolean;
  comissaoTipo?: TipoComissao;
  /** 0–100, usado quando comissaoTipo === 'percentual' */
  comissaoPercentual?: number;
  /** Em centavos, usado quando comissaoTipo === 'fixo' */
  comissaoFixaCentavos?: number;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export type TipoVinculo = 'negocio' | 'profissional';
export type OrigemVinculo = 'qr' | 'link' | 'codigo' | 'convite';

/** Vínculo do cliente com uma barbearia (negócio) ou profissional autônomo —
 * criado ao abrir um QR Code/link/convite ou digitar um código. Vive em
 * `usuarios/{clienteUid}/vinculos/{tipo_alvoId}` (id determinístico: mesma
 * origem nunca duplica o vínculo, ver VinculoClienteRepository). */
export interface VinculoCliente {
  id: string;
  clienteUid: string;
  tipo: TipoVinculo;
  /** id do negócio (tipo='negocio') ou do próprio barbeiro (tipo='profissional') */
  alvoId: string;
  /** uid do barbeiro cujo QR/link/código específico originou o vínculo —
   * sempre presente, mesmo quando tipo='negocio' (é o membro da equipe que
   * foi escaneado, não necessariamente o dono). */
  barbeiroOrigemId: string;
  origem: OrigemVinculo;
  ativo: boolean;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

// ─── Clientes banidos ─────────────────────────────────────────────────────────

export interface ClienteBanido {
  uid: string;
  nome: string;
  email: string;
  bannedAt?: FirestoreDate;
}

// ─── Notificações multicanal de agendamento (Onda A — fundação) ──────────────

/**
 * Canal usado para avisar sobre eventos de agendamento. Este tipo só define
 * o modelo de dado — o orquestrador que decide QUANDO cada canal dispara
 * (WhatsApp/SMS/Push) é uma onda futura, ainda não implementada.
 */
export type CanalNotificacao = 'whatsapp' | 'sms' | 'push';

/**
 * Preferência da campanha de retorno de clientes inativos. É separada de
 * `eventos.lembrete`: aquele toggle controla lembretes transacionais de um
 * agendamento existente; este é uma comunicação de retenção e, por isso,
 * nasce desativado para não alterar o comportamento de clientes já ativos.
 *
 * O primeiro lançamento é deliberadamente push-only. WhatsApp e SMS exigem
 * consentimento específico do cliente e infraestrutura própria antes de
 * poderem ser oferecidos aqui.
 */
export interface ConfiguracaoRetornoCliente {
  ativo: boolean;
  diasSemComparecer: number;
  canal: 'push';
}

/**
 * Granularidade fina de evento, pensada para o histórico de envio/idempotência
 * (`agendamentos/{id}/notificacoes/{envioId}`, ver firestore.rules — dado
 * interno, sem leitura pelo client) e para o orquestrador escolher a mensagem
 * certa. É mais fina que `ConfiguracaoNotificacoes.eventos` (a granularidade
 * que o USUÁRIO liga/desliga na tela de configuração): um único toggle
 * "cancelamento" ali cobre tanto `agendamento_cancelado_cliente` quanto
 * `agendamento_cancelado_profissional`.
 */
export type EventoNotificacao =
  | 'agendamento_criado'
  | 'agendamento_confirmado'
  | 'agendamento_cancelado_cliente'
  | 'agendamento_cancelado_profissional';

/**
 * Preferência de canais/eventos de notificação de UM profissional autônomo
 * OU de UM negócio (equipe inteira — sem configuração individual por membro,
 * ver `negocios/{id}/configuracoes` em firestore.rules: hoje profissionais de
 * equipe não têm login próprio). Documento fixo `notificacoes` dentro de
 * `barbeiros/{id}/configuracoes` (autônomo) ou `negocios/{id}/configuracoes`
 * (equipe) — ver NotificationRepository, que decide qual dos dois usar.
 */
export interface ConfiguracaoNotificacoes {
  canais: {
    whatsapp: boolean;
    sms: boolean;
    push: boolean;
  };
  eventos: {
    novoAgendamento: boolean;
    confirmacao: boolean;
    cancelamento: boolean;
    lembrete: boolean;
  };
  retornoCliente: ConfiguracaoRetornoCliente;
  updatedAt?: FirestoreDate;
  /**
   * uid de quem salvou por último. Opcional (diferença deliberada em relação
   * ao pedido original, que não marcava `?"): o valor PADRÃO devolvido para
   * registros sem config salva ainda (`CONFIGURACAO_NOTIFICACOES_PADRAO`) não
   * tem autor nenhum — ninguém "salvou" nada de verdade. Toda gravação real
   * feita por `NotificationRepository.salvarConfiguracaoNotificacoes` grava
   * este campo internamente, sempre.
   */
  updatedBy?: string;
}

/**
 * Valores padrão — preservam o comportamento atual do produto para
 * barbeiros/negócios cadastrados antes desta feature (sem doc de config
 * salvo ainda):
 *  - `whatsapp: true` — único canal que existe hoje; não pode "sumir" para
 *    quem já usava o app.
 *  - `sms: false` — canal novo; só liga quando o barbeiro decidir
 *    conscientemente E o provedor estiver configurado (onda futura).
 *  - `push: true` — o EVENTO fica habilitado por padrão; a permissão do SO
 *    ainda governa se a notificação chega de verdade.
 *  - todos os 4 eventos `true` — hoje toda mudança de status já dispara
 *    aviso (WhatsApp); desligar por padrão seria uma regressão silenciosa.
 */
export const CONFIGURACAO_NOTIFICACOES_PADRAO: ConfiguracaoNotificacoes = {
  canais: { whatsapp: true, sms: false, push: true },
  eventos: { novoAgendamento: true, confirmacao: true, cancelamento: true, lembrete: true },
  retornoCliente: { ativo: false, diasSemComparecer: 30, canal: 'push' },
};

/**
 * Preferências do resumo financeiro enviado ao dono. Vivem no mesmo documento
 * privado de configurações do negócio/profissional; assim uma equipe recebe
 * um único relatório consolidado, administrado pelo dono.
 *
 * `emailDestino` é opcional para compatibilidade: quando ausente, o serviço
 * de envio usa o email da conta do dono, preservando o relatório semanal já
 * existente para quem nunca abriu esta configuração.
 */
export interface ConfiguracaoRelatorioEmail {
  semanal: boolean;
  mensal: boolean;
  emailDestino?: string;
}

export const CONFIGURACAO_RELATORIO_EMAIL_PADRAO: ConfiguracaoRelatorioEmail = {
  semanal: true,
  mensal: false,
};

// ─── Modelos ─────────────────────────────────────────────────────────────────

export interface Usuario {
  uid: string;
  nome: string;
  email: string;
  especialidade?: string;
  telefone: string;
  tipo: TipoUsuario;
  fcmToken?: string;
  consentimentoLGPD?: boolean;
  consentimentoEm?: FirestoreDate;
  /**
   * Escolha explícita do cliente para receber notificações push de retorno e
   * outras comunicações não transacionais. É independente da permissão do SO
   * e do token FCM; todos precisam estar ativos para uma campanha entregar.
   * Ausente significa opt-in pendente, nunca autorização implícita.
   */
  consentimentoNotificacoesPush?: boolean;
  /** Carimbo técnico da última alteração do consentimento de push. */
  consentimentoNotificacoesPushEm?: FirestoreDate;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface Barbeiro {
  /** id do documento == uid do barbeiro */
  id: string;
  uid?: string;
  nome: string;
  telefone?: string;
  especialidade?: string;
  /** Foto de perfil (Firebase Storage, `barbeiros/{id}/perfil.jpg`) — ver FotoPerfilService. */
  fotoUrl?: string;
  /** Foto padrão (pool local, sem upload) atribuída na criação, quando o
   * barbeiro ainda não tem `fotoUrl` próprio. Some do card assim que ele
   * sobe uma foto real — ver AvatarIlustrado e FOTOS_PADRAO. */
  fotoPadraoId?: FotoPadraoId;
  /** Legado: preço como string "25,00" (mantido p/ compatibilidade) */
  preco?: string;
  /** Preferido: preço como inteiro em centavos (2500 = R$ 25,00) */
  precoEmCentavos?: number;
  /** Lista de serviços oferecidos com duração e preço */
  servicos?: ServicoBarbeiro[];
  /** Configuração de horários de atendimento */
  configuracaoAgenda?: ConfiguracaoAgenda;
  /** Templates de mensagens WhatsApp */
  templatesMensagem?: TemplatesMensagem;
  /**
   * @deprecated Formato antigo: a lista ficava dentro deste documento, que é
   * a vitrine pública — expunha nome e email dos banidos para qualquer usuário
   * logado. Agora vive na subcoleção privada `barbeiros/{id}/banidos/{uid}`
   * (ver BanimentoRepository). O campo é mantido apenas para a migração
   * automática (`migrarBanidosLegado`) e some do documento depois dela.
   */
  clientesBanidos?: ClienteBanido[];
  /** Mensagem exibida ao cliente após confirmar o agendamento */
  mensagemPosAgendamento?: string;
  /** Endereço do estabelecimento (exibido na confirmação e usado no link do mapa) */
  endereco?: string;
  /**
   * Endereço formatado pelo Google Places (quando o barbeiro escolheu uma
   * sugestão do autocomplete, em vez de digitar o endereço livremente).
   */
  enderecoFormatado?: string;
  /** Coordenadas do endereço (Google Places), usadas para um pino preciso no mapa. */
  latitude?: number;
  longitude?: number;
  /** Datas em que o barbeiro não atende (formato YYYY-MM-DD) — folgas, férias, feriados */
  datasBloqueadas?: DataISO[];
  /** Bloqueios de horário específico dentro de um dia (evento pessoal) */
  bloqueiosHorario?: BloqueioHorario[];
  /** Banner promocional exibido ao cliente na tela de agendamento */
  bannerPromocional?: BannerPromocional;
  /**
   * Presente quando este profissional faz parte de uma equipe (negócio).
   * Ausente = profissional solo, comportamento idêntico ao de sempre.
   */
  negocioId?: string;
  /**
   * Nome do negócio, denormalizado para a vitrine do cliente poder agrupar
   * profissionais da mesma equipe sem precisar ler `negocios/{id}` (coleção
   * privada, só o dono tem acesso).
   */
  negocioNome?: string;
  /**
   * Visibilidade na vitrine para membros de equipe (ausente/true = visível).
   * Espelha `MembroEquipe.ativo`, mas fica no doc público porque a vitrine
   * do cliente não tem acesso à subcoleção privada de membros do negócio.
   */
  ativo?: boolean;
  /**
   * Sinal de disponibilidade calculado pela Cloud Function agendada
   * `calcularDisponibilidade` (ver functions/index.js e
   * functions/disponibilidade.js), com base na ocupação real da agenda —
   * não apenas se o barbeiro atende naquele dia da semana. Alimenta o
   * `DisponibilidadeChip` na vitrine do cliente ("Hoje" / "Disponível
   * amanhã"). Só a Function escreve esses campos: o client é travado
   * contra escrita direta em `firestore.rules` (bloco `barbeiros/{id}`).
   */
  disponivelHoje?: boolean;
  disponivelAmanha?: boolean;
  disponibilidadeCalculadaEm?: FirestoreDate;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface Agendamento {
  id: string;
  barbeiroId: string;
  barbeiroNome: string;
  barbeiroTelefone?: string;
  /** Email do cliente (apenas exibição/contato — identidade é clienteUid) */
  cliente: string;
  clienteUid: string;
  clienteNome: string;
  clienteTelefone?: string;
  status: StatusAgendamento;
  data: DataISO;
  horario: Horario;
  servico?: string;
  /** Identificador imutável do serviço usado para a criação segura no servidor. */
  servicoId?: string;
  preco?: string;
  precoEmCentavos?: number;
  /** Denormalizado do Barbeiro no momento da criação — usado nas regras de
   * segurança (dono do negócio pode ver/gerenciar) e no relatório de comissões. */
  negocioId?: string;
  /** Comissão calculada (centavos) quando o agendamento é concluído, se o
   * profissional pertence a uma equipe com comissão configurada. */
  comissaoCentavos?: number;
  /** 'manual' = criado pelo próprio barbeiro (cliente sem conta no app); ausente/'cliente' = fluxo normal. */
  origem?: 'cliente' | 'manual';
  rating?: number;
  paymentMethod?: string;
  cancelledBy?: 'cliente' | 'barbeiro';
  createdAt?: FirestoreDate;
  confirmedAt?: FirestoreDate;
  cancelledAt?: FirestoreDate;
  concludedAt?: FirestoreDate;
  ratedAt?: FirestoreDate;
}

/** Dados de um novo agendamento antes de ganhar id/createdAt */
export type NovoAgendamento = Omit<Agendamento, 'id' | 'createdAt'>;

/**
 * Lançamento manual de despesa do barbeiro (aluguel, produtos de trabalho,
 * contas, etc.). Alimenta a coluna "Despesas" dos relatórios financeiros
 * (Início e aba Relatórios). Sem integração com meio de pagamento — é só
 * um registro do que foi gasto, lançado pelo próprio barbeiro.
 */
export interface Despesa {
  id: string;
  barbeiroId: string;
  descricao: string;
  valorEmCentavos: number;
  /** Data em que a despesa ocorreu (não necessariamente hoje) */
  data: DataISO;
  createdAt?: FirestoreDate;
}

export interface Avaliacao {
  agendamentoId: string;
  barbeiroId: string;
  barbeiroNome: string;
  cliente: string;
  clienteNome?: string;
  rating: number;
  comment?: string;
  createdAt?: FirestoreDate;
}

// ─── Lista de espera ──────────────────────────────────────────────────────────

export interface EntradaListaEspera {
  id: string;
  barbeiroId: string;
  clienteUid: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone?: string;
  data: DataISO;       // data desejada
  servicoId?: string;
  servicoNome?: string;
  status: 'aguardando' | 'notificado' | 'agendado' | 'expirado';
  createdAt?: FirestoreDate;
}

// ─── Agendamentos recorrentes ─────────────────────────────────────────────────

export type FrequenciaRecorrencia = 'semanal' | 'quinzenal' | 'mensal';

export interface Recorrencia {
  id: string;
  barbeiroId: string;
  clienteUid: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone?: string;
  servicoId: string;
  servicoNome: string;
  precoEmCentavos: number;
  diaSemana: number;         // 0=dom ... 6=sab
  horario: Horario;          // "09:00"
  frequencia: FrequenciaRecorrencia;
  ativo: boolean;
  ultimoAgendamento?: DataISO;
  createdAt?: FirestoreDate;
}

// ─── Navegação ───────────────────────────────────────────────────────────────

export type ClienteTabParamList = {
  Barbeiros: undefined;
  Agendamentos: undefined;
  PerfilCliente: undefined;
};

/** Abas internas da área autenticada do barbeiro. Mantido aqui para que a
 * pilha raiz e os deep links possam abrir uma aba sem recorrer a `any`. */
export type BarbeiroTabParamList = {
  Inicio: undefined;
  Agenda: undefined;
  Config: undefined;
  Analytics: undefined;
  Perfil: undefined;
};

export type RootStackParamList = {
  /** Primeira tela do fluxo de entrada para quem não está logado. */
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  VerifyEmail: undefined;
  Cliente: NavigatorScreenParams<ClienteTabParamList> | undefined;
  Barbeiro: NavigatorScreenParams<BarbeiroTabParamList> | undefined;
  Agendamento: { barbeiro: Barbeiro; servicoId?: string; agendamentoParaSubstituir?: Agendamento };
  /**
   * Porta de entrada do deep link `barbershop://agendar/{barbeiroId}` (QR Code).
   * Só recebe o uid; a tela resolve o `Barbeiro` e faz replace para 'Agendamento'.
   */
  AbrirAgendamento: { barbeiroId: string };
  /** Porta de entrada do deep link/link universal de um QR Code, link ou
   * convite de vínculo (ver VinculoClienteRepository.resgatarConvitePorCodigo). */
  AbrirConvite: { codigo: string; origem?: string };
  /** Porta autenticada do botão no e-mail financeiro. */
  AbrirRelatorios: undefined;
  AdicionarCodigo: undefined;
  /** Perfil público do profissional — vitrine mostra só nome/foto/descrição
   * e link para cá; daqui o cliente escolhe o serviço e segue para Agendamento. */
  PerfilProfissional: { barbeiro: Barbeiro };
  AgendamentoConfirmado: {
    agendamento: NovoAgendamento & { id?: string };
    barbeiro: Barbeiro;
    whatsappEnviado: boolean;
    mensagemPosAgendamento?: string | null;
  };
  Historico: undefined;
  Perfil: undefined;
  Privacidade: undefined;
  // Telas de configuração do barbeiro
  // profissionalId presente = dono editando um membro da equipe;
  // ausente = usuário logado editando o próprio perfil (comportamento de sempre).
  ConfigAgenda: { profissionalId?: string; profissionalNome?: string } | undefined;
  Folgas: { profissionalId?: string; profissionalNome?: string } | undefined;
  Bloqueios: { profissionalId?: string; profissionalNome?: string } | undefined;
  ConfigServicos: { profissionalId?: string; profissionalNome?: string } | undefined;
  /** Tela onde o barbeiro liga/desliga canais (WhatsApp/SMS/Push) e eventos
   * de aviso de agendamento. `profissionalId`/`profissionalNome` são só de
   * exibição — a config carregada/salva é sempre a do uid logado (negócio
   * inteiro ou autônomo, ver ConfiguracaoNotificacoesScreen). */
  ConfiguracaoNotificacoes: { profissionalId?: string; profissionalNome?: string } | undefined;
  ConfiguracaoRelatoriosEmail: undefined;
  SetupBarbeiro: undefined;
  Clientes: undefined;
  Aniversariantes: undefined;
  Promocao: undefined;
  BannerPromocional: undefined;
  AgendamentoManual: {
    clienteId?: string;
    clienteNome?: string;
    clienteTelefone?: string;
  } | undefined;
  Equipe: undefined;
  EditarProfissional: { profissionalId?: string } | undefined;
  Comissoes: undefined;
  TemplatesMensagem: undefined;
  ClientesBanidos: undefined;
  HistoricoCliente: { clienteUid: string; clienteNome: string; barbeiroId: string };
  QRCode: undefined;
  Suporte: undefined;
  ListaEspera: undefined;
  Recorrencias: undefined;
  CriarRecorrencia: {
    clienteUid: string;
    clienteNome: string;
    clienteEmail: string;
    clienteTelefone?: string;
    barbeiroId: string;
  };
  Onboarding: { tipo: 'cliente' | 'barbeiro' };
  Despesas: undefined;
  VendasRelatorio: undefined;
};

/**
 * Icone — ponto único de entrada para ícones no app (Fase 1,
 * BRIEFING-FASE-1.md). Ninguém importa de `lucide-react-native` direto —
 * sempre por aqui, para o app inteiro ficar preso à mesma escala de
 * tamanho, mesma espessura de traço e mesma fonte de cor do tema.
 *
 * Substitui os 207 emojis usados como ícone (ver mapa de substituição no
 * briefing) — emoji renderiza como fonte do sistema operacional, varia de
 * aparelho pra aparelho e não aceita cor/tamanho consistentes; ícone SVG
 * (`react-native-svg`, via `lucide-react-native`) resolve os dois problemas.
 */
import React from 'react';
import {
  Calendar,
  CalendarDays,
  Scissors,
  Store,
  CheckCircle2,
  Check,
  RefreshCw,
  Cake,
  Clock,
  Trash2,
  MessageCircle,
  Ban,
  ClipboardList,
  User,
  Users,
  Sun,
  Moon,
  Tag,
  AlertTriangle,
  Bell,
  Pencil,
  Lock,
  KeyRound,
  Settings,
  BarChart3,
  TrendingUp,
  Wallet,
  Banknote,
  CreditCard,
  Mail,
  MapPin,
  Briefcase,
  Megaphone,
  Smartphone,
  Contact,
  Handshake,
  QrCode,
  PartyPopper,
  HelpCircle,
  LogOut,
  Star,
  Home,
  X,
  Construction,
  FileText,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

// Mapa nome → componente Lucide (tabela de substituição do briefing).
// Nome em português, curto, sem depender do usuário saber o nome em inglês
// do ícone do Lucide.
const MAPA_ICONES = {
  calendario: Calendar,
  'calendario-mensal': CalendarDays,
  tesoura: Scissors,
  barbearia: Store,
  confirmado: CheckCircle2,
  check: Check,
  recarregar: RefreshCw,
  aniversario: Cake,
  horario: Clock,
  excluir: Trash2,
  mensagem: MessageCircle,
  bloqueado: Ban,
  lista: ClipboardList,
  pessoa: User,
  equipe: Users,
  'tema-claro': Sun,
  'tema-escuro': Moon,
  preco: Tag,
  aviso: AlertTriangle,
  notificacao: Bell,
  editar: Pencil,
  senha: Lock,
  chave: KeyRound,
  configuracao: Settings,
  relatorio: BarChart3,
  tendencia: TrendingUp,
  carteira: Wallet,
  dinheiro: Banknote,
  cartao: CreditCard,
  email: Mail,
  endereco: MapPin,
  profissional: Briefcase,
  promocao: Megaphone,
  telefone: Smartphone,
  contato: Contact,
  comissao: Handshake,
  qrcode: QrCode,
  sucesso: PartyPopper,
  ajuda: HelpCircle,
  sair: LogOut,
  avaliacao: Star,
  inicio: Home,
  fechar: X,
  'em-obra': Construction,
  documento: FileText,
  'mostrar-senha': Eye,
  'ocultar-senha': EyeOff,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof MAPA_ICONES;

/** Tamanhos permitidos — nada fora da escala. */
const TAMANHOS = [16, 20, 24, 32] as const;
export type TamanhoIcone = (typeof TAMANHOS)[number];

/** Espessura de traço fixa em todo o app — regra `icon-style-consistent`. */
const STROKE_WIDTH = 2;

interface IconeProps {
  nome: NomeIcone;
  /** Um dos 4 valores da escala (16/20/24/32). Padrão: 20. */
  tamanho?: TamanhoIcone;
  /** Cor explícita. Sem isso, puxa `theme.colors.text` do tema atual. */
  cor?: string;
  accessibilityLabel?: string;
  /**
   * Marque `true` quando o ícone é só decoração ao lado de um texto que já
   * diz a mesma coisa (ex.: ícone de sino ao lado da palavra "Notificações")
   * — evita leitor de tela anunciar a informação duas vezes.
   */
  decorativo?: boolean;
}

export default function Icone({
  nome,
  tamanho = 20,
  cor,
  accessibilityLabel,
  decorativo = false,
}: IconeProps) {
  const { theme } = useTheme();
  const Componente = MAPA_ICONES[nome];
  const corFinal = cor ?? theme.colors.text;

  return (
    <Componente
      size={tamanho}
      color={corFinal}
      strokeWidth={STROKE_WIDTH}
      accessibilityElementsHidden={decorativo}
      importantForAccessibility={decorativo ? 'no-hide-descendants' : 'auto'}
      accessibilityLabel={decorativo ? undefined : accessibilityLabel}
    />
  );
}

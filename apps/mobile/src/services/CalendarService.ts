/**
 * CalendarService — adiciona agendamentos ao calendário do usuário.
 *
 * Usa o link universal do Google Agenda via Linking: zero dependências nativas,
 * funciona em qualquer aparelho com o app ou navegador instalado.
 *
 * NOTA: Linking.canOpenURL() para URLs https:// requer a declaração
 * <queries> no AndroidManifest (já presente). Para evitar falso-negativo
 * em dispositivos sem o Google Calendar mas com um navegador, abrimos
 * diretamente via openURL e tratamos qualquer falha no catch.
 */
import { Alert, Linking } from 'react-native';
import type { Agendamento } from '../types';

type AgendamentoCalendario = Pick<
  Agendamento,
  'data' | 'horario' | 'barbeiroNome' | 'servico'
>;

/** Formata Date para o padrão do Google Calendar: YYYYMMDDTHHMMSS (hora local) */
const toGCalDate = (d: Date): string =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    'T',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    '00',
  ].join('');

class CalendarService {
  /**
   * Abre o Google Agenda com o evento pré-preenchido para o usuário salvar.
   */
  async addAgendamentoToCalendar(
    agendamento: AgendamentoCalendario,
  ): Promise<boolean> {
    try {
      const start = new Date(`${agendamento.data}T${agendamento.horario}:00`);
      if (isNaN(start.getTime())) {
        Alert.alert('Erro', 'Data do agendamento inválida.');
        return false;
      }
      const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hora

      // A URL é montada à mão (e não com URLSearchParams) porque o Google
      // Agenda exige a barra literal em `dates=inicio/fim`; URLSearchParams
      // a codifica como %2F e o GCal ignora o intervalo.
      const url =
        `https://calendar.google.com/calendar/render?action=TEMPLATE` +
        `&text=${encodeURIComponent(`Barbershop - ${agendamento.barbeiroNome}`)}` +
        `&dates=${toGCalDate(start)}/${toGCalDate(end)}` +
        `&details=${encodeURIComponent(
          `Agendamento com ${agendamento.barbeiroNome}\nServiço: ${agendamento.servico || 'Corte e barba'}`,
        )}` +
        `&location=${encodeURIComponent('Barbershop')}`;

      // Abre diretamente sem canOpenURL: em Android o sistema sempre consegue
      // abrir URLs https:// via browser ou app nativo.
      await Linking.openURL(url);
      return true;
    } catch (error) {
      console.error('Erro ao adicionar ao calendário:', error);
      Alert.alert(
        'Não foi possível abrir o calendário',
        'Verifique se você tem um navegador instalado e tente novamente.',
      );
      return false;
    }
  }
}

export default new CalendarService();

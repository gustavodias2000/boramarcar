/**
 * CalendarService — o botão "adicionar à agenda" depois de marcar o horário.
 *
 * A armadilha aqui é a URL: o Google Agenda exige a barra literal em
 * `dates=inicio/fim`. Trocar a montagem manual por `URLSearchParams` codifica
 * a barra como %2F, o GCal ignora o intervalo e o evento é criado na hora
 * errada — sem erro nenhum, o cliente só perde o horário. Por isso o teste
 * checa a barra crua explicitamente.
 */
import { Alert, Linking } from 'react-native';
import CalendarService from '../../src/services/CalendarService';

const agendamento = {
  data: '2026-08-15',
  horario: '14:30',
  barbeiroNome: 'João',
  servico: 'Corte degradê',
};

beforeEach(() => {
  jest.clearAllMocks();
  // `Linking` não é mockado globalmente (o jest.setup.js preserva o módulo
  // real do react-native de propósito); só o `Alert` é.
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
});

const urlAberta = () => (Linking.openURL as jest.Mock).mock.calls[0][0] as string;
const alertas = () => (Alert.alert as jest.Mock);

describe('addAgendamentoToCalendar', () => {
  it('abre o Google Agenda com o evento pronto', async () => {
    await expect(CalendarService.addAgendamentoToCalendar(agendamento as any)).resolves.toBe(true);

    expect(urlAberta()).toContain(
      'https://calendar.google.com/calendar/render?action=TEMPLATE',
    );
  });

  it('mantém a BARRA CRUA em dates=inicio/fim — %2F quebra o intervalo', async () => {
    await CalendarService.addAgendamentoToCalendar(agendamento as any);

    expect(urlAberta()).toContain('&dates=20260815T143000/20260815T153000');
    expect(urlAberta()).not.toContain('%2F');
  });

  it('reserva uma hora a partir do horário marcado', async () => {
    await CalendarService.addAgendamentoToCalendar({
      ...agendamento,
      horario: '23:30',
    } as any);

    // Vira o dia corretamente: 23:30 do dia 15 termina 00:30 do dia 16.
    expect(urlAberta()).toContain('dates=20260815T233000/20260816T003000');
  });

  it('leva o nome do profissional no título', async () => {
    await CalendarService.addAgendamentoToCalendar(agendamento as any);
    expect(urlAberta()).toContain(`text=${encodeURIComponent('Barbershop - João')}`);
  });

  it('escapa acentos e espaços do serviço', async () => {
    await CalendarService.addAgendamentoToCalendar(agendamento as any);
    expect(urlAberta()).toContain(encodeURIComponent('Serviço: Corte degradê'));
  });

  it('usa "Corte e barba" quando o serviço não foi informado', async () => {
    await CalendarService.addAgendamentoToCalendar({ ...agendamento, servico: '' } as any);
    expect(urlAberta()).toContain(encodeURIComponent('Corte e barba'));
  });
});

describe('quando algo dá errado', () => {
  it('data inválida: avisa e não tenta abrir nada', async () => {
    await expect(
      CalendarService.addAgendamentoToCalendar({ ...agendamento, data: 'sem-data' } as any),
    ).resolves.toBe(false);

    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(alertas()).toHaveBeenCalledWith('Erro', 'Data do agendamento inválida.');
  });

  it('horário inválido também é barrado antes de montar a URL', async () => {
    await expect(
      CalendarService.addAgendamentoToCalendar({ ...agendamento, horario: '99:99' } as any),
    ).resolves.toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('sem app que abra o link: devolve false com instrução, sem derrubar a tela', async () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no activity found'));

    await expect(CalendarService.addAgendamentoToCalendar(agendamento as any)).resolves.toBe(
      false,
    );
    expect(alertas()).toHaveBeenCalledWith(
      'Não foi possível abrir o calendário',
      expect.stringContaining('navegador'),
    );
    erro.mockRestore();
  });
});

import WhatsAppService from '../../src/services/WhatsAppService';
import { Alert, Linking } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn()
  },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn()
  }
}));

// Mock fetch
global.fetch = jest.fn();

// WhatsAppService.sendTextMessage tenta primeiro a Cloud Function
// `sendWhatsApp` (token no servidor) — mockado pra sempre rejeitar,
// exercitando o fallback local (Linking) testado abaixo.
jest.mock('../../src/services/CloudFunctionsClient', () => ({
  httpsCallable: jest.fn(() => jest.fn(() => Promise.reject(new Error('offline')))),
}));

describe('WhatsAppService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  describe('formatPhoneNumber', () => {
    it('should format Brazilian phone number correctly', () => {
      const formatted = WhatsAppService.formatPhoneNumber('11999999999');
      expect(formatted).toBe('5511999999999');
    });

    it('should keep already formatted number', () => {
      const formatted = WhatsAppService.formatPhoneNumber('5511999999999');
      expect(formatted).toBe('5511999999999');
    });

    it('should handle phone with special characters', () => {
      const formatted = WhatsAppService.formatPhoneNumber('(11) 99999-9999');
      expect(formatted).toBe('5511999999999');
    });
  });

  describe('gerarMensagemAgendamento', () => {
    it('should generate correct appointment message', () => {
      const barbeiro = {
        nome: 'João Silva',
        especialidade: 'Corte e barba'
      };
      const cliente = { nome: 'Maria' };
      const data = '2024-01-15';
      const horario = '14:00';

      const mensagem = WhatsAppService.gerarMensagemAgendamento(
        barbeiro, cliente, data, horario
      );

      expect(mensagem).toContain('João Silva');
      expect(mensagem).toContain('Maria');
      expect(mensagem).toContain('2024-01-15');
      expect(mensagem).toContain('14:00');
      expect(mensagem).toContain('Corte e barba');
    });
  });

  describe('sendTextMessage', () => {
    it('should use fallback when Cloud Function is not available', async () => {
      // A Cloud Function está mockada pra rejeitar (jest.setup.js), então
      // cai direto no fallback: abrir o WhatsApp via Linking.openURL.
      Linking.openURL.mockResolvedValue(true);

      const result = await WhatsAppService.sendTextMessage(
        '11999999999',
        'Teste'
      );

      expect(result).toBe(true);
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining('whatsapp://send?phone=5511999999999')
      );
    });

    it('should show alert when WhatsApp is not installed', async () => {
      // Falha tanto o link direto (whatsapp://) quanto o fallback web
      // (wa.me) — só aí o serviço desiste e mostra o alerta.
      Linking.openURL.mockRejectedValue(new Error('não instalado'));

      const result = await WhatsAppService.sendTextMessage(
        '11999999999',
        'Teste'
      );

      expect(result).toBe(false);
      expect(Alert.alert).toHaveBeenCalledWith(
        'WhatsApp não encontrado',
        'Não foi possível abrir o WhatsApp. Verifique se ele está instalado.'
      );
    });
  });

  describe('gerarMensagemConfirmacao', () => {
    it('should generate correct confirmation message', () => {
      const cliente = { nome: 'Maria' };
      const data = '2024-01-15';
      const horario = '14:00';
      const barbeiroNome = 'João';

      const mensagem = WhatsAppService.gerarMensagemConfirmacao(
        cliente, data, horario, barbeiroNome
      );

      expect(mensagem).toContain('Maria');
      expect(mensagem).toContain('confirmado');
      expect(mensagem).toContain('João');
      expect(mensagem).toContain('2024-01-15');
      expect(mensagem).toContain('14:00');
    });
  });

  describe('gerarMensagemCancelamento', () => {
    it('should include the reason when provided', () => {
      const mensagem = WhatsAppService.gerarMensagemCancelamento(
        { nome: 'Maria' }, '2024-01-15', '14:00', 'Reagendamento necessário',
      );
      expect(mensagem).toContain('Maria');
      expect(mensagem).toContain('Reagendamento necessário');
    });

    it('should omit the "Motivo" section when no reason is given', () => {
      const mensagem = WhatsAppService.gerarMensagemCancelamento(
        { nome: 'Maria' }, '2024-01-15', '14:00',
      );
      expect(mensagem).not.toContain('Motivo');
    });
  });

  describe('gerarMensagemAniversario', () => {
    it('should include the client name and the barbershop name', () => {
      const mensagem = WhatsAppService.gerarMensagemAniversario({ nome: 'Maria' }, 'Barbearia do João');
      expect(mensagem).toContain('Maria');
      expect(mensagem).toContain('Barbearia do João');
      expect(mensagem).toContain('aniversário');
    });
  });

  describe('gerarMensagemPromocional', () => {
    it('should interpolate {nome_cliente} when present', () => {
      const mensagem = WhatsAppService.gerarMensagemPromocional(
        { nome: 'Maria' }, 'Olá {nome_cliente}! 20% de desconto essa semana.',
      );
      expect(mensagem).toBe('Olá Maria! 20% de desconto essa semana.');
    });

    it('should return the text unchanged when there is no placeholder', () => {
      const texto = 'Promoção geral, sem nome.';
      expect(WhatsAppService.gerarMensagemPromocional({ nome: 'Maria' }, texto)).toBe(texto);
    });

    it('should replace every occurrence of the placeholder, not just the first', () => {
      const mensagem = WhatsAppService.gerarMensagemPromocional(
        { nome: 'Maria' }, '{nome_cliente}, oi {nome_cliente}!',
      );
      expect(mensagem).toBe('Maria, oi Maria!');
    });
  });

  describe('gerarMensagemComTemplate', () => {
    it('should interpolate every supported variable', () => {
      const mensagem = WhatsAppService.gerarMensagemComTemplate(
        'Olá {nome_cliente}, {nome_barbeiro} confirma {servico} em {data} às {horario}.',
        {
          nome_barbeiro: 'João',
          nome_cliente: 'Maria',
          data: '2024-01-15',
          horario: '14:00',
          servico: 'Corte',
        },
      );
      expect(mensagem).toBe('Olá Maria, João confirma Corte em 2024-01-15 às 14:00.');
    });
  });
});
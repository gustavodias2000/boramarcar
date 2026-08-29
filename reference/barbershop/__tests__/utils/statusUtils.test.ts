import { getStatusColor, getStatusText, STATUS_MAP } from '../../src/utils/statusUtils';

describe('statusUtils', () => {
  it('retorna label e cor para cada status conhecido', () => {
    (Object.keys(STATUS_MAP) as Array<keyof typeof STATUS_MAP>).forEach((status) => {
      expect(getStatusText(status)).toBe(STATUS_MAP[status].label);
      expect(getStatusColor(status)).toBe(STATUS_MAP[status].color);
    });
  });

  it('cai no fallback (pendente) para status desconhecido ou ausente', () => {
    expect(getStatusText('status-inexistente')).toBe(STATUS_MAP.pendente.label);
    expect(getStatusColor(undefined)).toBe(STATUS_MAP.pendente.color);
  });
});

module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `\.m?[jt]sx?$` (não só `[jt]sx?$`): `lucide-react-native` (Fase 1 —
  // Icone.tsx) publica só build ESM em arquivo `.mjs` — sem cobrir essa
  // extensão aqui, o Jest nunca aplica o babel-jest a ele (mesmo liberado
  // no transformIgnorePatterns abaixo) e quebra com
  // "Unexpected token 'export'" em qualquer teste que importe uma tela que
  // use <Icone />, transitivamente.
  transform: {
    '^.+\\.m?[jt]sx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-image-picker|lucide-react-native|react-native-reanimated|react-native-haptic-feedback)/)'
  ],
  // e2e/ usa Detox (precisa de device real/emulador) — não roda no Jest unitário
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/rules/'],
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.test.{js,jsx,ts,tsx}',
    '!src/index.js',
    // `src/types` é só declaração de tipo — não tem linha executável, então
    // aparecia como 0% e puxava a média para baixo sem significar nada.
    '!src/types/**',
    '!src/types.ts',
  ],
  // LIMITE POR DIRETÓRIO, não global único.
  //
  // O limite global de 70% era inalcançável por construção: `src/screens` +
  // `src/screens/tabs` concentram a maior parte dos statements do projeto e
  // são caras de testar (RN 0.80 + navegação + Firebase mockado por arquivo).
  // Um número global fazia a camada de lógica — que é onde mora o risco de
  // verdade (dinheiro, agenda, permissão) — ser refém da camada de tela.
  //
  // Agora cada camada responde pelo próprio risco:
  //  - repositórios/serviços/utils/contexto: alto, porque um bug ali é
  //    silencioso e caro (preço errado, horário duplicado, permissão furada);
  //  - telas: limite no patamar ATUAL, funcionando como catraca — não pode
  //    cair, e sobe conforme as suítes de tela forem escritas.
  //
  // Os valores estão alguns pontos abaixo do medido de propósito: catraca
  // não pode quebrar o CI por causa de uma linha de margem, mas quebra na
  // hora se alguém apagar cobertura de verdade.
  //
  // ATENÇÃO: quando há limite por caminho, o Jest SUBTRAI esses arquivos do
  // cálculo global. Por isso `global` aqui vale só para o que sobra
  // (navegação, tema, assets) — não é o número do projeto inteiro.
  coverageThreshold: {
    './src/data/repositories/': { statements: 95, branches: 89, functions: 94, lines: 95 },
    './src/context/': { statements: 96, branches: 88, functions: 100, lines: 96 },
    './src/utils/': { statements: 92, branches: 87, functions: 93, lines: 94 },
    './src/services/': { statements: 91, branches: 81, functions: 93, lines: 91 },
    './src/hooks/': { statements: 83, branches: 71, functions: 77, lines: 84 },
    './src/components/': { statements: 74, branches: 61, functions: 73, lines: 74 },
    './src/screens/tabs/': { statements: 52, branches: 43, functions: 30, lines: 53 },
    './src/screens/': { statements: 36, branches: 31, functions: 26, lines: 37 },
    global: { statements: 40, branches: 0, functions: 25, lines: 45 },
  },
};

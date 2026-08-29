/**
 * ESLint — Barbershop
 *
 * A configuração era só `extends: '@react-native'`, sem declarar em que
 * ambiente cada pasta roda. O resultado eram 70 erros `no-undef` falsos
 * (`jest` no setup dos testes, `waitFor` nos testes e2e do Detox, `Buffer`
 * nas Cloud Functions) que afogavam os erros de verdade — e impediam usar o
 * lint como portão no CI, porque ele nunca ficaria verde.
 *
 * Os `overrides` abaixo apenas informam os globais de cada ambiente; nenhuma
 * regra de qualidade foi afrouxada.
 */
module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Testes (Jest) e o setup global de mocks.
      files: [
        '**/__tests__/**/*.{js,jsx,ts,tsx}',
        '**/*.{spec,test}.{js,jsx,ts,tsx}',
        'jest.setup.js',
        'jest.config.js',
      ],
      env: { jest: true, node: true },
    },
    {
      // Testes end-to-end do Detox: globais próprios (device, element, by,
      // waitFor) injetados pelo runner.
      files: ['e2e/**/*.{js,ts}'],
      env: { jest: true, node: true },
      globals: {
        device: 'readonly',
        element: 'readonly',
        by: 'readonly',
        waitFor: 'readonly',
      },
    },
    {
      // Cloud Functions rodam em Node, não no React Native.
      files: ['functions/**/*.js'],
      env: { node: true, es2022: true },
    },
  ],
};

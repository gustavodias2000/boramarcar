const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // CORREÇÃO: o Metro 0.82+ (RN 0.80) ativa "package exports" por padrão,
    // o que quebra o Firebase Web SDK no React Native com o erro
    // "Component auth has not been registered yet" (o @firebase/app e o
    // @firebase/auth carregam de cópias diferentes do pacote).
    // Desligando, o Metro resolve pelos campos react-native/browser/main,
    // que o Firebase suporta corretamente.
    // Ref: github.com/firebase/firebase-js-sdk/issues/8657
    unstable_enablePackageExports: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

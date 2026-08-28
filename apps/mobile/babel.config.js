module.exports = {
  presets: ['@react-native/babel-preset', '@babel/preset-typescript'],
  // `react-native-reanimated/plugin` tem de ser SEMPRE o último da lista — regra do
  // próprio Reanimated, que reescreve o AST das worklets depois dos outros plugins.
  //
  // Ele voltou junto com a navegação. Nenhum código nosso escreve worklet, mas
  // `react-native-screens` usa, e sem o plugin a falha é em tempo de execução, numa
  // transição de tela, com mensagem que não aponta para o babel.
  plugins: ['react-native-reanimated/plugin'],
};

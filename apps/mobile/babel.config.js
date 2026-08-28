module.exports = {
  presets: [
    '@react-native/babel-preset',
    '@babel/preset-typescript'
  ],
  // react-native-reanimated/plugin precisa ser SEMPRE o último da lista
  // (regra do próprio Reanimated — ele reescreve o AST das "worklets" depois
  // que os outros plugins já rodaram).
  plugins: [
    'react-native-reanimated/plugin',
  ],
};

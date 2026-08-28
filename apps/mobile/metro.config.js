const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const repositoryRoot = path.resolve(__dirname, '../..');

/**
 * O `node_modules` da raiz PRECISA estar em `watchFolders`, não só em
 * `nodeModulesPaths`.
 *
 * As duas opções parecem redundantes e não são. `nodeModulesPaths` diz ONDE procurar;
 * `watchFolders` diz o que o Metro aceita servir. Ele só entrega arquivos que estejam
 * sob o `projectRoot` ou sob uma pasta observada — qualquer coisa fora disso é tratada
 * como inexistente, mesmo com o caminho apontado e o arquivo no disco.
 *
 * Num monorepo com npm workspaces isso morde sempre: o npm iça as dependências para a
 * raiz, e `apps/mobile/node_modules` fica praticamente vazio. Sem a linha abaixo o
 * empacotamento falha já na primeira dependência — na prática `@babel/runtime`, o helper
 * que o Babel injeta no topo de `index.js` —, e a mensagem culpa esse pacote, o que
 * manda quem está lendo investigar a dependência errada. `react-native` falha do mesmo
 * jeito; só não aparece por não ser o primeiro.
 */
const config = {
  watchFolders: [
    path.join(repositoryRoot, 'node_modules'),
    path.join(repositoryRoot, 'packages/core'),
  ],
  resolver: {
    nodeModulesPaths: [
      path.join(__dirname, 'node_modules'),
      path.join(repositoryRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

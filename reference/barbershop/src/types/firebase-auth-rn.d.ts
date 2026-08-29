/**
 * `getReactNativePersistence` existe no build React Native do Firebase Auth
 * (`@firebase/auth/dist/rn/index.js` — é para lá que o Metro resolve, pelo
 * campo "react-native" do package.json, já que este projeto desliga o
 * `unstable_enablePackageExports` no metro.config.js).
 *
 * O pacote guarda-chuva `firebase` publica apenas as tipagens do build web,
 * então a função existe em runtime mas não nos tipos. Esta declaração
 * apenas ensina o TypeScript sobre ela — não muda nada no build.
 *
 * Sem essa função o Auth roda com persistência em memória e o usuário
 * precisa digitar email e senha a cada abertura do app (ver firebaseConfig.ts).
 */
import type { Persistence } from 'firebase/auth';

/** Subconjunto do AsyncStorage que o Firebase Auth usa. */
interface ArmazenamentoReactNative {
  setItem(chave: string, valor: string): Promise<void>;
  getItem(chave: string): Promise<string | null>;
  removeItem(chave: string): Promise<void>;
}

declare module 'firebase/auth' {
  export function getReactNativePersistence(
    armazenamento: ArmazenamentoReactNative,
  ): Persistence;
}

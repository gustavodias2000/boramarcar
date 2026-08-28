/**
 * Assets de imagem locais (`require('./foo.png')`) resolvidos pelo Metro em
 * runtime, mas sem tipagem própria — sem isso o TypeScript não conhece o
 * módulo `*.png` e `npx tsc --noEmit` falha. O retorno real do Metro é um
 * número (id do asset) ou objeto de resolução; `any` é o que o próprio
 * `Image.source` do React Native espera nesse caso, então não há tipo mais
 * preciso a declarar aqui.
 */
declare module '*.png' {
  const value: any;
  export default value;
}

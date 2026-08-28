# Guia de Deploy Manual — Barbershop

Passo a passo do que precisa ser feito **no seu computador** para ativar tudo
que foi implementado no código. Siga na ordem.

---

## 0. Atualizar o projeto local

```powershell
cd C:\caminho\para\Barbershop
git pull
npm install --legacy-peer-deps
```

`npm install` é necessário porque removemos uma dependência deprecada
(`metro-react-native-babel-preset`).

---

## 1. Testar o build no celular (validação da migração TypeScript)

```powershell
npx react-native run-android
```

O Metro compila TypeScript nativamente — deve funcionar direto. Se aparecer
qualquer erro, copie a mensagem e me mande.

**Checklist rápido de teste no aparelho:**

- [ ] Login e cadastro funcionam (o cadastro agora exige aceitar a Política de Privacidade)
- [ ] Ao criar conta, chega o email de verificação
- [ ] Tema claro/escuro alterna na tela de Perfil (agora é uma lista inline, sem modal)
- [ ] Agendamento: datas/horários aparecem, horários de hoje que já passaram somem
- [ ] Perfil → Privacidade → Política abre; "Excluir conta" pede a senha
- [ ] Painel do barbeiro → Analytics carrega os números

---

## 2. Revogar o token do GitHub (IMPORTANTE — segurança)

O token que você colou no chat ficou registrado no histórico da conversa.
Revogue e crie outro se precisar:

1. Acesse https://github.com/settings/tokens
2. Localize o token que começa com `ghp_O8Yy...`
3. Clique em **Delete** / **Revoke**

---

## 3. Instalar o Firebase CLI (se ainda não tiver)

```powershell
npm install -g firebase-tools
firebase login
```

O `firebase login` abre o navegador — entre com a mesma conta Google do
projeto **barbershop-a754d**. O repositório já tem `.firebaserc` apontando
para esse projeto, então não precisa configurar mais nada.

---

## 4. Publicar regras e índices do Firestore (plano gratuito serve)

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

Isso publica:
- **Regras novas**: leitura de agendamentos por `clienteUid`, exclusão do
  próprio perfil (LGPD)
- **Índices novos**: `clienteUid+createdAt`, `clienteUid+status+createdAt`,
  `data+status` (lembretes) e `barbeiroId+status+createdAt` (faturamento
  por agregação)

Os índices levam alguns minutos para construir. Acompanhe em:
https://console.firebase.google.com/project/barbershop-a754d/firestore/indexes

> Enquanto um índice estiver "Building", a query correspondente no app dá
> erro — é temporário, espere concluir.

---

## 5. Ativar o plano Blaze (necessário só para as Cloud Functions)

As Cloud Functions (`sendWhatsApp` e `lembretesAgendamento`) exigem o plano
**Blaze** (pago por uso — na prática, custo ~zero nesse volume; tem cota
gratuita generosa).

1. Console do Firebase → engrenagem → **Uso e faturamento** → **Modificar plano**
2. Escolha **Blaze** e vincule um cartão

Se preferir adiar isso, tudo funciona sem as Functions: o WhatsApp usa o
fallback (abre o app com a mensagem pronta) e só os lembretes automáticos
ficam desativados. Nesse caso, pule os passos 6 e 7.

---

## 6. Configurar os secrets do WhatsApp (só com Blaze)

Com os dados do Meta for Developers (WhatsApp Business API):

```powershell
firebase functions:secrets:set WHATSAPP_TOKEN
# cole o token quando pedir

firebase functions:secrets:set WHATSAPP_PHONE_ID
# cole o Phone Number ID quando pedir
```

---

## 7. Publicar as Cloud Functions (só com Blaze)

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

Publica:
- **`sendWhatsApp`** — envio de WhatsApp com o token protegido no servidor
- **`lembretesAgendamento`** — roda todo dia às 18h (horário de Brasília) e
  envia push para cada cliente com horário confirmado no dia seguinte

---

## 8. Dependabot (recomendado)

Revise os alertas restantes (8 vulnerabilidades, 1 high — todas em
dependências de desenvolvimento/transitivas):
https://github.com/gustavodias2000/Barbershop/security/dependabot

---

## 9. Configurar o secret do Google Places (geocoding de endereço, opcional)

Habilita o autocomplete de endereço com pino no mapa na tela de Perfil do
barbeiro (item competitivo do Gendo). **Totalmente opcional** — sem isso,
o campo de endereço continua funcionando como texto livre, exatamente
como antes.

> **Status (23/07/2026): pausado.** A criação da conta de faturamento do
> Google Cloud (necessária pra ativar a Places API) está falhando com o
> erro `OR_BACR2_44` — é um bug conhecido do lado do Google (não é nada
> errado na configuração), sem previsão de quando resolve. Ficou pendente:
> vincular a conta de faturamento já criada ("Minha conta de faturamento",
> código `01D9A1-C2085E-04C2BA`) ao projeto `barbershop-a754d`. Tentar de
> novo depois em outro navegador (Firefox/Edge) ou aguardar alguns dias.
> O resto do app funciona 100% sem isso.

1. No [Google Cloud Console](https://console.cloud.google.com/), selecione
   o mesmo projeto do Firebase (**barbershop-a754d**).
2. Ative a **Places API** (legada): menu **APIs e Serviços** → **Biblioteca**
   → busque "Places API" → **Ativar**. Isso pode exigir vincular uma conta
   de faturamento do Google Cloud (separada do plano Blaze do Firebase) —
   o Google dá uma cota gratuita mensal generosa para geocoding.
3. Crie uma chave de API: **APIs e Serviços** → **Credenciais** → **Criar
   credenciais** → **Chave de API**. Restrinja a chave à **Places API**
   (aba "Restrições de API") para reduzir o risco em caso de vazamento.
4. Configure o secret na Cloud Function:

```powershell
firebase functions:secrets:set GOOGLE_PLACES_API_KEY
# cole a chave quando pedir
```

5. Publique as functions novamente (já inclui as duas novas):

```powershell
firebase deploy --only functions
```

Publica também:
- **`placesAutocomplete`** — sugestões de endereço enquanto o barbeiro digita
- **`placesDetails`** — resolve a sugestão escolhida em endereço formatado + coordenadas

---

## Resumo do essencial

| Passo | Comando | Precisa de Blaze? |
|---|---|---|
| Atualizar + build | `git pull` → `npm install --legacy-peer-deps` → `npx react-native run-android` | Não |
| Revogar token GitHub | (site do GitHub) | — |
| Regras + índices | `firebase deploy --only firestore:rules,firestore:indexes` | **Não** |
| Secrets WhatsApp | `firebase functions:secrets:set ...` | Sim |
| Functions | `firebase deploy --only functions` | Sim |
| Secret Google Places (opcional) | `firebase functions:secrets:set GOOGLE_PLACES_API_KEY` | Sim (+ faturamento Google Cloud) |

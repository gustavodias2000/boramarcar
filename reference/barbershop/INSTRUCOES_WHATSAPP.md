# Integração WhatsApp - Aplicativo Barbershop

## Opções de Integração

### 1. Links Diretos WhatsApp (Mais Simples)

#### Implementação
Adicione esta função aos seus componentes:

```javascript
import { Linking } from 'react-native';

const enviarWhatsApp = (telefone, mensagem) => {
  const url = `whatsapp://send?phone=${telefone}&text=${encodeURIComponent(mensagem)}`;
  
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(url);
      } else {
        alert('WhatsApp não está instalado');
      }
    })
    .catch((err) => console.error('Erro ao abrir WhatsApp:', err));
};
```

#### Exemplo de Uso
```javascript
// No ClienteHome.js
const confirmarAgendamento = (barbeiro) => {
  const telefone = '5511999999999'; // Número do barbeiro
  const mensagem = `Olá ${barbeiro.nome}, gostaria de agendar um horário.`;
  enviarWhatsApp(telefone, mensagem);
};

// No BarbeiroHome.js
const contatarCliente = (cliente) => {
  const telefone = cliente.telefone;
  const mensagem = `Olá ${cliente.nome}, seu agendamento foi confirmado!`;
  enviarWhatsApp(telefone, mensagem);
};
```

### 2. API WhatsApp Business (Mais Avançada)

#### Configuração Necessária
1. Conta WhatsApp Business
2. Meta for Developers account
3. WhatsApp Business API access

#### Implementação
```javascript
const enviarMensagemAPI = async (telefone, mensagem) => {
  try {
    const response = await fetch('https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer YOUR_ACCESS_TOKEN`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'text',
        text: {
          body: mensagem
        }
      })
    });
    
    const result = await response.json();
    console.log('Mensagem enviada:', result);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
  }
};
```

### 3. Integração com React Native

#### Instalação de Dependência
```bash
npm install react-native-whatsapp
```

#### Uso
```javascript
import WhatsApp from 'react-native-whatsapp';

const enviarMensagem = () => {
  WhatsApp.send({
    phone: '5511999999999',
    msg: 'Olá, gostaria de agendar um horário!'
  });
};
```

## Implementação Recomendada

### Arquivo: `src/services/WhatsAppService.js`

```javascript
import { Linking, Alert } from 'react-native';

class WhatsAppService {
  static async enviarMensagem(telefone, mensagem) {
    try {
      // Remove caracteres especiais do telefone
      const telefoneFormatado = telefone.replace(/[^0-9]/g, '');
      
      // Adiciona código do país se não tiver
      const telefoneCompleto = telefoneFormatado.startsWith('55') 
        ? telefoneFormatado 
        : `55${telefoneFormatado}`;
      
      const url = `whatsapp://send?phone=${telefoneCompleto}&text=${encodeURIComponent(mensagem)}`;
      
      const supported = await Linking.canOpenURL(url);
      
      if (supported) {
        await Linking.openURL(url);
        return true;
      } else {
        Alert.alert(
          'WhatsApp não encontrado',
          'Por favor, instale o WhatsApp para enviar mensagens.'
        );
        return false;
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
      return false;
    }
  }

  static gerarMensagemAgendamento(barbeiro, cliente, data, horario) {
    return `Olá ${barbeiro.nome}! 

Sou ${cliente.nome} e gostaria de agendar um horário.

📅 Data: ${data}
🕐 Horário: ${horario}

Aguardo confirmação. Obrigado!`;
  }

  static gerarMensagemConfirmacao(cliente, data, horario) {
    return `Olá ${cliente.nome}! 

Seu agendamento foi confirmado! ✅

📅 Data: ${data}
🕐 Horário: ${horario}

Nos vemos em breve!`;
  }
}

export default WhatsAppService;
```

### Uso nos Componentes

#### ClienteHome.js
```javascript
import WhatsAppService from '../services/WhatsAppService';

const agendar = async (barbeiro) => {
  // Salvar no Firestore
  await addDoc(collection(db, 'agendamentos'), {
    barbeiroId: barbeiro.id,
    cliente: auth.currentUser.email,
    status: 'pendente'
  });

  // Enviar mensagem WhatsApp
  const mensagem = WhatsAppService.gerarMensagemAgendamento(
    barbeiro,
    { nome: 'Cliente' }, // Pegar dados reais do usuário
    '25/12/2024',
    '14:00'
  );
  
  await WhatsAppService.enviarMensagem(barbeiro.telefone, mensagem);
  
  alert('Agendamento solicitado e mensagem enviada!');
};
```

#### BarbeiroHome.js
```javascript
import WhatsAppService from '../services/WhatsAppService';

const confirmar = async (agendamento) => {
  // Atualizar no Firestore
  const ref = doc(db, 'agendamentos', agendamento.id);
  await updateDoc(ref, { status: 'confirmado' });

  // Enviar confirmação por WhatsApp
  const mensagem = WhatsAppService.gerarMensagemConfirmacao(
    { nome: agendamento.cliente },
    '25/12/2024',
    '14:00'
  );
  
  await WhatsAppService.enviarMensagem(agendamento.telefoneCliente, mensagem);
  
  alert('Agendamento confirmado e cliente notificado!');
};
```

## Considerações Importantes

### Permissões Android
Adicione ao `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<queries>
  <package android:name="com.whatsapp" />
  <package android:name="com.whatsapp.w4b" />
</queries>
```

### Tratamento de Erros
- Verificar se WhatsApp está instalado
- Validar formato do número de telefone
- Implementar fallback (SMS, email)

### Melhorias Futuras
- Templates de mensagem personalizáveis
- Histórico de mensagens enviadas
- Integração com agenda do barbeiro
- Lembretes automáticos

## Teste da Integração

1. Instale o WhatsApp no dispositivo de teste
2. Configure números de telefone válidos no Firebase
3. Teste o envio de mensagens
4. Verifique se as mensagens chegam corretamente

Esta implementação fornece uma base sólida para integração WhatsApp no aplicativo Barbershop.


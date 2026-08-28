/**
 * Centraliza a agenda de clientes do profissional autenticado.
 *
 * A tela conserva somente a apresentação do formulário e da lista; acesso ao
 * Firestore, permissões de contatos e mutações ficam aqui para poderem ser
 * testados sem a árvore de navegação.
 */
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../firebaseConfig';
import {
  adicionarClienteManual,
  atualizarCliente,
  importarClientesEmLote,
  listarClientesDoBarbeiro,
  removerCliente,
} from '../data/repositories/ClienteContatoRepository';
import {
  aniversarioParaExibicao,
  birthdayParaAniversario,
  diaMesParaAniversario,
  formatPhoneToE164,
  maskPhone,
  removerCodigoPaisBrasil,
} from '../utils/dateUtils';
import type { ClienteContato } from '../types';

interface ContatoDoTelefone {
  givenName?: string;
  familyName?: string;
  phoneNumbers: Array<{ number: string }>;
  birthday?: { day?: number; month?: number; year?: number };
}

export default function useClientes() {
  const [clientes, setClientes] = useState<ClienteContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [salvandoManual, setSalvandoManual] = useState(false);
  const [nomeManual, setNomeManual] = useState('');
  const [telefoneManual, setTelefoneManual] = useState('');
  const [aniversarioManual, setAniversarioManual] = useState('');
  const [clienteEditando, setClienteEditando] = useState<ClienteContato | null>(null);

  const fetchClientes = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setClientes([]);
      setLoading(false);
      return;
    }

    try {
      const data = await listarClientesDoBarbeiro(uid);
      setClientes(data);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // useFocusEffect recebe um callback síncrono; a atualização é assíncrona
      // e o estado do hook representa sua conclusão.
      fetchClientes().catch(() => {});
    }, [fetchClientes]),
  );

  const abrirModalManual = useCallback(() => {
    setClienteEditando(null);
    setNomeManual('');
    setTelefoneManual('');
    setAniversarioManual('');
    setModalVisible(true);
  }, []);

  const abrirModalEdicao = useCallback((cliente: ClienteContato) => {
    setClienteEditando(cliente);
    setNomeManual(cliente.nome);
    setTelefoneManual(cliente.telefone ? maskPhone(removerCodigoPaisBrasil(cliente.telefone)) : '');
    setAniversarioManual(cliente.aniversario ? aniversarioParaExibicao(cliente.aniversario) : '');
    setModalVisible(true);
  }, []);

  const fecharModal = useCallback(() => setModalVisible(false), []);

  const salvarManual = useCallback(async () => {
    if (!nomeManual.trim()) {
      Alert.alert('Atenção', 'Informe o nome do cliente.');
      return;
    }
    if (
      aniversarioManual &&
      aniversarioManual.replace(/\D/g, '').length === 4 &&
      !diaMesParaAniversario(aniversarioManual)
    ) {
      Alert.alert('Atenção', 'Data de aniversário inválida.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSalvandoManual(true);
    try {
      const dados = {
        nome: nomeManual.trim(),
        telefone: telefoneManual ? formatPhoneToE164(telefoneManual) : undefined,
        aniversario: diaMesParaAniversario(aniversarioManual),
      };
      if (clienteEditando) {
        await atualizarCliente(uid, clienteEditando.id, dados);
      } else {
        await adicionarClienteManual(uid, dados);
      }
      setModalVisible(false);
      await fetchClientes();
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvandoManual(false);
    }
  }, [aniversarioManual, clienteEditando, fetchClientes, nomeManual, telefoneManual]);

  const excluirCliente = useCallback((cliente: ClienteContato) => {
    Alert.alert('Remover cliente', `Remover "${cliente.nome}" da sua agenda?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          try {
            await removerCliente(uid, cliente.id);
            setClientes((prev) => prev.filter((item) => item.id !== cliente.id));
          } catch (error) {
            console.error('Erro ao remover cliente:', error);
            Alert.alert('Erro', 'Não foi possível remover. Tente novamente.');
          }
        },
      },
    ]);
  }, []);

  const importarContatos = useCallback(async () => {
    setImportando(true);
    try {
      const Contacts = (await import('react-native-contacts')).default;
      const permissao = await Contacts.requestPermission();
      if (permissao !== 'authorized') {
        Alert.alert(
          'Permissão necessária',
          'Para importar contatos, permita o acesso à sua agenda nas configurações do celular.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      const todosContatos = (await Contacts.getAll()) as ContatoDoTelefone[];
      const telefonesJaCadastrados = new Set(
        clientes.map((cliente) => cliente.telefone).filter(Boolean) as string[],
      );
      const candidatos = todosContatos
        .filter((contato) => contato.phoneNumbers && contato.phoneNumbers.length > 0)
        .map((contato) => ({
          nome: `${contato.givenName || ''} ${contato.familyName || ''}`.trim() || 'Sem nome',
          telefone: formatPhoneToE164(contato.phoneNumbers[0].number),
          aniversario: birthdayParaAniversario(contato.birthday),
        }))
        .filter((contato) => contato.telefone && !telefonesJaCadastrados.has(contato.telefone));

      if (candidatos.length === 0) {
        Alert.alert('Nada para importar', 'Todos os seus contatos com telefone já estão na sua agenda de clientes.');
        return;
      }

      Alert.alert(
        'Importar contatos',
        `Encontramos ${candidatos.length} contato${candidatos.length === 1 ? '' : 's'} com telefone que ainda não estão na sua agenda. Importar todos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            onPress: async () => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              setImportando(true);
              try {
                const total = await importarClientesEmLote(uid, candidatos);
                Alert.alert('Sucesso!', `${total} contato${total === 1 ? '' : 's'} importado${total === 1 ? '' : 's'}.`);
                await fetchClientes();
              } catch (error) {
                console.error('Erro ao importar contatos:', error);
                Alert.alert('Erro', 'Não foi possível concluir a importação. Tente novamente.');
              } finally {
                setImportando(false);
              }
            },
          },
        ],
      );
    } catch (error) {
      console.error('Erro ao acessar contatos:', error);
      Alert.alert(
        'Não foi possível acessar seus contatos',
        'Verifique se o app tem permissão de acesso à agenda de contatos.',
      );
    } finally {
      setImportando(false);
    }
  }, [clientes, fetchClientes]);

  return {
    clientes,
    loading,
    importando,
    modalVisible,
    salvandoManual,
    nomeManual,
    telefoneManual,
    aniversarioManual,
    clienteEditando,
    setNomeManual,
    setTelefoneManual,
    setAniversarioManual,
    abrirModalManual,
    abrirModalEdicao,
    fecharModal,
    salvarManual,
    excluirCliente,
    importarContatos,
  };
}

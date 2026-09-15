import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';

import { AddressesScreen } from './AddressesScreen';
import { useToast } from '../store/toastStore';
import { useAuth } from '../store/authStore';
import * as addressesApi from '../api/addresses';
import type { SavedAddress } from '../types';

// AddressesScreen usa useFocusEffect solo para recargar al recibir foco — en
// este test no hay NavigationContainer real, así que se reemplaza por un
// simple efecto en el montaje (mismo timing que nos interesa: "al abrir").
// useNavigation también se reemplaza (lo consume useRequireAuth, ver A5) —
// basta con un `replace` espiable, no se prueba la redirección acá.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
  useNavigation: () => ({ replace: jest.fn() }),
}));
jest.mock('../api/addresses');

const mockedFetchAddresses = addressesApi.fetchAddresses as jest.Mock;
const mockedDeleteAddress = addressesApi.deleteAddress as jest.Mock;

const navigation = { navigate: jest.fn() } as any;

let renderer: TestRenderer.ReactTestRenderer | undefined;

const address: SavedAddress = {
  id: 'addr_1',
  direccion: 'Av. Siempre Viva',
  numero: '123',
  interior: '',
  referencia: '',
  departamento: { codigo: '15', nombre: 'Lima' },
  provincia: { codigo: '01', nombre: 'Lima' },
  distrito: { codigo: '01', nombre: 'Miraflores', idUbigeo: '150122' },
};

beforeEach(() => {
  useToast.setState({ message: null, seq: 0, variant: 'success', duration: 1800 });
  // Addresses está protegida por A5 (useRequireAuth) — sin sesión "lista", la
  // pantalla no renderiza nada (return null) y nunca llegaría al botón de borrar.
  useAuth.setState({ user: { id: 1, email: 'test@boticuy.com', nombre: 'Test' }, tokenReady: true });
  jest.clearAllMocks();
  // Simula al usuario tocando siempre "Eliminar" en el diálogo de confirmación.
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const confirmBtn = (buttons as any[] | undefined)?.find((b) => b.text === 'Eliminar');
    confirmBtn?.onPress?.();
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

async function renderAndPressDelete() {
  await act(async () => {
    renderer = TestRenderer.create(<AddressesScreen navigation={navigation} route={{} as any} />);
  });
  await act(async () => {}); // deja resolver fetchAddresses()

  const deleteBtn = renderer!.root.findByProps({ accessibilityLabel: 'Eliminar dirección' });
  await act(async () => {
    deleteBtn.props.onPress();
  });
  await act(async () => {}); // deja resolver deleteAddress()

  return renderer!;
}

describe('AddressesScreen — eliminar dirección', () => {
  test('muestra un toast de error si falla la eliminación', async () => {
    mockedFetchAddresses.mockResolvedValue([address]);
    mockedDeleteAddress.mockRejectedValue(new Error('network error'));

    await renderAndPressDelete();

    expect(mockedDeleteAddress).toHaveBeenCalledWith('addr_1');
    expect(useToast.getState().message).toBe('No pudimos eliminar la dirección. Intenta de nuevo.');
    expect(useToast.getState().variant).toBe('warning');
  });

  test('no muestra ningún toast si la eliminación es exitosa', async () => {
    mockedFetchAddresses.mockResolvedValue([address]);
    mockedDeleteAddress.mockResolvedValue([]);

    await renderAndPressDelete();

    expect(mockedDeleteAddress).toHaveBeenCalledWith('addr_1');
    expect(useToast.getState().message).toBeNull();
  });
});

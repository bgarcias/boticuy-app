import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';

/**
 * Redirige a Login si no hay sesión — para las pantallas que exigen cuenta
 * (Orders, OrderDetail, Addresses, AddressForm, Points, MyCoupons). Checkout/
 * PaymentWebView quedan afuera a propósito: son de invitado por diseño (ver
 * A5 en boticuy-hallazgos-completo.md).
 *
 * Espera `tokenReady` (authStore.ts) antes de decidir cualquier cosa — sin
 * esto, una pantalla protegida montada en el instante exacto de un arranque
 * en frío podría redirigir a un usuario real y logueado a Login por una
 * fracción de segundo, antes de que el token termine de leerse de
 * SecureStore. Mientras `tokenReady` es false, este hook no hace nada — ni
 * redirige, ni afirma que hay sesión: simplemente todavía no lo sabe.
 *
 * Devuelve true solo cuando ya se confirmó que hay sesión. La pantalla que
 * llama debe usarlo para no renderizar su contenido (`if (!authorized) return
 * null;`) hasta entonces — evita el parpadeo de contenido justo antes de
 * redirigir.
 */
export function useRequireAuth(): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tokenReady = useAuth((s) => s.tokenReady);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (tokenReady && !user) {
      navigation.replace('Login');
    }
  }, [tokenReady, user, navigation]);

  return tokenReady && !!user;
}

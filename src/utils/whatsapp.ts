import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';

const extra = (Constants.expoConfig?.extra ?? {}) as { whatsapp?: string };
const WHATSAPP_NUMBER = extra.whatsapp ?? '+51950557599';

/** Abre WhatsApp con un mensaje prellenado hacia el número de Boticuy. */
export function openWhatsApp(message = 'Hola Boticuy, necesito ayuda con mi pedido.') {
  const phone = WHATSAPP_NUMBER.replace(/[^0-9]/g, ''); // 51950557599
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  analytics.track(EV.CONTACT_WHATSAPP);
  Linking.openURL(url).catch(() => {});
}

import { Linking } from 'react-native';
import { WHATSAPP_DIGITS } from '../config/features';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';

/** Abre WhatsApp con un mensaje prellenado hacia el número de Boticuy. */
export function openWhatsApp(message = 'Hola Boticuy, necesito ayuda con mi pedido.') {
  const url = `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
  analytics.track(EV.CONTACT_WHATSAPP);
  Linking.openURL(url).catch(() => {});
}

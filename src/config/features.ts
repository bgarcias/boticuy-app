import Constants from 'expo-constants';

/**
 * Interruptores y datos de build del modo sin compra (ver FASE1_SIN_COMPRA.md).
 * Todo sale de `extra` en app.config.js, que lee variables EXPO_PUBLIC_* — y por
 * eso queda DENTRO del app: nada de aquí es secreto.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  purchaseEnabled?: boolean;
  cartEnabled?: boolean;
  creatorsEnabled?: boolean;
  couponsEnabled?: boolean;
  isProductionBuild?: boolean;
  chatUrl?: string;
  chatRateUrl?: string;
  chatAppKey?: string;
  privacyPolicyUrl?: string;
  storeApiUrl?: string;
  whatsapp?: string;
};

/**
 * Compra, carrito, checkout y cuenta del app. APAGADO por defecto: solo se
 * enciende con EXPO_PUBLIC_PURCHASE_ENABLED=true en el build. Con el flag
 * apagado el app no ofrece ningún camino que cree un pedido, un cobro o una
 * cuenta, y las funciones de `api/` de esas rutas se niegan a enviar peticiones.
 */
export const PURCHASE_ENABLED = extra.purchaseEnabled === true;

/**
 * Carrito del app que termina en la web: tab Carrito, botones Agregar y selector
 * de cantidad. Encendido por defecto (EXPO_PUBLIC_CART_ENABLED=false lo apaga) y
 * siempre activo si PURCHASE_ENABLED lo está. NO reabre checkout, pagos,
 * cuenta, cupones, puntos ni pedidos: eso sigue dependiendo solo de PURCHASE_ENABLED.
 */
export const CART_ENABLED = PURCHASE_ENABLED || extra.cartEnabled !== false;

/**
 * Pantalla "Apoya a tu creador" y su entrada en el Perfil. Encendida por defecto
 * (EXPO_PUBLIC_CREATORS_ENABLED=false la apaga), independiente de PURCHASE_ENABLED, y siempre
 * activa si PURCHASE_ENABLED lo está. Solo reabre `fetchApoyaCreador` (GET /apoya-creador).
 */
export const CREATORS_ENABLED = PURCHASE_ENABLED || extra.creatorsEnabled !== false;

/**
 * Pantalla "Mis cupones" y su entrada en el Perfil sin cuenta. Encendida por defecto
 * (EXPO_PUBLIC_COUPONS_ENABLED=false la apaga), independiente de PURCHASE_ENABLED, y siempre
 * activa si PURCHASE_ENABLED lo está. Sin compra solo reabre `fetchMisCupones` (GET /mis-cupones):
 * ni sesión, ni cupones Oro, ni validación contra el servidor.
 */
export const COUPONS_ENABLED = PURCHASE_ENABLED || extra.couponsEnabled !== false;

/** true solo en builds del perfil production de EAS. */
export const IS_PRODUCTION_BUILD = extra.isProductionBuild === true;

export const CHAT_URL = extra.chatUrl || 'https://boticuy.com/wp-admin/admin-ajax.php';
export const CHAT_RATE_URL = extra.chatRateUrl || 'https://boticuy.com/wp-json/botichat/v1/rate';

/**
 * Clave del chat (cabecera X-Boticuy-App). Solo existe en builds de producción
 * (app.config.js no la carga en preview ni en desarrollo) y aquí se vuelve a
 * exigir el perfil. Nunca se registra ni se muestra.
 */
export const CHAT_APP_KEY: string = IS_PRODUCTION_BUILD && typeof extra.chatAppKey === 'string' ? extra.chatAppKey : '';

/** Política de privacidad (constante configurable; por defecto la de la web). */
export const PRIVACY_POLICY_URL = extra.privacyPolicyUrl || 'https://boticuy.com/politicas-de-privacidad/';

/** Host de la tienda de la configuración (en staging puede ser una IP). */
export const STORE_API_URL = extra.storeApiUrl ?? '';

/** Número oficial de WhatsApp del app (misma configuración que usa `openWhatsApp`). */
export const WHATSAPP_NUMBER: string = extra.whatsapp ?? '+51950557599';

/** El mismo número solo con dígitos (por ejemplo 51950557599). */
export const WHATSAPP_DIGITS: string = WHATSAPP_NUMBER.replace(/[^0-9]/g, '');

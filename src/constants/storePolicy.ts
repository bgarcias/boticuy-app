import { STORE_API_URL, IS_PRODUCTION_BUILD } from '../config/features';
import { storeUrlPolicy } from '../utils/safeUrl';

/**
 * Política de URL de la web de la tienda, compartida por "Ver en la web", "Continuar
 * en la web" y la política de privacidad: `boticuy.com` por https; en builds que NO
 * son de producción (preview, desarrollo) también el host de la tienda de la
 * configuración (staging, que puede ser una IP por http).
 */
export const STORE_URL_POLICY = storeUrlPolicy(STORE_API_URL, IS_PRODUCTION_BUILD);

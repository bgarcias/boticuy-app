import { PRIVACY_POLICY_URL } from '../config/features';
import { validateUrl } from '../utils/safeUrl';
import { STORE_URL_POLICY } from './storePolicy';

/**
 * Política de privacidad (Perfil y chat). La constante configurable es
 * PRIVACY_POLICY_URL (EXPO_PUBLIC_PRIVACY_URL; por defecto la de la web). Solo se
 * abre si pasa la misma validación que los demás enlaces (https y dominio de la tienda).
 */
export const PRIVACY_URL: string | null = validateUrl(PRIVACY_POLICY_URL, STORE_URL_POLICY);

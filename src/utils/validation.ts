/** Validación de correo. Antes duplicada en CheckoutScreen.tsx y LoginScreen.tsx del legacy. */
export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Mismo criterio que `WC_Validation::is_phone()` de WooCommerce (checkout web):
 *  solo dígitos, espacios, `+`, `-`, `(` o `)` — sin exigir una longitud exacta. */
export const isValidPhone = (phone: string): boolean => /^[0-9\s+\-()]+$/.test(phone);

/** Quita espacios internos, no solo los de los extremos — "12 345 678" → "12345678".
 *  Se usa tanto para validar el DNI como para limpiar el valor antes de enviarlo. */
export const stripInnerSpaces = (value: string): string => value.replace(/\s+/g, '');

/** Un DNI no tiene letras — a diferencia de la web, la app sí lo exige (sin caso de uso legítimo para un DNI con letras). */
export const isValidDNI = (dni: string): boolean => /^[0-9]+$/.test(stripInnerSpaces(dni));

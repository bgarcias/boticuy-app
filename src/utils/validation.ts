/** Validación de correo. Antes duplicada en CheckoutScreen.tsx y LoginScreen.tsx del legacy. */
export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

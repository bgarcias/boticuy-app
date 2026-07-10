/**
 * Sistema de diseño Boticuy.
 * Colores extraídos del sitio real (variables globales de Elementor en boticuy.com).
 */

export const colors = {
  // Marca
  primary: '#1c4eb5', // azul Boticuy (--e-global-color-primary)
  primaryDark: '#193c6c', // azul oscuro (headers)
  primaryDarker: '#18419c',
  accent: '#5addf4', // cian (--e-global-color-accent)

  // Neutros
  text: '#1f2124',
  textMuted: '#80809a',
  border: '#e3e6ec',
  background: '#ffffff',
  surface: '#fafafa', // (--e-global-color-secondary)
  surfaceAlt: '#f4f4f4',

  // Estados
  success: '#25d366', // verde WhatsApp / éxito
  error: '#be0000',
  warning: '#f0a500',

  white: '#ffffff',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  price: { fontSize: 18, fontWeight: '800' as const, color: colors.primary },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

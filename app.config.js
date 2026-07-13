/** Config de Expo. Las URLs de API salen de variables de entorno EXPO_PUBLIC_*
 *  (con default a producción) en vez de ir hardcodeadas, a diferencia del legacy. */
module.exports = {
  expo: {
    name: 'boticuy-app',
    slug: 'boticuy-app',
    // v2: refactorización técnica sobre la versión original (v1)
    version: '2.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-font', 'expo-secure-store'],
    extra: {
      storeApiUrl: process.env.EXPO_PUBLIC_STORE_API_URL || 'https://boticuy.com/wp-json/wc/store/v1',
      wpApiUrl: process.env.EXPO_PUBLIC_WP_API_URL || 'https://boticuy.com/wp-json/wp/v2',
      bffUrl: process.env.EXPO_PUBLIC_BFF_URL || 'https://boticuy.com/wp-json/boticuy-app/v1',
      // Mientras esté en false, createOrder() no llama a POST /order de verdad
      // (ver src/api/orders.ts) — evita crear pedidos reales durante el desarrollo.
      ordersEnabled: process.env.EXPO_PUBLIC_ORDERS_ENABLED === 'true',
      // Analítica (PostHog). Cuenta compartida con el legacy mientras se decide
      // si el rediseño se queda con esta cuenta o abre una propia — ver PROGRESO.md.
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || 'phc_xtJYcWtSZaFUGW7fHbCDpumWgxr2eUi5gRL2nFkomfHS',
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      // Reglas de negocio (antes en src/config.ts del legacy, centralizadas acá).
      currencySymbol: process.env.EXPO_PUBLIC_CURRENCY_SYMBOL || 'S/',
      envioGratisDesde: Number(process.env.EXPO_PUBLIC_ENVIO_GRATIS_DESDE) || 69,
      whatsapp: process.env.EXPO_PUBLIC_WHATSAPP || '+51950557599',
      horarioAtencion: process.env.EXPO_PUBLIC_HORARIO_ATENCION || '9:00 AM – 6:00 PM',
    },
  },
};

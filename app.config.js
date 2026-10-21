/** Config de Expo. Las URLs de API salen de variables de entorno EXPO_PUBLIC_*
 *  (con default a producción) en vez de ir hardcodeadas, a diferencia del legacy.
 *  Para apuntar a staging: `npm run start:staging` (carga .env.staging). Para
 *  volver a producción: `npm start` (default, no toca nada). */
const storeApiUrl = process.env.EXPO_PUBLIC_STORE_API_URL || 'https://boticuy.com/wp-json/wc/store/v1';
const wpApiUrl = process.env.EXPO_PUBLIC_WP_API_URL || 'https://boticuy.com/wp-json/wp/v2';
const bffUrl = process.env.EXPO_PUBLIC_BFF_URL || 'https://boticuy.com/wp-json/boticuy-app/v1';
const apiUrl = new URL(bffUrl);
// El cleartext de Android solo se habilita, scoped a este host exacto, cuando
// la URL de API del entorno activo es http:// (staging sin dominio/SSL propio
// todavía). En producción (https) este plugin ni se incluye en el build.
const needsCleartext = apiUrl.protocol === 'http:';
// Modo sin compra (ver FASE1_SIN_COMPRA.md): APAGADO por defecto. Solo el valor
// exacto 'true' enciende el carrito, el checkout, la cuenta y las rutas de
// pedidos/pagos del app (ver src/config/features.ts). Reemplaza al antiguo
// EXPO_PUBLIC_ORDERS_ENABLED, que simulaba pedidos en vez de desactivarlos.
const purchaseEnabled = process.env.EXPO_PUBLIC_PURCHASE_ENABLED === 'true';

// Carrito del app que termina en la web (ver src/screens/WebCartScreen.tsx):
// ENCENDIDO por defecto; EXPO_PUBLIC_CART_ENABLED=false lo apaga. No reabre nada
// de lo que cierra el modo sin compra (checkout, pagos, cuenta, cupones, puntos).
const cartEnabled = process.env.EXPO_PUBLIC_CART_ENABLED !== 'false';

// Pantalla "Apoya a tu creador" (src/screens/CreatorsScreen.tsx): ENCENDIDA por defecto;
// EXPO_PUBLIC_CREATORS_ENABLED=false la apaga. Solo usa GET /apoya-creador, que el plugin
// deja abierta por defecto (BOTICUY_APP_CREATORS_ENABLED=false en wp-config.php la cierra).
const creatorsEnabled = process.env.EXPO_PUBLIC_CREATORS_ENABLED !== 'false';

// Pantalla "Mis cupones" sin cuenta (src/screens/MyCouponsScreen.tsx): ENCENDIDA por defecto;
// EXPO_PUBLIC_COUPONS_ENABLED=false la apaga. Solo usa GET /mis-cupones, que el plugin
// deja abierta por defecto (BOTICUY_APP_COUPONS_ENABLED=false en wp-config.php la cierra).
const couponsEnabled = process.env.EXPO_PUBLIC_COUPONS_ENABLED !== 'false';

// EAS expone el perfil de build durante el build (no existe en `expo start`).
const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production';

// Chat con IA del Home (ver src/api/chat.ts). La URL del chat y la de
// valoración van en variables propias, con producción por defecto.
const chatUrl = process.env.EXPO_PUBLIC_CHAT_URL || 'https://boticuy.com/wp-admin/admin-ajax.php';
const chatRateUrl = process.env.EXPO_PUBLIC_CHAT_RATE_URL || 'https://boticuy.com/wp-json/botichat/v1/rate';
// La clave del chat SOLO se carga en el perfil production: ni preview ni
// desarrollo la leen, para que las pruebas no cuenten como tráfico real del app.
// Todo lo EXPO_PUBLIC_* queda dentro del app: la clave identifica el tráfico
// del app, no lo protege.
const chatAppKey = isProductionBuild ? process.env.EXPO_PUBLIC_CHAT_APP_KEY || '' : '';
const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://boticuy.com/politicas-de-privacidad/';

/**
 * Salvaguarda de build (ver C3 en boticuy-hallazgos-completo.md): antes de
 * esto, un `eas.json` de producción mal configurado (o vacío, como estaba)
 * terminaba publicándose con pedidos simulados o apuntando a staging sin que
 * nada lo impidiera — solo un checklist manual en PROGRESO.md, fácil de
 * saltarse. `EAS_BUILD_PROFILE` lo expone EAS Build automáticamente durante
 * el build — no está presente en `expo start` ni en builds preview/development,
 * así que esto nunca corre fuera de un build real de producción.
 */
function assertProductionConfigIsSafe() {
  if (process.env.EAS_BUILD_PROFILE !== 'production') return;

  const problems = [];

  // El app de producción nace sin compra. Encenderla exige confirmarlo.
  if (purchaseEnabled && process.env.PURCHASE_ENABLED_CONFIRMED !== 'true') {
    problems.push(
      'EXPO_PUBLIC_PURCHASE_ENABLED es "true" (y PURCHASE_ENABLED_CONFIRMED no está puesto para confirmar que es intencional) — el app ofrecería carrito, checkout y cuenta (ver FASE1_SIN_COMPRA.md).'
    );
  }

  // Sin la clave el chat responde, pero el servidor lo cuenta como tráfico web de prueba.
  if (!chatAppKey) {
    problems.push('EXPO_PUBLIC_CHAT_APP_KEY está vacía — un build de producción debe llevar la clave del chat (definirla como variable de EAS del perfil production).');
  }

  const productionUrls = {
    EXPO_PUBLIC_STORE_API_URL: storeApiUrl,
    EXPO_PUBLIC_WP_API_URL: wpApiUrl,
    EXPO_PUBLIC_BFF_URL: bffUrl,
    EXPO_PUBLIC_CHAT_URL: chatUrl,
    EXPO_PUBLIC_CHAT_RATE_URL: chatRateUrl,
  };
  for (const [name, value] of Object.entries(productionUrls)) {
    let isProductionUrl = false;
    try {
      const u = new URL(value);
      isProductionUrl = u.protocol === 'https:' && u.hostname === 'boticuy.com';
    } catch {
      isProductionUrl = false;
    }
    if (!isProductionUrl) {
      problems.push(`${name} = "${value}" no apunta a https://boticuy.com (ver C2 en boticuy-hallazgos-completo.md).`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Build de producción bloqueado — configuración insegura en eas.json (perfil "production"):\n' +
      problems.map((p) => `  - ${p}`).join('\n') +
      '\n\nRevisa el bloque "env" del perfil "production" en eas.json.' +
      '\nPara encender la compra de forma intencional, define PURCHASE_ENABLED_CONFIRMED=true al construir (las URLs igual deben ser de producción).'
    );
  }
}

assertProductionConfigIsSafe();

module.exports = {
  expo: {
    name: 'boticuy-app',
    slug: 'boticuy-app',
    // v2: refactorización técnica sobre la versión original (v1). Este campo
    // había quedado desalineado con CHANGELOG.md (que ya documentaba hasta
    // [2.4.1]) — sincronizado acá y cerrado junto con la ronda semanal de
    // hallazgos de la auditoría TI (ver CHANGELOG.md, [2.5.0]).
    version: '2.5.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.boticuy.app',
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
    plugins: [
      'expo-font',
      'expo-secure-store',
      ...(needsCleartext ? [['./plugins/withCleartextHost', { host: apiUrl.hostname }]] : []),
    ],
    extra: {
      storeApiUrl,
      wpApiUrl,
      bffUrl,
      purchaseEnabled,
      cartEnabled,
      creatorsEnabled,
      couponsEnabled,
      isProductionBuild,
      chatUrl,
      chatRateUrl,
      chatAppKey,
      privacyPolicyUrl,
      // Analítica (PostHog). Sin key propia hardcodeada (ver B11 en
      // boticuy-hallazgos-completo.md) — se lee de eas.json/.env.staging, mismo
      // patrón que las URLs de API. Sin la variable seteada, initAnalytics()
      // no inicializa el cliente y la app sigue funcionando normal, sin analítica.
      // La cuenta actual (key en eas.json) es personal de Fernando, compartida
      // con el legacy mientras se decide migrar a una cuenta propia de la
      // empresa — ver PROGRESO.md.
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      // Reglas de negocio (antes en src/config.ts del legacy, centralizadas acá).
      currencySymbol: process.env.EXPO_PUBLIC_CURRENCY_SYMBOL || 'S/',
      envioGratisDesde: Number(process.env.EXPO_PUBLIC_ENVIO_GRATIS_DESDE) || 69,
      // Umbral reducido para niveles Plata/Oro (ver `points_level()` en el plugin).
      // Ya NO es la fuente de verdad (ver M5 en boticuy-hallazgos-completo.md):
      // useShippingConfig (src/store/shippingConfigStore.ts) lo consulta al
      // arrancar vía GET /shipping/config y lo cachea, sin publicar versión
      // nueva de la app cuando cambie. Este valor queda solo como default
      // inicial antes del primer fetch (o si nunca hubo red) — ya no hace falta
      // mantenerlo en sync a mano con `class-shipping.php`.
      envioGratisDesdeNivel: Number(process.env.EXPO_PUBLIC_ENVIO_GRATIS_DESDE_NIVEL) || 59,
      whatsapp: process.env.EXPO_PUBLIC_WHATSAPP || '+51950557599',
      horarioAtencion: process.env.EXPO_PUBLIC_HORARIO_ATENCION || '9:00 AM - 6:00 PM',
      eas: {
        projectId: '69d21b22-44cc-467b-8de4-276a1f34d680',
      },
    },
  },
};

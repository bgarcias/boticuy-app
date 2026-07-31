import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const extra = (Constants.expoConfig?.extra ?? {}) as { bffUrl: string };
// El BFF (EXPO_PUBLIC_BFF_URL) ya trae el dominio de WordPress; se deriva el
// origen para armar la página estándar de recuperación de contraseña, en vez
// de hardcodear el dominio o agregar una env var nueva solo para esto.
const wpOrigin = new URL(extra.bffUrl).origin;
const LOST_PASSWORD_URL = `${wpOrigin}/wp-login.php?action=lostpassword`;

// Oculta el "chrome" de administración de wp-login.php (logo de WordPress, link
// "Ir a Boticuy", selector de idioma + botón "Cambiar", y "Políticas de
// privacidad") para que solo se vea la caja del formulario. Selectores con
// variantes (id/clase) porque el HTML exacto puede diferir levemente entre
// versiones de WordPress — no toca el form ni sus campos, solo oculta otros
// elementos. Se re-inyecta en cada navegación dentro del WebView (el mismo
// script corre también en la página "revisa tu correo" tras enviar el
// formulario, por si llega a pintarse antes de que la pantalla nativa la
// reemplace — ver `onNavigationStateChange` abajo).
const HIDE_WP_CHROME_CSS = `
  #login h1, .login h1,
  #nav, #backtoblog,
  .language-switcher, #language-switcher,
  #privacy-policy-page-link, .privacy-policy-page-link {
    display: none !important;
  }
`;
const INJECTED_JS = `
  (function () {
    var style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(${JSON.stringify(HIDE_WP_CHROME_CSS)}));
    document.head.appendChild(style);
  })();
  true;
`;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = () => {
    setError(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  if (sent) {
    return (
      <View style={styles.center}>
        <Ionicons name="mail-outline" size={48} color={colors.success} />
        <Text style={styles.sentTitle}>Revisa tu correo</Text>
        <Text style={styles.sentText}>Te enviamos un enlace para restablecer tu contraseña.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.sentText}>No pudimos cargar la página de recuperación.</Text>
        <Pressable style={styles.btn} onPress={retry}>
          <Text style={styles.btnText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        // Acotado al dominio de WordPress — mismo criterio que PaymentWebViewScreen.
        originWhitelist={[wpOrigin]}
        source={{ uri: LOST_PASSWORD_URL }}
        injectedJavaScript={INJECTED_JS}
        onLoadEnd={() => setLoading(false)}
        onError={() => setError(true)}
        onHttpError={() => setError(true)}
        onNavigationStateChange={(navState) => {
          // WordPress redirige a `checkemail=confirm` tras enviar el formulario.
          if (navState.url.includes('checkemail=confirm')) setSent(true);
        }}
        javaScriptEnabled
        domStorageEnabled
      />
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.overlayText}>Cargando…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  overlayText: { color: colors.textMuted, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface },
  sentTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sentText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  btnText: { color: colors.white, fontWeight: '700' },
});

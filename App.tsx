import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { RootNavigator } from './src/navigation';
import { Toast } from './src/components/Toast';
import { OfflineBanner } from './src/components/OfflineBanner';
import { useAuth } from './src/store/authStore';
import { useShippingConfig } from './src/store/shippingConfigStore';
import { initAnalytics } from './src/analytics/posthog';

export default function App() {
  useEffect(() => {
    useAuth.getState().hydrate();
    initAnalytics();
    // Umbral Plata/Oro (ver M5): se refresca en segundo plano, sin bloquear el
    // primer render — mientras tanto se usa el valor cacheado o el default de build.
    useShippingConfig.getState().refresh();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <RootNavigator />
        <StatusBar style="auto" />
        <Toast />
        <OfflineBanner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

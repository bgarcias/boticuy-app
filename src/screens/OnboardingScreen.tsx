import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

/** Misma key que usaba el legacy — si ya existe con valor '1', no se vuelve a mostrar Onboarding. */
export const ONBOARDING_KEY = 'boticuy-onboarded';

const extra = (Constants.expoConfig?.extra ?? {}) as { currencySymbol?: string; envioGratisDesde?: number };

// Todo el contenido de esta pantalla es estático (definido acá mismo, no viene de
// WordPress/WooCommerce), salvo el umbral de envío gratis que sale de app.config.js
// (misma fuente que HomeScreen/ProductDetailScreen/FreeShippingBar) — no aplica decodeHtmlEntities.
const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  {
    icon: 'medkit',
    title: 'Tu botica de vitaminas',
    text: 'Vitaminas y suplementos de marcas confiables, a un toque de tu casa.',
  },
  {
    icon: 'bicycle',
    title: 'Envío gratis en Lima',
    text: `En tus compras desde ${extra.currencySymbol ?? 'S/'}${extra.envioGratisDesde ?? 69}. Recíbelo en la puerta de tu casa.`,
  },
  {
    icon: 'chatbubbles',
    title: 'Paga fácil y con asesoría',
    text: 'Yape, Plin o contra entrega. Y te acompañamos por WhatsApp en todo el proceso.',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ref = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const finish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {}
    navigation.replace('Tabs');
  };

  const next = () => {
    if (page >= SLIDES.length - 1) return finish();
    ref.current?.scrollTo({ x: width * (page + 1), animated: true });
    setPage(page + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable style={styles.skip} onPress={finish} hitSlop={10}>
        <Text style={styles.skipText}>Saltar</Text>
      </Pressable>

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon} size={72} color={colors.white} />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.text}>{s.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{page >= SLIDES.length - 1 ? 'Comenzar' : 'Siguiente'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  skip: { alignSelf: 'flex-end', padding: spacing.lg },
  skipText: { color: colors.textMuted, fontWeight: '600', fontSize: 15 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  iconCircle: { width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
  footer: { padding: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 17 },
});

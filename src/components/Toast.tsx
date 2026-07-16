import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../store/toastStore';
import { colors, radius, spacing, shadow } from '../theme';

/** Aviso flotante global (montado una vez en la raíz). */
export function Toast() {
  const message = useToast((s) => s.message);
  const seq = useToast((s) => s.seq);
  const variant = useToast((s) => s.variant);
  const duration = useToast((s) => s.duration);
  const hide = useToast((s) => s.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) hide();
      });
    }, duration);
    return () => clearTimeout(t);
  }, [seq, message, opacity, hide, duration]);

  if (!message) return null;

  const isWarning = variant === 'warning';

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, bottom: insets.bottom + 80 }]}>
      <View style={styles.toast}>
        <Ionicons name={isWarning ? 'warning' : 'checkmark-circle'} size={20} color={isWarning ? colors.warning : colors.success} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '90%',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  text: { color: colors.white, fontWeight: '700', fontSize: 14, flexShrink: 1 },
});

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, FlatList } from 'react-native';
import { colors, radius, spacing, shadow } from '../theme';

/** Bloque gris con pulso suave. */
export function SkeletonBlock({ style }: { style?: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

function CardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock style={{ height: 130, borderRadius: radius.sm }} />
      <SkeletonBlock style={{ height: 14, width: '90%', marginTop: spacing.sm }} />
      <SkeletonBlock style={{ height: 14, width: '60%', marginTop: 6 }} />
      <SkeletonBlock style={{ height: 18, width: '40%', marginTop: spacing.sm }} />
      <SkeletonBlock style={{ height: 44, borderRadius: radius.pill, marginTop: spacing.sm }} />
    </View>
  );
}

/** Grilla de tarjetas fantasma mientras carga el catálogo. */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const data = Array.from({ length: count }, (_, i) => i);
  return (
    <FlatList
      data={data}
      keyExtractor={(i) => String(i)}
      numColumns={2}
      scrollEnabled={false}
      contentContainerStyle={{ padding: spacing.sm }}
      renderItem={() => <CardSkeleton />}
    />
  );
}

/** Skeleton de la ficha de producto. */
export function ProductDetailSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={styles.detailImage}>
        <SkeletonBlock style={{ width: 220, height: 220, borderRadius: radius.md }} />
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <SkeletonBlock style={{ height: 12, width: '30%' }} />
        <SkeletonBlock style={{ height: 22, width: '80%' }} />
        <SkeletonBlock style={{ height: 22, width: '35%', marginTop: spacing.sm }} />
        <SkeletonBlock style={{ height: 60, borderRadius: radius.md, marginTop: spacing.md }} />
        <SkeletonBlock style={{ height: 16, width: '50%', marginTop: spacing.lg }} />
        <SkeletonBlock style={{ height: 14, width: '95%' }} />
        <SkeletonBlock style={{ height: 14, width: '90%' }} />
        <SkeletonBlock style={{ height: 14, width: '70%' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceAlt },
  detailImage: { backgroundColor: colors.surface, alignItems: 'center', padding: spacing.lg },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    margin: spacing.xs,
    ...shadow.card,
  },
});

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/** Fila de estrellas (0..5, admite medias) para mostrar calificaciones. */
export function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  const r = Math.max(0, Math.min(5, rating || 0));
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${r.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = r >= i ? 'star' : r >= i - 0.5 ? 'star-half' : 'star-outline';
        return <Ionicons key={i} name={name as any} size={size} color="#f5a623" />;
      })}
    </View>
  );
}

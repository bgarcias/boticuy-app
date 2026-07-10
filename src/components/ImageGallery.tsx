import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { ProductImage } from '../types';
import { colors, spacing } from '../theme';

/** Galería de fotos del producto: deslizable, con puntos y vista de pantalla completa. */
export function ImageGallery({ images }: { images: ProductImage[] }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  if (!images || images.length === 0) {
    return <View style={[styles.wrap, { backgroundColor: colors.surfaceAlt }]} />;
  }

  const onScroll = (e: any, w: number) => setPage(Math.round(e.nativeEvent.contentOffset.x / w));

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => onScroll(e, width)}
      >
        {images.map((img) => (
          <Pressable key={img.id} onPress={() => setFullscreen(true)} style={[styles.wrap, { width }]}>
            <Image source={{ uri: img.src }} style={styles.image} contentFit="contain" transition={150} />
          </Pressable>
        ))}
      </ScrollView>

      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsBackdrop}>
          <Pressable style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={12}>
            <Ionicons name="close" size={30} color={colors.white} />
          </Pressable>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: page * width, y: 0 }}>
            {images.map((img) => (
              <View key={img.id} style={{ width, justifyContent: 'center' }}>
                <Image source={{ uri: img.src }} style={styles.fsImage} contentFit="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 300, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  image: { width: '100%', height: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm, position: 'absolute', bottom: 0, left: 0, right: 0 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  fsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  fsClose: { position: 'absolute', top: 48, right: 20, zIndex: 10 },
  fsImage: { width: '100%', height: '80%' },
});

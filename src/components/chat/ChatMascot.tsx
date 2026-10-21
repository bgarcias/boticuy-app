import React from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

/**
 * Mascota del chat. Archivo local (sin URL remota): `assets/mascota-boticuy.png`.
 *
 * `source` permite usar otra imagen (el chat usa `assets/FAVICON-WEB.png` a color; la imagen llena todo el círculo, sin fondo ni borde propios del contenedor).
 *
 * PROVISIONAL: la imagen actual es un recorte del logo (`assets/icon.png`), en blanco
 * sobre transparente para verse sobre el azul del encabezado. Para poner la mascota
 * real, reemplaza ese mismo archivo (mismo nombre, PNG con fondo transparente,
 * idealmente 512×512) y no hace falta tocar código.
 */
export function ChatMascot({ size = 64, source }: { size?: number; source?: ImageSourcePropType }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Image
        source={source ?? require('../../../assets/mascota-boticuy.png')}
        style={{ width: size, height: size }}
        resizeMode="cover"
        accessibilityLabel="Mascota de Boticuy"
      />
    </View>
  );
}

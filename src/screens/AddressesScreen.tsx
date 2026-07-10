import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { SavedAddress } from '../types';
import { fetchAddresses, deleteAddress } from '../api/addresses';
import { Loading, ErrorView, Empty } from '../components/Feedback';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Addresses'>;

export function AddressesScreen(_props: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAddresses()
      .then(setAddresses)
      .catch(() => setError('No pudimos cargar tus direcciones.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const onDelete = async (id: string) => {
    try {
      setAddresses(await deleteAddress(id));
    } catch {
      /* noop */
    }
  };

  if (loading) return <Loading label="Cargando direcciones…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (addresses.length === 0)
    return <Empty message="Aún no tienes direcciones guardadas. Se guardan al finalizar una compra." />;

  return (
    <FlatList
      style={styles.container}
      data={addresses}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: spacing.lg }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Ionicons name="location" size={22} color={colors.primary} />
          <View style={styles.info}>
            <Text style={styles.line1}>
              {item.direccion} {item.numero}
              {item.interior ? `, ${item.interior}` : ''}
            </Text>
            <Text style={styles.line2}>
              {item.distrito?.nombre}, {item.provincia?.nombre}
            </Text>
            {!!item.referencia && <Text style={styles.ref}>{item.referencia}</Text>}
          </View>
          <Pressable onPress={() => onDelete(item.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Eliminar dirección">
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card },
  info: { flex: 1 },
  line1: { fontSize: 15, fontWeight: '700', color: colors.text },
  line2: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  ref: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
});

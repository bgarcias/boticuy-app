import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { SavedAddress } from '../types';
import { fetchAddresses, deleteAddress } from '../api/addresses';
import { Loading, ErrorView } from '../components/Feedback';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Addresses'>;

export function AddressesScreen({ navigation }: Props) {
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
  // Recarga al volver de AddressFormScreen (agregar/editar), no solo al montar.
  useFocusEffect(load);

  const onDelete = (id: string) => {
    Alert.alert('¿Seguro que quieres eliminar esta dirección?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setAddresses(await deleteAddress(id));
          } catch {
            /* noop */
          }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Cargando direcciones…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (addresses.length === 0)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Aún no tienes direcciones guardadas.</Text>
        <Pressable style={styles.addBtn} onPress={() => navigation.navigate('AddressForm', {})}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>Agregar dirección</Text>
        </Pressable>
      </View>
    );

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
          <Pressable
            onPress={() => navigation.navigate('AddressForm', { address: item })}
            hitSlop={10}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Editar dirección"
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </Pressable>
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
  actionBtn: { marginRight: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, justifyContent: 'center' },
  addBtnText: { color: colors.white, fontWeight: '700' },
});

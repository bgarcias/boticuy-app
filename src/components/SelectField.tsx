import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

export interface Option {
  codigo: string;
  nombre: string;
  [k: string]: any;
}

interface Props {
  label: string;
  placeholder?: string;
  value: Option | null;
  options: Option[];
  onSelect: (o: Option) => void;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  searchable?: boolean;
}

export function SelectField({
  label,
  placeholder = 'Selecciona…',
  value,
  options,
  onSelect,
  required,
  disabled,
  loading,
  error,
  searchable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const n = q.trim().toLowerCase();
    return options.filter((o) => o.nombre.toLowerCase().includes(n));
  }, [q, options]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.req}> *</Text>}
      </Text>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled, !!error && styles.fieldError]}
        onPress={() => !disabled && !loading && setOpen(true)}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {loading ? 'Cargando…' : value ? value.nombre : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            {searchable && (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.search}
                  placeholder="Buscar…"
                  placeholderTextColor={colors.textMuted}
                  value={q}
                  onChangeText={setQ}
                  autoFocus
                />
              </View>
            )}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.codigo + o.nombre}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onSelect(item);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.nombre}</Text>
                  {value?.codigo === item.codigo && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Sin resultados</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  req: { color: colors.error },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    backgroundColor: colors.white,
  },
  fieldDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  fieldError: { borderColor: colors.error },
  value: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { color: colors.textMuted },
  errorText: { color: colors.error, fontSize: 12, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '80%', paddingBottom: spacing.lg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  search: { flex: 1, paddingVertical: 10, color: colors.text },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  optionText: { fontSize: 15, color: colors.text },
  empty: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl },
});

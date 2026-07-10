import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';

import type { TabParamList, RootStackParamList } from '../navigation/types';
import { useFavorites } from '../store/favoritesStore';
import { useAuth } from '../store/authStore';
import { openWhatsApp } from '../utils/whatsapp';
import { attentionStatus } from '../utils/attention';
import { colors, spacing, radius } from '../theme';

const extra = (Constants.expoConfig?.extra ?? {}) as { horarioAtencion?: string };
const HORARIO_ATENCION = extra.horarioAtencion ?? '9:00 AM – 6:00 PM';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Perfil'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Mi Cuenta — completa (Fase 5): favoritos, pedidos, direcciones, puntos, creadores y ayuda. */
export function ProfileScreen({ navigation }: Props) {
  const favCount = useFavorites((s) => s.items.length);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const atencion = attentionStatus();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      {user ? (
        <View style={styles.card}>
          <Ionicons name="person-circle" size={64} color={colors.primary} />
          <Text style={styles.title}>Hola, {user.nombre || 'cliente'} 👋</Text>
          <Text style={styles.sub}>{user.email}</Text>
          <Pressable style={styles.logoutBtn} onPress={() => logout()}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Ionicons name="person-circle" size={64} color={colors.primary} />
          <Text style={styles.title}>Inicia sesión</Text>
          <Text style={styles.sub}>Accede a tus pedidos, puntos y cupones.</Text>
          <Pressable style={styles.btn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.btnText}>Iniciar sesión / Registrarse</Text>
          </Pressable>
        </View>
      )}

      {/* Disponible ahora, sin cuenta */}
      <View style={styles.menu}>
        <Pressable style={styles.menuRow} onPress={() => navigation.navigate('Favorites')}>
          <Ionicons name="heart-outline" size={22} color={colors.primaryDark} />
          <Text style={styles.menuLabel}>Mis favoritos</Text>
          {favCount > 0 && <Text style={styles.count}>{favCount}</Text>}
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[styles.menuRow, styles.menuRowLast]} onPress={() => navigation.navigate('Creators')}>
          <Ionicons name="heart-circle-outline" size={22} color={colors.primaryDark} />
          <Text style={styles.menuLabel}>Apoya a tu creador</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Cuenta */}
      {user ? (
        <View style={[styles.menu, { marginTop: spacing.lg }]}>
          <Pressable style={styles.menuRow} onPress={() => navigation.navigate('Orders')}>
            <Ionicons name="receipt-outline" size={22} color={colors.primaryDark} />
            <Text style={styles.menuLabel}>Mis pedidos</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => navigation.navigate('Addresses')}>
            <Ionicons name="location-outline" size={22} color={colors.primaryDark} />
            <Text style={styles.menuLabel}>Mis direcciones</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => navigation.navigate('Points')}>
            <Ionicons name="star-outline" size={22} color={colors.primaryDark} />
            <Text style={styles.menuLabel}>Mis puntos</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          {[
            { icon: 'pricetag-outline' as const, label: 'Mis cupones' },
          ].map((r) => (
            <View key={r.label} style={[styles.menuRow, styles.menuRowMuted]}>
              <Ionicons name={r.icon} size={22} color={colors.textMuted} />
              <Text style={[styles.menuLabel, { color: colors.textMuted }]}>{r.label}</Text>
              <Text style={styles.soon}>Pronto</Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <Text style={styles.groupNote}>Al iniciar sesión podrás ver:</Text>
          <View style={styles.menu}>
            {[
              { icon: 'receipt-outline' as const, label: 'Mis pedidos' },
              { icon: 'star-outline' as const, label: 'Mis puntos' },
              { icon: 'pricetag-outline' as const, label: 'Mis cupones' },
              { icon: 'location-outline' as const, label: 'Mis direcciones' },
            ].map((r) => (
              <View key={r.label} style={[styles.menuRow, styles.menuRowMuted]}>
                <Ionicons name={r.icon} size={22} color={colors.textMuted} />
                <Text style={[styles.menuLabel, { color: colors.textMuted }]}>{r.label}</Text>
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.help}>
        <Text style={styles.helpTitle}>¿Necesitas ayuda?</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: atencion.online ? colors.success : colors.warning }]} />
          <Text style={styles.statusText}>{atencion.online ? 'En línea ahora' : atencion.text}</Text>
        </View>
        <Pressable style={styles.waBtn} onPress={() => openWhatsApp('Hola Boticuy, necesito ayuda.')}>
          <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
          <Text style={styles.waBtnText}>Escríbenos por WhatsApp</Text>
        </Pressable>
        <Text style={styles.helpText}>Atención: Lun a Vie, {HORARIO_ATENCION}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 24, marginTop: spacing.sm },
  btnText: { color: colors.white, fontWeight: '700' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  logoutText: { color: colors.error, fontWeight: '700' },
  menu: { backgroundColor: colors.white, borderRadius: radius.lg, marginTop: spacing.lg, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuRowLast: { borderBottomWidth: 0 },
  menuRowMuted: { backgroundColor: colors.surface },
  groupNote: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, marginBottom: -spacing.sm, marginLeft: spacing.sm, fontWeight: '600' },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  count: { fontSize: 13, color: colors.white, backgroundColor: colors.primary, minWidth: 22, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden', fontWeight: '700' },
  soon: { fontSize: 11, color: colors.white, backgroundColor: colors.textMuted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  help: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
  helpTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 13, color: colors.textMuted },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, alignSelf: 'stretch', marginTop: 4 },
  waBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  helpText: { fontSize: 13, color: colors.textMuted },
});

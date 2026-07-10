import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../store/authStore';
import { loginUser, registerUser } from '../api/auth';
import { TextField } from '../components/TextField';
import { isValidEmail } from '../utils/validation';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const setAuth = useAuth((s) => s.setAuth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (mode === 'register' && !nombre.trim()) return setError('Ingresa tu nombre');
    if (!isValidEmail(email)) return setError('Correo inválido');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await loginUser(email.trim(), password)
          : await registerUser(email.trim(), password, nombre.trim());
      if (!res.ok || !res.token || !res.user) {
        setError(res.reason ?? 'No pudimos completar la operación');
        return;
      }
      await setAuth(res.token, res.user);
      navigation.goBack();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Iniciar sesión</Text>
          </Pressable>
          <Pressable style={[styles.tab, mode === 'register' && styles.tabActive]} onPress={() => setMode('register')}>
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Crear cuenta</Text>
          </Pressable>
        </View>

        {mode === 'register' && (
          <TextField label="Nombre" required value={nombre} onChangeText={setNombre} autoCapitalize="words" autoComplete="name" textContentType="name" />
        )}
        <TextField
          label="Correo electrónico"
          required
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Contraseña"
          required
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          textContentType={mode === 'register' ? 'newPassword' : 'password'}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.cta} onPress={submit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.ctaText}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          {mode === 'login' ? '¿No tienes cuenta? Crea una para ver tus pedidos y puntos.' : 'Tus datos se usan solo para gestionar tus pedidos.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing.xl },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.white },
  tabText: { fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  error: { color: colors.error, fontSize: 13, marginBottom: spacing.sm },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  note: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});

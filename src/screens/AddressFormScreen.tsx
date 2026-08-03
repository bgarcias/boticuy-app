import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { UbigeoTerm } from '../types';
import { fetchDepartamentos, fetchProvincias, fetchDistritos } from '../api/ubigeo';
import { addAddress, updateAddress } from '../api/addresses';
import { TextField } from '../components/TextField';
import { SelectField } from '../components/SelectField';
import { isValidPhone, isValidDNI, stripInnerSpaces } from '../utils/validation';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;

export function AddressFormScreen({ route, navigation }: Props) {
  const address = route.params?.address;
  const isEditing = !!address;

  const [telefono, setTelefono] = useState(address?.telefono ?? '');
  const [numDoc, setNumDoc] = useState(address?.numDoc ?? '');
  const [departamento, setDepartamento] = useState<UbigeoTerm | null>(address?.departamento ?? null);
  const [provincia, setProvincia] = useState<UbigeoTerm | null>(address?.provincia ?? null);
  const [distrito, setDistrito] = useState<UbigeoTerm | null>(address?.distrito ?? null);
  const [direccion, setDireccion] = useState(address?.direccion ?? '');
  const [numero, setNumero] = useState(address?.numero ?? '');
  const [interior, setInterior] = useState(address?.interior ?? '');
  const [referencia, setReferencia] = useState(address?.referencia ?? '');

  // Ubigeo data (cascada departamento → provincia → distrito, mismo patrón que CheckoutScreen).
  const [deps, setDeps] = useState<UbigeoTerm[]>([]);
  const [provs, setProvs] = useState<UbigeoTerm[]>([]);
  const [dists, setDists] = useState<UbigeoTerm[]>([]);
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingDist, setLoadingDist] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDepartamentos().then(setDeps).catch(() => {});
  }, []);

  // En modo edición, precargar provincias/distritos del departamento/provincia guardados.
  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        setProvs(await fetchProvincias(address.departamento.codigo));
        setDists(await fetchDistritos(address.departamento.codigo, address.provincia.codigo));
      } catch {
        /* noop */
      }
    })();
  }, [address]);

  const onDep = async (d: UbigeoTerm) => {
    setDepartamento(d);
    setProvincia(null);
    setDistrito(null);
    setProvs([]);
    setDists([]);
    setLoadingProv(true);
    try {
      setProvs(await fetchProvincias(d.codigo));
    } finally {
      setLoadingProv(false);
    }
  };

  const onProv = async (p: UbigeoTerm) => {
    if (!departamento) return;
    setProvincia(p);
    setDistrito(null);
    setDists([]);
    setLoadingDist(true);
    try {
      setDists(await fetchDistritos(departamento.codigo, p.codigo));
    } finally {
      setLoadingDist(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (telefono.trim().length < 9 || !isValidPhone(telefono.trim())) e.telefono = 'Teléfono inválido';
    if (stripInnerSpaces(numDoc.trim()).length < 8 || !isValidDNI(numDoc.trim())) e.numDoc = 'Documento inválido';
    if (!departamento) e.departamento = 'Elige departamento';
    if (!provincia) e.provincia = 'Elige provincia';
    if (!distrito) e.distrito = 'Elige distrito';
    if (!direccion.trim()) e.direccion = 'Ingresa la dirección';
    if (!numero.trim()) e.numero = 'Nro';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    try {
      const payload = {
        telefono: telefono.trim(),
        numDoc: stripInnerSpaces(numDoc.trim()),
        direccion: direccion.trim(),
        numero: numero.trim(),
        interior: interior.trim(),
        referencia: referencia.trim(),
        departamento: { codigo: departamento!.codigo, nombre: departamento!.nombre },
        provincia: { codigo: provincia!.codigo, nombre: provincia!.nombre },
        distrito: { codigo: distrito!.codigo, nombre: distrito!.nombre, idUbigeo: distrito!.idUbigeo ?? '' },
      };
      if (isEditing) {
        await updateAddress(address!.id, payload);
      } else {
        await addAddress(payload);
      }
      navigation.goBack();
    } catch {
      setErrors({ submit: 'No pudimos guardar la dirección. Intenta de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Datos del destinatario</Text>
        <TextField label="Celular / WhatsApp" required value={telefono} onChangeText={setTelefono} error={errors.telefono} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
        <TextField label="DNI" required value={numDoc} onChangeText={setNumDoc} error={errors.numDoc} keyboardType="number-pad" />

        <Text style={styles.section}>Dirección de entrega</Text>
        <SelectField label="Departamento" required value={departamento} options={deps} onSelect={onDep} error={errors.departamento} />
        <SelectField label="Provincia" required value={provincia} options={provs} onSelect={onProv} disabled={!departamento} loading={loadingProv} error={errors.provincia} />
        <SelectField label="Distrito" required value={distrito} options={dists} onSelect={setDistrito} disabled={!provincia} loading={loadingDist} error={errors.distrito} />
        <TextField label="Dirección (calle / avenida)" required value={direccion} onChangeText={setDireccion} error={errors.direccion} autoComplete="street-address" textContentType="fullStreetAddress" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField label="Número" required value={numero} onChangeText={setNumero} error={errors.numero} />
          </View>
          <View style={{ width: spacing.md }} />
          <View style={{ flex: 1 }}>
            <TextField label="Dpto / Interior" value={interior} onChangeText={setInterior} />
          </View>
        </View>
        <TextField label="Referencia (opcional)" value={referencia} onChangeText={setReferencia} placeholder="Ej: frente al parque" />

        {!!errors.submit && <Text style={styles.submitError}>{errors.submit}</Text>}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.cta, submitting && { opacity: 0.7 }]} onPress={onSave} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>{isEditing ? 'Guardar cambios' : 'Agregar dirección'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  section: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row' },
  submitError: { color: colors.error, fontSize: 13, textAlign: 'center', marginTop: spacing.md },
  bottomBar: { padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { UbigeoTerm, ShippingQuote, SavedAddress, PaymentMethod, CartItem } from '../types';
import { useCart } from '../store/cartStore';
import { useAuth } from '../store/authStore';
import { useToast } from '../store/toastStore';
import { revalidateCart } from '../utils/cartRevalidation';
import { fetchDepartamentos, fetchProvincias, fetchDistritos } from '../api/ubigeo';
import { fetchShipping } from '../api/shipping';
import { fetchAddresses, addAddress } from '../api/addresses';
import { buildAddressPayload } from '../utils/addressPayload';
import { TextField } from '../components/TextField';
import { SelectField } from '../components/SelectField';
import { CouponField } from '../components/CouponField';
import { PointsRedeemField } from '../components/PointsRedeemField';
import { createOrder } from '../api/orders';
import { getFormToken } from '../api/payment';
import { fetchPoints } from '../api/points';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { isValidEmail, isValidPhone, isValidDNI, stripInnerSpaces } from '../utils/validation';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

const PROFILE_KEY = 'boticuy-checkout-profile';

/**
 * No necesita ser criptográficamente segura, solo única por instancia de la
 * pantalla de Checkout — es el nonce de sesión que alimenta buildIdempotencyKey()
 * de abajo (ver M13 en boticuy-hallazgos-completo.md), ya no la key final.
 */
function generateSessionNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Hash chico y determinístico (tipo String.hashCode de Java), sin librería
 *  externa — no necesita propiedades criptográficas, solo ser estable: mismo
 *  contenido siempre da el mismo hash. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * La key de idempotencia se deriva del contenido real del pedido (ítems, cupón,
 * canje de puntos), no de un valor aleatorio fijo al montar — antes, si el
 * usuario reintentaba después de cambiar el cupón o el canje de puntos, el
 * servidor devolvía el pedido viejo sin mirar el payload nuevo (ver M13). Con
 * la key derivada del contenido, un cambio real produce una key distinta sola,
 * sin que nadie tenga que acordarse de regenerarla. El nonce de sesión evita
 * que dos invitados con carritos idénticos colisionen en la misma key.
 */
function buildIdempotencyKey(nonce: string, items: CartItem[], couponCode: string | undefined, pointsRedeem: number): string {
  const itemsKey = [...items]
    .sort((a, b) => a.productId - b.productId)
    .map((i) => `${i.productId}:${i.quantity}`)
    .join(',');
  const content = `${itemsKey}|${(couponCode ?? '').toLowerCase()}|${pointsRedeem || 0}`;
  return `${nonce}-${simpleHash(content)}`;
}

/**
 * Checkout — completo desde la Fase 4: tarjeta (Izipay, vía WebView), Yape/Plin
 * y transferencia bancaria (estas dos sin pasarela — coordinación manual del
 * comprobante por WhatsApp/email). Direcciones guardadas conectadas en la Fase
 * 5. Contra entrega retirado (decisión regulatoria, 2026-07-30) — ver `CHANGELOG.md`.
 */
export function CheckoutScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const discount = useCart((s) => s.discount());
  const coupon = useCart((s) => s.coupon);
  const user = useAuth((s) => s.user);
  const showToast = useToast((s) => s.show);

  // Direcciones guardadas (solo logueado)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [saveAddr, setSaveAddr] = useState(false); // opt-in (no marcado por defecto)

  // Idempotencia: la key se deriva del contenido (ver buildIdempotencyKey) a
  // partir de este nonce, fijo por instancia de la pantalla. Un reintento con
  // el mismo contenido (doble tap, timeout de red) reenvía la misma key, así
  // el plugin devuelve el pedido ya creado en vez de duplicarlo — pero si el
  // contenido cambió (cupón, puntos, carrito), la key sale distinta sola.
  const [sessionNonce] = useState(generateSessionNonce);

  // Form
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [numDoc, setNumDoc] = useState('');
  const [departamento, setDepartamento] = useState<UbigeoTerm | null>(null);
  const [provincia, setProvincia] = useState<UbigeoTerm | null>(null);
  const [distrito, setDistrito] = useState<UbigeoTerm | null>(null);
  const [direccion, setDireccion] = useState('');
  const [numero, setNumero] = useState('');
  const [interior, setInterior] = useState('');
  const [referencia, setReferencia] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod | null>(null);

  // Ubigeo data
  const [deps, setDeps] = useState<UbigeoTerm[]>([]);
  const [provs, setProvs] = useState<UbigeoTerm[]>([]);
  const [dists, setDists] = useState<UbigeoTerm[]>([]);
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingDist, setLoadingDist] = useState(false);

  // Envío real, calculado en cuanto se elige el distrito (la Store API/BFF ya
  // resuelve esto por zona de WooCommerce; el legacy solo decía "se coordina").
  const [shipping, setShipping] = useState<ShippingQuote | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Canje de puntos: saldo no persistido — se revalida contra el servidor en
  // cada sesión de checkout en vez de arrastrar un compromiso monetario entre
  // reinicios de la app (igual criterio que metodoPago).
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const pointsDiscount = Math.round(pointsToRedeem * 0.05 * 100) / 100;

  const envio = shipping ? shipping.cost : 0;
  const finalTotal = Math.max(0, subtotal - discount - pointsDiscount + envio);

  // Cupón de un tipo que cartStore.discount() no calcula (ej. fixed_product) —
  // mismo criterio que CouponField.tsx (ver M10 en boticuy-hallazgos-completo.md):
  // discount da 0 sin que el cupón realmente no haga nada, así que la fila de
  // "Descuento" no puede mostrar "−S/0.00" (mentira) ni ocultarse sin más (no
  // avisa que sigue aplicado). Se distingue del caso "no llega al monto mínimo"
  // (ese sí debe mostrarse en S/0/oculto — CouponField ya lo avisa arriba con su
  // propio mensaje) para no confundir "todavía no aplica" con "ya aplica, el
  // monto se confirma al pagar".
  const belowCouponMinimum = !!coupon?.minimum_amount && subtotal < coupon.minimum_amount;
  const discountPreviewUnsupported =
    !!coupon && discount === 0 && !belowCouponMinimum && coupon.discount_type !== 'percent' && coupon.discount_type !== 'fixed_cart';

  useEffect(() => {
    fetchDepartamentos().then(setDeps).catch(() => {});
  }, []);

  // Revalidación al entrar al Checkout (capa 2 de A7, ver
  // boticuy-hallazgos-completo.md): actualiza stock y precio real de cada
  // ítem ANTES de que el usuario decida cuánto canjear — así el subtotal y el
  // tope de 30% que ve en PointsRedeemField ya reflejan el precio vigente, no
  // el que tenía el carrito al agregarlo (que puede llevar días desactualizado).
  // Una sola vez al montar (Checkout es pantalla de stack, no de tab — a
  // diferencia de CartScreen no hace falta useFocusEffect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { issues } = await revalidateCart(() => cancelled);
      if (!cancelled && issues.length > 0) {
        showToast(issues.join('\n'), { variant: 'warning', duration: 5000 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Recordar mis datos: precargar lo guardado en este teléfono (opt-in).
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(PROFILE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p.nombre) setNombre(p.nombre);
        if (p.email) setEmail(p.email);
        if (p.telefono) setTelefono(p.telefono);
        if (p.numDoc) setNumDoc(p.numDoc);
        if (p.direccion) setDireccion(p.direccion);
        if (p.numero) setNumero(p.numero);
        if (p.interior) setInterior(p.interior);
        if (p.referencia) setReferencia(p.referencia);
        setSaveAddr(true);
        if (p.departamento && p.provincia && p.distrito) {
          setDepartamento(p.departamento);
          setProvincia(p.provincia);
          setDistrito(p.distrito);
          try {
            setProvs(await fetchProvincias(p.departamento.codigo));
            setDists(await fetchDistritos(p.departamento.codigo, p.provincia.codigo));
          } catch {
            /* noop */
          }
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    setNombre((n) => n || user.nombre || '');
    setEmail((e) => e || user.email || '');
    fetchAddresses().then(setSavedAddresses).catch(() => {});
    fetchPoints()
      .then((info) => setPointsBalance(info.balance))
      .catch(() => {});
  }, [user]);

  // Al aplicar un cupón, se cancela cualquier canje de puntos en curso (mutuamente excluyentes).
  useEffect(() => {
    if (coupon) setPointsToRedeem(0);
  }, [coupon]);

  const usarDireccion = async (a: SavedAddress) => {
    if (a.telefono) setTelefono(a.telefono);
    if (a.numDoc) setNumDoc(a.numDoc);
    setDepartamento(a.departamento);
    setProvincia(a.provincia);
    setDistrito(a.distrito);
    setDireccion(a.direccion);
    setNumero(a.numero);
    setInterior(a.interior || '');
    setReferencia(a.referencia || '');
    try {
      setProvs(await fetchProvincias(a.departamento.codigo));
      setDists(await fetchDistritos(a.departamento.codigo, a.provincia.codigo));
    } catch {
      /* noop */
    }
  };

  // Cotizar envío real en cuanto hay distrito (idUbigeo).
  useEffect(() => {
    if (!distrito?.idUbigeo) {
      setShipping(null);
      return;
    }
    setLoadingShipping(true);
    fetchShipping(distrito.idUbigeo, subtotal)
      .then(setShipping)
      .catch(() => setShipping(null))
      .finally(() => setLoadingShipping(false));
  }, [distrito?.idUbigeo, subtotal]);

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
    if (!nombre.trim()) e.nombre = 'Ingresa tu nombre';
    if (!isValidEmail(email)) e.email = 'Correo inválido';
    if (telefono.trim().length < 9 || !isValidPhone(telefono.trim())) e.telefono = 'Teléfono inválido';
    if (stripInnerSpaces(numDoc.trim()).length < 8 || !isValidDNI(numDoc.trim())) e.numDoc = 'Documento inválido';
    if (!departamento) e.departamento = 'Elige departamento';
    if (!provincia) e.provincia = 'Elige provincia';
    if (!distrito) e.distrito = 'Elige distrito';
    if (!direccion.trim()) e.direccion = 'Ingresa la dirección';
    if (!numero.trim()) e.numero = 'Nro';
    if (!metodoPago) e.metodoPago = 'Debes seleccionar un método de pago';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;

    // Revalidación pre-submit (capa 3 de A7): último chequeo de stock/precio
    // justo antes de crear el pedido — cierra la ventana que la revalidación
    // de montaje (arriba) deja abierta mientras el usuario llena el
    // formulario. Si encuentra un cambio real, se corta acá: el usuario ve
    // los números ya actualizados en pantalla (subtotal, tope de puntos,
    // total) y tiene que volver a tocar "Confirmar pedido" contra datos
    // frescos, en vez de que se le cobre o canjee algo distinto de lo que
    // vio. Si la revalidación en sí falla (red), NO bloquea — se sigue con lo
    // que ya había en el store; para ese caso queda el recorte del servidor
    // como red de seguridad final (ver create_order(), points_redeemed_adjusted).
    try {
      const { issues } = await revalidateCart();
      if (issues.length > 0) {
        showToast(issues.join('\n'), { variant: 'warning', duration: 5000 });
        return;
      }
    } catch {
      /* no bloquea el submit */
    }

    // Recordar mis datos: guardar/olvidar localmente en este teléfono (opt-in).
    try {
      if (saveAddr) {
        await SecureStore.setItemAsync(
          PROFILE_KEY,
          JSON.stringify({
            nombre: nombre.trim(),
            email: email.trim(),
            telefono: telefono.trim(),
            numDoc: numDoc.trim(),
            direccion: direccion.trim(),
            numero: numero.trim(),
            interior: interior.trim(),
            referencia: referencia.trim(),
            departamento,
            provincia,
            distrito,
          }),
        );
      } else {
        await SecureStore.deleteItemAsync(PROFILE_KEY);
      }
    } catch {
      /* noop */
    }
    // Además, guardar la dirección en la cuenta (si hay sesión). Fire-and-forget
    // a propósito — no debe bloquear ni demorar el pago. Si falla, se avisa con
    // un toast en vez de tragarse el error en silencio (ver A3): el toast es
    // global (montado en App.tsx), así que se ve igual aunque ya se haya
    // navegado a la pantalla de pago/confirmación para cuando la promesa resuelve.
    // `addAddress()` lanza con el motivo real ante cualquier fallo (ver B9 en
    // boticuy-hallazgos-completo.md) — basta con el `.catch()`.
    if (user && saveAddr && departamento && provincia && distrito) {
      addAddress(
        buildAddressPayload({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          numDoc: numDoc.trim(),
          direccion: direccion.trim(),
          numero: numero.trim(),
          interior: interior.trim(),
          referencia: referencia.trim(),
          departamento,
          provincia,
          distrito,
        })
      ).catch(() =>
        showToast('No pudimos guardar tu dirección en tu cuenta, pero tu pedido sí se procesó.', { variant: 'warning' })
      );
    }

    analytics.track(EV.CHECKOUT_SUBMITTED, {
      value: finalTotal,
      items: items.length,
      payment: metodoPago,
      distrito: distrito?.nombre,
      coupon: coupon?.code,
      points_redeem: pointsToRedeem || undefined,
    });

    const baseParams = {
      nombre: nombre.trim(),
      email: email.trim(),
      distrito: distrito!.nombre,
      metodoPago: metodoPago!,
      subtotal,
      envio,
      total: finalTotal,
      coupon: coupon?.code,
      // Estimado del cliente (cartStore.discount()) — solo como fallback si el
      // servidor no llega a responder con coupon_discount (ver couponParams
      // abajo). No calcula todos los tipos de descuento (ver M10 en
      // boticuy-hallazgos-completo.md), así que nunca es la fuente final.
      discount,
      // La cotización de envío nunca se resolvió (a diferencia de costar S/0
      // de verdad) — ver M2.
      shippingUnavailable: shipping === null,
    };
    // Del servidor, no del estado local: si A7 recortó el canje pedido, lo que
    // el cliente calculó (pointsToRedeem/pointsDiscount) ya no es lo que
    // realmente se canjeó.
    const pointsParams = (ord: { points_requested?: number; points_redeemed?: number; points_discount?: number; points_redeemed_adjusted?: boolean }) => ({
      pointsRequested: ord.points_requested,
      pointsRedeemed: ord.points_redeemed,
      pointsDiscount: ord.points_discount,
      pointsAdjusted: ord.points_redeemed_adjusted,
    });
    // Del servidor, no del estado local (ver M10): create_order() ya calculó el
    // descuento real del cupón vía apply_coupon() nativo de WooCommerce, que sí
    // sabe calcular cualquier discount_type — reemplaza el estimado de
    // cartStore.discount() en `baseParams` cuando está presente.
    const couponParams = (ord: { coupon_discount?: number }) =>
      ord.coupon_discount !== undefined ? { discount: ord.coupon_discount } : {};
    const orderPayload = {
      items: items.map((i) => ({ id: i.productId, qty: i.quantity })),
      customer: { nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim(), tipoDoc: 'DNI', numDoc: stripInnerSpaces(numDoc.trim()) },
      shipping: {
        departamento_cod: departamento!.codigo,
        provincia_cod: provincia!.codigo,
        provincia_nombre: provincia!.nombre,
        distrito_cod: distrito!.codigo,
        distrito_nombre: distrito!.nombre,
        idUbigeo: distrito!.idUbigeo ?? '',
        direccion: direccion.trim(),
        numero: numero.trim(),
        interior: interior.trim(),
        referencia: referencia.trim(),
      },
      payment: metodoPago!,
      coupon: coupon?.code,
      points_redeem: pointsToRedeem || undefined,
      // Calculada recién acá, con los valores actuales — si el cupón o el
      // canje de puntos cambiaron desde un intento anterior en esta misma
      // pantalla, la key sale distinta sola (ver M13).
      idempotency_key: buildIdempotencyKey(sessionNonce, items, coupon?.code, pointsToRedeem),
    };

    // Pago con tarjeta: primero se crea el pedido (total calculado en el servidor),
    // luego se cobra con Izipay y el pago se verifica del lado del servidor.
    if (metodoPago === 'tarjeta') {
      setSubmitting(true);
      setErrors({});
      try {
        const ord = await createOrder(orderPayload);
        if (!ord.ok) {
          setErrors({ submit: ord.reason ?? 'No pudimos crear el pedido. Intenta de nuevo.' });
          return;
        }
        if (!ord.order_id) {
          // Vista previa (ordersEnabled=false): no hay pedido real, no se llama a Izipay.
          navigation.navigate('OrderConfirmation', { ...baseParams, total: ord.total ?? finalTotal, orderNumber: ord.number, ...pointsParams(ord), ...couponParams(ord) });
          return;
        }
        const ft = await getFormToken(ord.order_id, ord.checkout_token);
        if (!ft.ok || !ft.formToken || !ft.publicKey) {
          setErrors({ submit: ft.reason ?? 'No pudimos iniciar el pago con tarjeta.' });
          return;
        }
        navigation.navigate('PaymentWebView', {
          orderId: ord.order_id,
          formToken: ft.formToken,
          publicKey: ft.publicKey,
          checkoutToken: ord.checkout_token,
          confirm: { ...baseParams, total: ord.total ?? finalTotal, orderNumber: ord.number, ...pointsParams(ord), ...couponParams(ord) },
        });
      } catch {
        setErrors({ submit: 'Error al iniciar el pago. Intenta de nuevo.' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Yape / transferencia — crear pedido y confirmar directo, sin pasarela de
    // por medio; la coordinación del comprobante es manual, por WhatsApp/email.
    setSubmitting(true);
    setErrors({});
    try {
      const res = await createOrder(orderPayload);
      if (!res.ok) {
        setErrors({ submit: res.reason ?? 'No pudimos crear el pedido. Intenta de nuevo.' });
        return;
      }
      navigation.navigate('OrderConfirmation', { ...baseParams, total: res.total ?? finalTotal, orderNumber: res.number, ...pointsParams(res), ...couponParams(res) });
    } catch {
      setErrors({ submit: 'Error de conexión al crear el pedido.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>Tu carrito está vacío.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Aviso guest-first: solo para invitados, no aplica si ya está logueado */}
        {!user && (
          <View style={styles.guestNote}>
            <Text style={styles.guestNoteText}>
              Compra sin crear cuenta. Solo necesitamos tus datos de entrega.
            </Text>
          </View>
        )}

        <Text style={styles.section}>Tus datos</Text>
        <TextField label="Nombre completo" required value={nombre} onChangeText={setNombre} error={errors.nombre} autoCapitalize="words" autoComplete="name" textContentType="name" />
        <TextField label="Correo electrónico" required value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        {user && savedAddresses.length > 0 && (
          <View style={styles.savedWrap}>
            <Text style={styles.savedTitle}>Usar mis datos guardados</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {savedAddresses.map((a) => (
                <Pressable key={a.id} style={styles.savedChip} onPress={() => usarDireccion(a)}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={styles.savedChipText} numberOfLines={1}>
                    {a.distrito?.nombre}: {a.direccion} {a.numero}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <TextField label="Celular / WhatsApp" required value={telefono} onChangeText={setTelefono} error={errors.telefono} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
        <TextField label="DNI" required value={numDoc} onChangeText={setNumDoc} error={errors.numDoc} keyboardType="number-pad" />

        <Text style={styles.section}>Entrega a domicilio</Text>
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

        <Pressable style={styles.saveToggle} onPress={() => setSaveAddr((v) => !v)}>
          <Ionicons name={saveAddr ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.saveToggleText}>Recordar mis datos para la próxima vez</Text>
            <Text style={styles.saveToggleHint}>Se guardan solo en este teléfono. Puedes desmarcarlo cuando quieras.</Text>
          </View>
        </Pressable>

        <Text style={styles.section}>Método de pago</Text>
        <PayOption
          active={metodoPago === 'tarjeta'}
          onPress={() => setMetodoPago('tarjeta')}
          title="Tarjeta de crédito o débito"
          desc="Pago seguro con Izipay, dentro de la app"
        />
        <PayOption
          active={metodoPago === 'yape'}
          onPress={() => setMetodoPago('yape')}
          title="Yape / Plin"
          desc="Escanea el QR y sube tu comprobante"
        />
        <PayOption
          active={metodoPago === 'transferencia'}
          onPress={() => setMetodoPago('transferencia')}
          title="Transferencia bancaria"
          desc="Deposita a nuestra cuenta y envíanos tu comprobante"
        />
        {!!errors.metodoPago && <Text style={styles.paymentError}>{errors.metodoPago}</Text>}

        {/* Cupón — oculto mientras haya un canje de puntos en curso (no combinables) */}
        {pointsToRedeem === 0 && (
          <>
            <Text style={styles.section}>Cupón de descuento</Text>
            <CouponField />
          </>
        )}

        {/* Canje de puntos — oculto si ya hay un cupón aplicado (no combinables).
            El título "Canjear puntos" vive dentro de PointsRedeemField, como
            parte de su propia tarjeta autocontenida. */}
        {user && !coupon && pointsBalance > 0 && (
          <PointsRedeemField balance={pointsBalance} subtotal={subtotal} value={pointsToRedeem} onChange={setPointsToRedeem} />
        )}

        {/* Resumen */}
        <View style={styles.summary}>
          <Row label="Subtotal" value={formatSoles(subtotal)} />
          {discountPreviewUnsupported ? (
            <Row label={`Descuento (${coupon!.code})`} value="Se verá al confirmar" highlight />
          ) : (
            discount > 0 && (
              <Row label={`Descuento${coupon ? ` (${coupon.code})` : ''}`} value={`− ${formatSoles(discount)}`} highlight />
            )
          )}
          {pointsDiscount > 0 && (
            <Row label={`Puntos canjeados (${pointsToRedeem})`} value={`− ${formatSoles(pointsDiscount)}`} highlight />
          )}
          <Row
            label="Envío"
            value={
              !distrito
                ? 'Elige tu distrito'
                : loadingShipping
                  ? 'Calculando…'
                  : shipping
                    ? shipping.is_free
                      ? 'Gratis'
                      : formatSoles(shipping.cost)
                    : '—'
            }
          />
          {shipping && !shipping.is_free && shipping.free_threshold != null && (
            <Text style={styles.envioHint}>
              Envío gratis en {shipping.zone} desde {formatSoles(shipping.free_threshold)}.
            </Text>
          )}
        </View>

        {!!errors.submit && <Text style={styles.submitError}>{errors.submit}</Text>}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatSoles(finalTotal)}</Text>
        </View>
        <Pressable style={[styles.cta, submitting && { opacity: 0.7 }]} onPress={onSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>Confirmar pedido</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function PayOption({ active, onPress, title, desc }: { active: boolean; onPress: () => void; title: string; desc: string }) {
  return (
    <Pressable style={[styles.pay, active && styles.payActive]} onPress={onPress}>
      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payTitle}>{title}</Text>
        <Text style={styles.payDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && { color: colors.success }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted },
  guestNote: { backgroundColor: '#eaf2ff', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  guestNoteText: { color: colors.primaryDark, fontSize: 13 },
  section: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.md },
  savedWrap: { marginBottom: spacing.md },
  savedTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  savedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  savedChipText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  saveToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  saveToggleText: { fontSize: 14, color: colors.text },
  saveToggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.white },
  payActive: { borderColor: colors.primary, backgroundColor: '#f5f9ff' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  payTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  payDesc: { fontSize: 12, color: colors.textMuted },
  summary: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.textMuted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  envioHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  submitError: { color: colors.error, fontSize: 13, textAlign: 'center', marginTop: spacing.md },
  paymentError: { color: colors.error, fontSize: 12, marginTop: 4 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  cta: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { validatePayment } from '../api/payment';
import { useCart } from '../store/cartStore';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentWebView'>;

function buildHtml(publicKey: string, formToken: string, amount: number) {
  const total = (amount || 0).toFixed(2);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js" kr-public-key="${publicKey}"></script>
<link rel="stylesheet" href="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic-reset.min.css">
<script src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js"></script>
<style>
  body{margin:0;background:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;}
  .bcy-head{background:#1c4eb5;color:#fff;padding:16px 18px;display:flex;align-items:center;gap:10px}
  .bcy-head .t{font-weight:700;font-size:15px;flex:1}
  .bcy-total{font-weight:800;font-size:16px}
  .bcy-card{background:#fff;margin:14px;border-radius:16px;padding:6px 6px 14px;box-shadow:0 2px 12px rgba(0,0,0,.07)}
  .bcy-sec{color:#80809a;font-size:12px;text-align:center;margin:2px 14px 14px;display:flex;align-items:center;justify-content:center;gap:6px}
  .kr-embedded{padding:14px !important;width:100% !important;box-sizing:border-box !important}
  .kr-embedded form,.kr-embedded .kr-form{width:100% !important;margin:0 !important}
  .kr-embedded .kr-field,.kr-embedded .kr-pan,.kr-embedded .kr-expiry,.kr-embedded .kr-security-code,.kr-embedded .kr-installment-number,.kr-embedded .kr-first-installment-delay,.kr-embedded .kr-card-holder-name{width:100% !important;max-width:100% !important;box-sizing:border-box !important;margin-left:0 !important;margin-right:0 !important;margin-bottom:10px !important}
  .kr-embedded .kr-field,.kr-embedded .kr-input-field,.kr-embedded input,.kr-embedded select{border-radius:12px !important;box-sizing:border-box !important}
  .kr-embedded .kr-payment-button{background-color:#1c4eb5 !important;color:#ffffff !important;border-radius:999px !important;min-height:54px !important;width:100% !important;font-weight:800 !important;font-size:16px !important;margin-top:10px !important;box-shadow:none !important;border:none !important}
  .kr-embedded .kr-payment-button *,.kr-embedded .kr-payment-button span,.kr-embedded .kr-payment-button .kr-button-label{color:#ffffff !important;fill:#ffffff !important}
</style>
</head><body>
<div class="bcy-head"><span class="t">🔒 Total a pagar</span><span class="bcy-total">S/ ${total}</span></div>
<div class="bcy-card"><div class="kr-embedded" kr-form-token="${formToken}"></div></div>
<div class="bcy-sec"><span>🔒</span> Procesado por Izipay · tus datos están protegidos</div>
<script>
function send(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
window.addEventListener('load', function(){
  if(!window.KR){ send({type:'error', message:'No se pudo cargar el formulario de pago'}); return; }
  KR.onSubmit(function(resp){ send({type:'submit', answer: resp.rawClientAnswer, hash: resp.hash}); return false; });
  KR.onError(function(e){ send({type:'error', message:(e && e.errorMessage) || 'Error en el pago'}); });
});
</script>
</body></html>`;
}

export function PaymentWebViewScreen({ route, navigation }: Props) {
  const { orderId, formToken, publicKey, checkoutToken, confirm } = route.params;
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clear = useCart((s) => s.clear);

  // El pedido ya se creó antes del pago; aquí solo se confirma y se limpia el carrito.
  const complete = () => {
    clear();
    navigation.replace('OrderConfirmation', { ...confirm });
  };

  const onMessage = async (e: any) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'error') {
      setError(msg.message || 'Ocurrió un error en el pago');
      return;
    }
    if (msg.type === 'submit') {
      setValidating(true);
      setError(null);
      try {
        const v = await validatePayment(orderId, msg.answer, msg.hash, checkoutToken);
        if (v.ok && v.paid) {
          complete();
        } else {
          setError(v.reason || 'El pago no se completó. Intenta de nuevo.');
        }
      } catch {
        setError('No pudimos confirmar el pago. Revisa tu conexión.');
      } finally {
        setValidating(false);
      }
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Volver al checkout</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        // Acotado a boticuy.com (baseUrl del HTML embebido) y *.micuentaweb.pe (Izipay):
        // antes era ['*'], permitiendo que el WebView navegara a cualquier origen.
        originWhitelist={['https://boticuy.com', 'https://*.micuentaweb.pe']}
        source={{ html: buildHtml(publicKey, formToken, confirm.total), baseUrl: 'https://boticuy.com' }}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
      />
      {(loading || validating) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.overlayText}>{validating ? 'Confirmando tu pago…' : 'Cargando pago seguro…'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  overlayText: { color: colors.textMuted, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface },
  errorText: { fontSize: 15, color: colors.error, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.white, fontWeight: '700' },
});

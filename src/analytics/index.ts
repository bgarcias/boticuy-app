/**
 * Capa de analítica provider-agnóstica.
 * Hoy registra eventos en consola (visibles en el dev server) y permite
 * enchufar un proveedor real (PostHog recomendado, o Amplitude/Meta) con setSink.
 *
 * Para conectar PostHog (cuando exista la cuenta + key):
 *   import PostHog from 'posthog-react-native'
 *   const ph = await PostHog.initAsync(KEY, { host })
 *   analytics.setSink((event, props) => ph.capture(event, props))
 *   analytics.setIdentifySink((id, traits) => ph.identify(id, traits))
 */

export type Props = Record<string, any>;
type Sink = (event: string, props?: Props) => void;
type IdentifySink = (id: string, traits?: Props) => void;

let sink: Sink | null = null;
let identifySink: IdentifySink | null = null;

// Activar logs en consola solo en desarrollo.
declare const __DEV__: boolean;
const logToConsole = typeof __DEV__ !== 'undefined' && __DEV__;

export const analytics = {
  /** Conecta el proveedor real (ej. PostHog.capture). */
  setSink(s: Sink | null) {
    sink = s;
  },
  setIdentifySink(s: IdentifySink | null) {
    identifySink = s;
  },

  /** Registra un evento del embudo. */
  track(event: string, props?: Props) {
    if (logToConsole) console.log('📊 [analytics]', event, props ?? {});
    try {
      sink?.(event, props);
    } catch {
      /* nunca romper la app por analítica */
    }
  },

  /** Vista de pantalla. */
  screen(name: string, props?: Props) {
    analytics.track('screen_view', { screen: name, ...props });
  },

  /** Identifica al usuario (cuando haya login). */
  identify(id: string, traits?: Props) {
    try {
      identifySink?.(id, traits);
    } catch {
      /* noop */
    }
  },
};

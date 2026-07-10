import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';
import { analytics } from './index';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  posthogKey?: string;
  posthogHost?: string;
};

let client: PostHog | null = null;

/** Inicializa PostHog y conecta la capa de analítica (sink). No hace nada si no hay key configurada. */
export function initAnalytics() {
  if (!extra.posthogKey) return;
  try {
    client = new PostHog(extra.posthogKey, { host: extra.posthogHost });
    analytics.setSink((event, props) => {
      try {
        client?.capture(event, props);
      } catch {
        /* noop */
      }
    });
    analytics.setIdentifySink((id, traits) => {
      try {
        client?.identify(id, traits);
      } catch {
        /* noop */
      }
    });
  } catch {
    /* la analítica nunca debe romper la app */
  }
}

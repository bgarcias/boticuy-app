import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { fetchShippingConfig } from '../api/shipping';

const extra = (Constants.expoConfig?.extra ?? {}) as { envioGratisDesdeNivel?: number };

interface ShippingConfigState {
  /** Umbral reducido Plata/Oro (`envio_gratis_nivel` del plugin, ver M5 en
   *  boticuy-hallazgos-completo.md). Arranca con el default de build y se
   *  actualiza al primer fetch exitoso — nunca queda sin valor. */
  envioGratisDesdeNivel: number;
  refresh: () => Promise<void>;
}

/** Cachea `GET /shipping/config` en disco (mismo patrón que recentSearchesStore) para
 *  que el umbral Plata/Oro sea configurable desde WordPress sin publicar versión nueva
 *  de la app, sin depender de la red en cada arranque (ver M5). */
export const useShippingConfig = create<ShippingConfigState>()(
  persist(
    (set) => ({
      envioGratisDesdeNivel: extra.envioGratisDesdeNivel ?? 59,
      refresh: async () => {
        try {
          const { envio_gratis_nivel } = await fetchShippingConfig();
          if (typeof envio_gratis_nivel === 'number' && envio_gratis_nivel > 0) {
            set({ envioGratisDesdeNivel: envio_gratis_nivel });
          }
        } catch {
          // Sin red o el endpoint falló: se queda con el último valor cacheado
          // (o el default de build, si nunca hubo un fetch exitoso).
        }
      },
    }),
    {
      name: 'boticuy-shipping-config',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ envioGratisDesdeNivel: state.envioGratisDesdeNivel }),
    }
  )
);

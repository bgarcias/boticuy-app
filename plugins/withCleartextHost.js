const { withDangerousMod, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Permite tráfico HTTP (cleartext) en Android solo para el host recibido en
 * `host` — nunca de forma global (no toca usesCleartextTraffic, no agrega
 * base-config). app.config.js solo aplica este plugin cuando la URL de API
 * configurada por entorno usa http:// (staging); en producción (https) el
 * plugin ni siquiera se incluye, así que un build de producción nunca lleva
 * este permiso.
 */
function withCleartextHost(config, { host }) {
  if (!host) return config;

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Generado por plugins/withCleartextHost.js a partir de la URL de API del
         entorno activo (ver app.config.js). Solo este host puede usar HTTP. -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">${host}</domain>
    </domain-config>
</network-security-config>
`
      );
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

  return config;
}

module.exports = withCleartextHost;

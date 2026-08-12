// Mock de AsyncStorage para los stores con persistencia.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock de @expo/vector-icons.
//
// No es un parche puntual de este entorno: `expo-font` (dependencia de
// vector-icons) hace `require('expo-asset')` al cargarse, pero no declara
// `expo-asset` en su propio package.json — solo lo declara `expo` — así que
// npm nunca lo sube al node_modules raíz (queda anidado en
// node_modules/expo/node_modules/expo-asset, confirmado en package-lock.json).
// Cualquier `npm install` desde este lockfile reproduce el mismo árbol, en
// cualquier máquina — no es un node_modules corrupto de esta sesión.
//
// Se podría "arreglar" agregando expo-asset como devDependency propia para
// forzar el hoist (se probó: funciona), pero eso solo sirve para que el ícono
// real se monte en los tests — ninguna pantalla de esta app hace assertions
// sobre cómo se ve un ícono — y de paso el ícono real dispara un setState
// asíncrono interno (chequeo de fuente cargada) que ensucia la salida con
// warnings de "not wrapped in act(...)" sin aportar nada a lo que se testea.
// Mockear el ícono es la opción más limpia: cero dependencias extra, salida
// silenciosa, y sigue reenviando cualquier prop (incluido testID/
// accessibilityLabel) por si algún test futuro necesita encontrarlo.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = (props) => React.createElement('MockIcon', props);
  return new Proxy({}, { get: () => MockIcon });
});

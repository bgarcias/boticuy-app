import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList, TabParamList } from './types';
import { analytics } from '../analytics';
import { colors } from '../theme';
import { useCart } from '../store/cartStore';
import { OnboardingScreen, ONBOARDING_KEY } from '../screens/OnboardingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CartScreen } from '../screens/CartScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { OrderConfirmationScreen } from '../screens/OrderConfirmationScreen';
import { AddressesScreen } from '../screens/AddressesScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { PointsScreen } from '../screens/PointsScreen';
import { CreatorsScreen } from '../screens/CreatorsScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { PaymentWebViewScreen } from '../screens/PaymentWebViewScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function CartBadge() {
  const count = useCart((s) => s.count());
  if (count === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Catalogo: 'grid',
            Carrito: 'cart',
            Perfil: 'person',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerTitle: () => (
            <Image
              source={require('../../assets/logo-boticuy.png')}
              style={{ width: 124, height: 32 }}
              resizeMode="contain"
            />
          ),
          headerTitleAlign: 'center',
        }}
      />
      <Tab.Screen name="Catalogo" component={CatalogScreen} options={{ title: 'Catálogo' }} />
      <Tab.Screen
        name="Carrito"
        component={CartScreen}
        options={{
          title: 'Carrito',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="cart" size={size} color={color} />
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tab.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Mi cuenta' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true));
  }, []);

  if (onboarded === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onStateChange={() => {
        const name = navigationRef.getCurrentRoute()?.name;
        if (name) analytics.screen(name);
      }}
    >
      <Stack.Navigator
        initialRouteName={onboarded ? 'Tabs' : 'Onboarding'}
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '800' },
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="ProductDetail"
          component={ProductDetailScreen}
          options={({ route }) => ({ title: route.params?.name ?? 'Producto' })}
        />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Mi cuenta' }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Finalizar compra' }} />
        <Stack.Screen
          name="OrderConfirmation"
          component={OrderConfirmationScreen}
          options={{ title: 'Confirmación', headerBackVisible: false, gestureEnabled: false }}
        />
        <Stack.Screen name="Addresses" component={AddressesScreen} options={{ title: 'Mis direcciones' }} />
        <Stack.Screen name="Orders" component={OrdersScreen} options={{ title: 'Mis pedidos' }} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Detalle del pedido' }} />
        <Stack.Screen name="Points" component={PointsScreen} options={{ title: 'Mis puntos' }} />
        <Stack.Screen name="Creators" component={CreatorsScreen} options={{ title: 'Apoya a tu creador' }} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Mis favoritos' }} />
        <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} options={{ title: 'Pago seguro' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  badge: {
    position: 'absolute',
    right: -10,
    top: -6,
    backgroundColor: colors.error,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
});

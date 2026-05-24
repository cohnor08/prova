import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from './src/hooks/useAuth';
import { COLORS } from './src/constants/theme';

import LoginScreen from './src/screens/auth/LoginScreen';
import SignupScreen from './src/screens/auth/SignupScreen';
import OnboardingFlow from './src/screens/onboarding/OnboardingFlow';
import TodayScreen from './src/screens/tabs/TodayScreen';
import ProgressScreen from './src/screens/tabs/ProgressScreen';
import PlanScreen from './src/screens/tabs/PlanScreen';
import ProfileScreen from './src/screens/tabs/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  const icons = { Today: '🎸', Plan: '📅', Progress: '📈', Profile: '👤' };
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20 }}>{icons[label]}</Text>
      <Text style={{ color: focused ? COLORS.primary : COLORS.textMuted, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 80,
          paddingBottom: 10,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Today" focused={focused} /> }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Plan" focused={focused} /> }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Progress" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { user, onboardingComplete, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.loadingLogo}>PROVA</Text>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {!user ? (
        <AuthStack />
      ) : !onboardingComplete ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingFlow} />
        </Stack.Navigator>
      ) : (
        <MainTabs />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  loadingLogo: {
    color: COLORS.primary,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 8,
  },
});

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './src/hooks/useAuth';
import { useMaintenance } from './src/hooks/useMaintenance';
import { AuthContext } from './src/contexts/AuthContext';
import { COLORS } from './src/constants/theme';

import MaintenanceScreen from './src/screens/MaintenanceScreen';
import WelcomeScreen from './src/screens/auth/WelcomeScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignupScreen from './src/screens/auth/SignupScreen';
import OnboardingFlow from './src/screens/onboarding/OnboardingFlow';
import TeacherOnboarding from './src/screens/onboarding/TeacherOnboarding';
import TodayScreen from './src/screens/tabs/TodayScreen';
import ProgressScreen from './src/screens/tabs/ProgressScreen';
import ProfileScreen from './src/screens/tabs/ProfileScreen';
import TeacherScreen from './src/screens/tabs/TeacherScreen';
import TeacherHomeScreen from './src/screens/tabs/TeacherHomeScreen';
import ResourceLibraryScreen from './src/screens/tabs/ResourceLibraryScreen';
import PracticeScreen from './src/screens/tabs/PracticeScreen';
import GigsScreen from './src/screens/tabs/GigsScreen';
import SongsScreen from './src/screens/tabs/SongsScreen';
import MessagesScreen from './src/screens/tabs/MessagesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PracticeStack = createNativeStackNavigator();

// The Practice tab is a small stack so it can push deeper pages (Gigs &
// Setlists) without adding another bottom tab.
function PracticeStackScreen() {
  return (
    <PracticeStack.Navigator screenOptions={{ headerShown: false }}>
      <PracticeStack.Screen name="PracticeHome" component={PracticeScreen} />
      <PracticeStack.Screen
        name="Songs"
        component={SongsScreen}
        options={{
          headerShown: true,
          title: 'Songs & Setlists',
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { color: COLORS.text, fontWeight: '800' },
          headerShadowVisible: false,
        }}
      />
      <PracticeStack.Screen
        name="Gigs"
        component={GigsScreen}
        options={{
          headerShown: true,
          title: 'Gigs',
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerTitleStyle: { color: COLORS.text, fontWeight: '800' },
          headerShadowVisible: false,
        }}
      />
    </PracticeStack.Navigator>
  );
}

const TAB_ICONS = {
  Today: ['musical-notes', 'musical-notes-outline'],
  Practice: ['options', 'options-outline'],
  Progress: ['trending-up', 'trending-up-outline'],
  Messages: ['chatbubbles', 'chatbubbles-outline'],
  Home: ['home', 'home-outline'],
  Teacher: ['school', 'school-outline'],
  Resources: ['library', 'library-outline'],
  Profile: ['person', 'person-outline'],
};

function MainTabs({ role }) {
  const isTeacher = role === 'teacher';
  return (
    <Tab.Navigator
      initialRouteName={isTeacher ? 'Home' : 'Today'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={22} color={color} />;
        },
      })}
    >
      {isTeacher ? (
        <>
          <Tab.Screen name="Home" component={TeacherHomeScreen} />
          <Tab.Screen name="Teacher" component={TeacherScreen} options={{ tabBarLabel: 'Students' }} />
          <Tab.Screen name="Resources" component={ResourceLibraryScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Tab.Screen name="Today" component={TodayScreen} />
          <Tab.Screen name="Practice" component={PracticeStackScreen} />
          <Tab.Screen name="Progress" component={ProgressScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { user, onboardingComplete, setOnboardingComplete, role, loading } = useAuth();
  const { isUnderMaintenance, message, loading: maintenanceLoading } = useMaintenance();

  if (loading || maintenanceLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.loadingLogo}>PROVA</Text>
        <ActivityIndicator color={COLORS.primary} size="small" />
      </View>
    );
  }

  if (isUnderMaintenance) {
    return (
      <>
        <StatusBar style="light" />
        <MaintenanceScreen message={message} />
      </>
    );
  }

  return (
    <AuthContext.Provider value={{ setOnboardingComplete }}>
      <NavigationContainer>
        <StatusBar style="light" />
        {!user ? (
          <AuthStack />
        ) : !onboardingComplete ? (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="Onboarding"
              component={role === 'teacher' ? TeacherOnboarding : OnboardingFlow}
            />
          </Stack.Navigator>
        ) : (
          <MainTabs role={role} />
        )}
      </NavigationContainer>
    </AuthContext.Provider>
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

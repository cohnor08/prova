import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './src/hooks/useAuth';
import { useMaintenance } from './src/hooks/useMaintenance';
import { AuthContext } from './src/contexts/AuthContext';
import { COLORS, TAB_BAR_STYLE } from './src/constants/theme';
import { CelebrationProvider } from './src/components/Celebration';

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
import TeacherCalendarScreen from './src/screens/tabs/TeacherCalendarScreen';
import TeacherOverviewScreen from './src/screens/tabs/TeacherOverviewScreen';
import LessonNoteScreen from './src/screens/tabs/LessonNoteScreen';
import PacksScreen from './src/screens/tabs/PacksScreen';
import ResourceLibraryScreen from './src/screens/tabs/ResourceLibraryScreen';
import PracticeScreen from './src/screens/tabs/PracticeScreen';
import SongsScreen from './src/screens/tabs/SongsScreen';
import ScheduleScreen from './src/screens/tabs/ScheduleScreen';
import LibraryScreen from './src/screens/tabs/LibraryScreen';
import LearnSongScreen from './src/screens/tabs/LearnSongScreen';
import MessagesScreen from './src/screens/tabs/MessagesScreen';
import StudentLessonNoteScreen from './src/screens/tabs/StudentLessonNoteScreen';
import PaywallScreen from './src/screens/tabs/PaywallScreen';
import NotificationsScreen from './src/screens/tabs/NotificationsScreen';
import AskProvaScreen from './src/screens/tabs/AskProvaScreen';

// Dark navigation theme so screen push transitions (and the tab-bar hide when a
// full-screen child like Ask Prova opens) never flash the default white
// background. Safe now that the SafeAreaView bottom-gap is fixed at the source.
const NAV_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: COLORS.background, card: COLORS.background },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PracticeStack = createNativeStackNavigator();
const TeacherHomeStack = createNativeStackNavigator();
const TodayStack = createNativeStackNavigator();

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
      <PracticeStack.Screen name="Schedule" component={ScheduleScreen} />
      <PracticeStack.Screen name="Library" component={LibraryScreen} />
      <PracticeStack.Screen name="LearnSong" component={LearnSongScreen} />
      <PracticeStack.Screen name="LessonNotes" component={StudentLessonNoteScreen} />
    </PracticeStack.Navigator>
  );
}

// The Today tab is a small stack so it can push the read-only lesson-notes page
// in its own window (instead of jumping over to the calendar).
function TodayStackScreen() {
  return (
    <TodayStack.Navigator screenOptions={{ headerShown: false }}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} />
      <TodayStack.Screen name="LessonNotes" component={StudentLessonNoteScreen} />
      <TodayStack.Screen name="Paywall" component={PaywallScreen} />
      <TodayStack.Screen name="Notifications" component={NotificationsScreen} />
    </TodayStack.Navigator>
  );
}

// Teacher Home wrapped in a stack so it can push the lesson calendar.
function TeacherHomeStackScreen() {
  return (
    <TeacherHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <TeacherHomeStack.Screen name="TeacherHomeMain" component={TeacherHomeScreen} />
      <TeacherHomeStack.Screen name="TeacherCalendar" component={TeacherCalendarScreen} />
      <TeacherHomeStack.Screen name="TeacherOverview" component={TeacherOverviewScreen} />
      <TeacherHomeStack.Screen name="LessonNote" component={LessonNoteScreen} />
      <TeacherHomeStack.Screen name="Packs" component={PacksScreen} />
    </TeacherHomeStack.Navigator>
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
        tabBarStyle: TAB_BAR_STYLE,
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
          <Tab.Screen name="Home" component={TeacherHomeStackScreen} />
          <Tab.Screen name="Teacher" component={TeacherScreen} options={{ tabBarLabel: 'Students' }} />
          <Tab.Screen name="Resources" component={ResourceLibraryScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Tab.Screen name="Today" component={TodayStackScreen} />
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
    <AuthContext.Provider value={{ setOnboardingComplete, role }}>
      <CelebrationProvider>
      <NavigationContainer theme={NAV_THEME}>
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
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {/* MainTabs + any full-screen screens that should cover the tab bar
                (e.g. Ask Prova) live here so opening them doesn't reflow the tab bar. */}
            <Stack.Screen name="MainTabs">
              {() => <MainTabs role={role} />}
            </Stack.Screen>
            <Stack.Screen
              name="AskProva"
              component={AskProvaScreen}
              options={{ contentStyle: { backgroundColor: COLORS.background } }}
            />
          </Stack.Navigator>
        )}
      </NavigationContainer>
      </CelebrationProvider>
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

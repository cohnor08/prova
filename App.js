import React, { useState, useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';

import Ghost from './src/components/Ghost';
// Web: the app is phone-designed — pin the app root to a centred column.
// react-native-web modal portals are ALSO direct children of <body>, but they
// sit at height 0 in normal flow, so constraining them the same way parks
// every modal in a zero-height box below the page (= every modal invisible,
// buttons that open them look dead). Instead each portal becomes its own
// fixed, click-transparent viewport box the width of the column: its
// position:fixed modal content then fills that box, so modals still respect
// the column AND actually appear. Empty (closed) portals pass clicks through.
// On a computer this build is the wrong product: /webapp/ is the real
// full-screen web app, and /webapp/ sends teachers on to /studio/ itself. So
// desktop never sees the phone column — this export stays the phone-browser
// build only. `?phone=1` forces it through for testing.
// Both conditions matter: width alone catches a phone held sideways, and a
// coarse pointer rules that out.
if (Platform.OS === 'web' && typeof window !== 'undefined'
    && !new URLSearchParams(window.location.search).has('phone')
    && window.innerWidth >= 900
    && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  window.location.replace('/webapp/');
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = [
    // A phone UI stretched to 1080px reads as broken on a desktop; held to a
    // phone-width column on a darker ground it reads as deliberate. The page
    // colour is a shade under Sky's background so the column edges show.
    // NOTE: the same width must apply to the portal boxes below, or modals
    // stop lining up with the app.
    'body{background:#101318}',
    'body>#root{max-width:480px;width:100%;margin:0 auto;box-shadow:0 0 0 1px #333B4A}',
    'body>div:not(#root){position:fixed;inset:0;max-width:480px;width:100%;margin:0 auto;transform:translateZ(0);pointer-events:none}',
    'body>div:not(#root)>*{pointer-events:auto}',
  ].join(' ');
  document.head.appendChild(style);
  require('./src/lib/webAlert').installWebAlert();
}
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './src/hooks/useAuth';
import { useMaintenance } from './src/hooks/useMaintenance';
import { useStaleReload } from './src/hooks/useStaleReload';
import { AuthContext } from './src/contexts/AuthContext';
import { COLORS, TAB_BAR_STYLE, makeTabBarStyle } from './src/constants/theme';
import { ThemeProvider, useTheme } from './src/lib/ThemeContext';
import { CelebrationProvider } from './src/components/Celebration';
import { MetronomeProvider } from './src/lib/MetronomeContext';
import MetronomePill from './src/components/MetronomePill';
import { hideNativeSplash, holdNativeSplash } from './src/lib/nativeSplash';
import TourOverlay from './src/components/TourOverlay';

// Keep the native launch screen up until the intro has actually drawn a frame.
// Left to itself it hides as soon as React renders, which uncovered the root
// view a beat before the intro's WebView had painted — that gap was the white
// square around the mark at launch.
holdNativeSplash();

import MaintenanceScreen from './src/screens/MaintenanceScreen';
import VerifyEmailScreen from './src/screens/auth/VerifyEmailScreen';
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
import ChordLibraryScreen from './src/screens/tabs/ChordLibraryScreen';
import LearnSongScreen from './src/screens/tabs/LearnSongScreen';
import MessagesScreen from './src/screens/tabs/MessagesScreen';
import StudentLessonNoteScreen from './src/screens/tabs/StudentLessonNoteScreen';
import SkillTreeScreen from './src/screens/tabs/SkillTreeScreen';
import EarTrainingScreen from './src/screens/tabs/EarTrainingScreen';
import FretboardGameScreen from './src/screens/tabs/FretboardGameScreen';
import RhythmTapperScreen from './src/screens/tabs/RhythmTapperScreen';
import TheoryQuizScreen from './src/screens/tabs/TheoryQuizScreen';
import JournalScreen from './src/screens/tabs/JournalScreen';
import CreatePlanScreen from './src/screens/onboarding/CreatePlanScreen';
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
const ProgressStack = createNativeStackNavigator();
const ResourcesStack = createNativeStackNavigator();

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
      <PracticeStack.Screen name="ChordLibrary" component={ChordLibraryScreen} />
      <PracticeStack.Screen name="EarTraining" component={EarTrainingScreen} />
      <PracticeStack.Screen name="FretboardGame" component={FretboardGameScreen} />
      <PracticeStack.Screen name="RhythmTapper" component={RhythmTapperScreen} />
      <PracticeStack.Screen name="TheoryQuiz" component={TheoryQuizScreen} />
      <PracticeStack.Screen name="Journal" component={JournalScreen} />
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
      <TodayStack.Screen name="CreatePlan" component={CreatePlanScreen} />
      <TodayStack.Screen name="LessonNotes" component={StudentLessonNoteScreen} />
      <TodayStack.Screen name="Notifications" component={NotificationsScreen} />
    </TodayStack.Navigator>
  );
}

// Progress wrapped in a stack so it can push the skill tree.
function ProgressStackScreen() {
  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false }}>
      <ProgressStack.Screen name="ProgressHome" component={ProgressScreen} />
      <ProgressStack.Screen name="SkillTree" component={SkillTreeScreen} />
    </ProgressStack.Navigator>
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
      <TeacherHomeStack.Screen name="Notifications" component={NotificationsScreen} />
    </TeacherHomeStack.Navigator>
  );
}

// The teacher's Resources tab is a stack so it can push the skill-drill games —
// a teacher needs to play a drill to know what they're assigning. Same screens
// as the student's Practice tab, which owns its own copies.
function ResourcesStackScreen() {
  return (
    <ResourcesStack.Navigator screenOptions={{ headerShown: false }}>
      <ResourcesStack.Screen name="ResourcesHome" component={ResourceLibraryScreen} />
      <ResourcesStack.Screen name="EarTraining" component={EarTrainingScreen} />
      <ResourcesStack.Screen name="FretboardGame" component={FretboardGameScreen} />
      <ResourcesStack.Screen name="RhythmTapper" component={RhythmTapperScreen} />
      <ResourcesStack.Screen name="TheoryQuiz" component={TheoryQuizScreen} />
    </ResourcesStack.Navigator>
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
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      initialRouteName={isTeacher ? 'Home' : 'Today'}
      screenOptions={({ route }) => ({
        headerShown: false,
        // Mount every tab up front: screens load their data at app start, so
        // switching tabs (and the guided tour walking through them) never
        // shows a cold-load spinner.
        lazy: false,
        tabBarStyle: makeTabBarStyle(colors),
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
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
          <Tab.Screen name="Resources" component={ResourcesStackScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Tab.Screen name="Today" component={TodayStackScreen} />
          <Tab.Screen name="Practice" component={PracticeStackScreen} />
          <Tab.Screen name="Progress" component={ProgressStackScreen} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      )}
    </Tab.Navigator>
    {/* Students get the floating metronome pill so the click survives tab
        switches and stays visible/stoppable from anywhere. */}
    {!isTeacher && <MetronomePill />}
    <TourOverlay role={role} />
    </View>
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
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { user, onboardingComplete, setOnboardingComplete, role, loading,
    needsEmailVerification, setNeedsEmailVerification } = useAuth();
  const { isUnderMaintenance, message, loading: maintenanceLoading } = useMaintenance();
  const { colors, mode } = useTheme();
  const statusBarStyle = mode === 'light' ? 'dark' : 'light';
  const navTheme = { ...NAV_THEME, colors: { ...NAV_THEME.colors, background: colors.background, card: colors.background } };
  // No JS intro any more: the launch screen IS the intro. It's held on screen
  // for a beat (see src/lib/nativeSplash.js) and then fades straight into
  // whatever is ready, so there's no second animation and nothing to restart.
  useEffect(() => { hideNativeSplash(); }, []);

  // Coming back after a long time away restarts the app rather than showing
  // yesterday's data. Only while signed in — there is nothing stale to fix on
  // the welcome screen, and restarting mid-signup would lose what was typed.
  useStaleReload(!!user);

  let body;
  if (loading || maintenanceLoading) {
    body = (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.loadingLogo}>PROVA</Text>
        <Ghost color={COLORS.primary} size="small" />
      </View>
    );
  } else if (isUnderMaintenance) {
    body = (
      <>
        <StatusBar style="light" />
        <MaintenanceScreen message={message} />
      </>
    );
  } else {
    body = (
      <AuthContext.Provider value={{ setOnboardingComplete, role }}>
        <MetronomeProvider>
        <CelebrationProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style={statusBarStyle} />
          {!user ? (
            <AuthStack />
          ) : needsEmailVerification ? (
            // Sits in front of onboarding, so a new account confirms the
            // address before it can put anything into the app.
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="VerifyEmail">
                {() => <VerifyEmailScreen onVerified={() => setNeedsEmailVerification(false)} />}
              </Stack.Screen>
            </Stack.Navigator>
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
                options={{ contentStyle: { backgroundColor: colors.background } }}
              />
            </Stack.Navigator>
          )}
        </NavigationContainer>
        </CelebrationProvider>
        </MetronomeProvider>
      </AuthContext.Provider>
    );
  }

  return (
    // Explicitly dark: an unpainted wrapper lets the bare root view through,
    // and that reads white for the frames before the app paints.
    <View style={{ flex: 1, backgroundColor: '#171A21' }}>{body}</View>
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

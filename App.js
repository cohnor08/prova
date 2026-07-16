import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';

// Web: the app is phone-designed — pin the app root to a centred column.
// react-native-web modal portals are ALSO direct children of <body>, but they
// sit at height 0 in normal flow, so constraining them the same way parks
// every modal in a zero-height box below the page (= every modal invisible,
// buttons that open them look dead). Instead each portal becomes its own
// fixed, click-transparent viewport box the width of the column: its
// position:fixed modal content then fills that box, so modals still respect
// the column AND actually appear. Empty (closed) portals pass clicks through.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = [
    'body{background:#02040a}',
    'body>#root{max-width:1080px;width:94%;margin:0 auto}',
    'body>div:not(#root){position:fixed;inset:0;max-width:1080px;width:94%;margin:0 auto;transform:translateZ(0);pointer-events:none}',
    'body>div:not(#root)>*{pointer-events:auto}',
  ].join(' ');
  document.head.appendChild(style);
  require('./src/lib/webAlert').installWebAlert();
}
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './src/hooks/useAuth';
import { useMaintenance } from './src/hooks/useMaintenance';
import { AuthContext } from './src/contexts/AuthContext';
import { COLORS, TAB_BAR_STYLE, makeTabBarStyle } from './src/constants/theme';
import { ThemeProvider, useTheme } from './src/lib/ThemeContext';
import { CelebrationProvider } from './src/components/Celebration';
import IntroSplash from './src/components/IntroSplash';
import TourOverlay from './src/components/TourOverlay';

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
      <PracticeStack.Screen name="Paywall" component={PaywallScreen} />
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
  const { user, onboardingComplete, setOnboardingComplete, role, loading } = useAuth();
  const { isUnderMaintenance, message, loading: maintenanceLoading } = useMaintenance();
  const { colors, mode } = useTheme();
  const statusBarStyle = mode === 'light' ? 'dark' : 'light';
  const navTheme = { ...NAV_THEME, colors: { ...NAV_THEME.colors, background: colors.background, card: colors.background } };
  // Animated brand intro on cold start — overlays every app state (auth and
  // data keep loading underneath it), then fades into whatever is ready.
  const [introDone, setIntroDone] = useState(false);

  // The body swaps between loading / maintenance / the real app, but the
  // intro overlay must live at ONE stable position in the tree — if it sits
  // inside each branch, the branch swap remounts it and the WebView replays
  // the animation from the start (the visible "restart" glitch).
  let body;
  if (loading || maintenanceLoading) {
    body = (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.loadingLogo}>PROVA</Text>
        <ActivityIndicator color={COLORS.primary} size="small" />
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
        <CelebrationProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style={statusBarStyle} />
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
                options={{ contentStyle: { backgroundColor: colors.background } }}
              />
            </Stack.Navigator>
          )}
        </NavigationContainer>
        </CelebrationProvider>
      </AuthContext.Provider>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {body}
      {!introDone && <IntroSplash onDone={() => setIntroDone(true)} />}
    </View>
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

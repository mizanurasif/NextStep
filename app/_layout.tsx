import { Stack } from "expo-router";
import '@/global.css'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import { ApplicationsProvider } from '@/lib/applications-store'
import { useReminderNotifications } from '@/lib/use-reminder-notifications'
import { useSearchIndex } from '@/lib/use-search-index'

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

// Lives inside ApplicationsProvider because it schedules reminders from the live list
function ReminderNotifications() {
  useReminderNotifications();
  return null;
}

// Same for the AI search index, which is rebuilt from the live list
function SearchIndex() {
  useSearchIndex();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'sans-light': require('../assets/fonts/PlusJakartaSans-Light.ttf'),
    'sans-regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'sans-medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'sans-semibold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'sans-bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'sans-extrabold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <ApplicationsProvider>
        <ReminderNotifications />
        <SearchIndex />
        <Stack screenOptions={{headerShown: false}} />
      </ApplicationsProvider>
    </AuthProvider>
  );
}

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { initDB } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { syncAll } from '../lib/sync';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  const { setSession, user } = useAuthStore();
  const loadAll = useShiftStore((s) => s.loadAll);
  const sync = useShiftStore((s) => s.sync);

  useEffect(() => {
    initDB();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadAll(user.id);
      syncAll(user.id); // pull from Supabase on load
    }
  }, [user?.id]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.textPrimary,
            headerTitleStyle: { color: Colors.textPrimary },
            contentStyle: { backgroundColor: Colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen
            name="shift/[id]"
            options={{ title: 'Shift Details', presentation: 'card' }}
          />
          <Stack.Screen
            name="shift/new"
            options={{ title: 'Log Shift', presentation: 'modal' }}
          />
          <Stack.Screen
            name="shift/edit/[id]"
            options={{ title: 'Edit Shift', presentation: 'card' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

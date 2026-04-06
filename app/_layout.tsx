import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { initDB } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { syncAll } from '../lib/sync';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  const { setSession, user, loading } = useAuthStore();
  const loadAll = useShiftStore((s) => s.loadAll);
  const sync = useShiftStore((s) => s.sync);
  const dataReady = useShiftStore((s) => s.dataReady);

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
    if (!user?.id) return;
    // loadAll handles sync on web natively; on native it reads local SQLite
    loadAll(user.id);
  }, [user?.id]);

  // Block render until auth resolves and initial data load completes.
  // Without this gate, screens mount into empty jobs/shifts and useState
  // initializers lock in stale empty values before the store settles.
  const isReady = !loading && (!user || dataReady);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.accentActive} />
      </View>
    );
  }

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
            name="shift/import"
            options={{ title: 'Scan Receipt', presentation: 'modal' }}
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

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CenteredProgress } from '@/components/ui';
import { AuthFlowProvider } from '@/t3k/auth';
import { t3kClient } from '@/t3k/client';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Load persisted tokens before any screen asks whether the user is connected.
  useEffect(() => {
    t3kClient.hydrate().finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <AuthFlowProvider>
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="index" options={{ title: 'TONE3000 Examples' }} />
            <Stack.Screen name="select" options={{ title: 'Acme Inc' }} />
            <Stack.Screen name="load-tone" options={{ title: 'Beacon Inc' }} />
            <Stack.Screen name="full-api" options={{ title: 'Chord Inc' }} />
            <Stack.Screen name="tone/[id]" options={{ title: 'Tone' }} />
            <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
          </Stack>
        </AuthFlowProvider>
      ) : (
        <CenteredProgress />
      )}
    </SafeAreaProvider>
  );
}

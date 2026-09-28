// auth.tsx — run TONE3000 OAuth flows in an in-app WebView
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { PUBLISHABLE_KEY, REDIRECT_URI } from './config';
import { t3kClient } from './client';
import { buildAuthorization, exchangeCode, type PendingAuthorization } from './tone3000-client';

/**
 * Outcome of a flow.
 * - `connected`: tokens were issued (and saved). `toneId` is set for
 *   select/load flows; `canceled` means the user signed in but closed the
 *   flow before picking a tone.
 * - `canceled`: the user closed the flow before signing in.
 */
export type AuthResult =
  | { status: 'connected'; toneId?: string; canceled?: boolean }
  | { status: 'canceled' }
  | { status: 'error'; error: string };

type StartFlow = (params: Record<string, string>, title?: string) => Promise<AuthResult>;

const AuthFlowContext = createContext<StartFlow | null>(null);

/** Start a flow with authorize params from selectToneParams() and friends. */
export function useAuthFlow(): StartFlow {
  const start = useContext(AuthFlowContext);
  if (!start) throw new Error('useAuthFlow must be used inside <AuthFlowProvider>');
  return start;
}

function parseQuery(url: string): Record<string, string> {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

const isRedirect = (url: string) => url.split('?')[0] === REDIRECT_URI;

interface ActiveFlow {
  auth: PendingAuthorization;
  title: string;
  resolve: (result: AuthResult) => void;
}

/**
 * Hosts the TONE3000 WebView in a modal sheet. The WebView uses the app's
 * persistent web data store, so the TONE3000 session survives restarts and
 * later flows skip sign-in. Navigation to REDIRECT_URI is intercepted before
 * it leaves the WebView; nothing needs to handle the scheme at the OS level.
 */
export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<ActiveFlow | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const active = useRef<ActiveFlow | null>(null);

  /** Settle the active flow exactly once. */
  const finish = useCallback((result: AuthResult) => {
    const current = active.current;
    active.current = null;
    setFlow(null);
    setExchanging(false);
    current?.resolve(result);
  }, []);

  const start = useCallback<StartFlow>(async (params, title = 'TONE3000') => {
    if (!PUBLISHABLE_KEY) {
      return { status: 'error', error: 'missing_publishable_key' };
    }
    active.current?.resolve({ status: 'canceled' });
    const auth = await buildAuthorization(PUBLISHABLE_KEY, REDIRECT_URI, params);
    return new Promise<AuthResult>((resolve) => {
      const next = { auth, title, resolve };
      active.current = next;
      setFlow(next);
    });
  }, []);

  const handleCallback = async (url: string, current: ActiveFlow) => {
    const q = parseQuery(url);
    const canceled = q.canceled === 'true';
    if (canceled && !q.code) return finish({ status: 'canceled' });
    if (q.error) return finish({ status: 'error', error: q.error });
    if (!q.code || q.state !== current.auth.state) return finish({ status: 'error', error: 'state_mismatch' });

    setExchanging(true);
    try {
      const tokens = await exchangeCode(PUBLISHABLE_KEY, REDIRECT_URI, q.code, current.auth.codeVerifier);
      t3kClient.setTokens(tokens);
      finish({ status: 'connected', toneId: q.tone_id, canceled: canceled || undefined });
    } catch (err) {
      finish({ status: 'error', error: err instanceof Error ? err.message : 'token_exchange_failed' });
    }
  };

  const onShouldStartLoad = (req: WebViewNavigation) => {
    if (!flow || !isRedirect(req.url)) return true;
    void handleCallback(req.url, flow);
    return false;
  };

  return (
    <AuthFlowContext.Provider value={start}>
      {children}
      <Modal
        visible={flow !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => finish({ status: 'canceled' })}
      >
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>{flow?.title}</Text>
            <Pressable onPress={() => finish({ status: 'canceled' })} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          {flow && !exchanging ? (
            <WebView
              source={{ uri: flow.auth.url }}
              // URLs outside originWhitelist are handed to the OS without
              // reaching onShouldStartLoadWithRequest, so allow the redirect scheme.
              originWhitelist={['https://*', 'http://*', `${REDIRECT_URI.split(':')[0]}://*`]}
              onShouldStartLoadWithRequest={onShouldStartLoad}
              // Authorize can reject the request outright (bad key, unregistered
              // redirect URI) with an error page instead of a redirect.
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 400 && !isRedirect(e.nativeEvent.url)) {
                  finish({ status: 'error', error: `authorize_failed_${e.nativeEvent.statusCode}` });
                }
              }}
              onError={(e) => {
                if (!isRedirect(e.nativeEvent.url)) finish({ status: 'error', error: 'load_failed' });
              }}
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} />}
              setSupportMultipleWindows={false}
              style={styles.webview}
            />
          ) : (
            <ActivityIndicator style={styles.webview} />
          )}
        </SafeAreaView>
      </Modal>
    </AuthFlowContext.Provider>
  );
}

/** User-facing text for a failed flow. */
export function flowErrorMessage(error: string): string {
  if (error === 'missing_publishable_key') return 'Set EXPO_PUBLIC_T3K_PUBLISHABLE_KEY in react-native/.env and restart Metro.';
  if (error.startsWith('authorize_failed')) {
    return 'TONE3000 rejected the request. Check your publishable key and registered redirect URI.';
  }
  if (error === 'load_failed') return "Couldn't reach TONE3000. Check your connection and try again.";
  return 'Authentication failed. Please try again.';
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dde1e7',
  },
  title: { fontSize: 16, fontWeight: '600' },
  close: { fontSize: 16, color: '#2563eb' },
  webview: { flex: 1 },
});

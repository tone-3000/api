import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * The auth WebView consumes the redirect itself. If the OS ever delivers the
 * redirect URI to the app instead (e.g. from an external browser), return
 * to wherever the user was rather than showing an unmatched route.
 */
export default function OAuthCallback() {
  const router = useRouter();
  const canGoBack = router.canGoBack();
  useEffect(() => {
    if (canGoBack) router.back();
  }, [canGoBack, router]);
  return canGoBack ? null : <Redirect href="/" />;
}

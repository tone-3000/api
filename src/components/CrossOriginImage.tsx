// src/components/CrossOriginImage.tsx
//
// Centralized <img> wrapper that sets crossOrigin="anonymous" for all
// cross-origin image loads. Required because the app sets COEP headers
// (for SharedArrayBuffer support in the WASM audio player), which blocks
// no-CORS cross-origin requests. Supabase storage sends
// Access-Control-Allow-Origin: * so CORS mode works correctly.
//
// Use this component for any image whose src is not same-origin.
import type { ImgHTMLAttributes } from 'react';

export function CrossOriginImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} crossOrigin="anonymous" />;
}

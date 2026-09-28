/// <reference types="vite/client" />
import type { T3KBridge } from '../../shared/ipc'

declare global {
  interface Window {
    t3k: T3KBridge
  }
}

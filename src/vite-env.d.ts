/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Web push certificate key pair (public key) from Firebase Console → Cloud Messaging. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  /** Base URL of the deployed Cloudflare Worker that sends push notifications. */
  readonly VITE_PUSH_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

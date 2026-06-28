import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp | null = null
let messaging: Messaging | null = null

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseMessaging(): Messaging | null {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null
  if (!messaging) {
    messaging = getMessaging(getFirebaseApp())
  }
  return messaging
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    const m = getFirebaseMessaging()
    if (!m) return null
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
    const token = await getToken(m, { vapidKey, serviceWorkerRegistration: reg })
    return token || null
  } catch (e) {
    console.error('[fcm] getToken failed:', e)
    return null
  }
}

export function onFCMMessage(cb: (payload: any) => void): (() => void) | null {
  const m = getFirebaseMessaging()
  if (!m) return null
  return onMessage(m, cb)
}

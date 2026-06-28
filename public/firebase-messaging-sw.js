// Firebase Messaging Service Worker
// Ce fichier DOIT être à la racine du domaine (public/)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// La config est injectée par le client au moment de l'enregistrement du SW.
// En attendant, on utilise une config minimale — le token est passé via getToken().
let app
try {
  app = firebase.initializeApp({
    apiKey:            self.FIREBASE_API_KEY            || '',
    authDomain:        self.FIREBASE_AUTH_DOMAIN        || '',
    projectId:         self.FIREBASE_PROJECT_ID         || '',
    messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             self.FIREBASE_APP_ID             || '',
  })
} catch (e) {
  // déjà initialisé
  app = firebase.app()
}

const messaging = firebase.messaging(app)

// Notifications reçues en arrière-plan (app fermée ou en background)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  const data = payload.data || {}

  const notifTitle = title || '📞 Nouvel appel'
  const notifOptions = {
    body:       body || 'Consultez le récap dans votre dashboard Fixlyy.',
    icon:       '/logo-full-clean.svg',
    badge:      '/logo-full-clean.svg',
    data:       { url: 'https://app.fixlyy.fr/dashboard', ...data },
    tag:        data.call_id || 'fixlyy-call',
    renotify:   true,
    vibrate:    data.urgency === 'urgent' ? [200, 100, 200, 100, 200] : [200],
    requireInteraction: data.urgency === 'urgent',
  }

  self.registration.showNotification(notifTitle, notifOptions)
})

// Clic sur la notification → ouvrir/focus le dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || 'https://app.fixlyy.fr/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('app.fixlyy.fr') && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

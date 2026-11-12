import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { afterFirstPaint } from './app/afterFirstPaint'
import { forgetSignInMarker } from './sync/client'
import './design/tokens.css'

forgetSignInMarker()

/** The service worker is an extra: a failure to register never blocks the app. */
function registerWorker(): void {
  try {
    registerSW({ immediate: true })
  } catch {
    // Online use carries on without it.
  }
}

// Its precache asks for the data too, so it waits until the books have settled and been painted. If they hang for ever
// there is no worker in that session.
createApp(App, { onBooksSettled: () => afterFirstPaint(registerWorker) }).mount('#app')

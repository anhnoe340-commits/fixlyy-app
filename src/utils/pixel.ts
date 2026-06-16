declare global {
  interface Window {
    fbq: (...args: unknown[]) => void
  }
}

export function trackEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window.fbq === 'function') {
    window.fbq('track', event, params)
  }
}

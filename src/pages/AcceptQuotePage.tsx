import { useEffect, useState } from 'react'

const BRAND = '#2850c8'

type State = 'loading' | 'success' | 'already' | 'error'

export default function AcceptQuotePage() {
  const [state, setState] = useState<State>('loading')
  const [quoteNumber, setQuoteNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setState('error'); return }

    fetch(
      `https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/accept-quote?token=${token}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    )
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState('error'); return }
        if (data.alreadyAccepted) {
          setQuoteNumber(data.quoteNumber || '')
          setClientName(data.clientName || '')
          setState('already')
          return
        }
        setQuoteNumber(data.quoteNumber || '')
        setClientName(data.clientName || '')
        setInvoiceNumber(data.invoiceNumber || '')
        setState('success')
      })
      .catch(() => setState('error'))
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F5F4] flex items-center justify-center p-4"
         style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8 text-center">

        {state === 'loading' && (
          <>
            <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                 style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
            <p className="text-sm text-gray-500">Validation en cours…</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                 style={{ background: '#D1FAE5' }}>
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Devis accepté !</h1>
            <p className="text-sm text-gray-500 mb-1">
              {clientName && <><strong>{clientName}</strong>, votre </>}
              devis <strong>{quoteNumber}</strong> a bien été accepté.
            </p>
            {invoiceNumber && (
              <p className="text-sm text-gray-400 mt-3">
                Une facture <strong>{invoiceNumber}</strong> a été générée automatiquement.
              </p>
            )}
            <p className="text-xs text-gray-300 mt-6">L'artisan a été notifié et vous recontactera prochainement.</p>
          </>
        )}

        {state === 'already' && (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                 style={{ background: BRAND + '15' }}>
              <svg className="w-8 h-8" style={{ color: BRAND }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Devis déjà accepté</h1>
            <p className="text-sm text-gray-500">Le devis <strong>{quoteNumber}</strong> a déjà été accepté précédemment.</p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Lien invalide</h1>
            <p className="text-sm text-gray-500">Ce lien d'acceptation est invalide ou a expiré. Contactez votre artisan pour obtenir un nouveau lien.</p>
          </>
        )}

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[11px] text-gray-300">Propulsé par <strong>Fixlyy</strong> — Secrétaire IA pour artisans</p>
        </div>
      </div>
    </div>
  )
}

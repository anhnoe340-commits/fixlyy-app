import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'

const BRAND = '#3B5BF5'

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

interface Props {
  userId: string
  fixlyyNumber: string | null
  onDone: () => void
}

export default function Step5Forwarding({ userId, fixlyyNumber, onDone }: Props) {
  const isMobile    = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const [tapped, setTapped]           = useState(false)
  const [showManual, setShowManual]   = useState(false)
  const [copied, setCopied]           = useState<string | null>(null)
  const [twilioNum, setTwilioNum]     = useState<string | null>(fixlyyNumber)

  useEffect(() => {
    if (twilioNum) return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('profiles').select('twilio_number').eq('id', userId).single()
      if (data?.twilio_number) { setTwilioNum(data.twilio_number); clearInterval(interval) }
    }, 2000)
    return () => clearInterval(interval)
  }, [userId, twilioNum])

  function handleActivate() {
    if (!twilioNum) return
    setTapped(true)
    window.location.href = `tel:**21*${twilioNum}%23`
    setTimeout(() => onDone(), 5000)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const ussdCodes = twilioNum ? [
    { label: 'Renvoi total', desc: 'Tous vos appels → Mia', code: `**21*${twilioNum}#`, badge: true },
    { label: 'Si occupé', desc: 'Quand vous êtes déjà en ligne', code: `**67*${twilioNum}#`, badge: false },
    { label: 'Si sans réponse', desc: 'Quand vous ne décrochez pas', code: `**61*${twilioNum}#`, badge: false },
  ] : []

  if (!twilioNum) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
        <p className="text-sm text-center" style={{ color: 'rgba(148,163,184,0.8)' }}>Attribution du numéro en cours…</p>
      </div>
    )
  }

  if (tapped) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,91,245,0.15)', border: `2px solid rgba(59,91,245,0.4)` }}>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND }} />
        </div>
        <div>
          <p className="font-semibold text-white mb-1">Activation en cours…</p>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.7)' }}>Redirection dans quelques secondes</p>
        </div>
        <button onClick={onDone} className="text-sm underline underline-offset-2" style={{ color: 'rgba(148,163,184,0.6)' }}>
          Continuer quand même →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Activez le renvoi d'appel</h2>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.85)' }}>
          Quand vous ne pouvez pas décrocher, Mia prend le relais.
        </p>
      </div>

      {/* Numéro Mia */}
      <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(59,91,245,0.10)', border: '2px solid rgba(59,91,245,0.30)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(148,163,184,0.7)' }}>Votre numéro Mia</p>
        <p className="text-3xl font-black tracking-wide text-white">{formatFrPhone(twilioNum)}</p>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleActivate}
            className="w-full py-5 rounded-2xl text-white text-base font-bold transition-all active:scale-95 flex items-center justify-center gap-3"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
            </svg>
            Activer le renvoi maintenant
          </button>
          <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Votre composeur s'ouvre · Appuyez juste sur le bouton vert
          </p>
          <button onClick={() => setShowManual(v => !v)} className="text-xs text-center underline underline-offset-2" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Faire manuellement
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="v3-card rounded-2xl p-5 text-center">
            <div className="mx-auto mb-3 w-fit p-2 bg-white rounded-xl">
              <QRCodeSVG value={`**21*${twilioNum}#`} size={112} bgColor="#ffffff" fgColor="#070B1A" level="M" />
            </div>
            <p className="text-sm font-medium text-white mb-1">Scannez avec votre téléphone</p>
            <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>Pour activer le renvoi depuis votre mobile</p>
          </div>
          <button onClick={() => setShowManual(v => !v)} className="text-sm text-center underline underline-offset-2" style={{ color: 'rgba(148,163,184,0.6)' }}>
            Voir les codes manuels
          </button>
        </div>
      )}

      {showManual && (
        <div className="flex flex-col gap-3 pt-2">
          {ussdCodes.map(opt => (
            <div key={opt.code} className="v3-card rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-white">{opt.label}</p>
                {opt.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: BRAND }}>Recommandé</span>}
              </div>
              <p className="text-xs mb-2.5" style={{ color: 'rgba(148,163,184,0.6)' }}>{opt.desc}</p>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <code className="text-sm font-mono text-white flex-1">{opt.code}</code>
                <button
                  onClick={() => copyCode(opt.code)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                  style={{ background: copied === opt.code ? '#10b981' : 'rgba(59,91,245,0.3)', color: 'white' }}
                >
                  {copied === opt.code ? '✓' : 'Copier'}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Compatible Free, Orange, SFR, Bouygues · Désactivez avec <span className="font-mono">##21#</span>
          </p>
        </div>
      )}

      <button onClick={onDone} className="text-sm text-center underline underline-offset-2" style={{ color: 'rgba(148,163,184,0.5)' }}>
        Passer cette étape →
      </button>
    </div>
  )
}

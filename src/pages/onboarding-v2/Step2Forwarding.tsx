import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const BRAND = '#2850c8'

function formatFrPhone(e164: string): string {
  const local = e164.replace('+33', '0')
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

interface Props {
  userId: string
  fixlyyNumber: string | null
  onDone: () => void
}

export default function Step2Forwarding({ userId, fixlyyNumber, onDone }: Props) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const [tapped, setTapped] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [numberReady, setNumberReady] = useState(!!fixlyyNumber)
  const [twilioNum, setTwilioNum] = useState<string | null>(fixlyyNumber)

  // Polling si le numéro n'est pas encore attribué
  useEffect(() => {
    if (twilioNum) return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('twilio_number')
        .eq('id', userId)
        .single()
      if (data?.twilio_number) {
        setTwilioNum(data.twilio_number)
        setNumberReady(true)
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [userId, twilioNum])

  function handleActivate() {
    if (!twilioNum) return
    setTapped(true)
    const e164 = twilioNum.replace('+33', '0033')
    const encoded = `**21*${twilioNum}%23`
    window.location.href = `tel:${encoded}`
    // Après 5s → passer à l'étape suivante
    setTimeout(() => onDone(), 5000)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const displayNumber = twilioNum ? formatFrPhone(twilioNum) : null

  const ussdCodes = twilioNum ? [
    { label: 'Renvoi total', desc: 'Tous vos appels → Mia (recommandé)', code: `**21*${twilioNum}#`, badge: true },
    { label: 'Si occupé', desc: 'Quand vous êtes déjà en ligne', code: `**67*${twilioNum}#`, badge: false },
    { label: 'Si pas de réponse', desc: 'Quand vous ne décrochez pas', code: `**61*${twilioNum}#`, badge: false },
  ] : []

  // ── Attente numéro ───────────────────────────────────────────────────────────
  if (!numberReady) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
        <div className="text-center">
          <p className="font-semibold text-gray-800 mb-1">Attribution de votre numéro Fixlyy…</p>
          <p className="text-sm text-gray-400">Encore quelques secondes</p>
        </div>
      </div>
    )
  }

  // ── Après le tap — attente ───────────────────────────────────────────────────
  if (tapped) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: BRAND + '15' }}>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">Activation en cours…</p>
          <p className="text-sm text-gray-400">On vérifie que le renvoi est actif</p>
        </div>
        <button onClick={onDone} className="text-sm text-gray-400 underline mt-2">
          Continuer quand même →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          Dites à votre téléphone d'envoyer les appels manqués à Mia
        </h2>
        <p className="text-sm text-gray-500">Ça prend 10 secondes.</p>
      </div>

      {/* Numéro Fixlyy */}
      <div className="rounded-2xl border-2 p-5 text-center" style={{ borderColor: BRAND + '30', background: BRAND + '06' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: BRAND }}>
          Votre numéro Mia
        </p>
        <p className="text-3xl font-bold tracking-wide text-gray-900">{displayNumber}</p>
        <p className="text-xs text-gray-400 mt-1">Mia répond sur ce numéro à votre place</p>
      </div>

      {isMobile ? (
        /* ── Mobile : bouton deeplink ──────────────────────────────────────── */
        <div className="flex flex-col gap-4">
          <button
            onClick={handleActivate}
            disabled={!twilioNum}
            className="w-full py-5 rounded-2xl text-white text-base font-bold transition-all active:scale-95 flex items-center justify-center gap-3"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
            </svg>
            Activer le renvoi maintenant
          </button>
          <p className="text-xs text-gray-400 text-center">
            On va ouvrir votre composeur d'appel. Appuyez juste sur le bouton vert.
          </p>

          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowManual(v => !v)} className="text-xs text-gray-400 underline">
              Faire manuellement
            </button>
            <span className="text-gray-300">·</span>
            <button onClick={() => setShowVideo(true)} className="text-xs text-gray-400 underline">
              Voir la vidéo
            </button>
          </div>
        </div>
      ) : (
        /* ── Desktop : QR code ou SMS ──────────────────────────────────────── */
        <div className="flex flex-col gap-4">
          <div className="border border-gray-200 rounded-2xl p-6 text-center">
            <div className="w-32 h-32 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <p className="text-xs text-gray-400 text-center px-2">QR code<br />(à générer)</p>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Scannez ce QR code avec votre téléphone</p>
            <p className="text-xs text-gray-400">Vous pourrez activer le renvoi directement depuis votre mobile</p>
          </div>
          <p className="text-xs text-gray-400 text-center">ou</p>
          <button onClick={() => setShowManual(true)}
            className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
            Voir les codes à composer manuellement
          </button>
        </div>
      )}

      {/* Codes manuels */}
      {showManual && (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Codes manuels</p>
          {ussdCodes.map(opt => (
            <div key={opt.code} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                {opt.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: BRAND }}>
                    Recommandé
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3">{opt.desc}</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <code className="text-sm font-mono text-gray-700 flex-1">{opt.code}</code>
                <button onClick={() => copyCode(opt.code)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md transition-all"
                  style={{ background: copied === opt.code ? '#10b981' : BRAND + '15', color: copied === opt.code ? 'white' : BRAND }}>
                  {copied === opt.code ? '✓' : 'Copier'}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400">
            Composez le code depuis votre téléphone et appuyez sur Appel. Le renvoi est actif immédiatement.
          </p>
        </div>
      )}

      <button onClick={onDone} className="text-sm text-center text-gray-400 hover:text-gray-600">
        Continuer sans activer →
      </button>

      {/* Modal vidéo */}
      {showVideo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowVideo(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Comment activer le renvoi</h3>
              <button onClick={() => setShowVideo(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center mb-4">
              <p className="text-xs text-gray-400 text-center px-4">
                Vidéo à uploader<br />
                <span className="text-[10px]">iPhone + Android côte à côte</span>
              </p>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Composez le code → appuyez sur Appel → message de confirmation ✓
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

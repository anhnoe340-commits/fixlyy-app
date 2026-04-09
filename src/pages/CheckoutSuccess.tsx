import { useEffect, useState } from 'react'
import { CheckCircle, Phone, ArrowRight, Loader } from 'lucide-react'

const steps = [
  { icon: CheckCircle, label: 'Paiement confirmé',           done: true },
  { icon: Phone,       label: 'Création de votre numéro Fixlyy', done: false },
  { icon: ArrowRight,  label: 'Accès au tableau de bord',    done: false },
]

export default function CheckoutSuccess({ onContinue }: { onContinue: () => void }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1500)
    const t2 = setTimeout(() => setStep(2), 3000)
    const t3 = setTimeout(() => onContinue(), 4500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500"/>
        </div>
        <h1 className="text-2xl font-bold mb-2">Bienvenue sur Fixlyy !</h1>
        <p className="text-gray-500 text-sm mb-10">Votre essai de 7 jours commence maintenant. Aucun débit avant J+7.</p>

        <div className="flex flex-col gap-4 mb-10">
          {steps.map((s, i) => {
            const Icon = s.icon
            const active = i <= step
            const current = i === step && i < steps.length - 1
            return (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${active ? 'border-[#3B5BF5]/30 bg-[#3B5BF5]/5' : 'border-gray-100 bg-gray-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-[#3B5BF5]' : 'bg-gray-200'}`}>
                  {current ? <Loader className="w-5 h-5 text-white animate-spin"/> : <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-gray-400'}`}/>}
                </div>
                <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
                {active && !current && <CheckCircle className="w-4 h-4 text-green-500 ml-auto"/>}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400">Redirection automatique vers votre tableau de bord...</p>
      </div>
    </div>
  )
}

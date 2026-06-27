import { useEffect } from 'react'

interface Props {
  onClose: () => void
}

export default function CGUModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const h2 = { color: '#3B5BFA', fontSize: 15, fontWeight: 700, marginBottom: 6, marginTop: 18 }
  const p  = { color: '#374151', fontSize: 13, lineHeight: 1.6, marginBottom: 4 }
  const li = { color: '#374151', fontSize: 13, lineHeight: 1.6, marginBottom: 3 }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px 16px 0 0',
          width: '100%', maxWidth: 540,
          maxHeight: '88vh', overflowY: 'auto',
          padding: '24px 20px 40px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1A1A2E' }}>Conditions Générales d'Utilisation</h1>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer' }}>×</button>
        </div>

        <p style={{ ...p, color: '#9CA3AF', fontSize: 12 }}>Dernière mise à jour : juin 2026</p>

        <h2 style={h2}>1. Tarification</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={li}><strong>1er mois : 197 € TTC</strong> — prix fondateurs, offre limitée aux premiers inscrits</li>
          <li style={li}><strong>À partir du 2ème mois : 497 €/mois TTC</strong></li>
          <li style={li}>Ces tarifs peuvent évoluer avec un préavis de 30 jours</li>
        </ul>

        <h2 style={h2}>2. Période d'essai</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={li}><strong>7 jours gratuits</strong> à compter de l'inscription</li>
          <li style={li}>Aucun débit ne sera effectué avant le 8ème jour</li>
          <li style={li}>La carte bancaire est requise pour activer l'essai mais ne sera pas débitée avant expiration</li>
        </ul>

        <h2 style={h2}>3. Engagement minimum</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={li}><strong>Engagement minimum de 3 mois</strong> à compter du premier débit (J+8)</li>
          <li style={li}>Aucune résiliation possible pendant les 3 premiers mois payants</li>
          <li style={li}>Après 3 mois : résiliation possible avec un préavis de 30 jours</li>
        </ul>

        <h2 style={h2}>4. Renouvellement et résiliation</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={li}>Renouvellement automatique mensuel après la période d'engagement</li>
          <li style={li}>Pour résilier : contacter support@fixlyy.fr avec un préavis de 30 jours</li>
          <li style={li}>La résiliation prend effet à la fin de la période en cours</li>
        </ul>

        <h2 style={h2}>5. Protection des données (RGPD)</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={li}><strong>Droit d'accès :</strong> vous pouvez consulter vos données à tout moment</li>
          <li style={li}><strong>Droit de rectification :</strong> correction des données inexactes</li>
          <li style={li}><strong>Droit à l'oubli :</strong> suppression de vos données sur demande</li>
          <li style={li}>Hébergement sur serveurs européens (UE/EEE) uniquement</li>
          <li style={li}>Aucune revente ou partage de vos données à des tiers commerciaux</li>
        </ul>

        <h2 style={h2}>6. Responsabilité</h2>
        <p style={p}>
          Fixlyy s'engage à maintenir la disponibilité du service à 99,5 % par mois. En cas d'interruption prolongée (plus de 24h consécutives), un avoir proportionnel sera appliqué.
        </p>
        <p style={p}>
          Fixlyy n'est pas responsable des communications manquées ou des conséquences liées à une configuration incorrecte du renvoi d'appel.
        </p>

        <h2 style={h2}>7. Droit applicable</h2>
        <p style={p}>
          Ces CGU sont régies par le droit français. Tout litige sera soumis à la compétence exclusive des tribunaux français.
        </p>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px', marginTop: 20,
            background: '#3B5BFA', color: '#fff', borderRadius: 10,
            border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          J'ai lu et compris les CGU
        </button>
      </div>
    </div>
  )
}

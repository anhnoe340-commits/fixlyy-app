interface Props {
  videoUrl: string | null
}

export default function SectionVideo({ videoUrl }: Props) {
  if (!videoUrl) {
    return (
      <div style={{
        background: '#F9FAFB', border: '1px dashed #D1D5DB',
        borderRadius: 10, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 400,
      }}>
        <span style={{ fontSize: 18, opacity: 0.5 }}>🎬</span>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Vidéo explicative à venir</p>
      </div>
    )
  }

  if (videoUrl.includes('cloudflarestream')) {
    return (
      <div style={{ borderRadius: 12, overflow: 'hidden', maxWidth: 400, width: '100%', boxShadow: '0 2px 12px rgba(59,91,250,0.10)' }}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={videoUrl}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', maxWidth: 400, width: '100%' }}>
      <video src={videoUrl} controls style={{ width: '100%', display: 'block' }} />
    </div>
  )
}

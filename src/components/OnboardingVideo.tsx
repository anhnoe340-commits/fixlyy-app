interface Props {
  videoUrl: string | null
  placeholderMessage: string
  autoplay?: boolean
}

export default function OnboardingVideo({ videoUrl, placeholderMessage, autoplay = false }: Props) {
  if (!videoUrl) {
    return (
      <div style={{
        background: '#fff',
        border: '2px dashed #3B5BFA',
        borderRadius: 12,
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 28 }}>🎬</span>
        <p style={{
          color: '#374151',
          fontSize: 13,
          whiteSpace: 'pre-line',
          fontWeight: 500,
          lineHeight: 1.55,
          maxWidth: 340,
        }}>
          {placeholderMessage}
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 11 }}>Vidéo de présentation à venir</p>
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(59,91,250,0.12)',
    width: '100%',
  }

  if (videoUrl.includes('cloudflarestream')) {
    const src = autoplay ? `${videoUrl}?autoplay=1` : videoUrl
    return (
      <div style={containerStyle}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={src}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <video src={videoUrl} controls autoPlay={autoplay} style={{ width: '100%', display: 'block' }} />
    </div>
  )
}

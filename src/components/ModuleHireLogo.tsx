type Size = 'nav' | 'sidebar' | 'icon'

const SIZES: Record<Size, { icon: number; font: number; gap: number }> = {
  nav:     { icon: 32, font: 18, gap: 10 },
  sidebar: { icon: 24, font: 15, gap: 8 },
  icon:    { icon: 20, font: 0,  gap: 0 },
}

export default function ModuleHireLogo({ size = 'nav' }: { size?: Size }) {
  const cfg = SIZES[size]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: cfg.gap }}>
      <svg width={cfg.icon} height={cfg.icon} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="10" height="10" rx="2" fill="#1d9e75" opacity="0.3" />
        <rect x="16" y="14" width="10" height="10" rx="2" fill="#1d9e75" />
        <path d="M20 4L8 24" stroke="#1d9e75" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {size !== 'icon' && (
        <span style={{ fontSize: cfg.font, fontWeight: 500, letterSpacing: 0, lineHeight: 1 }}>
          <span>Module</span><span style={{ color: '#1d9e75' }}>Hire</span>
        </span>
      )}
    </span>
  )
}

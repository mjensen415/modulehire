// ElevenLabs Grants badge (a grant condition: display it, linked to ElevenLabs, for 12 months
// from Nov 2026). Both variants render; CSS in globals.css shows the one for the active theme.
/* eslint-disable @next/next/no-img-element -- external CDN badge, served as provided */
export default function GrantBadge({ width = 250 }: { width?: number }) {
  return (
    <a
      href="https://elevenlabs.io/startup-grants"
      target="_blank"
      rel="noopener noreferrer"
      className="grant-badge"
      aria-label="ElevenLabs Grants"
      style={{ display: 'inline-block', lineHeight: 0 }}
    >
      <img
        className="grant-badge-on-dark"
        src="https://eleven-public-cdn.elevenlabs.io/payloadcms/cy7rxce8uki-IIElevenLabsGrants%201.webp"
        alt="ElevenLabs Grants"
        style={{ width, height: 'auto' }}
      />
      <img
        className="grant-badge-on-light"
        src="https://eleven-public-cdn.elevenlabs.io/payloadcms/pwsc4vchsqt-ElevenLabsGrants.webp"
        alt="ElevenLabs Grants"
        style={{ width, height: 'auto' }}
      />
    </a>
  )
}

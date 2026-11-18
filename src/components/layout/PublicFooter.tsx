import Link from 'next/link';

export default function PublicFooter() {
  return (
    <footer>
      <div className="footer-logo">
        <div className="nav-logo-mark" style={{ width: 22, height: 22, fontSize: 9 }}>MH</div>
        ModuleHire Labs
      </div>
      <ul className="footer-links">
        <li><Link href="/privacy">Privacy</Link></li>
        <li><Link href="/terms">Terms</Link></li>
        <li><Link href="/docs">Docs</Link></li>
        <li><Link href="/mcp">Use with AI</Link></li>
        <li><Link href="/support">Support</Link></li>
        <li><Link href="/press">Press</Link></li>
        <li><Link href="/status">Status</Link></li>
      </ul>
      <div className="footer-copy">
        {/* ElevenLabs Grants condition: badge linking to ElevenLabs for 12 months (from Nov 2026). */}
        <a href="https://elevenlabs.io/startup-grants" target="_blank" rel="noopener noreferrer" style={{ marginRight: 12 }}>
          ElevenLabs Grants
        </a>
        © 2026
      </div>
    </footer>
  );
}

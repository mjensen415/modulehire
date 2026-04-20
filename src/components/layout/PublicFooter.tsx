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
        <li><Link href="/status">Status</Link></li>
      </ul>
      <div className="footer-copy">© 2026</div>
    </footer>
  );
}

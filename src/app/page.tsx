'use client'

import { useState, useEffect } from 'react';
import Link from 'next/link';

import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';

const TWEAK_DEFAULTS = {
  accentColor: "teal",
  showAnimations: true,
  moduleCount: 3,
  heroLayout: "three-column"
};

function SourceResume() {
  return (
    <div className="resume-panel source" style={{position:'relative',overflow:'hidden'}}>
      <div className="scan-line" />
      <div className="resume-header-line">
        <div className="resume-name-line" />
        <div className="resume-title-line" />
        <div className="resume-contact-line" />
      </div>

      <div className="resume-section">
        <div className="resume-section-label" />
        <div className="skill-line teal" style={{width:'95%'}} />
        <div className="skill-line teal" style={{width:'80%'}} />
        <div className="skill-line gray" style={{width:'70%'}} />
      </div>

      <div className="resume-section">
        <div className="resume-section-label" />
        <div className="skill-line amber" style={{width:'90%'}} />
        <div className="skill-line amber" style={{width:'75%'}} />
        <div className="skill-line gray" style={{width:'65%'}} />
      </div>

      <div className="resume-section">
        <div className="resume-section-label" />
        <div className="skill-line indigo" style={{width:'85%'}} />
        <div className="skill-line indigo" style={{width:'70%'}} />
        <div className="skill-line gray" style={{width:'60%'}} />
      </div>

      <div className="resume-section">
        <div className="resume-section-label" />
        <div className="skill-line rose" style={{width:'90%'}} />
        <div className="skill-line teal" style={{width:'65%'}} />
        <div className="skill-line gray" style={{width:'75%'}} />
      </div>

      <div style={{
        position:'absolute', bottom:12, right:12,
        fontFamily:'var(--mono)', fontSize:'9px',
        color:'var(--teal)', opacity:0.8, letterSpacing:'0.06em'
      }}>PARSING...</div>
    </div>
  );
}

function ModuleCard({ color, domain, delay=0 }: {color: string, domain: string, delay?: number}) {
  return (
    <div className={`module-card ${color}`} style={{animationDelay:`${delay}s`}}>
      <div className="module-domain">{domain}</div>
      <div className="module-line w-full" />
      <div className="module-line w-80" />
      <div className="module-line w-65" />
    </div>
  );
}

function OutputResume() {
  return (
    <div className="resume-panel output">
      <div className="resume-header-line">
        <div className="resume-name-line" style={{width:'65%', opacity:0.85}} />
        <div className="resume-title-line" style={{width:'45%', opacity:0.6}} />
        <div className="resume-contact-line" style={{width:'75%', opacity:0.4}} />
      </div>

      <div className="resume-section">
        <div className="output-label">Security & Infrastructure</div>
        <div className="output-line accent w-full" />
        <div className="output-line w-90" />
        <div className="output-line w-75" />
      </div>

      <div className="resume-section">
        <div className="output-label">Team Leadership</div>
        <div className="output-line accent w-full" style={{background:'var(--amber)', opacity:0.5}} />
        <div className="output-line w-80" />
        <div className="output-line w-60" />
      </div>

      <div className="resume-section">
        <div className="output-label">Developer Onboarding</div>
        <div className="output-line accent w-full" style={{background:'var(--indigo)', opacity:0.5}} />
        <div className="output-line w-90" />
        <div className="output-line w-45" />
      </div>

      <div style={{
        marginTop:8,
        display:'flex', gap:4, flexWrap:'wrap'
      }}>
        <div className="output-badge">tailored.pdf</div>
        <div className="output-badge" style={{background:'oklch(0.72 0.18 58 / 0.12)', color:'var(--amber)', borderColor:'oklch(0.72 0.18 58 / 0.3)'}}>ready.docx</div>
      </div>
    </div>
  );
}

function ArrowsSVG() {
  return (
    <svg className="arrows-svg" viewBox="0 0 1200 480" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowTeal" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.65 0.20 195)" opacity="0.9"/>
        </marker>
        <marker id="arrowAmber" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.72 0.18 58)" opacity="0.9"/>
        </marker>
        <marker id="arrowIndigo" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.62 0.18 270)" opacity="0.9"/>
        </marker>
      </defs>

      <path className="arrow-path extract" opacity="0.7"
        d="M 230 150 C 310 150, 360 175, 440 185"
        markerEnd="url(#arrowTeal)" />

      <path className="arrow-path amber-path" opacity="0.7"
        d="M 230 240 C 310 240, 360 245, 440 250"
        markerEnd="url(#arrowAmber)" />

      <path className="arrow-path indigo-path" opacity="0.7"
        d="M 230 310 C 310 310, 360 305, 440 315"
        markerEnd="url(#arrowIndigo)" />

      <path className="arrow-path inject" opacity="0.7"
        d="M 660 185 C 740 185, 800 160, 870 150"
        markerEnd="url(#arrowTeal)" />

      <path className="arrow-path inject-amber" opacity="0.7"
        d="M 660 250 C 740 250, 800 235, 870 230"
        markerEnd="url(#arrowAmber)" />

      <path className="arrow-path inject-indigo" opacity="0.7"
        d="M 660 315 C 740 315, 800 305, 870 310"
        markerEnd="url(#arrowIndigo)" />

      <circle className="arrow-dot" cx="232" cy="150" r="2.5" fill="oklch(0.65 0.20 195)" />
      <circle className="arrow-dot" cx="232" cy="240" r="2.5" fill="oklch(0.72 0.18 58)" style={{animationDelay:'0.4s'}} />
      <circle className="arrow-dot" cx="232" cy="310" r="2.5" fill="oklch(0.62 0.18 270)" style={{animationDelay:'0.8s'}} />
    </svg>
  );
}

function TweaksPanel({ visible, tweaks, onUpdate }: any) {
  return (
    <div className={`tweaks-panel ${visible ? 'visible' : ''}`}>
      <div className="tweaks-title">Tweaks</div>

      <div className="tweak-row">
        <span className="tweak-label">Accent color</span>
        <select className="tweak-select" value={tweaks.accentColor}
          onChange={e => onUpdate({accentColor: e.target.value})}>
          <option value="teal">Electric Teal</option>
          <option value="amber">Warm Amber</option>
          <option value="indigo">Deep Indigo</option>
        </select>
      </div>

      <div className="tweak-row">
        <span className="tweak-label">Animations</span>
        <div className={`tweak-toggle ${tweaks.showAnimations ? 'on' : ''}`}
          onClick={() => onUpdate({showAnimations: !tweaks.showAnimations})} />
      </div>

      <div className="tweak-row">
        <span className="tweak-label">Module count</span>
        <select className="tweak-select" value={tweaks.moduleCount}
          onChange={e => onUpdate({moduleCount: parseInt(e.target.value)})}>
          <option value={2}>2 modules</option>
          <option value={3}>3 modules</option>
        </select>
      </div>
    </div>
  );
}

export default function Home() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksVisible, setTweaksVisible] = useState(false);

  useEffect(() => {
    const accentMap: Record<string, string> = {
      teal: 'oklch(0.65 0.20 195)',
      amber: 'oklch(0.72 0.18 58)',
      indigo: 'oklch(0.62 0.18 270)',
    };
    document.documentElement.style.setProperty('--teal', accentMap[tweaks.accentColor] || accentMap.teal);

    const allAnimated = document.querySelectorAll('.scan-line, .arrow-path, .arrow-dot') as NodeListOf<HTMLElement>;
    allAnimated.forEach(el => {
      el.style.animationPlayState = tweaks.showAnimations ? 'running' : 'paused';
    });
  }, [tweaks]);

  function handleUpdate(updates: Partial<typeof TWEAK_DEFAULTS>) {
    const next = {...tweaks, ...updates};
    setTweaks(next);
  }

  const modules = [
    {color:'teal', domain:'Security & Infrastructure'},
    {color:'amber', domain:'Team Leadership'},
    {color:'indigo', domain:'Developer Onboarding'},
  ].slice(0, tweaks.moduleCount);

  return (
    <>
      <PublicNav />

      {/* ─── HERO ─── */}
      <section id="hero">
        <div className="hero-bg-grid" />
        <div className="hero-bg-glow" />

        <div className="hero-eyebrow">
          <span>Resume Intelligence</span>
        </div>

        <h1 className="hero-headline">
          Your resume contains<br/><em>more than one story.</em><br/>
          <span style={{fontWeight:300, fontSize:'0.75em', color:'var(--text2)', letterSpacing:'-0.01em'}}>ModuleHire Labs finds them all.</span>
        </h1>

        <p className="hero-sub">
          Parse your resume into modular skill blocks. Reassemble them instantly into tailored applications — tuned to each job description.
        </p>

        <div className="hero-ctas">
          <Link href="/signin" className="btn-primary" style={{textDecoration: 'none'}}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1v9M4 7l3.5 3.5L11 7M2 13h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Upload your resume
          </Link>
          <Link href="/how-it-works" className="btn-secondary" style={{textDecoration: 'none'}}>
            See how it works
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

        {/* THREE-COLUMN VISUAL */}
        <div className="hero-visual-wrap">
          <div className="hero-visual">
            <div>
              <div style={{
                fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)',
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10,
                textAlign:'center'
              }}>Source resume</div>
              <SourceResume />
            </div>

            <div className="modules-center" style={{position:'relative'}}>
              <ArrowsSVG />
              <div style={{
                fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)',
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:14,
              }}>Extracted modules</div>
              {modules.map((m,i) => (
                <ModuleCard key={m.domain} color={m.color} domain={m.domain} delay={i*0.15} />
              ))}
            </div>

            <div>
              <div style={{
                fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)',
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10,
                textAlign:'center'
              }}>Tailored output</div>
              <OutputResume />
            </div>
          </div>

          <div style={{
            textAlign:'center', marginTop:28,
            fontFamily:'var(--mono)', fontSize:'11px', color:'var(--text3)',
            letterSpacing:'0.06em'
          }}>
            1 upload → modular intelligence → ∞ tailored resumes
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features">
        <div style={{textAlign:'center', marginBottom:48}}>
          <div style={{
            fontFamily:'var(--mono)', fontSize:'10px', color:'var(--teal)',
            letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14,
            fontWeight:500
          }}>How it works</div>
          <h2 style={{
            fontSize:'clamp(24px,3vw,38px)', fontWeight:800, letterSpacing:'-0.03em',
            lineHeight:1.15, textWrap: 'balance'
          }}>
            Three steps. One career narrative, <span style={{color:'var(--text2)', fontWeight:400}}>infinitely adaptable.</span>
          </h2>
        </div>

        <div className="features-grid">
          {[
            {
              step: '01', title: 'Parse once.',
              desc: 'Upload your resume and we extract every skill domain as its own reusable module — color-coded, labeled, and ready to deploy.',
              accent: '01'
            },
            {
              step: '02', title: 'Match automatically.',
              desc: 'Drop in any job description. We score your modules against the role and recommend the optimal stack for that application.',
              accent: '02'
            },
            {
              step: '03', title: 'Generate in seconds.',
              desc: 'Get a tailored .docx and .pdf that reads like it was written specifically for that role — because the right modules were.',
              accent: '03'
            }
          ].map(f => (
            <div className="feature-card" key={f.step}>
              <div className="feature-step">
                <div className="feature-step-num">{f.step}</div>
                Step {f.step}
              </div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
              <div className="feature-accent">{f.accent}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section id="bottom-cta">
        <div className="bottom-cta-bg" />
        <div className="bottom-cta-label">Ready when you are</div>
        <h2 className="bottom-cta-title">
          Stop rewriting.<br/>Start reassembling.
        </h2>
        <p className="bottom-cta-sub">
          Your experience doesn't change. The story you tell does. ModuleHire Labs makes every application feel like it was made just for that role.
        </p>
        <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
          <Link href="/signin" className="btn-primary" style={{fontSize:'15px', padding:'14px 28px', textDecoration: 'none'}}>
            Upload your resume — it's free
          </Link>
          <Link href="/how-it-works" className="btn-secondary" style={{fontSize:'15px', padding:'14px 28px', textDecoration: 'none'}}>
            View sample output
          </Link>
        </div>
      </section>

      <PublicFooter />
    </>
  );
}

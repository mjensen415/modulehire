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
  // SVG spans the full hero-visual (1200 viewBox units = full grid width).
  // Grid columns: source 220px | middle 1fr | output 220px
  // At max-width 1200px: source x=0–220, middle x=220–980, output x=980–1200
  // Modules are centred in the middle column (~x=490–710).
  // Arrows start inside the source panel and end inside the output panel.
  return (
    <svg className="arrows-svg" viewBox="0 0 1200 480" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowTeal" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.65 0.20 195)" opacity="0.9"/>
        </marker>
        <marker id="arrowAmber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.72 0.18 58)" opacity="0.9"/>
        </marker>
        <marker id="arrowIndigo" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.62 0.18 270)" opacity="0.9"/>
        </marker>
      </defs>

      {/* source → modules */}
      <path className="arrow-path extract" opacity="0.7"
        d="M 200 150 C 310 150, 400 175, 490 185"
        markerEnd="url(#arrowTeal)" />
      <path className="arrow-path amber-path" opacity="0.7"
        d="M 200 240 C 310 240, 400 248, 490 252"
        markerEnd="url(#arrowAmber)" />
      <path className="arrow-path indigo-path" opacity="0.7"
        d="M 200 320 C 310 320, 400 312, 490 318"
        markerEnd="url(#arrowIndigo)" />

      {/* modules → output */}
      <path className="arrow-path inject" opacity="0.7"
        d="M 710 185 C 810 185, 900 162, 1000 150"
        markerEnd="url(#arrowTeal)" />
      <path className="arrow-path inject-amber" opacity="0.7"
        d="M 710 252 C 810 252, 900 244, 1000 240"
        markerEnd="url(#arrowAmber)" />
      <path className="arrow-path inject-indigo" opacity="0.7"
        d="M 710 318 C 810 318, 900 328, 1000 320"
        markerEnd="url(#arrowIndigo)" />

      {/* origin dots — anchored inside source panel */}
      <circle className="arrow-dot" cx="200" cy="150" r="2.5" fill="oklch(0.65 0.20 195)" />
      <circle className="arrow-dot" cx="200" cy="240" r="2.5" fill="oklch(0.72 0.18 58)" style={{animationDelay:'0.4s'}} />
      <circle className="arrow-dot" cx="200" cy="320" r="2.5" fill="oklch(0.62 0.18 270)" style={{animationDelay:'0.8s'}} />
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
          Tell the right story<br/>
          <em style={{
            fontStyle: 'normal',
            display: 'inline',
            background: 'linear-gradient(135deg, oklch(0.65 0.20 195), oklch(0.72 0.20 220))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}>for every role.</em>
        </h1>

        <p className="hero-sub">
          Upload your resume once. ModuleHire breaks it into modules and rebuilds it for each job — putting your most relevant experience front and center, every time.
        </p>

        <div className="hero-ctas">
          <Link href="/signin?signup=1" className="btn-primary" style={{textDecoration: 'none', display: 'inline-flex'}}>
            Start free
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link href="/how-it-works" className="btn-secondary" style={{textDecoration: 'none', display: 'inline-flex'}}>
            See how it works
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
          Already have an account?{' '}
          <Link href="/signin" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>Sign in →</Link>
        </div>

        {/* THREE-COLUMN VISUAL */}
        <div className="hero-visual-wrap">
          <div className="hero-visual">
            {/* SVG spans the full grid so arrows can reach both side panels */}
            <ArrowsSVG />

            <div style={{position:'relative', zIndex:2}}>
              <div style={{
                fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)',
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10,
                textAlign:'center'
              }}>Source resume</div>
              <SourceResume />
            </div>

            <div className="modules-center">
              <div style={{
                fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)',
                letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:14,
              }}>Extracted modules</div>
              {modules.map((m,i) => (
                <ModuleCard key={m.domain} color={m.color} domain={m.domain} delay={i*0.15} />
              ))}
            </div>

            <div style={{position:'relative', zIndex:2}}>
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
            Four steps. One career narrative, <span style={{color:'var(--text2)', fontWeight:400}}>infinitely adaptable.</span>
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
            },
            {
              step: '04', title: 'Walk in ready.',
              desc: 'Generate a talking points doc for any interview — your pitch, your angle on every requirement, questions worth asking, and gaps to be honest about. Built from your actual experience and the real JD.',
              accent: '04'
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

      {/* ─── INTERVIEW PREP SPOTLIGHT ─── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
        <style>{`
          @media (max-width: 768px) {
            .interview-prep-spotlight { flex-direction: column; }
            .interview-prep-spotlight > div { flex-basis: 100% !important; }
          }
        `}</style>
        <div className="interview-prep-spotlight" style={{ display: 'flex', gap: 48, alignItems: 'center' }}>

          {/* Left — copy */}
          <div style={{ flex: '1 1 50%', minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--teal)',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 500,
            }}>
              New: Interview Prep
            </div>
            <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 18 }}>
              Stop winging your interviews.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.65, maxWidth: 420, marginBottom: 22 }}>
              After you generate your resume, ModuleHire can build a full talking points document for the interview — matched to your actual modules and the job description you already uploaded.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                'Your opening pitch, drafted for you',
                'Talking point for every key requirement',
                'Questions worth asking',
                'Gaps to be ready for',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--teal)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'var(--amber-dim)', color: 'var(--amber)',
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
              marginBottom: 18,
            }}>
              Pro feature
            </div>
            <div>
              <Link href="/signin?signup=1" style={{ fontSize: 14, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
                Try it free →
              </Link>
            </div>
          </div>

          {/* Right — prep doc mockup */}
          <div style={{ flex: '1 1 50%', minWidth: 0 }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14,
              overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}>
              {/* Doc header */}
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    Senior Product Manager — Stripe
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    Interview prep · Generated just now
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                  background: 'var(--teal-dim)', color: 'var(--teal)',
                  padding: '3px 9px', borderRadius: 20, flexShrink: 0,
                }}>
                  Pro
                </div>
              </div>

              {/* Doc body */}
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Pitch */}
                <div style={{ background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Your pitch
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                    I&apos;m a PM with 5 years building developer-facing products at scale. At Figma I owned the API platform — grew adoption 3× in 18 months.
                  </div>
                </div>

                {/* Talking points */}
                {[
                  {
                    label: 'Cross-functional leadership',
                    angle: 'Led 3 eng teams across 2 time zones at Figma',
                    point: 'Lead with the API v2 launch — shipped on time despite a 6-week scope change.',
                  },
                  {
                    label: 'Data-driven prioritization',
                    angle: 'Built a 0-to-1 analytics practice from scratch',
                    point: 'Mention the North Star metric you defined and how it changed the roadmap.',
                  },
                ].map((tp) => (
                  <div key={tp.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 13px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{tp.label}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Your angle: {tp.angle}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{tp.point}</div>
                  </div>
                ))}

                {/* Questions / Gaps */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: '1 1 50%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Ask them
                    </div>
                    {[
                      'How does eng and PM share the roadmap?',
                      'What does a great first 90 days look like?',
                    ].map((q) => (
                      <div key={q} style={{ display: 'flex', gap: 5, fontSize: 11, color: 'var(--text2)', marginBottom: 4, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--teal)', flexShrink: 0 }}>→</span>
                        {q}
                      </div>
                    ))}
                  </div>
                  <div style={{ flex: '1 1 50%', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 6 }}>
                      Gaps to prep for
                    </div>
                    {[
                      'No direct payments experience',
                      'Limited enterprise background',
                    ].map((g) => (
                      <div key={g} style={{ display: 'flex', gap: 5, fontSize: 11, color: 'var(--text2)', marginBottom: 4, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--amber)', flexShrink: 0 }}>⚠</span>
                        {g}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" style={{ padding: '72px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--teal)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 500,
          }}>Pricing</div>
          <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Start free. Upgrade when you&apos;re ready.
          </h2>
        </div>

        <div style={{
          display: 'grid', gap: 18,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          maxWidth: 1080, margin: '0 auto',
        }}>
          {/* Free */}
          <div className="pricing-card">
            <div className="pricing-card-name">Free</div>
            <div className="pricing-card-price">$0</div>
            <div className="pricing-card-desc">Try it out.</div>
            <div className="pricing-features">
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>25 tailored resumes / month</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Full module library</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Estimated ATS Match score</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>DOCX + PDF download</div>
            </div>
            <Link href="/signin?signup=1" className="btn-secondary" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>Start free →</Link>
          </div>

          {/* Pro Monthly */}
          <div className="pricing-card" style={{ borderColor: 'var(--teal-glow)' }}>
            <div className="pricing-badge">Most popular</div>
            <div className="pricing-card-name">Pro Monthly</div>
            <div className="pricing-card-price">$19<span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 400 }}>/mo</span></div>
            <div className="pricing-card-desc">Unlimited everything, billed monthly.</div>
            <div className="pricing-features">
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Unlimited tailored resumes</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Full ATS Estimator breakdown</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Full module editing</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Multiple resume uploads</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Interview prep document</div>
            </div>
            <Link href="/signin?signup=1" className="btn-primary" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>Start free →</Link>
          </div>

          {/* Pro Annual */}
          <div className="pricing-card">
            <div className="pricing-card-name">Pro Annual</div>
            <div className="pricing-card-price">$99<span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 400 }}>/yr</span></div>
            <div className="pricing-card-desc">Everything in Pro — save two months.</div>
            <div className="pricing-features">
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Everything in Pro Monthly</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Billed annually</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>~ $8.25/month effective</div>
              <div className="pricing-feature"><span className="pricing-feature-icon">✓</span>Interview prep document</div>
            </div>
            <Link href="/signin?signup=1" className="btn-secondary" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>Start free →</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--text3)' }}>
          Just need a one-off? Buy <Link href="/billing" style={{ color: 'var(--teal)' }}>a single resume for $9</Link> or a <Link href="/billing" style={{ color: 'var(--teal)' }}>5-pack for $29</Link>.
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
        <div style={{
          maxWidth: 560,
          margin: '0 auto 40px',
          padding: '20px 24px',
          borderLeft: '3px solid var(--teal)',
          textAlign: 'left',
          background: 'var(--surface)',
          borderRadius: '0 8px 8px 0',
        }}>
          <p style={{
            fontSize: 15,
            lineHeight: 1.65,
            color: 'var(--text2)',
            margin: '0 0 12px',
            fontStyle: 'italic',
          }}>
            "It has been interesting this time around with the amount of noise about whether bespoke resumes are too polished or assumed to be fake. I have been using Claude to create resumes, which has been way better than ChatGPT, but they still tilt toward a level of puffery that I don't really like. Your setup lets the examples and data do the talking, which is more my speed."
          </p>
          <p style={{
            fontSize: 13,
            color: 'var(--text3)',
            margin: 0,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            — Job seeker
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <Link
            href="/signin?signup=1"
            className="btn-primary"
            style={{ fontSize: 15, padding: '14px 32px', textDecoration: 'none', display: 'inline-flex', whiteSpace: 'nowrap', width: 'auto' }}
          >
            Start free →
          </Link>
          <Link
            href="/how-it-works"
            className="btn-secondary"
            style={{ fontSize: 15, padding: '14px 32px', textDecoration: 'none', display: 'inline-flex', whiteSpace: 'nowrap', width: 'auto' }}
          >
            View sample output
          </Link>
        </div>
        <div style={{marginTop: 16, fontSize: 13, color: 'var(--text3)'}}>
          Already have an account?{' '}
          <Link href="/signin" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>Sign in →</Link>
        </div>
      </section>

      {/* ─── FOR BUSINESS ─── */}
      <section style={{
        padding: '80px 24px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 14px', borderRadius: 20,
            background: 'var(--teal-dim)', border: '1px solid var(--teal-glow)',
            fontSize: 11, fontWeight: 700, color: 'var(--teal)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            marginBottom: 28,
          }}>
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none">
              <rect x="1" y="5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 5V3.5A1.5 1.5 0 016.5 2h2A1.5 1.5 0 0110 3.5V5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M1 9h13" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            ModuleHire for Business
          </div>

          <h2 style={{
            fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 20,
          }}>
            The other side<br/>of the resume.
          </h2>

          <p style={{
            fontSize: 17, color: 'var(--text2)', lineHeight: 1.65,
            maxWidth: 480, margin: '0 auto 32px',
          }}>
            Paste a job description, set your criteria, and get every applicant scored and ranked — before the coffee&apos;s cold.
          </p>

          {/* Mini applicant score strip */}
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center',
            flexWrap: 'wrap', margin: '0 0 36px',
          }}>
            {[
              { name: 'Jordan M.', score: 91, color: '#1d9e75' },
              { name: 'Casey T.', score: 74, color: '#f59e0b' },
              { name: 'Robin K.', score: 43, color: 'var(--text3)' },
            ].map(({ name, score, color }) => (
              <div key={name} style={{
                padding: '9px 16px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontWeight: 800, color, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{name}</span>
              </div>
            ))}
          </div>

          <a
            href="https://business.modulehire.com"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 9,
              background: 'var(--teal)', color: '#fff',
              fontWeight: 700, fontSize: 15, textDecoration: 'none',
            }}
          >
            Try ModuleHire for Business
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </section>

      <PublicFooter />
    </>
  );
}

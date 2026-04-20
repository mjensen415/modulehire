'use client'

import { useState } from 'react';
import Link from 'next/link';
import PublicNav from '@/components/layout/PublicNav';
import PublicFooter from '@/components/layout/PublicFooter';
import FaqItem from '@/components/ui/FaqItem';

export default function HowItWorks() {
  return (
    <>
      <PublicNav />

      <section className="page-hero">
        <div className="hero-glow"></div>
        <div className="eyebrow">How it works</div>
        <h1 className="page-headline">From one resume to every role.</h1>
        <p className="page-sub">One upload. Modular intelligence. Tailored applications built in seconds.</p>
      </section>

      <div className="steps-wrap">
        {/* Step 1 */}
        <div className="step-row">
          <div className="step-content">
            <div className="step-num"><div className="step-num-circle">01</div>Step 01</div>
            <h2 className="step-title">Upload your resume.</h2>
            <p className="step-desc">Drop in any resume. We handle the parsing — PDF, Word doc, or plain text. The raw text is what matters, not the formatting. Most resumes take under 10 seconds to process.</p>
          </div>
          <div className="step-visual">
            <div className="upload-zone">
              <div className="upload-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M24 32V12M14 22l10-10 10 10M8 38h32" />
                </svg>
              </div>
              <div className="upload-title">Drop your resume here</div>
              <div className="upload-sub">or click to browse files</div>
              <div className="file-badges">
                <span className="file-badge">PDF</span>
                <span className="file-badge">DOCX</span>
                <span className="file-badge">TXT</span>
                <span className="file-badge">RTF</span>
              </div>
              <div className="upload-note">Max 10MB · Processed in seconds</div>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="step-row flip">
          <div className="step-content">
            <div className="step-num"><div className="step-num-circle">02</div>Step 02</div>
            <h2 className="step-title">Parse into modules.</h2>
            <p className="step-desc">Every job you've held contains multiple skill domains. We find them. A 4-year IT role might produce 6 separate modules — one for security work, one for hardware, one for provisioning. Each module stands on its own.</p>
          </div>
          <div className="step-visual">
            <div className="module-stack-wrap">
              <div className="stk-card c-teal" style={{ transform: 'rotate(-2.2deg) translateY(-80px) translateX(-12px)', zIndex: 5 }}>
                <div className="stk-domain">Security & Infrastructure</div>
                <div className="cline" style={{ width: '90%' }}></div>
                <div className="cline" style={{ width: '72%' }}></div>
                <div className="cline" style={{ width: '58%' }}></div>
              </div>
              <div className="stk-card c-amber" style={{ transform: 'rotate(1.5deg) translateY(-36px) translateX(8px)', zIndex: 4 }}>
                <div className="stk-domain">Team Leadership</div>
                <div className="cline" style={{ width: '85%' }}></div>
                <div className="cline" style={{ width: '68%' }}></div>
                <div className="cline" style={{ width: '52%' }}></div>
              </div>
              <div className="stk-card c-indigo" style={{ transform: 'rotate(-1deg) translateY(8px)', zIndex: 3 }}>
                <div className="stk-domain">Developer Onboarding</div>
                <div className="cline" style={{ width: '95%' }}></div>
                <div className="cline" style={{ width: '76%' }}></div>
                <div className="cline" style={{ width: '62%' }}></div>
              </div>
              <div className="stk-card c-rose" style={{ transform: 'rotate(2deg) translateY(52px) translateX(10px)', zIndex: 2 }}>
                <div className="stk-domain">Technical Writing</div>
                <div className="cline" style={{ width: '80%' }}></div>
                <div className="cline" style={{ width: '64%' }}></div>
              </div>
              <div className="stk-card c-green" style={{ transform: 'rotate(-1.8deg) translateY(96px) translateX(-8px)', zIndex: 1 }}>
                <div className="stk-domain">Strategic Planning</div>
                <div className="cline" style={{ width: '88%' }}></div>
                <div className="cline" style={{ width: '70%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="step-row">
          <div className="step-content">
            <div className="step-num"><div className="step-num-circle">03</div>Step 03</div>
            <h2 className="step-title">Match to a job description.</h2>
            <p className="step-desc">Drop in any job description — paste it, upload it, or link it. The system scores every module in your library against the role's requirements and builds the optimal stack automatically.</p>
          </div>
          <div className="step-visual">
            <div className="jd-match">
              <div className="jd-card">
                <div className="vis-label">Job Description</div>
                <div className="jd-line" style={{ width: '95%' }}></div>
                <div className="jd-line hl" style={{ width: '80%' }}></div>
                <div className="jd-line" style={{ width: '62%' }}></div>
                <div className="jd-line hl2" style={{ width: '88%' }}></div>
                <div className="jd-line" style={{ width: '50%' }}></div>
                <div className="jd-line hl" style={{ width: '72%' }}></div>
                <div className="jd-line" style={{ width: '40%' }}></div>
                <div className="jd-line" style={{ width: '78%' }}></div>
                <div className="jd-line hl2" style={{ width: '65%' }}></div>
              </div>
              <div>
                <div className="vis-label">Module scores</div>
                <div className="match-row r-teal">
                  <span className="match-name">Security & Infra</span>
                  <span className="score s-hi">94%</span>
                </div>
                <div className="match-row r-teal">
                  <span className="match-name">Team Leadership</span>
                  <span className="score s-hi">87%</span>
                </div>
                <div className="match-row r-amber">
                  <span className="match-name">Dev Onboarding</span>
                  <span className="score s-mid">81%</span>
                </div>
                <div className="match-row r-dim">
                  <span className="match-name">Tech Writing</span>
                  <span className="score s-lo">61%</span>
                </div>
                <div className="match-row r-dim">
                  <span className="match-name">Strategic Plan</span>
                  <span className="score s-lo">54%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="step-row flip">
          <div className="step-content">
            <div className="step-num"><div className="step-num-circle">04</div>Step 04</div>
            <h2 className="step-title">Generate in seconds.</h2>
            <p className="step-desc">Download a tailored .docx and .pdf in seconds. Every resume sounds like it was written for that exact role — because the right modules were selected for it.</p>
          </div>
          <div className="step-visual">
            <div className="out-panel">
              <div className="out-hdr">
                <div className="out-name-bar"></div>
                <div className="out-title-bar"></div>
              </div>
              <div className="out-sec">
                <div className="out-sec-lbl" style={{ color: 'var(--teal)' }}>Security & Infrastructure</div>
                <div className="out-line a-teal" style={{ width: '100%' }}></div>
                <div className="out-line" style={{ width: '90%' }}></div>
                <div className="out-line" style={{ width: '75%' }}></div>
              </div>
              <div className="out-sec">
                <div className="out-sec-lbl" style={{ color: 'var(--amber)' }}>Team Leadership</div>
                <div className="out-line a-amber" style={{ width: '100%' }}></div>
                <div className="out-line" style={{ width: '82%' }}></div>
                <div className="out-line" style={{ width: '60%' }}></div>
              </div>
              <div className="out-sec">
                <div className="out-sec-lbl" style={{ color: 'var(--indigo)' }}>Developer Onboarding</div>
                <div className="out-line a-indigo" style={{ width: '100%' }}></div>
                <div className="out-line" style={{ width: '88%' }}></div>
                <div className="out-line" style={{ width: '45%' }}></div>
              </div>
              <div className="out-badges">
                <span className="out-badge">tailored.pdf</span>
                <span className="out-badge ab">ready.docx</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="faq-section">
        <h2 className="section-headline">Common questions</h2>
        <FaqItem question="Is this just AI writing my resume from scratch?" answer="No. The AI assembles from content you wrote and verified. Your words, your experience — ModuleHire Labs organizes and selects them. Nothing is fabricated." />
        <FaqItem question="What makes a module different from a bullet point?" answer="A module is a full skill story with context — it captures what you did, why it mattered, and what it demonstrates. A bullet point is a trimmed line. Modules are reusable assets; bullets are formatting." />
        <FaqItem question="How many modules will my resume produce?" answer="Typically 8–20, depending on experience length and variety. A 10-year career across diverse roles will produce more modules than a 2-year focused one. You can always split or merge after review." />
        <FaqItem question="Can I edit my modules after parsing?" answer="Yes. Every module is editable, splittable, and mergeable. After parsing you review each module in a dedicated editor — you control the final library." />
        <FaqItem question="What file formats are supported for upload?" answer="PDF, DOCX, and plain text (.txt, .rtf). If your resume is in another format, export it to PDF first — that works for every editor and ATS." />
        <FaqItem question="Does this work for career changers?" answer="Especially well. Modules surface transferable skills that a traditional resume buries. If you're an engineer moving into product, your debugging mindset, stakeholder communication, and spec-writing each become distinct library assets." />
      </section>

      <section className="bottom-cta">
        <div className="bottom-cta-bg"></div>
        <div className="cta-label">Ready when you are</div>
        <h2 className="cta-title">Ready to find every story<br />in your resume?</h2>
        <p className="cta-sub">Upload once. Build your library. Generate tailored resumes for every role you want.</p>
        <Link href="/signin" className="btn-primary" style={{ textDecoration: 'none' }}>Upload free</Link>
      </section>

      <PublicFooter />
    </>
  );
}

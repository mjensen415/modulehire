'use client'

import { useState } from 'react';

export default function FaqItem({ question, answer }: { question: string, answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`faq-item ${open ? 'open' : ''}`}>
      <button className="faq-q" onClick={() => setOpen(!open)}>
        {question}
        <svg className="faq-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="faq-a">{answer}</div>
    </div>
  );
}

// Pure (client-safe) cleanup for voice interview transcripts and feedback.
//
// 1. The agent's voice model takes expressive audio tags ("[happy]", "[laughs]"); ElevenLabs keeps
//    them in the transcript text. They're stage directions, not speech: strip them before showing
//    or scoring a transcript.
// 2. Haiku's forced tool use sometimes returns a string-array field as one string with leaked
//    markup ('\n<parameter name="item">First point'), seen on 2026-11-18. The page called .map on
//    it and crashed. normalizeFeedback() coerces every field to the shape the UI expects, so a
//    stored row in either shape renders.
import type { VoiceFeedback } from './interview'

const AUDIO_TAG = /\[(?:[a-z]+(?:[ -][a-z]+){0,3})\]\s*/gi

export function stripAudioTags(text: string): string {
  return text.replace(AUDIO_TAG, '').replace(/\s{2,}/g, ' ').trim()
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/<\/?(?:parameter|invoke|antml:[a-z_]+|item|function_calls)[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function textList(v: unknown, max: number, maxItems: number): string[] {
  let items: unknown[]
  if (Array.isArray(v)) items = v
  else if (typeof v === 'string') items = v.split(/<parameter[^>]*>|<\/parameter>|<\/?item>|\n+/i)
  else items = []
  return items.map((x) => cleanText(x, max)).filter((s) => s.length > 1).slice(0, maxItems)
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt
}

export function normalizeFeedback(raw: unknown): VoiceFeedback | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q) => {
      const star = (q.star && typeof q.star === 'object' ? q.star : {}) as Record<string, unknown>
      const missed = cleanText(q.missed_module, 200)
      return {
        question: cleanText(q.question, 500),
        answer_summary: cleanText(q.answer_summary, 600),
        score: clampInt(q.score, 1, 5, 1),
        star: { situation: star.situation === true, task: star.task === true, action: star.action === true, result: star.result === true },
        modules_used: textList(q.modules_used, 200, 6),
        missed_module: missed || null,
        better_answer_tip: cleanText(q.better_answer_tip, 600),
        unsupported_claims: textList(q.unsupported_claims, 300, 6),
      }
    })
    .filter((q) => q.question.length > 0)
  const summary = cleanText(r.summary, 1200)
  if (!summary && questions.length === 0) return null
  return {
    overall_score: clampInt(r.overall_score, 0, 100, 0),
    summary,
    strengths: textList(r.strengths, 400, 4),
    improvements: textList(r.improvements, 400, 4),
    questions,
    unused_strengths: textList(r.unused_strengths, 200, 3),
  }
}

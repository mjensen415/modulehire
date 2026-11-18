/**
 * Writes test-resumes/review-fixture.pdf: a fictional 2024 annual review for Tessa Lindqvist at
 * Fieldnote AI (one of the jobs in tessa-lindqvist-perfect-anthropic.pdf). It mixes six concrete
 * accomplishments with ratings, opinions and future goals the parser must skip.
 *   npx tsx scripts/smoke/make-review-fixture.tsx
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToFile } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.45, fontFamily: 'Helvetica' },
  h1: { fontSize: 16, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  h2: { fontSize: 12, marginTop: 14, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  p: { marginBottom: 6 },
})

const sections: Array<[string, string[]]> = [
  ['Overall rating', [
    'Rating: Exceeds expectations.',
    'Tessa is a thoughtful leader and a pleasure to work with. Her peers describe her as calm under pressure.',
  ]],
  ['Key accomplishments', [
    'Tessa launched the Fieldnote Builders program, growing it from 0 to 1,400 active members in nine months.',
    'She led the migration of 3 regional community forums onto a single platform, finishing two weeks ahead of schedule.',
    'Tessa built the community health dashboard that the product team now reviews every Monday, cutting time-to-triage for bug reports from 6 days to 2 days.',
    'She ran 12 virtual office hours with the research team, which produced 48 feature requests that were added to the roadmap.',
    'Tessa hired and onboarded 2 community managers and wrote the moderation playbook they use today.',
    'She partnered with marketing on the 2024 launch event, which drew 2,300 registrations, the largest in company history.',
  ]],
  ['Competencies', [
    'Collaboration: Exceeds expectations.',
    'Communication: Meets expectations. Tessa could share updates with leadership more often.',
  ]],
  ['Goals for 2025', [
    'Tessa will own the APAC community launch and aims to stand up two new regional chapters.',
    'Development area: delegate more of the day-to-day moderation work.',
  ]],
]

const Review = () => (
  <Document title="Fieldnote AI 2024 annual review">
    <Page size="LETTER" style={s.page}>
      <Text style={s.h1}>Fieldnote AI · 2024 Annual Performance Review</Text>
      <Text style={s.p}>Employee: Tessa Lindqvist · Role: Head of Community · Reviewer: Jordan Pike, VP Product</Text>
      <Text style={s.p}>Review period: January to December 2024</Text>
      {sections.map(([h, lines]) => (
        <View key={h}>
          <Text style={s.h2}>{h}</Text>
          {lines.map(l => <Text key={l} style={s.p}>{l}</Text>)}
        </View>
      ))}
    </Page>
  </Document>
)

renderToFile(<Review />, 'test-resumes/review-fixture.pdf').then(() => console.log('wrote test-resumes/review-fixture.pdf'))

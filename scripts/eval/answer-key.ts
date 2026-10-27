// test-resumes/answer-key-jd-levels.md as data. Years only: the key gives year ranges, and the
// parser's job is to get the right employer, title and start year, not a month.

export type JdKey = 'A' | 'B'
export type Level = 'perfect' | 'director' | 'clevel' | 'poor'
export type ExpectedJob = {
  /** null = the key doesn't name it (e.g. Kevin's unnamed internship); matched by year only. */
  company: string | null
  /** Only for companies with several roles, where the title tells them apart. */
  title?: string
  start?: number
}
export type Fixture = { file: string; name: string; jd: JdKey; level: Level; jobs: ExpectedJob[] }

export const JD_FILES: Record<JdKey, string> = {
  A: 'franklin-templeton-head-of-ai-community.txt',
  B: 'anthropic-head-of-community.txt',
}
export const JD_LABELS: Record<JdKey, string> = {
  A: 'Head of AI Community at Franklin Templeton',
  B: 'Head of Community, Enterprise Marketing at Anthropic',
}

export const FIXTURES: Fixture[] = [
  {
    file: 'noor-haddad-perfect-franklin-templeton.pdf', name: 'Noor (perfect)', jd: 'A', level: 'perfect',
    jobs: [
      { company: 'Halden Rowe', start: 2022 },
      { company: 'Corvane', start: 2019 },
      { company: 'Ardent Cloud', start: 2015 },
      { company: 'Brightline Labs', start: 2011 },
    ],
  },
  {
    file: 'rachel-okonkwo-director-franklin-templeton.pdf', name: 'Rachel (director)', jd: 'A', level: 'director',
    jobs: [
      { company: 'Calder Mutual', title: 'Director', start: 2022 },
      { company: 'Calder Mutual', title: 'Senior Manager', start: 2019 },
      { company: 'Fernway Software' },
      { company: 'Brookline Analytics' },
      { company: 'Datacove' },
    ],
  },
  {
    file: 'gregory-takahashi-clevel-franklin-templeton.pdf', name: 'Gregory (C-level)', jd: 'A', level: 'clevel',
    jobs: [
      { company: 'Velora Wealth', start: 2020 },
      { company: 'Harbor and Lane Financial', start: 2015 },
      { company: 'Quantive', start: 2011 },
      { company: 'Lexmont Systems', title: 'Engineering Manager', start: 2006 },
      { company: 'Lexmont Systems', title: 'Software Engineer', start: 2003 },
      { company: 'Alder Health', start: 2022 },
      { company: 'Open Ledger Foundation', start: 2021 },
    ],
  },
  {
    file: 'kevin-marsh-poor-franklin-templeton.pdf', name: 'Kevin (poor)', jd: 'A', level: 'poor',
    jobs: [
      { company: 'Tegra Bank', start: 2022 },
      { company: 'Stackhouse', start: 2018 },
      { company: 'Brightwire', start: 2015 },
      { company: null, start: 2014 },
    ],
  },
  {
    file: 'tessa-lindqvist-perfect-anthropic.pdf', name: 'Tessa (perfect)', jd: 'B', level: 'perfect',
    jobs: [
      { company: 'Fieldnote AI', start: 2022 },
      { company: 'Brightwave Data', start: 2018 },
      { company: 'Northpeak', start: 2014 },
      { company: 'Pylon Labs', start: 2011 },
    ],
  },
  {
    file: 'daniel-reyes-director-anthropic.pdf', name: 'Daniel (director)', jd: 'B', level: 'director',
    jobs: [
      { company: 'Quillbase', title: 'Director', start: 2021 },
      { company: 'Quillbase', title: 'Senior Manager', start: 2018 },
      { company: 'Harrow Systems' },
      { company: 'Stackmint', title: 'Developer Evangelist', start: 2011 },
      { company: 'Stackmint', title: 'Support Engineer', start: 2009 },
    ],
  },
  {
    file: 'catherine-moreau-clevel-anthropic.pdf', name: 'Catherine (C-level)', jd: 'B', level: 'clevel',
    jobs: [
      { company: 'Cobaltline', start: 2021 },
      { company: 'Meridian Forge', start: 2016 },
      { company: 'Kestrel Data', start: 2012 },
      { company: 'Brightfield Software', start: 2008 },
      { company: 'Lumora Learning', start: 2023 },
      { company: 'Community Leaders Forum', start: 2020 },
    ],
  },
  {
    file: 'brittany-cole-poor-anthropic.pdf', name: 'Brittany (poor)', jd: 'B', level: 'poor',
    jobs: [
      { company: 'Brightloop', start: 2022 },
      { company: 'Frolic Apps', start: 2019 },
      { company: 'Bean & Bloom Coffee Co.', start: 2016 },
      { company: 'ShopRight', start: 2013 },
      { company: 'The Daily Grind', start: 2011 },
    ],
  },
]

export const SCANNED_FIXTURE = 'kevin-marsh-poor-franklin-templeton-SCANNED.pdf'

/** Sections that must never become modules. */
export const EXCLUDED_SECTIONS = /^\s*(career\s+)?objective\b|^\s*interests\b|^\s*hobbies\b|^\s*references\b|^\s*earlier\s+career\b/i

export const LEVEL_ORDER: Level[] = ['perfect', 'director', 'clevel', 'poor']

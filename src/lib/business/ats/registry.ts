// Client-safe description of every direct ATS connection: labels, the fields the connect form
// asks for, setup steps and permissions. The server side (adapters.ts) implements each one.
// All of these work with a key the customer creates in their own account (no partner program).

export type Provider = 'greenhouse' | 'workable' | 'lever' | 'ashby' | 'bamboohr'
export const PROVIDERS: Provider[] = ['greenhouse', 'lever', 'ashby', 'workable', 'bamboohr']
export const isProvider = (v: unknown): v is Provider => typeof v === 'string' && (PROVIDERS as string[]).includes(v)

export type ConnectField = { name: 'account' | 'secret' | 'secret2'; label: string; secret?: boolean; placeholder?: string }

export type ProviderInfo = {
  label: string
  noteWord: string // what a score posted back is called in that ATS
  hasOptOut: boolean // the ATS records candidates who opted out of AI review, and we honor it
  blurb: string
  fields: ConnectField[]
  steps: string[] // setup steps shown on the connect form
  permissions: string[]
  writebackPermission: string // the one permission only needed for posting scores back
  activeMeans: string // which candidates the import list shows
}

export const PROVIDER_INFO: Record<Provider, ProviderInfo> = {
  greenhouse: {
    label: 'Greenhouse',
    noteWord: 'note',
    hasOptOut: true,
    blurb: 'Pull candidates and resumes from a Greenhouse job, and post each score back as a note.',
    fields: [
      { name: 'account', label: 'Client ID' },
      { name: 'secret', label: 'Client secret', secret: true },
    ],
    steps: [
      'In Greenhouse, open Configure (the gear), Dev Center, API Credential Management, then Create new API credentials.',
      'Choose Harvest V3 (OAuth), leave Partner blank, and name it ModuleHire.',
      'Give it the permissions below, then copy the client ID and client secret here. Greenhouse shows the secret once.',
    ],
    permissions: ['jobs:list', 'job_posts:list', 'applications:list', 'candidates:list', 'attachments:list', 'ai_opt_out_statuses:list', 'notes:create'],
    writebackPermission: 'notes:create',
    activeMeans: 'Candidates still in process. Candidates who opted out of AI review are never imported or scored.',
  },
  lever: {
    label: 'Lever',
    noteWord: 'note',
    hasOptOut: false,
    blurb: 'Pull opportunities and resumes from a Lever posting, and post each score back as a note.',
    fields: [{ name: 'secret', label: 'API key', secret: true }],
    steps: [
      'In Lever, open Settings, Integrations and API, then the API Credentials tab.',
      'Generate a new key named ModuleHire with the permissions below.',
      'Copy the key here.',
    ],
    permissions: ['Read postings', 'Read opportunities', 'Read resumes', 'Create notes'],
    writebackPermission: 'Create notes',
    activeMeans: 'Opportunities that are not archived.',
  },
  ashby: {
    label: 'Ashby',
    noteWord: 'note',
    hasOptOut: false,
    blurb: 'Pull applications and resumes from an Ashby job, and post each score back as a note.',
    fields: [{ name: 'secret', label: 'API key', secret: true }],
    steps: [
      'In Ashby, open Admin, then API Keys under Integrations, and create a key named ModuleHire.',
      'Give it the permissions below. Leave confidential job access off unless you want those jobs.',
      'Copy the key here.',
    ],
    permissions: ['Jobs: read', 'Candidates: read', 'Candidates: write'],
    writebackPermission: 'Candidates: write',
    activeMeans: 'Active applications.',
  },
  workable: {
    label: 'Workable',
    noteWord: 'comment',
    hasOptOut: false,
    blurb: 'Pull candidates and resumes from a Workable job, and post each score back as a comment.',
    fields: [
      { name: 'account', label: 'Workable subdomain', placeholder: 'acme' },
      { name: 'secret', label: 'API access token', secret: true },
    ],
    steps: [
      'In Workable, open Settings, Integrations, and find API Access Tokens. Click Generate API token.',
      'Name it ModuleHire and give it the scopes below.',
      'Copy the token here, with your account subdomain (the "acme" in acme.workable.com).',
    ],
    permissions: ['r_jobs', 'r_candidates', 'w_candidates'],
    writebackPermission: 'w_candidates',
    activeMeans: 'Candidates who are not disqualified or hired.',
  },
  bamboohr: {
    label: 'BambooHR',
    noteWord: 'comment',
    hasOptOut: false,
    blurb: 'Pull applicants and resumes from a BambooHR job opening, and post each score back as a comment.',
    fields: [
      { name: 'account', label: 'BambooHR company domain', placeholder: 'acme' },
      { name: 'secret', label: 'API key', secret: true },
    ],
    steps: [
      'In BambooHR, click your name in the lower left, then API Keys, and add a key named ModuleHire.',
      'The key acts as you, so use an account with access to Hiring (ATS settings).',
      'Copy the key here, with your company domain (the "acme" in acme.bamboohr.com).',
    ],
    permissions: ['Access to Hiring / ATS settings'],
    writebackPermission: 'Access to Hiring / ATS settings',
    activeMeans: 'Applicants in new or active statuses.',
  },
}

/** Display name for a provider id, or null for anything that isn't a connected ATS. */
export function providerLabel(v: string | null | undefined): string | null {
  return isProvider(v) ? PROVIDER_INFO[v].label : null
}

export type BulletPrompt = {
  text: string
}

export type RoleTemplateSection = {
  name: string
  bulletPrompts: BulletPrompt[]
}

export type RoleTemplate = {
  id: string
  industry: string
  title: string
  suggestedSkills: string[]
  sections: RoleTemplateSection[]
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'software-engineer',
    industry: 'Engineering',
    title: 'Software Engineer',
    suggestedSkills: [
      'TypeScript', 'React', 'Node.js', 'SQL', 'REST APIs', 'Git',
      'Unit Testing', 'CI/CD', 'System Design', 'AWS', 'Python', 'Agile/Scrum',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Built [feature/system] using [technologies], serving [X] users/requests per [day/month]' },
          { text: 'Reduced [latency/load time/error rate] by [X%] by [what you changed]' },
          { text: 'Led the migration from [old system] to [new system], cutting [cost/time/incidents] by [X%]' },
          { text: 'Designed and shipped [API/service] that [what it enabled], used by [X teams/customers]' },
          { text: 'Mentored [X] engineers on [area], improving [team velocity/code quality metric]' },
          { text: 'Wrote/expanded test coverage for [system] from [X%] to [Y%], catching [type of bugs] before production' },
        ],
      },
      {
        name: 'Projects',
        bulletPrompts: [
          { text: 'Built [project name], a [what it does], using [tech stack] — [result, e.g. GitHub stars, users, or what you learned]' },
          { text: 'Solved [problem] by implementing [approach], resulting in [measurable outcome]' },
          { text: 'Contributed [feature/fix] to [open source project], reviewed by [maintainer/team]' },
        ],
      },
    ],
  },
  {
    id: 'product-manager',
    industry: 'Product',
    title: 'Product Manager',
    suggestedSkills: [
      'Product Strategy', 'Roadmapping', 'User Research', 'A/B Testing', 'SQL',
      'Stakeholder Management', 'Agile/Scrum', 'Figma', 'Jira', 'Go-to-Market', 'Analytics', 'Prioritization',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Owned the roadmap for [product/feature area], shipping [X] features that drove [metric] by [X%]' },
          { text: 'Launched [product/feature], growing [adoption/revenue/retention] by [X%] within [timeframe]' },
          { text: 'Ran [X] user interviews / usability tests to identify [problem], leading to [what changed]' },
          { text: 'Partnered with [eng/design/sales] to define requirements for [initiative], shipped in [timeframe]' },
          { text: 'Defined and tracked [KPI] for [product area], improving it from [X] to [Y]' },
          { text: 'Prioritized [backlog/roadmap] using [framework], cutting [cycle time/scope creep] by [X%]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Grew [key metric] from [X] to [Y] over [timeframe] by [what you did]' },
          { text: 'Reduced churn/increased retention by [X%] by identifying and fixing [root cause]' },
        ],
      },
    ],
  },
  {
    id: 'marketing-manager',
    industry: 'Marketing',
    title: 'Marketing Manager',
    suggestedSkills: [
      'Campaign Strategy', 'SEO/SEM', 'Content Marketing', 'Email Marketing', 'Marketing Analytics',
      'Brand Positioning', 'Social Media', 'HubSpot', 'A/B Testing', 'Budget Management', 'Copywriting', 'Paid Media',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Led [campaign/channel] strategy, growing [leads/traffic/pipeline] by [X%] over [timeframe]' },
          { text: 'Managed a [$X] budget across [channels], improving CAC/ROAS by [X%]' },
          { text: 'Built and executed [content/email/social] program that generated [X leads/signups/engagement]' },
          { text: 'Repositioned [product/brand] messaging, resulting in [X% lift] in [conversion/engagement metric]' },
          { text: 'Ran [X] A/B tests on [landing pages/emails/ads], lifting conversion rate by [X%]' },
          { text: 'Launched [product/feature] go-to-market plan, driving [X] signups/customers in [timeframe]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Grew [channel] from [X] to [Y] [followers/subscribers/MQLs] in [timeframe]' },
          { text: 'Cut cost per [lead/acquisition] by [X%] while maintaining/improving [quality metric]' },
        ],
      },
    ],
  },
  {
    id: 'sales-account-executive',
    industry: 'Sales',
    title: 'Sales Account Executive',
    suggestedSkills: [
      'Consultative Selling', 'Pipeline Management', 'Salesforce', 'Negotiation', 'Cold Outreach',
      'Account Management', 'Quota Attainment', 'Forecasting', 'Discovery Calls', 'Closing', 'Territory Planning', 'CRM',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Closed [$X] in [new/expansion] revenue against a [$X] quota, attaining [X%] of target' },
          { text: 'Built and managed a pipeline of [X] accounts, converting [X%] to closed-won' },
          { text: 'Ranked #[X] of [Y] reps on the team for [metric] in [year/quarter]' },
          { text: 'Grew average deal size from [$X] to [$Y] by [what you changed in approach]' },
          { text: 'Owned the full sales cycle for [segment/territory], from prospecting to close, averaging [X]-day cycle' },
          { text: 'Expanded [X] existing accounts, adding [$Y] in upsell/cross-sell revenue' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Exceeded quota [X] consecutive quarters, peaking at [X%] attainment' },
          { text: 'Reduced sales cycle length from [X] to [Y] days by [tactic]' },
        ],
      },
    ],
  },
  {
    id: 'data-analyst',
    industry: 'Data & Analytics',
    title: 'Data Analyst',
    suggestedSkills: [
      'SQL', 'Python', 'Excel/Sheets', 'Tableau', 'Looker', 'Statistical Analysis',
      'A/B Testing', 'Data Visualization', 'ETL', 'dbt', 'R', 'Dashboarding',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Built [dashboard/report] tracking [metric], used by [X stakeholders/teams] to make [type of decision]' },
          { text: 'Analyzed [dataset/behavior] to identify [insight], leading to [business action and result]' },
          { text: 'Automated [manual process/report], saving [X hours/week] for [team]' },
          { text: 'Designed and ran an A/B test on [feature/campaign], finding [result], adopted company-wide' },
          { text: 'Built [ETL pipeline/data model] for [data source], improving data freshness/accuracy by [X%]' },
          { text: 'Partnered with [team] to define [metric/KPI], now used as the primary measure of [what]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Findings from [analysis] directly informed [decision], resulting in [$X or X% impact]' },
          { text: 'Reduced report turnaround time from [X days] to [Y hours] by [what you built]' },
        ],
      },
    ],
  },
  {
    id: 'ux-designer',
    industry: 'Design',
    title: 'UX Designer',
    suggestedSkills: [
      'Figma', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems',
      'Usability Testing', 'Information Architecture', 'Interaction Design', 'Accessibility', 'User Flows', 'Visual Design', 'Design Critique',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Redesigned [flow/feature], improving [conversion/task completion/satisfaction] by [X%]' },
          { text: 'Led user research (interviews, usability tests) for [product area], surfacing [key insight]' },
          { text: 'Built/extended the design system, reducing design-to-dev handoff time by [X%]' },
          { text: 'Designed [feature] from concept to launch, partnering with [PM/eng], shipped in [timeframe]' },
          { text: 'Ran [X] usability tests on [prototype], identifying [X] issues fixed before launch' },
          { text: 'Simplified [complex flow] from [X] steps to [Y], reducing drop-off by [X%]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Redesign of [feature] increased [engagement/conversion metric] by [X%]' },
          { text: 'Design system adoption cut new-feature design time by [X%] across [X] teams' },
        ],
      },
    ],
  },
  {
    id: 'operations-manager',
    industry: 'Operations',
    title: 'Operations Manager',
    suggestedSkills: [
      'Process Improvement', 'Project Management', 'Vendor Management', 'Cross-functional Coordination',
      'Budgeting', 'KPI Tracking', 'SOP Development', 'Supply Chain', 'Team Leadership', 'Resource Planning', 'Six Sigma', 'Change Management',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Redesigned [process] end to end, cutting [cost/time/errors] by [X%]' },
          { text: 'Managed a team of [X] across [function], improving [productivity metric] by [X%]' },
          { text: 'Owned [budget area] of [$X], reducing costs by [X%] without impacting [quality/output]' },
          { text: 'Built and rolled out [SOP/system] adopted across [X teams/locations]' },
          { text: 'Managed relationships with [X] vendors, renegotiating terms to save [$X annually]' },
          { text: 'Led [cross-functional project], coordinating [X teams] to hit [deadline/goal]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Cut operating costs by [$X/X%] through [initiative]' },
          { text: 'Scaled [process/team] to support [X% growth] in [volume/headcount] without adding headcount' },
        ],
      },
    ],
  },
  {
    id: 'financial-analyst',
    industry: 'Finance',
    title: 'Financial Analyst',
    suggestedSkills: [
      'Financial Modeling', 'Excel', 'Forecasting', 'Variance Analysis', 'FP&A',
      'Budgeting', 'SQL', 'Valuation', 'Financial Reporting', 'PowerPoint', 'GAAP', 'Scenario Analysis',
    ],
    sections: [
      {
        name: 'Work Experience',
        bulletPrompts: [
          { text: 'Built [financial model/forecast] for [business area], used to guide [decision]' },
          { text: 'Led [budgeting/forecasting] process for [$X budget], improving forecast accuracy to within [X%]' },
          { text: 'Identified [$X] in cost savings/revenue opportunity through [analysis]' },
          { text: 'Prepared [monthly/quarterly] reporting for [stakeholders], reducing close time by [X days]' },
          { text: 'Built variance analysis flagging [X], leading to [corrective action and result]' },
          { text: 'Supported [deal/fundraise/audit] by building [analysis], contributing to [outcome]' },
        ],
      },
      {
        name: 'Impact Highlights',
        bulletPrompts: [
          { text: 'Identified and drove [$X] in annualized savings through [initiative]' },
          { text: 'Cut monthly close process from [X days] to [Y days] by [what you automated/changed]' },
        ],
      },
    ],
  },
]

export function getRoleTemplate(id: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.id === id)
}

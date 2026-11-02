// Vocabulary for the Investors app: stages, investor types, pass reasons and timings.
// Change these lists freely; stored records keep their key, so renaming a label is safe.

export const CURRENCY = 'USD';

// How long before a chase is suggested.
export const FOLLOW_UP_DAYS = 7;      // ticking a follow-up on the sticky note sets the next one this far out
export const STALE_DAYS = 14;         // an active investor with no touch (and no follow-up date) for this long
export const UPDATE_EVERY_DAYS = 30;  // investors who asked for updates: send one at least this often

// The journey through one round, in order. `active` = still being worked.
export const STAGES = {
  to_contact: { label: 'To contact', tone: 'neutral', active: false },
  contacted: { label: 'Contacted', tone: 'info', active: true },
  follow_up: { label: 'Following up', tone: 'info', active: true },
  meeting: { label: 'Meeting / pitch', tone: 'warn', active: true },
  diligence: { label: 'Due diligence', tone: 'warn', active: true },
  term_sheet: { label: 'Term sheet', tone: 'good', active: true },
  committed: { label: 'Committed', tone: 'good', active: false },
  passed: { label: 'Passed', tone: 'bad', active: false },
};

export const INVESTOR_TYPES = {
  '': '—',
  vc: 'VC fund',
  angel: 'Angel',
  syndicate: 'Angel syndicate',
  family_office: 'Family office',
  cvc: 'Corporate / strategic',
  accelerator: 'Accelerator',
  government: 'Grant / government',
  other: 'Other',
};

export const PASS_REASONS = {
  '': '—',
  too_early: 'Too early / need more traction',
  thesis: 'Outside thesis or sector',
  check_size: 'Check size / round size mismatch',
  valuation: 'Valuation',
  market: 'Market size',
  team: 'Team',
  timing: 'Timing / fund cycle',
  conflict: 'Portfolio conflict',
  no_response: 'Never responded',
  other: 'Other',
};

export const ROUND_STATUSES = {
  planned: 'Planned',
  active: 'Raising now',
  closed: 'Closed',
};

export const ACTIVITY_KINDS = {
  email: '✉️ Email',
  call: '📞 Call',
  meeting: '🤝 Meeting',
  update: '📰 Investor update sent',
  note: '📝 Note',
  stage: '➡️ Stage change',
};

// Suggested round names for the "New round" form.
export const ROUND_NAMES = ['Pre-seed', 'Seed', 'Seed extension', 'Series A', 'Series B', 'Bridge'];

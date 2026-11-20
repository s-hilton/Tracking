// Vocabulary for the Customer Outreach app. Change these freely; stored records
// keep their key, so renaming a label is safe.

export const FOLLOW_UP_DAYS = 7; // ticking a follow-up on the sticky note sets the next one this far out
export const STALE_DAYS = 14;    // an active lead with no follow-up date and no contact for this long

// The journey from a name on a list to a paying customer. `active` = still being worked.
export const STAGES = {
  to_contact: { label: 'To contact', tone: 'neutral', active: false },
  contacted: { label: 'Contacted', tone: 'info', active: true },
  follow_up: { label: 'Following up', tone: 'info', active: true },
  replied: { label: 'Replied', tone: 'warn', active: true },
  meeting: { label: 'Meeting / demo', tone: 'warn', active: true },
  trial: { label: 'Trial / pilot', tone: 'good', active: true },
  customer: { label: 'Customer', tone: 'good', active: false },
  not_interested: { label: 'Not interested', tone: 'bad', active: false },
};

// Suggestions for the Industry box (you can type anything; industries you've used are suggested too).
export const INDUSTRIES = [
  'Software / SaaS', 'AI / ML', 'Fintech', 'Healthcare', 'Biotech', 'Aerospace', 'Defense', 'Energy',
  'Manufacturing', 'Robotics', 'Automotive', 'Logistics', 'Retail / e-commerce', 'Media', 'Gaming',
  'Education', 'Government', 'Telecom', 'Real estate', 'Agriculture', 'Consulting', 'Research / academia',
];

export const SOURCES = {
  '': '—',
  linkedin: 'LinkedIn',
  email: 'Cold email',
  referral: 'Referral / intro',
  event: 'Event / conference',
  website: 'Website / inbound',
  waitlist: 'Waitlist sign-up',
  community: 'Community / forum',
  other: 'Other',
};

export const ACTIVITY_KINDS = {
  email: '✉️ Email',
  linkedin: '💬 LinkedIn message',
  call: '📞 Call',
  meeting: '🤝 Meeting / demo',
  note: '📝 Note',
  stage: '➡️ Stage change',
};

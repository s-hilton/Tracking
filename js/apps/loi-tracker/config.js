// Astra Retrieval business-development vocabulary (from the LOI Tracker PRD).
// Edit labels and lists here; stored records keep their keys, so renaming a
// label is safe. Removing a key leaves old records showing the raw key.

// Days without any update before a company shows up in "Needs follow-up".
// Companies with a signed LOI are never flagged.
export const STALE_DAYS = 5;

// LOI expiry alerts (days before the expiry date).
export const EXPIRY_ALERT_DAYS = [60, 30, 7];

export const CURRENCY = 'USD';

const feasibility = ['Unknown', 'Low', 'Medium', 'High'];

export const PRODUCTS = {
  comms: {
    label: 'Private Deep Space Communications Network',
    short: 'Comms',
    color: '#0ea5e9',
    useCases: {
      deep_space_comm: 'Deep-space spacecraft communication',
      ttc: 'Telemetry, tracking and command',
      navigation: 'Navigation support',
      radio_astronomy: 'Radio astronomy time',
      vlbi: 'VLBI / coordinated observations',
      augmentation: 'Network augmentation and backup',
      station_hosting: 'Ground station hosting / partnership',
      tech_demo: 'Technology demonstration support',
      government: 'Government / institutional support',
    },
    fields: [
      { key: 'mission_destination', label: 'Mission and destination' },
      { key: 'mission_phase', label: 'Mission phase' },
      { key: 'launch_date', label: 'Launch date', type: 'date' },
      { key: 'service_dates', label: 'Service dates' },
      { key: 'usage_hours', label: 'Usage hours', type: 'number' },
      { key: 'term', label: 'Term' },
      { key: 'frequency_band', label: 'Frequency band' },
      { key: 'data_rate', label: 'Data rate' },
      { key: 'link', label: 'Uplink / downlink', type: 'select', options: ['', 'Uplink', 'Downlink', 'Both'] },
      { key: 'service_type', label: 'TT&C vs astronomy', type: 'select', options: ['', 'TT&C', 'Astronomy', 'Both'] },
      { key: 'coverage', label: 'Coverage geography' },
      { key: 'station_count', label: 'Station count', type: 'number' },
      { key: 'observation_requirements', label: 'Observation requirements', type: 'textarea', wide: true },
      { key: 'feasibility', label: 'Feasibility', type: 'select', options: feasibility },
    ],
  },
  software: {
    label: 'Autonomous Deep Spaceflight Software',
    short: 'Software',
    color: '#8b5cf6',
    useCases: {
      gnc: 'Navigation, guidance and control',
      trajectory: 'Trajectory and mission optimization',
      maneuver: 'Autonomous maneuver execution',
      rpo: 'Proximity operations, rendezvous and capture',
      onboard_decisions: 'Onboard decision making',
      fdir: 'Fault detection and recovery',
      licensing: 'Software licensing and integration',
      custom: 'Custom software and simulation',
    },
    fields: [
      { key: 'mission_type', label: 'Application and mission type' },
      { key: 'vehicle', label: 'Vehicle class / mass' },
      { key: 'computing', label: 'Computing architecture' },
      { key: 'existing_software', label: 'Existing flight software' },
      { key: 'autonomy', label: 'Required autonomy' },
      { key: 'integration', label: 'Integration and simulation requirements', type: 'textarea', wide: true },
      { key: 'deployment_date', label: 'Deployment date', type: 'date' },
      { key: 'license_model', label: 'License model' },
      { key: 'spacecraft_count', label: 'Number of spacecraft', type: 'number' },
      { key: 'custom_work', label: 'Custom work' },
      { key: 'feasibility', label: 'Feasibility', type: 'select', options: feasibility },
    ],
  },
  capture: {
    label: 'Asteroid Capture Spacecraft',
    short: 'Capture',
    color: '#f59e0b',
    useCases: {
      acquisition: 'Asteroid acquisition / delivery',
      mining_supply: 'Asteroid mining supply',
      science: 'Asteroid science and research',
      relocation: 'Capture and relocation',
      cislunar: 'Cislunar delivery',
      dedicated: 'Dedicated deep-space transport',
      rideshare: 'Deep-space rideshare',
      hosted_payloads: 'Hosted payloads and demonstrations',
      payload_delivery: 'Payload deployment / scientific delivery',
    },
    fields: [
      { key: 'customer_category', label: 'Customer category' },
      { key: 'service_type', label: 'Service type' },
      { key: 'target_asteroid', label: 'Target asteroid' },
      { key: 'composition', label: 'Preferred composition' },
      { key: 'size_mass', label: 'Size / mass' },
      { key: 'delivery', label: 'Delivery location / orbit' },
      { key: 'desired_date', label: 'Desired date', type: 'date' },
      { key: 'payload', label: 'Payload mass / volume / power' },
      { key: 'mission_requirements', label: 'Mission and deployment requirements', type: 'textarea', wide: true },
      { key: 'shared_dedicated', label: 'Shared vs dedicated', type: 'select', options: ['', 'Shared', 'Dedicated'] },
      { key: 'mission_count', label: 'Mission count', type: 'number' },
      { key: 'feasibility', label: 'Technical / commercial feasibility', type: 'select', options: feasibility },
    ],
  },
};

// Opportunity pipeline stages, in order. `group` drives open/paused/closed reporting.
export const STAGES = {
  identified: { label: 'Identified', group: 'open' },
  reached_out: { label: 'Reached Out', group: 'open' },
  following_up: { label: 'Following Up', group: 'open' },
  in_conversation: { label: 'In Conversation', group: 'open' },
  qualified: { label: 'Qualified / Interested', group: 'open' },
  loi_discussion: { label: 'LOI Discussion', group: 'open' },
  loi_negotiating: { label: 'LOI Sent / Negotiating', group: 'open' },
  loi_signed: { label: 'LOI Signed', group: 'won' },
  contracted: { label: 'Contracted', group: 'won' },
  on_hold: { label: 'On Hold', group: 'paused' },
  lost: { label: 'Lost / Disqualified', group: 'closed' },
};

export const LOI_STATUSES = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  shared: { label: 'Shared', tone: 'info' },
  negotiating: { label: 'Negotiating', tone: 'warn' },
  awaiting_signatures: { label: 'Awaiting signatures', tone: 'warn' },
  signed: { label: 'Signed', tone: 'good' },
  expired: { label: 'Expired', tone: 'bad' },
  withdrawn: { label: 'Withdrawn', tone: 'bad' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};
// Counted as "proposed LOI value" (under negotiation, not yet signed).
export const PROPOSED_LOI_STATUSES = ['draft', 'shared', 'negotiating', 'awaiting_signatures'];

export const VALUE_BASIS = { total: 'Total', annual: 'Annual recurring', per_mission: 'Per mission', other: 'Other' };

export const ACTIVITY_TYPES = {
  first_email: 'First email',
  follow_up_email: 'Follow-up email',
  received_email: 'Received email',
  call: 'Phone call',
  video_meeting: 'Video meeting',
  in_person_meeting: 'In-person meeting',
  event: 'Event interaction',
  linkedin: 'LinkedIn / social message',
  sms: 'SMS / Signal / WhatsApp',
  referral: 'Referral',
  proposal_sent: 'Document or proposal sent',
  loi_sent: 'LOI sent',
  loi_received: 'LOI received',
  loi_signed: 'LOI signed',
  internal_meeting: 'Internal meeting',
  note: 'General note',
};
export const MEETING_TYPES = ['video_meeting', 'in_person_meeting', 'call'];

export const DIRECTIONS = { outbound: 'Outbound', inbound: 'Inbound', internal: 'Internal' };

export const OUTCOMES = {
  '': '—',
  no_response: 'No response',
  awaiting_reply: 'Awaiting reply',
  interested: 'Interested',
  declined: 'Declined',
  requested_info: 'Requested information',
  meeting_requested: 'Meeting requested',
  meeting_scheduled: 'Meeting scheduled',
  meeting_completed: 'Meeting completed',
  referred: 'Referred',
  technical_question: 'Technical question',
  commercial_discussion: 'Commercial discussion',
  loi_requested: 'LOI requested',
  loi_under_review: 'LOI under review',
  loi_signed: 'LOI signed',
  follow_up_needed: 'Follow-up needed',
  no_action: 'No action',
};

// Suggested follow-up after logging an activity: [days, businessDaysOnly].
export const FOLLOW_UP_DEFAULTS = {
  first_email: [3, true],
  follow_up_email: [7, false],
  video_meeting: [1, false],
  in_person_meeting: [1, false],
  call: [1, false],
  loi_sent: [7, false],
  loi_signed: [30, false],
  default: [3, true],
};

export const COMPANY_TYPES = {
  '': '—',
  commercial: 'Commercial',
  government: 'Government / public sector',
  research: 'University / research',
  investor: 'Investor',
  partner: 'Partner',
  other: 'Other',
};

export const LEAD_SOURCES = {
  '': '—',
  cold_outreach: 'Cold outreach',
  personal_network: 'Personal network',
  warm_intro: 'Warm intro',
  investor_intro: 'Investor introduction',
  conference: 'Conference',
  research_network: 'Research network',
  linkedin: 'LinkedIn',
  inbound_site: 'Inbound (website)',
  referral: 'Referral',
};

export const CONTACT_ROLES = {
  '': '—',
  decision_maker: 'Decision maker',
  champion: 'Champion',
  technical_evaluator: 'Technical evaluator',
  legal: 'Legal',
  other: 'Other',
};

export const CONTACT_STATUSES = {
  active: 'Active',
  moved_roles: 'Moved roles',
  left_company: 'Left company',
  unresponsive: 'Unresponsive',
};

export const PRIORITIES = { low: 'Low', normal: 'Normal', high: 'High' };

export const TASK_STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const USE_CASE_SOURCES = {
  '': '—',
  customer_confirmed: 'Customer-confirmed',
  internally_proposed: 'Internally proposed',
};

// ---- Lead scoring (PRD §10) ---------------------------------------------------------
// Each dimension is scored 1–5 or left unknown. Weights are percentages; change them
// here. The score is the weighted average of the known dimensions, shown 0–100.
// Scoring never changes an opportunity's stage.
export const SCORE_DIMENSIONS = {
  commercial: { label: 'Commercial potential', weight: 30 },
  interest: { label: 'Customer interest', weight: 25 },
  technical: { label: 'Technical fit', weight: 20 },
  strategic: { label: 'Strategic importance', weight: 15 },
  timeline: { label: 'Timeline alignment', weight: 10 },
};
// An opportunity scoring at least this is a "strong fit".
export const STRONG_FIT_SCORE = 70;

// Qualification facts, each tracked as yes / no / unknown.
export const QUALIFICATION_FACTS = {
  problem: 'Confirmed problem',
  decision_maker: 'Decision maker identified',
  budget: 'Budget',
  mission_dates: 'Mission dates known',
  technical_requirements: 'Technical requirements known',
  willingness_to_pay: 'Willingness to pay',
  open_to_loi: 'Open to an LOI',
  no_blockers: 'No blocking capabilities',
};

// ---- Contacts ------------------------------------------------------------------------
export const CONTACT_METHOD_TYPES = {
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  messaging: 'Signal / WhatsApp / other',
  other: 'Other',
};

// ---- Analytics -----------------------------------------------------------------------
// The stage path used for the conversion funnel (On Hold / Lost are off-path).
export const FUNNEL_STAGES = ['identified', 'reached_out', 'in_conversation', 'qualified', 'loi_discussion', 'loi_negotiating', 'loi_signed'];

export const DATE_RANGES = {
  all: 'All time',
  d30: 'Last 30 days',
  d90: 'Last 90 days',
  quarter: 'This quarter',
  year: 'This year',
  m12: 'Last 12 months',
  custom: 'Custom range…',
};

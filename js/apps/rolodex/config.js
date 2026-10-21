// Rolodex vocabulary: the quick-tap choices offered next to every free-text box.
// Add or rename entries freely; saved records keep whatever they were given.

// How two people know each other (a connection between two cards).
export const RELATIONS = {
  colleague: { label: 'Colleagues', color: '#2563eb' },
  'former-colleague': { label: 'Former colleagues', color: '#60a5fa' },
  friend: { label: 'Friends', color: '#16a34a' },
  family: { label: 'Family', color: '#db2777' },
  partner: { label: 'Partners / spouses', color: '#e11d48' },
  classmate: { label: 'Classmates', color: '#9333ea' },
  'boss-report': { label: 'Manager / report', color: '#0891b2' },
  client: { label: 'Client / vendor', color: '#ca8a04' },
  investor: { label: 'Investor / founder', color: '#ea580c' },
  mentor: { label: 'Mentor / mentee', color: '#0d9488' },
  cofounder: { label: 'Co-founders', color: '#b45309' },
  neighbor: { label: 'Neighbours', color: '#65a30d' },
  community: { label: 'Same club / community', color: '#7c3aed' },
  unknown: { label: 'Unknown', color: '#78716c' },
};

export const WHERE_MET = ['Work', 'Conference', 'Event / meetup', 'School', 'Through a friend', 'Online', 'LinkedIn', 'Neighbourhood', 'Club / gym', 'Travel', 'Family'];

export const HOPING_FOR = ['Friendship', 'Mentorship', 'Advice', 'Introductions', 'Job / referral', 'Hiring them', 'Customer', 'Partnership', 'Investment', 'Collaboration', 'Stay in touch'];

export const CLOSENESS = {
  '': 'Not set',
  acquaintance: 'Acquaintance',
  contact: 'Professional contact',
  friend: 'Friend',
  close: 'Close friend',
  inner: 'Inner circle',
};

// Follow-up cadence: after you log a touch, the next follow-up is this many days out.
export const CADENCES = [
  [0, 'No repeat'],
  [7, 'Weekly'],
  [14, 'Every 2 weeks'],
  [30, 'Monthly'],
  [90, 'Quarterly'],
  [182, 'Twice a year'],
  [365, 'Yearly'],
];

// Snooze choices on the follow-up list, in days.
export const SNOOZES = [[3, '3 days'], [7, '1 week'], [30, '1 month']];

// How far ahead the follow-up list looks for "coming up".
export const UPCOMING_DAYS = 14;

// The rolodex's own name for you in the connection web.
export const ME = 'me';

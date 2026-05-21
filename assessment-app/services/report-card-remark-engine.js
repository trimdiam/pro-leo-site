// ── Report Card Remark Engine ─────────────────────────────────────────────────
// Generates warm, human-like teacher remarks from student criteria data.
// No external API — remarks are assembled from grade-aware phrase banks.

// ── Phrase banks ──────────────────────────────────────────────────────────────

const OPENERS = {
  Adv:  [
    '{name} has had an outstanding term, consistently demonstrating exceptional dedication across all areas.',
    '{name} has shown remarkable commitment this term, achieving excellent results throughout.',
    'It has been a pleasure to watch {name} excel this term with such admirable effort and focus.'
  ],
  Prof: [
    '{name} has had a very good term, showing solid understanding and consistent effort.',
    '{name} has worked diligently this term and made commendable progress in most areas.',
    'This term, {name} has demonstrated a good level of understanding and steady commitment.'
  ],
  Dev:  [
    '{name} has made satisfactory progress this term and is steadily building confidence.',
    '{name} has shown growing effort this term, with clear improvement in several areas.',
    'This term, {name} has worked to develop key skills and is making positive strides forward.'
  ],
  Beg:  [
    '{name} has been working hard this term, and with continued support, real progress is within reach.',
    'This term, {name} has shown a willingness to try, which is a wonderful foundation to build on.',
    '{name} has taken important steps this term, and we are encouraged by the effort being shown.'
  ],
  NY:   [
    '{name} is at an early stage of the learning journey this term, and we believe in their potential.',
    'This term, {name} has been finding their footing, and we are here to support every step forward.',
    '{name} is beginning to engage with the curriculum and has room to grow with encouragement.'
  ],
  Ex:   [
    '{name} has participated in class this term and we look forward to seeing continued engagement.',
    'We have enjoyed having {name} in class this term and encourage greater involvement going forward.'
  ]
};

const STRENGTH_PHRASES = [
  '{subject} is clearly a strong area for {name}.',
  '{name} has shown particular ability in {subject}.',
  'A real strength has been {subject}, where {name} has shone brightly.',
  '{name} consistently performs well in {subject}.'
];

const IMPROVE_PHRASES = [
  'Continued focus on {subject} will help unlock even greater potential.',
  'We encourage {name} to give a little extra attention to {subject} in the coming term.',
  'With more practice in {subject}, {name} will see excellent improvement.',
  'Dedicating time to {subject} will make a meaningful difference in the next term.'
];

const CLOSERS_IMPROVING = [
  'Keep up this wonderful momentum!',
  'We are proud of this progress and look forward to even greater things ahead.',
  'The hard work is clearly paying off — keep it up!'
];

const CLOSERS_STABLE = [
  'Keep working with this same dedication.',
  'With continued effort, great things are ahead.',
  'We look forward to seeing this growth continue.'
];

const CLOSERS_DECLINING = [
  'We believe in {name} and know a strong comeback is possible.',
  'With renewed focus and effort, next term can be even better.',
  'We encourage {name} to approach the next term with fresh energy and determination.'
];

const ATTENDANCE_NOTE = ' Regular attendance will also play an important role in future progress.';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

function gradeTier(gradeCode) {
  const order = ['NY', 'Beg', 'Dev', 'Prof', 'Adv', 'Ex'];
  return order.indexOf(gradeCode);
}

// ── Term remark ───────────────────────────────────────────────────────────────

/**
 * Generates a warm teacher remark from student criteria performance data.
 *
 * @param {object} profile
 * @param {string} profile.firstName
 * @param {string} profile.className
 * @param {string} profile.overallGrade      - e.g. "Prof"
 * @param {string} profile.overallLabel      - e.g. "Proficient"
 * @param {string} profile.strongestSubject  - subject name
 * @param {string} profile.weakestSubject    - subject name
 * @param {string[]} profile.improvementAreas
 * @param {string}  profile.trendDirection   - "improving"|"declining"|"stable"
 * @param {boolean} profile.attendanceRisk
 * @returns {string}
 */
export function generateTeacherRemark(profile) {
  const name    = profile.firstName || 'The student';
  const grade   = profile.overallGrade || 'Dev';
  const tier    = ['Adv', 'Prof', 'Dev', 'Beg', 'NY', 'Ex'].includes(grade) ? grade : 'Dev';
  const openers = OPENERS[tier] || OPENERS.Dev;

  const opener = fill(pick(openers), { name });

  const strengthPart = profile.strongestSubject
    ? fill(pick(STRENGTH_PHRASES), { name, subject: profile.strongestSubject })
    : '';

  const improvePart = profile.weakestSubject && profile.weakestSubject !== profile.strongestSubject
    ? fill(pick(IMPROVE_PHRASES), { name, subject: profile.weakestSubject })
    : profile.improvementAreas?.length > 0
      ? fill(pick(IMPROVE_PHRASES), { name, subject: profile.improvementAreas[0].split(' in ')[0] })
      : '';

  let closer = '';
  if (profile.trendDirection === 'improving') {
    closer = pick(CLOSERS_IMPROVING);
  } else if (profile.trendDirection === 'declining') {
    closer = fill(pick(CLOSERS_DECLINING), { name });
  } else {
    closer = pick(CLOSERS_STABLE);
  }

  const attendancePart = profile.attendanceRisk ? ATTENDANCE_NOTE : '';

  const parts = [opener, strengthPart, improvePart, closer + attendancePart].filter(Boolean);
  return parts.join(' ');
}

// ── Annual remark ─────────────────────────────────────────────────────────────

/**
 * Generates an annual summary teacher remark from both half-yearly profiles.
 *
 * @param {object} annualProfile
 * @param {string} annualProfile.firstName
 * @param {string} annualProfile.className
 * @param {string} annualProfile.hy1Grade
 * @param {string} annualProfile.hy2Grade
 * @param {string} annualProfile.annualGrade
 * @param {string} annualProfile.strongestSubject
 * @param {string} annualProfile.mostImprovedArea
 * @param {string} annualProfile.persistentWeakArea
 * @param {string} annualProfile.trendDirection
 * @param {string|null} annualProfile.promotedToClass
 * @returns {string}
 */
export function generateAnnualRemark(annualProfile) {
  const name  = annualProfile.firstName || 'The student';
  const grade = annualProfile.annualGrade || 'Dev';
  const tier  = ['Adv', 'Prof', 'Dev', 'Beg', 'NY', 'Ex'].includes(grade) ? grade : 'Dev';

  // Detect if student improved between HY1 and HY2
  const hy1Tier = gradeTier(annualProfile.hy1Grade || 'Dev');
  const hy2Tier = gradeTier(annualProfile.hy2Grade || 'Dev');
  const improved = hy2Tier > hy1Tier;

  const opener = fill(pick(OPENERS[tier] || OPENERS.Dev), { name });

  const strengthPart = annualProfile.strongestSubject
    ? fill(pick(STRENGTH_PHRASES), { name, subject: annualProfile.strongestSubject })
    : '';

  const improvedPart = annualProfile.mostImprovedArea && improved
    ? `${name} showed impressive growth in ${annualProfile.mostImprovedArea} over the course of the year.`
    : '';

  const weakPart = annualProfile.persistentWeakArea
    ? fill(pick(IMPROVE_PHRASES), { name, subject: annualProfile.persistentWeakArea })
    : '';

  const promotionPart = annualProfile.promotedToClass
    ? `Congratulations on promotion to ${annualProfile.promotedToClass} — well deserved!`
    : '';

  const closer = improved
    ? pick(CLOSERS_IMPROVING)
    : fill(pick(CLOSERS_STABLE), { name });

  const parts = [opener, strengthPart, improvedPart, weakPart, promotionPart || closer].filter(Boolean);
  return parts.join(' ');
}

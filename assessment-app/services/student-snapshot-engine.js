import { getAttendanceRiskLevel } from './attendance-engine.js';

// Builds the lean, canonical snapshot document written to
// student_profiles/{sanitizedStudentId} in Firestore.
//
// This is the integration contract between assessment-app and pro-leo-site.
// It contains only the fields that a reader needs for a summary view —
// no monthly arrays, no raw mark data, no trend arrays.
//
// The full analytics profile (with monthlyData, subjectAverages, etc.) is
// returned to the assessment-app UI separately and never written to Firestore.
export function buildStudentSnapshot(studentId, profile) {
  const trend         = deriveTrend(profile.monthlyData);
  const { attendanceRisk, attendanceRiskLevel } = deriveAttendance(profile.attendance);
  const { activeAlerts, alertReasons }          = deriveAlerts(profile, attendanceRisk, attendanceRiskLevel);
  const summaryText   = buildSummaryText(profile, trend, attendanceRisk);
  const totalSessions = Array.isArray(profile.monthlyData)
    ? profile.monthlyData.reduce((sum, m) => sum + (m.totalSessions || 0), 0)
    : 0;

  return {
    // ── Identity ─────────────────────────────────────────────────────
    studentId,
    student_id:  studentId,
    full_name:   profile.full_name  || '',
    class:       profile.class      || '',
    roll_no:     profile.roll_no    || '',

    // ── Academic summary ─────────────────────────────────────────────
    overallAverage: profile.averageOverall || 0,
    monthsTracked:  profile.totalMonths    || 0,
    totalSessions,

    // ── Strongest / weakest — only the fields a reader needs ─────────
    strongestSubject: profile.strongestSubject ? {
      subject_id:        profile.strongestSubject.subject_id,
      subject_name:      profile.strongestSubject.subject_name,
      averagePercentage: profile.strongestSubject.averagePercentage
    } : null,

    weakestSubject: profile.weakestSubject ? {
      subject_id:        profile.weakestSubject.subject_id,
      subject_name:      profile.weakestSubject.subject_name,
      averagePercentage: profile.weakestSubject.averagePercentage
    } : null,

    // ── Full subject breakdown ────────────────────────────────────────
    subjectBreakdown: Array.isArray(profile.subjectAverages)
      ? profile.subjectAverages.map(s => ({
          subject_id:        s.subject_id,
          subject_name:      s.subject_name,
          averagePercentage: s.averagePercentage,
          totalSessions:     s.totalSessions || 0
        }))
      : [],

    // ── Monthly trend (last 6 months for chart) ───────────────────────
    monthlyTrend: Array.isArray(profile.monthlyData)
      ? profile.monthlyData.map(m => ({
          month:             m.month,
          overallPercentage: m.overallPercentage,
          totalSessions:     m.totalSessions || 0
        }))
      : [],

    // ── Trend (derived from last two months in monthlyData) ───────────
    trendDirection: trend.direction,
    trendLabel:     trend.label,
    trendDelta:     trend.delta,

    // ── Attendance ────────────────────────────────────────────────────
    attendanceRisk,
    attendanceRiskLevel,

    // ── Alerts ────────────────────────────────────────────────────────
    activeAlerts,
    alertReasons,

    // ── Human-readable summary ────────────────────────────────────────
    summaryText,

    // ── Metadata ──────────────────────────────────────────────────────
    lastUpdated: new Date().toISOString()
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function deriveTrend(monthlyData) {
  if (!Array.isArray(monthlyData) || monthlyData.length < 2) {
    return { direction: 'stable', label: 'Stable', delta: 0 };
  }
  const last = monthlyData[monthlyData.length - 1];
  const prev = monthlyData[monthlyData.length - 2];
  const delta = (last?.overallPercentage ?? 0) - (prev?.overallPercentage ?? 0);
  if (delta >= 5)  return { direction: 'improving', label: 'Improving', delta };
  if (delta <= -5) return { direction: 'declining', label: 'Declining', delta };
  return { direction: 'stable', label: 'Stable', delta };
}

function deriveAttendance(attendance) {
  const rate = attendance?.absenceRate ?? 0;
  const risk = getAttendanceRiskLevel(rate);
  return {
    attendanceRisk:      risk.level === 'high' || risk.level === 'critical',
    attendanceRiskLevel: risk.level
  };
}

function deriveAlerts(profile, attendanceRisk, attendanceRiskLevel) {
  const activeAlerts = [];
  const alertReasons = [];

  if ((profile.averageOverall || 0) < 40) {
    activeAlerts.push('weak_overall');
    alertReasons.push(`Overall average ${profile.averageOverall}% is below 40%`);
  }

  if (Array.isArray(profile.subjectAverages)) {
    profile.subjectAverages
      .filter(s => s.averagePercentage < 40)
      .forEach(s => {
        activeAlerts.push(`weak_subject_${s.subject_id}`);
        alertReasons.push(`${s.subject_name}: ${s.averagePercentage}% (below 40%)`);
      });
  }

  if (attendanceRisk) {
    activeAlerts.push('attendance_risk');
    alertReasons.push(`Attendance risk level: ${attendanceRiskLevel}`);
  }

  return { activeAlerts, alertReasons };
}

function buildSummaryText(profile, trend, attendanceRisk) {
  const avg  = profile.averageOverall || 0;
  const name = profile.full_name || 'This student';

  let perfLabel;
  if (avg >= 75)      perfLabel = 'strong';
  else if (avg >= 60) perfLabel = 'average';
  else if (avg >= 40) perfLabel = 'needs attention';
  else                perfLabel = 'critical';

  let text = `${name} is performing ${perfLabel} with an overall average of ${avg}%.`;

  if (trend.direction === 'improving') {
    text += ` Performance has been improving (+${trend.delta}%).`;
  } else if (trend.direction === 'declining') {
    text += ` Performance has declined by ${Math.abs(trend.delta)}% recently.`;
  }

  if (attendanceRisk) text += ' Attendance requires attention.';

  return text;
}

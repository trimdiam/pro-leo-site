# Report Card System — Workflow

## Overview

The report card system has three layers: **Admin** (creates & releases), **Firestore** (stores & gates), and **Student** (views & downloads).

---

## 1. Admin Side — `report-card-admin.js`

```
Admin logs in
    └── Opens Report Cards section
        ├── Selects class + term (HY1 or HY2)
        ├── Fills in subject scores per criterion
        ├── System computes:
        │     ├── Per-criterion average
        │     ├── Subject average + grade
        │     └── Overall class average + grade
        ├── Admin writes teacher remark
        ├── Saves as DRAFT → Firestore (status: "draft")
        ├── Reviews → LOCK → Firestore (status: "locked")
        └── RELEASE → Firestore (status: "released")
                └── Triggers student visibility
```

**Firestore document saved:**
```
report_cards/{docId}
  ├── studentId      e.g. "SFS/2025/001"
  ├── term           "HY1" or "HY2"
  ├── status         "draft" | "locked" | "released"
  ├── className, rollNo, studentName
  ├── subjects[]
  │     ├── subject_id, subject_name
  │     ├── criteria[]  → { criterion_id, criterion_name, averageScore, grade }
  │     ├── subjectAverage, subjectGrade
  ├── overallGrade, overallAverageScore, overallLabel
  ├── teacherRemark
  ├── attendancePresentDays, attendanceWorkingDays
  └── releasedAt (timestamp)
```

---

## 2. Print Engine — `report-card-print.js`

This is the **core renderer**. It takes raw Firestore data and builds a complete self-contained HTML document.

```
buildPrintableHTML(hy1Card, hy2Card, studentInfo)
    ├── computeAnnualSummary()
    │     ├── Merges HY1 + HY2 subject data
    │     ├── Computes annual averages per criterion & subject
    │     └── Derives overall annual grade + most improved subject
    │
    ├── buildTableRows()
    │     ├── Class I & II (isPrimary = true)
    │     │     └── Groups criteria by category (Work Habits, Writing Skills, etc.)
    │     └── Class III–X
    │           └── Lists individual criteria per subject
    │
    ├── buildPanel()  × 2  (HY1 panel, HY2 panel)
    │     └── Overall grade, average score, strongest subject, remark
    │
    ├── buildAnnualPanel()
    │     └── Annual grade, year average, trend, promotion status
    │
    └── Outputs full <!DOCTYPE html> with:
          ├── Inline BASE_CSS  (flexbox layout, cow-dung palette, Inter font)
          ├── html2pdf CDN script
          ├── rcGoBack()       — back button for all contexts
          ├── rcWaitForReady() — waits for fonts + images before capture
          ├── rcDownloadPDF()  — captures .rc in-document → PDF
          └── <main class="rc"> — the 14×8.5in report card markup
```

**Layout structure of the card:**
```
┌─────────────────────────────────────────────────────┐
│  HEADER  (school name, crest, "Annual Progress Report") │
├─────────────────────────────────────────────────────┤
│  INFO STRIP  (name / class / roll / ID / attendance) │
├──────────────────────────┬──────────────────────────┤
│                          │  HY1 Summary Panel       │
│  MARKS TABLE             ├──────────────────────────┤
│  Subject → Criteria      │  HY2 Summary Panel       │
│  Score + Grade per term  ├──────────────────────────┤
│                          │  Annual Standing Panel   │
├──────────────────────────┴──────────────────────────┤
│  FOOTER  (achievement scale + signature lines)      │
└─────────────────────────────────────────────────────┘
```

---

## 3. Student Side — `report-card-student-view.js`

```
Student logs in → initReportCardStudentView(studentId)
    │
    ├── Queries Firestore:
    │     collection("report_cards")
    │     where studentId == logged-in student
    │     where status == "released"
    │
    ├── Separates results into hy1Card and hy2Card
    │
    └── Renders term cards in #rc-student-root
          │
          ├── Per term card (HY1 / HY2):
          │     ├── Shows overall grade badge
          │     ├── Shows release date
          │     ├── [📄 View Report]  → openPrintWindow(hy1, null, info)
          │     └── [📥 Download PDF] → downloadReportPdfDirect(hy1, null, info)
          │
          └── Bottom section (if any card exists):
                ├── [📄 View Complete Academic Record]    → openPrintWindow(hy1, hy2, info)
                └── [📥 Download Complete Academic Record] → downloadReportPdfDirect(hy1, hy2, info)
```

---

## 4. View Flow — `openPrintWindow()`

```
openPrintWindow(hy1Card, hy2Card, studentInfo)
    │
    ├── buildPrintableHTML() → full HTML string
    │
    ├── Desktop (non-Capacitor)?
    │     └── window.open() new tab → write HTML → done
    │
    └── Mobile / Capacitor APK (or popup blocked)?
          ├── Create fullscreen <div> overlay (z-index: 100000)
          ├── Load HTML into <iframe> via Blob URL
          ├── Student sees 14in card in overlay
          ├── [← Back] button → postMessage("closeReportOverlay")
          │     └── Overlay removed, blob URL revoked
          └── [📥 Download PDF] button → rcDownloadPDF()
                └── (see Download Flow below)
```

---

## 5. Download Flow — `downloadReportPdfDirect()`

```
downloadReportPdfDirect(hy1Card, hy2Card, studentInfo)
    │
    ├── buildPrintableHTML() → full HTML string
    ├── Create off-screen <div> (left: -99999px, width: 1400px)
    ├── Load HTML into hidden <iframe> via Blob URL
    ├── Wait for iframe.onload (20s timeout)
    ├── Poll until fwin.rcDownloadPDF is defined (200 polls × 50ms)
    │
    └── fwin.rcDownloadPDF()  ← runs INSIDE the hidden iframe
          │
          ├── rcWaitForReady() — wait for fonts + images
          ├── html2canvas captures document.querySelector('.rc')
          │     └── IN THE SAME DOCUMENT (no cross-frame issues)
          │     └── Options: scale:2, width:1344, height:816
          ├── jsPDF: 14×8.5in landscape, JPEG image fill
          │
          └── Save priority:
                1. Capacitor Filesystem (APK) via postMessage bridge
                      └── parent.postMessage("savePdfRequest") →
                          handleSavePdfRequest() in student-view.js →
                          Capacitor.Plugins.Filesystem.writeFile()
                2. Web Share API (modern mobile browsers)
                3. Anchor <a download> (desktop browsers)
```

---

## 6. PDF Save Bridge (APK only)

```
Hidden iframe
    └── postMessage({ type: "savePdfRequest", base64, filename })
          ↓
Portal window (report-card-student-view.js)
    └── handleSavePdfRequest()
          ├── Checks Capacitor.Plugins.Filesystem exists
          ├── writeFile({ path: filename, data: base64, directory: "DOCUMENTS" })
          └── postMessage({ type: "pdfSaveResult", ok: true/false })
                ↓
Hidden iframe
    └── Shows alert("Saved: filename.pdf") or falls through to Web Share
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| All CSS Grid → Flexbox | `html2pdf 0.10.1` bundles `html2canvas v1.0.0-alpha.12` (2018) — no CSS Grid support |
| `viewport width=1400` | Forces report to render at desktop width on mobile WebView |
| In-document PDF capture | Cross-frame `html2canvas` on Capacitor WebView produces empty canvases |
| Off-screen 1400px iframe | Ensures desktop layout for PDF without showing UI to user |
| Blob URL + overlay iframe | `window.open()` unreliable in Capacitor Android WebView |
| `justify-content: safe center` | Prevents Subject column from being clipped on narrow viewports |

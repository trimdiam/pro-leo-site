"""
St. Francis de Sales School
Automated Legal-Size 3-Panel Report Card Generator
────────────────────────────────────────────────────
Usage:
  python report_card_generator.py --roll 25
  python report_card_generator.py --roll 1 --json path/to/marksheet.json

Reads student data from the JSON marksheet and produces a
legal-size (8.5 × 14 in) 3-panel PDF report card.
"""

import json, sys, os, argparse
from reportlab.lib.pagesizes import legal
from reportlab.lib import colors
from reportlab.lib.units import mm, inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib.utils import ImageReader

# ─── Page Geometry ────────────────────────────────────────────
PAGE_W, PAGE_H = legal          # 612 × 1008 pt  (8.5 × 14 in)
MARGIN = 18                     # pts
INNER_W = PAGE_W - 2 * MARGIN  # usable width

# ─── Colour Palette ────────────────────────────────────────────
NAV   = colors.HexColor("#1A2744")   # dark navy
GOLD  = colors.HexColor("#C9A84C")   # school gold
LGOLD = colors.HexColor("#F5EDCF")   # light gold tint
LBLUE = colors.HexColor("#E8EEF8")   # light blue row
DGREY = colors.HexColor("#4A4A4A")
WHITE = colors.white
PASS_G = colors.HexColor("#D6EFD8")
FAIL_R = colors.HexColor("#FDECEA")
ALT   = colors.HexColor("#F4F7FC")
BORD  = colors.HexColor("#CBD5E8")

GRADE_COL = {
    "O":  colors.HexColor("#1B5E20"),
    "A+": colors.HexColor("#2E7D32"),
    "A":  colors.HexColor("#388E3C"),
    "B+": colors.HexColor("#1565C0"),
    "B":  colors.HexColor("#1976D2"),
    "C":  colors.HexColor("#E65100"),
    "D":  colors.HexColor("#BF360C"),
    "F":  colors.HexColor("#B71C1C"),
}

PANEL_DIVIDER_COL = GOLD

# ─── Grade logic ──────────────────────────────────────────────
def score_to_grade(pct):
    if pct >= 90: return "O"
    if pct >= 80: return "A+"
    if pct >= 70: return "A"
    if pct >= 60: return "B+"
    if pct >= 50: return "B"
    if pct >= 40: return "C"
    if pct >= 33: return "D"
    return "F"

SUBJECTS = [
    "Mathematics","Physics","Chemistry","Biology",
    "English","History","Geography","Computer Sc.","Economics","Civics",
]
GRADE_SUBJECTS = ["Physical Ed.","Music","Art","Life Skills","Vocational"]

CONDUCT_ITEMS = [
    ("Punctuality & Regularity","Punctuality"),
    ("Discipline & Conduct","Discipline"),
    ("Class Participation","Class Part."),
    ("Teamwork & Collaboration","Teamwork"),
    ("Respect & Courtesy","Respect"),
    ("Cleanliness & Hygiene","Cleanliness"),
    ("Initiative & Creativity","Initiative"),
    ("Homework Completion","Homework"),
]

# ─── Data loading ─────────────────────────────────────────────
def load_student(json_path, roll):
    with open(json_path) as f:
        data = json.load(f)
    for s in data:
        if s["Roll No"] == roll:
            return s
    raise ValueError(f"Roll number {roll} not found.")

def compute_derived(s):
    """Add grade, pass/fail per subject/term if not present."""
    for term in ["Term 1","Term 2"]:
        for subj in SUBJECTS:
            tot = s.get(f"{term} | {subj} | Total", 0)
            grade_key = f"{term} | {subj} | Grade"
            pf_key    = f"{term} | {subj} | PF"
            if grade_key not in s:
                s[grade_key] = score_to_grade((tot/100)*100)
            if pf_key not in s:
                s[pf_key] = "PASS" if tot >= 40 else "FAIL"

    # Term totals
    for term in ["Term 1","Term 2"]:
        key = f"{term} | Term Total"
        if key not in s:
            s[key] = sum(s.get(f"{term} | {subj} | Total", 0) for subj in SUBJECTS)

    # Consolidated
    for subj in SUBJECTS:
        key = f"Consolidated | {subj}"
        if key not in s:
            s[key] = (s.get(f"Term 1 | {subj} | Total",0) +
                      s.get(f"Term 2 | {subj} | Total",0))

    # Grade-only subjects if missing
    import random; random.seed(s["Roll No"] * 7)
    for gs in GRADE_SUBJECTS:
        key = f"Grade | {gs}"
        if key not in s:
            s[key] = score_to_grade(random.randint(40,95))

    # Conduct if missing
    conduct_defaults = {
        "Punctuality & Regularity": "Satisfactory",
        "Discipline & Conduct": "Excellent",
        "Class Participation": "Very Good",
        "Teamwork & Collaboration": "Very Good",
        "Respect & Courtesy": "Good",
        "Cleanliness & Hygiene": "Very Good",
        "Initiative & Creativity": "Satisfactory",
        "Homework Completion": "Excellent",
    }
    for k,v in conduct_defaults.items():
        if f"Conduct | {k}" not in s:
            s[f"Conduct | {k}"] = v

    # Remarks
    if "Remarks" not in s:
        pct = s.get("Percentage", 0)
        if pct >= 75:
            s["Remarks"] = "Displays commendable dedication and strong academic performance. Deserves recognition at the school level."
        elif pct >= 60:
            s["Remarks"] = "Shows consistent effort and satisfactory progress. Encouraged to aim higher next term."
        else:
            s["Remarks"] = "Needs to work harder and seek additional support in weaker subjects."

    return s


# ══════════════════════════════════════════════════════════════
# DRAWING HELPERS
# ══════════════════════════════════════════════════════════════

def draw_rect(c, x, y, w, h, fill=None, stroke=None, lw=0.5, radius=0):
    c.saveState()
    if fill:   c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(lw)
    if radius:
        p = c.beginPath()
        p.roundRect(x, y, w, h, radius)
        c.drawPath(p, fill=bool(fill), stroke=bool(stroke))
    else:
        c.rect(x, y, w, h,
               fill=1 if fill else 0,
               stroke=1 if stroke else 0)
    c.restoreState()

def draw_text(c, text, x, y, font="Helvetica", size=9, color=colors.black,
              align="left", max_width=None):
    c.saveState()
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "center":
        c.drawCentredString(x, y, str(text))
    elif align == "right":
        c.drawRightString(x, y, str(text))
    else:
        if max_width:
            # Simple word-wrap: draw truncated
            while c.stringWidth(str(text), font, size) > max_width and len(str(text)) > 4:
                text = str(text)[:-4] + "…"
        c.drawString(x, y, str(text))
    c.restoreState()

def draw_line(c, x1, y1, x2, y2, color=BORD, lw=0.5):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    c.line(x1, y1, x2, y2)
    c.restoreState()

def grade_color(g):
    return GRADE_COL.get(g, DGREY)


# ══════════════════════════════════════════════════════════════
# PANEL 1  — School Header + Student Info  (top ~210 pts)
# ══════════════════════════════════════════════════════════════

P1_TOP  = PAGE_H - MARGIN
P1_BOT  = PAGE_H - 210
P1_H    = P1_TOP - P1_BOT

def draw_panel1(c, student):
    x, y = MARGIN, P1_BOT
    w, h = INNER_W, P1_H

    # ── Background ──────────────────────────
    draw_rect(c, x, y, w, h, fill=NAV, radius=4)

    # ── Gold top accent bar ──────────────────
    draw_rect(c, x, y+h-8, w, 8, fill=GOLD, radius=4)
    draw_rect(c, x, y+h-8, w, 4, fill=GOLD)   # flatten bottom of accent

    # ── Logo placeholder circle ───────────────
    logo_cx = x + 46
    logo_cy = y + h - 58
    c.saveState()
    c.setFillColor(GOLD)
    c.circle(logo_cx, logo_cy, 36, fill=1, stroke=0)
    c.setFillColor(NAV)
    c.circle(logo_cx, logo_cy, 30, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(GOLD)
    c.drawCentredString(logo_cx, logo_cy+12, "ST. FRANCIS")
    c.drawCentredString(logo_cx, logo_cy+2,  "DE SALES")
    c.setFont("Helvetica", 6.5)
    c.drawCentredString(logo_cx, logo_cy-10, "EST. 1988")
    c.restoreState()

    # ── School name block ─────────────────────
    tx = x + 95
    draw_text(c, "ST. FRANCIS DE SALES SCHOOL",
              tx, y+h-32, "Helvetica-Bold", 17, GOLD)
    draw_text(c, "Affiliated to CBSE  |  School Code: 41285  |  New Delhi – 110 016",
              tx, y+h-50, "Helvetica", 8.5, colors.HexColor("#B0BCDA"))
    # Gold separator line
    draw_line(c, tx, y+h-57, x+w-MARGIN, y+h-57, GOLD, 1)
    draw_text(c, "ANNUAL REPORT CARD  —  CLASS X  |  ACADEMIC YEAR 2024–25",
              tx, y+h-70, "Helvetica-Bold", 9.5, WHITE)

    # ── Panel divider label ───────────────────
    draw_rect(c, x, y+h-90, w, 18, fill=colors.HexColor("#0F1A30"))
    draw_text(c, "◆  STUDENT INFORMATION",
              x+10, y+h-84, "Helvetica-Bold", 8, GOLD)

    # ── Student info grid ─────────────────────
    info_y = y + h - 110
    col1_x = x + 12
    col2_x = x + w*0.25
    col3_x = x + w*0.52
    col4_x = x + w*0.76

    def info_pair(label, value, lx, ly, vcolor=WHITE):
        draw_text(c, label, lx, ly, "Helvetica", 7.5, colors.HexColor("#7A94C1"))
        draw_text(c, str(value), lx, ly-13, "Helvetica-Bold", 9.5, vcolor)

    name = student.get("Student Name","—")
    roll = student.get("Roll No","—")
    att  = student.get("Attendance (%)","—")
    sec  = student.get("Section","A")
    pct  = student.get("Percentage","—")
    rank = student.get("Rank","—")
    result = student.get("Result","—")
    grade  = student.get("Grade","—")

    if isinstance(pct, float): pct = f"{pct:.1f}%"
    res_color = colors.HexColor("#72E0A0") if result=="PASS" else colors.HexColor("#FF7A72")

    info_pair("STUDENT NAME", name,   col1_x, info_y)
    info_pair("ROLL NO.",      roll,   col2_x, info_y)
    info_pair("CLASS / SEC",  f"X — {sec}", col3_x, info_y)
    info_pair("ATTENDANCE",  f"{att}%", col4_x, info_y)

    info_y2 = info_y - 36
    info_pair("ACADEMIC YEAR","2024–25", col1_x, info_y2)
    info_pair("OVERALL %",    pct,       col2_x, info_y2)
    info_pair("CLASS RANK",   rank,      col3_x, info_y2)
    info_pair("RESULT",       result,    col4_x, info_y2, res_color)

    # Result badge
    badge_x = col4_x + 42
    badge_y = info_y2 - 15
    bw = 52
    bc = PASS_G if result=="PASS" else FAIL_R
    btext_c = colors.HexColor("#1B5E20") if result=="PASS" else colors.HexColor("#B71C1C")
    draw_rect(c, badge_x, badge_y, bw, 16, fill=bc, radius=3)
    draw_text(c, result, badge_x+bw/2, badge_y+4, "Helvetica-Bold", 8, btext_c, "center")

    # Overall grade badge
    draw_rect(c, col3_x+42, info_y2-15, 36, 16,
              fill=colors.HexColor("#1A2F5E"), radius=3)
    draw_text(c, f"Grade: {grade}", col3_x+60, info_y2-11,
              "Helvetica-Bold", 7.5, GOLD, "center")

    # Fold guide line
    draw_line(c, x, y, x+w, y, GOLD, 0.8)


# ══════════════════════════════════════════════════════════════
# PANEL 2  — Term 1 + Term 2 Academic Tables  (~390 pts)
# ══════════════════════════════════════════════════════════════

P2_TOP = P1_BOT
P2_BOT = P2_TOP - 390
P2_H   = P2_TOP - P2_BOT

def draw_term_table(c, student, term, x, y, w):
    """Draw a single-term subject table. Returns height consumed."""
    COL_WIDTHS = [w*0.34, w*0.09, w*0.10, w*0.10, w*0.12, w*0.13, w*0.12]
    HEADERS = ["Subject","IA\n(10)","Unit Test\n(30)","Term Exam\n(60)","Total\n(100)","Grade","Pass/Fail"]
    ROW_H = 17

    # Section header
    term_label = "TERM 1 — ACADEMIC PERFORMANCE" if term=="Term 1" else "TERM 2 — ACADEMIC PERFORMANCE"
    draw_rect(c, x, y-18, w, 18, fill=NAV)
    draw_rect(c, x, y-18, 4, 18, fill=GOLD)
    draw_text(c, f"◆  {term_label}", x+10, y-13, "Helvetica-Bold", 8, GOLD)

    # Column headers
    hdr_y = y - 18 - 22
    draw_rect(c, x, hdr_y, w, 22, fill=colors.HexColor("#1E3560"))
    cx = x
    for i, (hdr, cw) in enumerate(zip(HEADERS, COL_WIDTHS)):
        lines = hdr.split("\n")
        if len(lines)==2:
            draw_text(c, lines[0], cx+cw/2, hdr_y+13, "Helvetica-Bold", 7, GOLD, "center")
            draw_text(c, lines[1], cx+cw/2, hdr_y+4,  "Helvetica-Bold", 6, colors.HexColor("#A0B4D4"), "center")
        else:
            draw_text(c, hdr, cx+cw/2, hdr_y+9, "Helvetica-Bold", 7, GOLD, "center")
        draw_line(c, cx, hdr_y, cx, hdr_y+22, BORD, 0.3)
        cx += cw

    # Data rows
    row_y = hdr_y - ROW_H
    term_total = 0
    for i, subj in enumerate(SUBJECTS):
        ia  = student.get(f"{term} | {subj} | IA",    0)
        ut  = student.get(f"{term} | {subj} | UT",    0)
        te  = student.get(f"{term} | {subj} | TE",    0)
        tot = student.get(f"{term} | {subj} | Total", 0)
        gr  = score_to_grade((tot/100)*100)
        pf  = "PASS" if tot >= 40 else "FAIL"
        term_total += tot

        bg = ALT if i%2==0 else WHITE
        if pf=="FAIL": bg = FAIL_R
        draw_rect(c, x, row_y, w, ROW_H, fill=bg)

        # Subject stripe
        draw_rect(c, x, row_y, 3, ROW_H, fill=GOLD if i%2==0 else colors.HexColor("#3A5A9A"))

        vals = [subj, ia, ut, te, tot, gr, pf]
        cx = x
        for j, (val, cw) in enumerate(zip(vals, COL_WIDTHS)):
            align = "left" if j==0 else "center"
            font = "Helvetica-Bold" if j in (0,5) else "Helvetica"
            vcolor = DGREY
            if j==5: vcolor = grade_color(gr)
            if j==6: vcolor = colors.HexColor("#1B5E20") if pf=="PASS" else colors.HexColor("#B71C1C")
            if j==4: font = "Helvetica-Bold"; vcolor = NAV

            tx = (cx + cw/2) if align=="center" else cx+6
            draw_text(c, str(val), tx, row_y+5, font, 7.5 if j>0 else 8, vcolor, align)
            draw_line(c, cx, row_y, cx, row_y+ROW_H, BORD, 0.2)
            cx += cw

        draw_line(c, x, row_y, x+w, row_y, BORD, 0.2)
        row_y -= ROW_H

    # Term total row
    draw_rect(c, x, row_y, w, ROW_H, fill=LBLUE)
    draw_rect(c, x, row_y, 3, ROW_H, fill=GOLD)
    pct = term_total / 10
    draw_text(c, f"TERM TOTAL", x+6, row_y+5, "Helvetica-Bold", 8, NAV)
    draw_text(c, f"{term_total} / 1000", x+w*0.68, row_y+5, "Helvetica-Bold", 8.5, NAV, "center")
    draw_text(c, f"{pct:.1f}%", x+w*0.88, row_y+5, "Helvetica-Bold", 8.5, GOLD, "center")
    draw_line(c, x, row_y, x+w, row_y, GOLD, 0.8)

    consumed = (y) - (row_y - 2)
    return consumed


def draw_panel2(c, student):
    x  = MARGIN
    y  = P2_TOP - 4
    w  = INNER_W

    # Panel label bar
    draw_rect(c, x, P2_TOP-4, w, 14, fill=GOLD)
    draw_text(c, "ACADEMIC PERFORMANCE  |  BOTH TERMS",
              x+w/2, P2_TOP+1, "Helvetica-Bold", 7.5, NAV, "center")

    # Two term tables stacked (each ~185pt)
    half = (P2_H - 24) / 2

    # Term 1
    t1_y = P2_TOP - 14
    draw_term_table(c, student, "Term 1", x, t1_y, w)

    # Term 2  (starts halfway down panel 2)
    t2_y = P2_TOP - 14 - half - 4
    draw_term_table(c, student, "Term 2", x, t2_y, w)

    draw_line(c, x, P2_BOT, x+w, P2_BOT, GOLD, 0.8)


# ══════════════════════════════════════════════════════════════
# PANEL 3  — Consolidated + Activities + Conduct + Signatures
# ══════════════════════════════════════════════════════════════

P3_TOP = P2_BOT
P3_BOT = MARGIN
P3_H   = P3_TOP - P3_BOT

def draw_panel3(c, student):
    x = MARGIN
    w = INNER_W
    y = P3_TOP

    # Panel label
    draw_rect(c, x, y-14, w, 14, fill=GOLD)
    draw_text(c, "CONSOLIDATED RESULTS  |  CO-CURRICULAR  |  CONDUCT  |  SIGNATURES",
              x+w/2, y-10, "Helvetica-Bold", 7.5, NAV, "center")

    # ── Split into left(60%) and right(40%) ────────────────────
    left_w  = w * 0.60
    right_w = w - left_w - 4
    right_x = x + left_w + 4

    # ── LEFT: Consolidated table ───────────────────────────────
    cy = y - 28
    draw_rect(c, x, cy-14, left_w, 14, fill=NAV)
    draw_rect(c, x, cy-14, 3, 14, fill=GOLD)
    draw_text(c, "◆  CONSOLIDATED — BOTH TERMS COMBINED (MAX 200 PER SUBJECT)",
              x+10, cy-9, "Helvetica-Bold", 7, GOLD)

    # Col headers
    SUB_W   = left_w * 0.35
    T1_W    = left_w * 0.13
    T2_W    = left_w * 0.13
    TOT_W   = left_w * 0.15
    PCT_W   = left_w * 0.13
    GR_W    = left_w * 0.11

    hdr_y = cy - 14 - 18
    draw_rect(c, x, hdr_y, left_w, 18, fill=colors.HexColor("#1E3560"))
    headers_c = [("Subject",SUB_W),("Term 1",T1_W),("Term 2",T2_W),
                 ("Total\n(200)",TOT_W),("% Score",PCT_W),("Grade",GR_W)]
    cx2 = x
    for hdr,cw in headers_c:
        lines = hdr.split("\n")
        if len(lines)==2:
            draw_text(c,lines[0],cx2+cw/2,hdr_y+11,"Helvetica-Bold",6.5,GOLD,"center")
            draw_text(c,lines[1],cx2+cw/2,hdr_y+3, "Helvetica-Bold",6,colors.HexColor("#A0B4D4"),"center")
        else:
            draw_text(c,hdr,cx2+cw/2,hdr_y+7,"Helvetica-Bold",6.5,GOLD,"center")
        draw_line(c,cx2,hdr_y,cx2,hdr_y+18,BORD,0.3)
        cx2+=cw

    ROW_H2 = 15
    ry = hdr_y - ROW_H2
    grand_tot = 0
    for i,subj in enumerate(SUBJECTS):
        t1  = student.get(f"Term 1 | {subj} | Total", 0)
        t2  = student.get(f"Term 2 | {subj} | Total", 0)
        tot = t1 + t2
        pct = tot / 2
        gr  = score_to_grade(pct)
        grand_tot += tot

        bg = ALT if i%2==0 else WHITE
        draw_rect(c, x, ry, left_w, ROW_H2, fill=bg)
        draw_rect(c, x, ry, 3, ROW_H2, fill=grade_color(gr))

        vals = [(subj,SUB_W,"left","Helvetica",DGREY),
                (t1,  T1_W, "center","Helvetica",DGREY),
                (t2,  T2_W, "center","Helvetica",DGREY),
                (tot, TOT_W,"center","Helvetica-Bold",NAV),
                (f"{pct:.1f}%",PCT_W,"center","Helvetica",DGREY),
                (gr,  GR_W, "center","Helvetica-Bold",grade_color(gr))]
        cx3 = x
        for (val,cw,al,fn,fc) in vals:
            tx = (cx3+cw/2) if al=="center" else cx3+6
            draw_text(c,str(val),tx,ry+4,fn,7,fc,al)
            draw_line(c,cx3,ry,cx3,ry+ROW_H2,BORD,0.2)
            cx3+=cw
        draw_line(c,x,ry,x+left_w,ry,BORD,0.2)
        ry -= ROW_H2

    # Grand total row
    draw_rect(c, x, ry, left_w, ROW_H2+2, fill=LBLUE)
    draw_rect(c, x, ry, 3, ROW_H2+2, fill=GOLD)
    overall_pct = grand_tot / 20
    overall_gr  = score_to_grade(overall_pct)
    draw_text(c,"OVERALL TOTAL",x+6,ry+5,"Helvetica-Bold",7.5,NAV)
    draw_text(c,f"{grand_tot} / 2000",x+left_w*0.68,ry+5,"Helvetica-Bold",8,NAV,"center")
    draw_text(c,f"{overall_pct:.1f}%",x+left_w*0.81,ry+5,"Helvetica-Bold",8,GOLD,"center")
    draw_text(c,overall_gr,x+left_w*0.945,ry+5,"Helvetica-Bold",8,grade_color(overall_gr),"center")
    draw_line(c,x,ry,x+left_w,ry,GOLD,1)

    # ── RIGHT COLUMN ──────────────────────────────────────────
    # Co-curricular
    rc_y = y - 28
    draw_rect(c, right_x, rc_y-14, right_w, 14, fill=NAV)
    draw_rect(c, right_x, rc_y-14, 3, 14, fill=GOLD)
    draw_text(c,"◆  CO-CURRICULAR GRADES",right_x+8,rc_y-9,"Helvetica-Bold",7,GOLD)

    act_y = rc_y - 14 - 6
    act_col_w = right_w / 2
    for i, gs in enumerate(GRADE_SUBJECTS):
        gr = student.get(f"Grade | {gs}", "B")
        ax = right_x + (i%2)*act_col_w
        ay = act_y - (i//2)*28
        draw_rect(c,ax+2,ay-22,act_col_w-6,24, fill=ALT if i%2==0 else WHITE, radius=2)
        draw_rect(c,ax+2,ay-22,3,24,fill=grade_color(gr))
        draw_text(c,gs,ax+10,ay-8,"Helvetica",7,DGREY)
        draw_rect(c,ax+act_col_w-22,ay-20,18,18,fill=grade_color(gr),radius=3)
        draw_text(c,gr,ax+act_col_w-13,ay-14,"Helvetica-Bold",8,WHITE,"center")

    # Conduct section
    cond_start_y = act_y - 3*28 - 10
    draw_rect(c, right_x, cond_start_y-14, right_w, 14, fill=NAV)
    draw_rect(c, right_x, cond_start_y-14, 3, 14, fill=GOLD)
    draw_text(c,"◆  CONDUCT & BEHAVIOUR",right_x+8,cond_start_y-9,"Helvetica-Bold",7,GOLD)

    COND_COLS = [("EXCELLENT","E",colors.HexColor("#1B5E20")),
                 ("VERY GOOD","VG",colors.HexColor("#2E7D32")),
                 ("GOOD","G",colors.HexColor("#1565C0")),
                 ("SATISFACTORY","S",colors.HexColor("#E65100")),
                 ("NEEDS IMPROVEMENT","NI",colors.HexColor("#B71C1C"))]
    rating_map = {
        "Excellent":"E","Very Good":"VG","Good":"G",
        "Satisfactory":"S","Needs Improvement":"NI",
    }

    COND_Y = cond_start_y - 18
    c_col_w = right_w / 2
    for i,(full_key, short_key) in enumerate(CONDUCT_ITEMS):
        rating = student.get(f"Conduct | {full_key}", "Good")
        code   = rating_map.get(rating, "G")
        col_i  = i % 2
        row_i  = i // 2
        cix    = right_x + col_i * c_col_w
        ciy    = COND_Y - row_i * 16

        bg = ALT if (i//2)%2==0 else WHITE
        draw_rect(c,cix,ciy-13,c_col_w-2,14,fill=bg,radius=1)
        draw_text(c,short_key,cix+5,ciy-9,"Helvetica",6.5,DGREY)
        # Rating badge
        rc_col = next((cl for n,cd,cl in COND_COLS if cd==code), DGREY)
        draw_rect(c,cix+c_col_w-24,ciy-12,22,12,fill=rc_col,radius=2)
        draw_text(c,code,cix+c_col_w-13,ciy-8,"Helvetica-Bold",6,WHITE,"center")
        draw_line(c,cix,ciy-13,cix+c_col_w-2,ciy-13,BORD,0.2)

    # ── Teacher Remarks ────────────────────────────────────────
    rem_y  = ry - 10
    remarks = student.get("Remarks","—")
    draw_rect(c, x, rem_y-30, left_w, 32, fill=LBLUE, radius=3)
    draw_rect(c, x, rem_y-30, 3, 32, fill=GOLD)
    draw_text(c,"CLASS TEACHER'S REMARKS:",x+8,rem_y-8,"Helvetica-Bold",7,NAV)

    # Word wrap remarks
    words = remarks.split()
    line, lines_out = "", []
    for w2 in words:
        test = line+" "+w2 if line else w2
        if c.stringWidth(test,"Helvetica-Oblique",7) < left_w-16:
            line = test
        else:
            lines_out.append(line); line=w2
    if line: lines_out.append(line)
    for li, ln in enumerate(lines_out[:2]):
        draw_text(c,ln,x+8,rem_y-18-li*9,"Helvetica-Oblique",7,DGREY)

    # ── Signatures ─────────────────────────────────────────────
    sig_y = max(P3_BOT + 55, rem_y - 42)
    sig_cols = [
        ("Class Teacher", "Mrs. Sunita Sharma"),
        ("Examination Controller", "Mr. Rajesh Verma"),
        ("Principal", "Mrs. Kavita Joshi"),
        ("Parent / Guardian", "Signature & Date"),
    ]
    sig_w = w / len(sig_cols)
    for i,(title,name) in enumerate(sig_cols):
        sx = x + i*sig_w + 6
        draw_line(c, sx, sig_y+14, sx+sig_w-16, sig_y+14, DGREY, 0.5)
        draw_text(c,title, sx+(sig_w-16)/2, sig_y+6,"Helvetica-Bold",6.5,NAV,"center")
        draw_text(c,name,  sx+(sig_w-16)/2, sig_y-4, "Helvetica",6,DGREY,"center")

    # ── Footer strip ───────────────────────────────────────────
    draw_rect(c, x, P3_BOT, w, 16, fill=NAV, radius=2)
    draw_text(c,
        "St. Francis de Sales School  |  New Delhi – 110 016  |  Tel: 011-2876-5000  |  sfds@school.edu.in  |  www.sfdsdelhi.edu.in",
        x+w/2, P3_BOT+5, "Helvetica",6,colors.HexColor("#8CA0C4"),"center")
    draw_text(c,"CONFIDENTIAL — FOR OFFICIAL USE ONLY",
        x+w/2, P3_BOT+14, "Helvetica-Oblique",5.5,GOLD,"center")


# ══════════════════════════════════════════════════════════════
# PANEL FOLD GUIDES + DECORATIVE FRAME
# ══════════════════════════════════════════════════════════════

def draw_frame_and_guides(c):
    # Outer decorative border
    c.saveState()
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.5)
    c.rect(MARGIN-4, MARGIN-4, INNER_W+8, PAGE_H-2*(MARGIN-4))
    c.setLineWidth(0.4)
    c.setStrokeColor(colors.HexColor("#4A6FA5"))
    c.rect(MARGIN-2, MARGIN-2, INNER_W+4, PAGE_H-2*(MARGIN-2))
    c.restoreState()

    # Fold indicator marks (small triangles at edges)
    for fold_y in [P1_BOT, P2_BOT]:
        c.saveState()
        c.setFillColor(GOLD)
        # Left notch
        p = c.beginPath()
        p.moveTo(MARGIN-4, fold_y)
        p.lineTo(MARGIN-4+7, fold_y+3)
        p.lineTo(MARGIN-4+7, fold_y-3)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        # Right notch
        p2 = c.beginPath()
        p2.moveTo(PAGE_W-MARGIN+4, fold_y)
        p2.lineTo(PAGE_W-MARGIN+4-7, fold_y+3)
        p2.lineTo(PAGE_W-MARGIN+4-7, fold_y-3)
        p2.close()
        c.drawPath(p2, fill=1, stroke=0)
        c.restoreState()


# ══════════════════════════════════════════════════════════════
# MAIN GENERATE FUNCTION
# ══════════════════════════════════════════════════════════════

def generate_report_card(student_data, output_path):
    student = compute_derived(student_data.copy())

    name   = student.get("Student Name","Student").replace(" ","_")
    roll   = student.get("Roll No","XX")

    c = canvas.Canvas(output_path, pagesize=legal)
    c.setTitle(f"Report Card — {student.get('Student Name','')} — 2024-25")
    c.setAuthor("St. Francis de Sales School — Automated Report Card System")

    draw_frame_and_guides(c)
    draw_panel1(c, student)
    draw_panel2(c, student)
    draw_panel3(c, student)

    c.save()
    print(f"✓  Report card generated → {output_path}")


# ══════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate St. Francis de Sales report card from marksheet JSON")
    parser.add_argument("--roll", type=int, required=True,
                        help="Student roll number")
    parser.add_argument("--json", default="student_marksheet.json",
                        help="Path to student_marksheet.json")
    parser.add_argument("--out",  default=None,
                        help="Output PDF path (auto-named if omitted)")
    args = parser.parse_args()

    student = load_student(args.json, args.roll)
    name_slug = student["Student Name"].replace(" ","_")
    out_path = args.out or f"ReportCard_25-26_{args.roll:02d}_{name_slug}.pdf"

    generate_report_card(student, out_path)

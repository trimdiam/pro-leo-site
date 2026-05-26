// default-score-picker.js
// Modal that appears between "Start Session" and the assessment opening.
// Teacher picks a default score (1–5) or skips. Replaces the buried checkbox.

/**
 * @param {object} opts
 * @param {string} opts.subjectName
 * @param {string} opts.className
 * @param {number} opts.studentCount
 * @param {function} opts.onConfirm   - called with (defaultScore: number|null)
 * @param {function} opts.onCancel
 */
export function showDefaultScorePicker({ subjectName, className, studentCount, onConfirm, onCancel }) {
  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'dsp-overlay';

  // ── Card ──
  const card = document.createElement('div');
  card.className = 'dsp-card';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'dsp-header';
  header.innerHTML = `
    <div class="dsp-icon">⚡</div>
    <div>
      <div class="dsp-title">Quick Start</div>
      <div class="dsp-sub">${subjectName} · ${className} · ${studentCount} students</div>
    </div>
  `;

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'dsp-body';

  const question = document.createElement('p');
  question.className = 'dsp-question';
  question.textContent = 'Pre-fill all students with a default score?';

  const hint = document.createElement('p');
  hint.className = 'dsp-hint';
  hint.textContent = 'You can still change individual scores after. This saves time when most students perform similarly.';

  // ── Score buttons ──
  const scores = document.createElement('div');
  scores.className = 'dsp-scores';

  let selectedScore = 4; // default selection
  const btns = [];

  [1, 2, 3, 4, 5].forEach(n => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dsp-score-btn' + (n === 4 ? ' selected' : '');
    btn.dataset.score = n;

    const labels = { 1: 'Beginning', 2: 'Beginning+', 3: 'Developing', 4: 'Proficient', 5: 'Advanced' };
    btn.innerHTML = `<span class="dsp-num">${n}</span><span class="dsp-lbl">${labels[n]}</span>`;

    btn.addEventListener('click', () => {
      selectedScore = n;
      btns.forEach(b => b.classList.toggle('selected', Number(b.dataset.score) === n));
    });

    btns.push(btn);
    scores.append(btn);
  });

  body.append(question, hint, scores);

  // ── Footer ──
  const footer = document.createElement('div');
  footer.className = 'dsp-footer';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'dsp-btn dsp-btn-ghost';
  skipBtn.textContent = 'Skip — start blank';
  skipBtn.addEventListener('click', () => { destroy(); onConfirm(null); });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'dsp-btn dsp-btn-primary';
  confirmBtn.textContent = 'Pre-fill & Start →';
  confirmBtn.addEventListener('click', () => { destroy(); onConfirm(selectedScore); });

  footer.append(skipBtn, confirmBtn);

  // ── Cancel on overlay click ──
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { destroy(); onCancel(); }
  });

  card.append(header, body, footer);
  overlay.append(card);
  document.body.append(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('dsp-visible'));

  function destroy() {
    overlay.classList.remove('dsp-visible');
    setTimeout(() => overlay.remove(), 200);
  }
}

// ── Styles (injected once) ──────────────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById('dsp-styles')) return;
  const s = document.createElement('style');
  s.id = 'dsp-styles';
  s.textContent = `
    .dsp-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; opacity: 0; transition: opacity 0.18s ease;
    }
    .dsp-overlay.dsp-visible { opacity: 1; }
    .dsp-card {
      background: #fff; border-radius: 16px; width: 100%; max-width: 480px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.22); overflow: hidden;
      transform: translateY(12px); transition: transform 0.18s ease;
    }
    .dsp-overlay.dsp-visible .dsp-card { transform: translateY(0); }

    .dsp-header {
      display: flex; align-items: center; gap: 14px;
      background: #0f4c35; color: #fff; padding: 20px 24px;
    }
    .dsp-icon { font-size: 28px; line-height: 1; }
    .dsp-title { font-size: 17px; font-weight: 700; letter-spacing: 0.2px; }
    .dsp-sub   { font-size: 12px; opacity: 0.75; margin-top: 2px; }

    .dsp-body { padding: 24px 24px 8px; }
    .dsp-question { font-size: 15px; font-weight: 600; color: #111; margin: 0 0 8px; }
    .dsp-hint     { font-size: 12.5px; color: #666; margin: 0 0 20px; line-height: 1.5; }

    .dsp-scores {
      display: flex; gap: 8px; justify-content: center; margin-bottom: 8px;
    }
    .dsp-score-btn {
      flex: 1; border: 2px solid #e2e8f0; border-radius: 10px;
      background: #f8fafc; cursor: pointer; padding: 10px 4px;
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      transition: all 0.12s ease;
    }
    .dsp-score-btn:hover { border-color: #0f4c35; background: #f0fdf4; }
    .dsp-score-btn.selected {
      border-color: #0f4c35; background: #0f4c35; color: #fff;
      box-shadow: 0 4px 12px rgba(15,76,53,0.3);
    }
    .dsp-num { font-size: 22px; font-weight: 800; line-height: 1; }
    .dsp-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase;
               letter-spacing: 0.5px; opacity: 0.75; text-align: center; }
    .dsp-score-btn.selected .dsp-lbl { opacity: 0.9; }

    .dsp-footer {
      display: flex; gap: 10px; padding: 16px 24px 20px;
      border-top: 1px solid #f1f5f9; justify-content: flex-end;
    }
    .dsp-btn {
      padding: 10px 20px; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; border: none; transition: all 0.12s;
    }
    .dsp-btn-ghost {
      background: transparent; color: #64748b; border: 1.5px solid #e2e8f0;
    }
    .dsp-btn-ghost:hover { background: #f8fafc; border-color: #cbd5e1; }
    .dsp-btn-primary {
      background: #0f4c35; color: #fff;
      box-shadow: 0 4px 12px rgba(15,76,53,0.25);
    }
    .dsp-btn-primary:hover { background: #0a3828; }

    @media (max-width: 520px) {
      .dsp-card { margin: 16px; border-radius: 14px; }
      .dsp-scores { gap: 5px; }
      .dsp-num { font-size: 18px; }
      .dsp-lbl { font-size: 8px; }
    }
  `;
  document.head.append(s);
})();

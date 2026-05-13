/**
 * ═══════════════════════════════════════════════════════════════
 *  PROJECT LEO – SIBLING LINKING SYSTEM
 *  Safe, backward-compatible implementation
 * ═══════════════════════════════════════════════════════════════
 *
 *  Stages implemented:
 *    1. DB Preparation        – familyId field support
 *    2. Admin Linking UI      – Family Management section
 *    3. Student Fetch         – load linked siblings after login
 *    4. Student Switching UI  – header dropdown
 *    5. Notification Merging  – unified feed
 *    6. Edge Case Handling    – removal, duplicates, fallback
 *
 *  RULES:
 *    • Login system is NEVER modified
 *    • ALL existing data stays intact
 *    • Only extends functionality
 *    • activeStudentId controls ALL data views
 * ═══════════════════════════════════════════════════════════════
 */

(function _initSiblingSystem() {
  'use strict';

  /* ── Guard: Firebase must be ready ── */
  if (typeof window.db === 'undefined' || typeof window.auth === 'undefined') {
    console.warn('[SiblingSystem] Firebase not ready yet. Retrying…');
    setTimeout(_initSiblingSystem, 300);
    return;
  }

  const { db, auth } = window;
  const {
    getDoc, getDocs, doc, collection, query, where,
    updateDoc, setDoc, deleteField, serverTimestamp, writeBatch
  } = window;

  /* ═══════════════════════════════════════════════════════════
     STAGE 1  —  LOCAL STATE (Session-only)
     ═══════════════════════════════════════════════════════════ */
  window._siblingState = {
    linkedStudents: [],      // Array of {studentId, name, class, rollNo, familyId}
    activeStudentId: null,   // Currently viewed student
    primaryStudentId: null,  // Original logged-in student
    familyId: null           // Family group id
  };

  /* ═══════════════════════════════════════════════════════════
     STAGE 3  —  FETCH LINKED STUDENTS (called after login)
     ═══════════════════════════════════════════════════════════ */

  /**
   * Detect family and load all linked siblings.
   * Called from app-logic.js after loadStudentProfile().
   */
  window.detectAndLoadSiblings = async function (user) {
    try {
      const state = window._siblingState;
      state.primaryStudentId = window._studentId || null;
      state.activeStudentId  = window._studentId || null;

      if (!state.primaryStudentId) {
        _renderSiblingSwitcher([]); // no student id → normal single-student flow
        return;
      }

      // 1. Try to find the student record to get familyId
      let familyId = null;
      let studentRecord = null;

      // Query by studentId field
      try {
        const q = query(collection(db, 'students'), where('studentId', '==', state.primaryStudentId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          studentRecord = snap.docs[0].data();
          familyId = studentRecord.familyId || null;
        }
      } catch (e) { /* ignore permission errors */ }

      // Fallback: direct doc lookup
      if (!familyId) {
        try {
          const d = await getDoc(doc(db, 'students', state.primaryStudentId));
          if (d.exists()) {
            studentRecord = d.data();
            familyId = studentRecord.familyId || null;
          }
        } catch (e) { /* ignore */ }
      }

      state.familyId = familyId;

      // 2. No familyId → normal single-student behaviour
      if (!familyId) {
        state.linkedStudents = [];
        _renderSiblingSwitcher([]);
        return;
      }

      // 3. Fetch all students in the same family
      const linked = await _fetchStudentsByFamilyId(familyId);
      state.linkedStudents = linked;

      // 4. Render the switcher UI
      _renderSiblingSwitcher(linked);

      console.log('[SiblingSystem] Loaded', linked.length, 'sibling(s) for family', familyId);
    } catch (err) {
      console.error('[SiblingSystem] detectAndLoadSiblings error:', err);
      _renderSiblingSwitcher([]);
    }
  };

  /**
   * Fetch all students with the given familyId.
   */
  async function _fetchStudentsByFamilyId(familyId) {
    const results = [];
    try {
      const q = query(collection(db, 'students'), where('familyId', '==', familyId));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        results.push({
          docId:      d.id,
          studentId:  data.studentId || d.id,
          name:       data.name || 'Student',
          class:      data.class || '',
          rollNo:     data.rollNo || '',
          familyId:   data.familyId || familyId,
          avatar:     _makeAvatar(data.name)
        });
      });
    } catch (e) {
      console.warn('[SiblingSystem] fetch by familyId failed:', e.message);
    }
    // Sort by name for consistent ordering
    return results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function _makeAvatar(name) {
    if (!name) return 'S';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }

  /* ═══════════════════════════════════════════════════════════
     STAGE 4  —  STUDENT SWITCHING UI
     ═══════════════════════════════════════════════════════════ */

  /**
   * Render (or hide) the sibling switcher dropdown in the student header.
   */
  function _renderSiblingSwitcher(linkedStudents) {
    const headerUser = document.querySelector('.dash-user');
    if (!headerUser) return;

    // Remove old switcher if present
    const oldSwitcher = document.getElementById('sibling-switcher-wrap');
    if (oldSwitcher) oldSwitcher.remove();

    // No siblings → hide switcher (normal single-student)
    if (!linkedStudents || linkedStudents.length <= 1) return;

    // Build the switcher
    const wrap = document.createElement('div');
    wrap.id = 'sibling-switcher-wrap';
    wrap.style.cssText = 'position:relative;margin-left:8px;';

    const active = linkedStudents.find(s => s.studentId === window._siblingState.activeStudentId) || linkedStudents[0];

    wrap.innerHTML = `
      <button id="sibling-switcher-btn" onclick="toggleSiblingDropdown(event)"
        style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--glass-bg);border:1.5px solid var(--border);border-radius:20px;cursor:pointer;font-family:var(--font-body);font-size:13px;color:var(--text-dark);transition:all .2s">
        <span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent-dark));color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${active.avatar}</span>
        <span id="sibling-switcher-label">${_escapeHtml(active.name)}</span>
        <i class="fas fa-chevron-down" style="font-size:10px;color:var(--text-light);transition:transform .2s"></i>
      </button>
      <div id="sibling-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);right:0;background:var(--white);border:1.5px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.15);min-width:220px;z-index:9999;overflow:hidden">
        <div style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Switch Student</div>
        <div id="sibling-dropdown-list">
          ${linkedStudents.map(s => `
            <div onclick="switchStudent('${_escapeHtml(s.studentId)}')"
              class="sibling-option ${s.studentId === window._siblingState.activeStudentId ? 'sibling-active' : ''}"
              style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .15s;border-bottom:1px solid var(--border)"
              onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
              <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent-dark));color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${s.avatar}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escapeHtml(s.name)}</div>
                <div style="font-size:11px;color:var(--text-light)">Class ${s.class || '—'} · Roll ${s.rollNo || '—'}</div>
              </div>
              ${s.studentId === window._siblingState.activeStudentId ? '<i class="fas fa-check" style="color:var(--success);font-size:11px"></i>' : ''}
            </div>
          `).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding:8px 14px">
          <button onclick="logoutSiblingSystem()" style="width:100%;padding:8px;border:none;background:none;color:var(--danger);font-size:12px;font-family:var(--font-body);cursor:pointer;border-radius:6px;text-align:left;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background=''">
            <i class="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      </div>
    `;

    // Insert right after the avatar, before any existing elements if needed
    headerUser.appendChild(wrap);
  }

  window.toggleSiblingDropdown = function (e) {
    e.stopPropagation();
    const dd = document.getElementById('sibling-dropdown');
    if (!dd) return;
    const isHidden = dd.style.display === 'none';
    dd.style.display = isHidden ? 'block' : 'none';
    const btn = document.getElementById('sibling-switcher-btn');
    if (btn) {
      const icon = btn.querySelector('.fa-chevron-down');
      if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : '';
    }
  };

  // Close dropdown when clicking outside
  document.addEventListener('click', function (e) {
    const dd = document.getElementById('sibling-dropdown');
    const btn = document.getElementById('sibling-switcher-btn');
    if (dd && dd.style.display === 'block' && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
      dd.style.display = 'none';
      const icon = btn.querySelector('.fa-chevron-down');
      if (icon) icon.style.transform = '';
    }
  });

  /**
   * Switch to a different sibling's profile.
   * ALL data fetches must use window._siblingState.activeStudentId
   */
  window.switchStudent = async function (studentId) {
    const state = window._siblingState;
    const target = state.linkedStudents.find(s => s.studentId === studentId);
    if (!target) { showToast('⚠️ Student not found.'); return; }

    state.activeStudentId = studentId;

    // Update global vars that the rest of the app uses
    window._studentId   = studentId;
    window._studentName = target.name;
    window._studentClass = target.class || '';
    window._studentRollNo = target.rollNo || '';

    // Update UI labels
    const nameEl = document.getElementById('student-name');
    if (nameEl) nameEl.textContent = target.name;
    const headerName = document.getElementById('s-header-name');
    if (headerName) headerName.textContent = target.name;
    const headerMeta = document.getElementById('s-header-meta');
    if (headerMeta) headerMeta.textContent = `Student · Class ${target.class} · Roll No. ${target.rollNo}`;
    const headerAvatar = document.getElementById('s-header-avatar');
    if (headerAvatar) headerAvatar.textContent = target.avatar;

    // Refresh switcher label
    const label = document.getElementById('sibling-switcher-label');
    if (label) label.textContent = target.name;
    const switcherBtn = document.getElementById('sibling-switcher-btn');
    if (switcherBtn) {
      const av = switcherBtn.querySelector('span');
      if (av) av.textContent = target.avatar;
    }

    // Re-render dropdown with active checkmark
    _renderSiblingSwitcher(state.linkedStudents);

    // Reload ALL student data for the new active student
    await _reloadActiveStudentData(studentId);

    showToast(`👤 Switched to ${target.name}`);
  };

  /**
   * Reload all dashboard data for the currently active student.
   */
  async function _reloadActiveStudentData(studentId) {
    try {
      // Fetch fresh student record
      let studentData = null;
      try {
        const q = query(collection(db, 'students'), where('studentId', '==', studentId));
        const snap = await getDocs(q);
        if (!snap.empty) studentData = snap.docs[0].data();
      } catch (e) {}
      if (!studentData) {
        try {
          const d = await getDoc(doc(db, 'students', studentId));
          if (d.exists()) studentData = d.data();
        } catch (e) {}
      }

      if (studentData) {
        // Update profile card fields
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        const houseMap = { G: '🟢 Green', R: '🔴 Red', Y: '🟡 Yellow', B: '🔵 Blue' };
        const classLabel = { PLG: 'Play Group', SKG: 'SKG', LKG: 'LKG' };
        const getClsLabel = c => classLabel[c] || (c ? 'Class ' + c : '—');

        setTxt('s-profile-name', studentData.name);
        setTxt('s-profile-sub', `Class ${getClsLabel(studentData.class)} · Roll No. ${studentData.rollNo}`);
        const tagAdm = document.getElementById('s-tag-admno');
        if (tagAdm) tagAdm.textContent = 'Admission No: ' + (studentData.admissionNo || '—');
        setTxt('s-card-name', studentData.name);
        setTxt('s-card-class', `${getClsLabel(studentData.class)}${studentData.section ? ' – Section ' + studentData.section : ''}`);
        setTxt('s-card-roll', studentData.rollNo);
        setTxt('s-card-admno', studentData.admissionNo);
        setTxt('s-card-dob', studentData.dob);
        setTxt('s-card-blood', studentData.bloodGroup);
        setTxt('s-card-gender', studentData.gender === 'M' ? 'Male' : studentData.gender === 'F' ? 'Female' : studentData.gender);
        setTxt('s-card-nationality', studentData.nationality || 'Indian');
        setTxt('s-card-contact', studentData.whatsapp || '—');
        setTxt('s-card-address', studentData.address || '—');
        setTxt('s-card-father', studentData.fatherName || '—');
        setTxt('s-card-mother', studentData.motherName || '—');
        setTxt('s-card-parent-contact', studentData.whatsapp || studentData.altContact || '—');
        setTxt('s-card-pen', studentData.penNumber || '—');
        setTxt('s-card-house', houseMap[studentData.house] || studentData.house || '—');

        const bal = parseFloat(studentData.feeBalance ?? studentData.feeTotal ?? 0);
        const feeDueEl = document.getElementById('s-stat-fee-due');
        if (feeDueEl) feeDueEl.textContent = bal > 0 ? '₹' + bal.toLocaleString('en-IN') : '₹0';
      }

      // Reload all data modules
      if (typeof loadStudentHomework === 'function') loadStudentHomework();
      if (typeof loadStudentNotices === 'function') loadStudentNotices();
      if (typeof loadStudentFees === 'function') loadStudentFees();
      if (window.loadStudentAttendance) window.loadStudentAttendance();
      if (window.loadAcademicSnapshot) window.loadAcademicSnapshot(studentId);

      // Reload merged notifications (Stage 5)
      if (window.loadStudentNotificationCenter) {
        window.loadStudentNotificationCenter(auth.currentUser).catch(e =>
          console.warn('[NotificationCenter] reload failed:', e.message)
        );
      }
    } catch (e) {
      console.error('[SiblingSystem] reloadActiveStudentData error:', e);
    }
  }

  window.logoutSiblingSystem = async function () {
    try {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
      await signOut(auth);
      window.location.reload();
    } catch (e) {
      console.error('[SiblingSystem] logout error:', e);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     STAGE 5  —  NOTIFICATION MERGING
     ═══════════════════════════════════════════════════════════ */

  /**
   * Returns an array of all linked student IDs (including active).
   * Use this in notification fetching.
   */
  window.getLinkedStudentIds = function () {
    const state = window._siblingState;
    if (!state.linkedStudents || state.linkedStudents.length === 0) {
      return state.activeStudentId ? [state.activeStudentId] : [];
    }
    return state.linkedStudents.map(s => s.studentId);
  };

  /**
   * Returns the name map: { studentId: name }
   * Used to label notifications.
   */
  window.getLinkedStudentNameMap = function () {
    const map = {};
    const state = window._siblingState;
    if (state.linkedStudents) {
      state.linkedStudents.forEach(s => { map[s.studentId] = s.name; });
    }
    return map;
  };

  /* ═══════════════════════════════════════════════════════════
     STAGE 2  —  ADMIN FAMILY MANAGEMENT
     ═══════════════════════════════════════════════════════════ */

  /**
   * Open the Family Linking modal for a student.
   * Called from admin student list.
   */
  window.openFamilyLinkModal = async function (studentId, studentName) {
    window._flTargetStudentId = studentId;
    window._flTargetStudentName = studentName;

    const overlay = document.getElementById('family-link-overlay');
    const title = document.getElementById('fl-modal-title');
    const currentFamily = document.getElementById('fl-current-family');
    const searchList = document.getElementById('fl-search-results');
    const linkedList = document.getElementById('fl-linked-list');

    if (title) title.textContent = `Link Siblings — ${studentName}`;
    if (searchList) searchList.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">Search to find students.</p>';

    // Load current family members
    let familyMembers = [];
    try {
      const q = query(collection(db, 'students'), where('studentId', '==', studentId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const famId = snap.docs[0].data().familyId;
        if (famId) {
          const fq = query(collection(db, 'students'), where('familyId', '==', famId));
          const fsnap = await getDocs(fq);
          fsnap.forEach(d => {
            const data = d.data();
            if (data.studentId !== studentId) {
              familyMembers.push({ studentId: data.studentId, name: data.name || 'Student', class: data.class || '', rollNo: data.rollNo || '' });
            }
          });
        }
      }
    } catch (e) { console.warn('[FamilyLink] load current family:', e.message); }

    _renderLinkedList(familyMembers);
    if (overlay) overlay.style.display = 'flex';
  };

  window.closeFamilyLinkModal = function () {
    const overlay = document.getElementById('family-link-overlay');
    if (overlay) overlay.style.display = 'none';
    window._flTargetStudentId = null;
    window._flTargetStudentName = null;
  };

  window.searchStudentsForLinking = async function () {
    const input = document.getElementById('fl-search-input');
    const term = (input?.value || '').trim().toLowerCase();
    const list = document.getElementById('fl-search-results');
    if (!term || term.length < 2) { if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">Type at least 2 characters.</p>'; return; }

    if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px"><i class="fas fa-spinner fa-spin"></i> Searching…</p>';

    try {
      // Fetch all students and filter client-side (no text search in Firestore free plan)
      const snap = await getDocs(collection(db, 'students'));
      const matches = [];
      snap.forEach(d => {
        const data = d.data();
        const sid = (data.studentId || d.id).toLowerCase();
        const name = (data.name || '').toLowerCase();
        if ((sid.includes(term) || name.includes(term)) && data.studentId !== window._flTargetStudentId) {
          matches.push({ studentId: data.studentId || d.id, name: data.name || 'Student', class: data.class || '', rollNo: data.rollNo || '', familyId: data.familyId || null });
        }
      });

      if (matches.length === 0) {
        if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">No students found.</p>';
        return;
      }

      if (list) {
        list.innerHTML = matches.map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:13px;font-weight:600">${_escapeHtml(s.name)}</div>
              <div style="font-size:11px;color:var(--text-light)">${s.studentId} · Class ${s.class || '—'}</div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="addSibling('${_escapeHtml(s.studentId)}')" ${s.familyId ? 'disabled title="Already in a family"' : ''}>
              <i class="fas fa-plus"></i> Add
            </button>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('[FamilyLink] search error:', e);
      if (list) list.innerHTML = '<p style="color:var(--danger);font-size:13px;padding:8px">Search failed.</p>';
    }
  };

  window.addSibling = async function (siblingStudentId) {
    const targetId = window._flTargetStudentId;
    if (!targetId) return;

    try {
      // Get target student's familyId
      let targetFamilyId = null;
      let targetDocId = null;
      const tq = query(collection(db, 'students'), where('studentId', '==', targetId));
      const tsnap = await getDocs(tq);
      if (!tsnap.empty) {
        const tdata = tsnap.docs[0].data();
        targetFamilyId = tdata.familyId || null;
        targetDocId = tsnap.docs[0].id;
      }

      // Get sibling's familyId
      let siblingFamilyId = null;
      let siblingDocId = null;
      const sq = query(collection(db, 'students'), where('studentId', '==', siblingStudentId));
      const ssnap = await getDocs(sq);
      if (!ssnap.empty) {
        const sdata = ssnap.docs[0].data();
        siblingFamilyId = sdata.familyId || null;
        siblingDocId = ssnap.docs[0].id;
      }

      // Case A: No familyId exists anywhere → generate new
      // Case B: One has familyId → reuse existing
      // Case C: Both have different familyIds → merge into target's family
      let familyId = targetFamilyId || siblingFamilyId;
      if (!familyId) {
        familyId = 'FAM_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase();
      }

      // Update both students
      const batch = writeBatch(db);
      if (targetDocId) {
        batch.update(doc(db, 'students', targetDocId), { familyId });
      }
      if (siblingDocId) {
        batch.update(doc(db, 'students', siblingDocId), { familyId });
      }

      // If sibling was in a different family, merge all members
      if (siblingFamilyId && siblingFamilyId !== targetFamilyId && targetFamilyId) {
        const mq = query(collection(db, 'students'), where('familyId', '==', siblingFamilyId));
        const msnap = await getDocs(mq);
        msnap.forEach(d => {
          if (d.id !== siblingDocId) {
            batch.update(doc(db, 'students', d.id), { familyId: targetFamilyId });
          }
        });
        familyId = targetFamilyId;
      }

      await batch.commit();

      // Sync familyId to users collection so Firestore rules can read it
      await _syncFamilyIdToUsers([targetId, siblingStudentId], familyId);

      showToast('✅ Siblings linked successfully!');

      // Refresh the modal
      openFamilyLinkModal(targetId, window._flTargetStudentName);
    } catch (e) {
      console.error('[FamilyLink] addSibling error:', e);
      showToast('❌ Could not link siblings: ' + e.message);
    }
  };

  window.removeSibling = async function (siblingStudentId) {
    const targetId = window._flTargetStudentId;
    if (!targetId) return;
    if (!confirm('Remove this student from the family?')) return;

    try {
      const q = query(collection(db, 'students'), where('studentId', '==', siblingStudentId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'students', snap.docs[0].id), { familyId: deleteField() });
        await _syncFamilyIdToUsers([siblingStudentId], null);
        showToast('✅ Student removed from family.');
        openFamilyLinkModal(targetId, window._flTargetStudentName);
      }
    } catch (e) {
      console.error('[FamilyLink] removeSibling error:', e);
      showToast('❌ Could not remove: ' + e.message);
    }
  };

  async function _syncFamilyIdToUsers(studentIds, familyId) {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);
      usersSnap.forEach(d => {
        const data = d.data();
        if (studentIds.includes(data.studentId)) {
          if (familyId) {
            batch.update(doc(db, 'users', d.id), { familyId });
          } else {
            batch.update(doc(db, 'users', d.id), { familyId: deleteField() });
          }
        }
      });
      await batch.commit();
    } catch (e) {
      console.warn('[SiblingSystem] Could not sync familyId to users:', e.message);
    }
  }

  function _renderLinkedList(members) {
    const el = document.getElementById('fl-linked-list');
    if (!el) return;
    if (members.length === 0) {
      el.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">No siblings linked yet.</p>';
      return;
    }
    el.innerHTML = members.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:600">${_escapeHtml(s.name)}</div>
          <div style="font-size:11px;color:var(--text-light)">${s.studentId} · Class ${s.class || '—'}</div>
        </div>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" onclick="removeSibling('${_escapeHtml(s.studentId)}')">
          <i class="fas fa-unlink"></i> Remove
        </button>
      </div>
    `).join('');
  }

  /* ═══════════════════════════════════════════════════════════
     STAGE 6  —  EDGE CASE HANDLING
     ═══════════════════════════════════════════════════════════ */

  /**
   * When a student is removed from a family on another device,
   * re-fetch on next dashboard load to stay in sync.
   */
  window.refreshSiblingState = async function () {
    const user = auth.currentUser;
    if (!user) return;
    await detectAndLoadSiblings(user);
  };

  /**
   * Returns the currently active student ID.
   * ALL student data functions should use this instead of _studentId directly.
   */
  window.getActiveStudentId = function () {
    return window._siblingState.activeStudentId || window._studentId || null;
  };

  /* ── Helpers ── */
  function _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ═══════════════════════════════════════════════════════════
     ADMIN FAMILY MANAGEMENT — Bulk search from a-family-mgmt
     ═══════════════════════════════════════════════════════════ */

  window.searchFamilyStudents = async function () {
    const input = document.getElementById('fam-search-input');
    const term = (input?.value || '').trim().toLowerCase();
    const list = document.getElementById('fam-search-results');

    if (!term || term.length < 2) {
      if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">Type at least 2 characters.</p>';
      return;
    }

    if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px"><i class="fas fa-spinner fa-spin"></i> Searching…</p>';

    try {
      const snap = await getDocs(collection(db, 'students'));
      const matches = [];
      snap.forEach(d => {
        const data = d.data();
        const sid = (data.studentId || d.id).toLowerCase();
        const name = (data.name || '').toLowerCase();
        if (sid.includes(term) || name.includes(term)) {
          matches.push({
            studentId: data.studentId || d.id,
            name: data.name || 'Student',
            class: data.class || '',
            rollNo: data.rollNo || '',
            familyId: data.familyId || null
          });
        }
      });

      if (matches.length === 0) {
        if (list) list.innerHTML = '<p style="color:var(--text-light);font-size:13px;padding:8px">No students found.</p>';
        return;
      }

      if (list) {
        list.innerHTML = matches.map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:13px;font-weight:600">${_escapeHtml(s.name)}</div>
              <div style="font-size:11px;color:var(--text-light)">${s.studentId} · Class ${s.class || '—'} · Roll ${s.rollNo || '—'}${s.familyId ? ' · <span style="color:var(--success)">Linked</span>' : ''}</div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="openFamilyLinkModal('${_escapeHtml(s.studentId)}', '${_escapeHtml(s.name)}')">
              <i class="fas fa-link"></i> Link Siblings
            </button>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('[FamilyMgmt] search error:', e);
      if (list) list.innerHTML = '<p style="color:var(--danger);font-size:13px;padding:8px">Search failed.</p>';
    }
  };

  console.log('[SiblingSystem] ✅ Loaded successfully');
})();

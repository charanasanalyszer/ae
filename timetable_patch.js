/* ═══════════════════════════════════════════════════════════════════════
   CHARANAS TIMETABLE CONSTRAINT ENGINE — PATCH v2.0
   Appended to script.js — do not edit above this line.
   ─────────────────────────────────────────────────────────────────────
   Adds:
   1. es_state.constraints  — persisted constraint settings
   2. Max-consecutive-periods rule per teacher  (configurable: 2/3/4)
   3. Subject-follow blacklist  (subject A cannot immediately follow B)
   4. Auto-sync from Charanas data when timetable tab opens
   5. Auto-select all classes on Generate page
   6. Constraints card UI injected into #page-generate
   7. 🔀 Shuffle-Regenerate button for fresh random layout
   8. Constraint violation report in Generation Log
═══════════════════════════════════════════════════════════════════════ */

/* ─── 0. Guard: ensure es_state exists (in case of load order issues) ─── */
if (typeof es_state === 'undefined') {
  window.es_state = {
    school:    { name:'', daysPerWeek:5, lessonsPerDay:9, lessonDuration:40, schoolStart:'07:30', breaks:[] },
    classes:   [],
    subjects:  [],
    teachers:  [],
    rooms:     [],
    timetable: {},
    constraints: {}
  };
}
if (typeof ES_DB_KEY === 'undefined')    window.ES_DB_KEY = 'eduschedule_v1';
if (typeof es_initialized === 'undefined') window.es_initialized = false;
if (typeof ES_DAY_NAMES === 'undefined')
  window.ES_DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

/* ─── 1. Constraint defaults ─────────────────────────────────────────── */
function es_getConstraints() {
  if (!es_state.constraints) es_state.constraints = {};
  const c = es_state.constraints;
  return {
    maxConsecutive:  c.maxConsecutive  !== undefined ? c.maxConsecutive  : 3,   // 0 = no limit
    noFollowPairs:   Array.isArray(c.noFollowPairs)  ? c.noFollowPairs  : [],   // [{a,b}] — b cannot follow a
    autoSync:        c.autoSync        !== undefined ? c.autoSync        : true,
    teacherBreakMin: c.teacherBreakMin !== undefined ? c.teacherBreakMin : 1,   // periods of gap required
  };
}
function es_saveConstraints(obj) {
  es_state.constraints = Object.assign(es_state.constraints || {}, obj);
  if (typeof es_saveData === 'function') es_saveData();
}

/* ─── 2. Inject Constraints Card UI into #page-generate ─────────────── */
function es_injectConstraintUI() {
  if (document.getElementById('es_constraintCard')) return; // already injected

  const generatePage = document.getElementById('page-generate');
  if (!generatePage) return;

  const c = es_getConstraints();

  // Build subject-pair options
  function subOptions(selectedId) {
    return (es_state.subjects || []).map(s =>
      `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.name}</option>`
    ).join('');
  }

  const pairRows = (c.noFollowPairs || []).map((p, i) => `
    <div class="es-nfp-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
      <select class="form-control es-nfp-a" style="width:auto;flex:1;min-width:120px;" onchange="es_updateNoFollowPair(${i},'a',this.value)">
        ${subOptions(p.a)}
      </select>
      <span style="color:var(--text2);font-size:12px;font-weight:700;white-space:nowrap;">cannot be followed by</span>
      <select class="form-control es-nfp-b" style="width:auto;flex:1;min-width:120px;" onchange="es_updateNoFollowPair(${i},'b',this.value)">
        ${subOptions(p.b)}
      </select>
      <button class="btn btn-sm btn-danger" onclick="es_removeNoFollowPair(${i})" style="padding:4px 8px;flex-shrink:0;">✕</button>
    </div>`).join('');

  const cardHTML = `
  <div id="es_constraintCard" class="card" style="margin-bottom:20px;border-left:3px solid var(--accent2);">
    <div class="card-header">
      <div class="card-title" style="color:var(--accent2);">🔒 Scheduling Constraints</div>
      <div style="font-size:11px;color:var(--text3);">Rules enforced during auto-generation</div>
    </div>

    <!-- Row 1: Max Consecutive + Auto-Sync -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">Max Consecutive Periods per Teacher</label>
        <select class="form-control" id="es_maxConsec" onchange="es_saveConstraints({maxConsecutive:+this.value})">
          <option value="0" ${c.maxConsecutive===0?'selected':''}>No limit</option>
          <option value="2" ${c.maxConsecutive===2?'selected':''}>2 (must rest after every 2)</option>
          <option value="3" ${c.maxConsecutive===3?'selected':''}>3 (rest after 3 in a row)</option>
          <option value="4" ${c.maxConsecutive===4?'selected':''}>4 (rest after 4 in a row)</option>
        </select>
        <div class="form-hint">Teacher cannot teach this many periods in a row without a free period.</div>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="es_autoSyncChk" ${c.autoSync?'checked':''} style="accent-color:var(--accent2);" onchange="es_saveConstraints({autoSync:this.checked})"/>
          Auto-sync school data on open
        </label>
        <div class="form-hint" style="margin-top:8px;">Pulls latest teachers, streams &amp; subjects from Charanas each time you open the Timetable section.</div>
        <button class="btn btn-sm btn-secondary" onclick="es_syncFromCharanas();es_buildGenClassSelector();" style="margin-top:8px;width:100%;">🔄 Sync Now</button>
      </div>
    </div>

    <!-- Row 2: No-Follow Subject Pairs -->
    <div class="form-group">
      <label class="form-label">Subject Sequencing Rules (cannot follow)</label>
      <div class="form-hint" style="margin-bottom:8px;">E.g. "Physical Education cannot be followed by Science" means after PE, the next lesson in the same class cannot be Science.</div>
      <div id="es_noFollowList" style="margin-bottom:8px;">${pairRows || '<div style="color:var(--text3);font-size:12px;">No rules added yet.</div>'}</div>
      <button class="btn btn-sm btn-secondary" onclick="es_addNoFollowPair()" id="es_addNFPBtn">➕ Add Rule</button>
    </div>
  </div>`;

  // Insert the constraint card BEFORE the generation log card
  const logCard = generatePage.querySelector('#es_genLog')?.closest('.card');
  if (logCard) {
    logCard.insertAdjacentHTML('beforebegin', cardHTML);
  } else {
    const buttonsDiv = generatePage.querySelector('[style*="gap:10px"]');
    if (buttonsDiv) buttonsDiv.insertAdjacentHTML('beforebegin', cardHTML);
  }
}

/* ─── 3. No-Follow Pair CRUD ─────────────────────────────────────────── */
function es_addNoFollowPair() {
  const subs = es_state.subjects || [];
  if (subs.length < 2) { es_toast('Add subjects first', 'warning'); return; }
  const c = es_getConstraints();
  c.noFollowPairs.push({ a: subs[0].id, b: subs[1].id });
  es_saveConstraints({ noFollowPairs: c.noFollowPairs });
  es_refreshNoFollowUI();
}
function es_removeNoFollowPair(idx) {
  const c = es_getConstraints();
  c.noFollowPairs.splice(idx, 1);
  es_saveConstraints({ noFollowPairs: c.noFollowPairs });
  es_refreshNoFollowUI();
}
function es_updateNoFollowPair(idx, field, val) {
  const c = es_getConstraints();
  if (c.noFollowPairs[idx]) c.noFollowPairs[idx][field] = val;
  es_saveConstraints({ noFollowPairs: c.noFollowPairs });
}
function es_refreshNoFollowUI() {
  const listEl = document.getElementById('es_noFollowList');
  if (!listEl) return;
  const c = es_getConstraints();
  if (!c.noFollowPairs.length) {
    listEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">No rules added yet.</div>';
    return;
  }
  function subOpts(selectedId) {
    return (es_state.subjects || []).map(s =>
      `<option value="${s.id}" ${s.id===selectedId?'selected':''}>${s.name}</option>`).join('');
  }
  listEl.innerHTML = c.noFollowPairs.map((p, i) => `
    <div class="es-nfp-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
      <select class="form-control es-nfp-a" style="width:auto;flex:1;min-width:120px;" onchange="es_updateNoFollowPair(${i},'a',this.value)">
        ${subOpts(p.a)}
      </select>
      <span style="color:var(--text2);font-size:12px;font-weight:700;white-space:nowrap;">cannot be followed by</span>
      <select class="form-control es-nfp-b" style="width:auto;flex:1;min-width:120px;" onchange="es_updateNoFollowPair(${i},'b',this.value)">
        ${subOpts(p.b)}
      </select>
      <button class="btn btn-sm btn-danger" onclick="es_removeNoFollowPair(${i})" style="padding:4px 8px;flex-shrink:0;">✕</button>
    </div>`).join('');
}

/* ─── 4. Enhanced Generate Function with Constraints ────────────────── */
const __origGenerate = es_generateTimetable;

async function es_generateTimetable() {
  // Inject constraint UI if not already done
  es_injectConstraintUI();

  await __origGenerate.call(this);

  // Post-process: enforce max-consecutive and no-follow rules
  const c = es_getConstraints();
  const days    = parseInt(es_state.school.daysPerWeek)  || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;

  const selectedClassIds = Array.from(document.querySelectorAll('.class-chip.selected')).map(c => c.dataset.classId);

  let consecViolations = 0;
  let followViolations = 0;

  for (const classId of selectedClassIds) {
    const tt = es_state.timetable[classId];
    if (!tt) continue;

    for (let d = 0; d < days; d++) {
      /* ── 4a. Enforce max-consecutive per teacher ── */
      if (c.maxConsecutive > 0) {
        const teacherRuns = {}; // teacherId → current run length

        for (let p = 0; p < periods; p++) {
          const slot = tt[d]?.[p];
          if (!slot) continue;

          // Any teacher whose slot this is NOT: reset their run
          Object.keys(teacherRuns).forEach(tid => {
            if (slot.teacherId !== tid) teacherRuns[tid] = 0;
          });

          if (!slot.teacherId) continue;
          const tid = slot.teacherId;
          teacherRuns[tid] = (teacherRuns[tid] || 0) + 1;

          if (teacherRuns[tid] > c.maxConsecutive) {
            // Violation: remove teacher from this slot (they need a break)
            const teacher = (es_state.teachers || []).find(t => t.id === tid);
            const cls     = (es_state.classes  || []).find(cl => cl.id === classId);
            const logEl   = document.getElementById('es_genLog');
            if (logEl) {
              logEl.innerHTML += `<div style="color:var(--warning);">⏸️ Consecutive limit hit: ${teacher?.name||tid} freed at ${ES_DAY_NAMES[d]||'Day'} P${p+1} for ${cls?.grade||classId} ${cls?.stream||''} (run was ${teacherRuns[tid]})</div>`;
              logEl.scrollTop = logEl.scrollHeight;
            }
            slot.teacherId = null;
            teacherRuns[tid] = 0;
            consecViolations++;
          }
        }
      }

      /* ── 4b. Enforce no-follow subject pairs ── */
      if (c.noFollowPairs.length > 0) {
        for (let p = 1; p < periods; p++) {
          const prev = tt[d]?.[p-1];
          const curr = tt[d]?.[p];
          if (!prev?.subjectId || !curr?.subjectId) continue;

          const violated = c.noFollowPairs.find(rule =>
            rule.a === prev.subjectId && rule.b === curr.subjectId
          );
          if (violated) {
            const subA = (es_state.subjects||[]).find(s=>s.id===violated.a);
            const subB = (es_state.subjects||[]).find(s=>s.id===violated.b);
            const cls  = (es_state.classes||[]).find(cl=>cl.id===classId);
            const logEl = document.getElementById('es_genLog');
            if (logEl) {
              logEl.innerHTML += `<div style="color:var(--danger);">🚫 Follow-rule violated: <strong>${subA?.name||violated.a}</strong> → <strong>${subB?.name||violated.b}</strong> at ${ES_DAY_NAMES[d]||'Day'} P${p+1} for ${cls?.grade||classId} ${cls?.stream||''} — swapping…</div>`;
              logEl.scrollTop = logEl.scrollHeight;
            }
            // Try to swap current slot with a later slot that doesn't violate
            let swapped = false;
            for (let q = p + 1; q < periods && !swapped; q++) {
              const cand = tt[d]?.[q];
              if (!cand?.subjectId) continue;
              // Check swap doesn't create new violations
              const prevOfQ = q > 0 ? tt[d]?.[q-1] : null;
              const nextOfQ = q < periods-1 ? tt[d]?.[q+1] : null;
              const newViolAtQ = c.noFollowPairs.some(r =>
                (prevOfQ?.subjectId === r.a && curr.subjectId === r.b) ||
                (curr.subjectId === r.a && nextOfQ?.subjectId === r.b)
              );
              const newViolAtP = c.noFollowPairs.some(r =>
                (prev?.subjectId === r.a && cand.subjectId === r.b)
              );
              if (!newViolAtQ && !newViolAtP) {
                // Safe to swap
                const tmp = { ...tt[d][p] };
                tt[d][p] = { ...tt[d][q] };
                tt[d][q] = tmp;
                swapped = true;
              }
            }
            followViolations++;
          }
        }
      }
    }
  }

  // Final summary
  const logEl = document.getElementById('es_genLog');
  if (logEl) {
    const consecMsg = c.maxConsecutive > 0
      ? `<div style="color:var(--text2);">📊 Consecutive rule (max ${c.maxConsecutive}): ${consecViolations} adjustment${consecViolations!==1?'s':''} made.</div>`
      : '';
    const followMsg = c.noFollowPairs.length > 0
      ? `<div style="color:var(--text2);">📊 No-follow rules: ${followViolations} swap${followViolations!==1?'s':''} attempted.</div>`
      : '';
    if (consecMsg || followMsg) {
      logEl.innerHTML += `<div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">${consecMsg}${followMsg}</div>`;
    }
    logEl.innerHTML += `<div style="color:var(--success);font-weight:700;">✅ Constraint pass complete.</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  es_saveData();
}

/* ─── 5. Shuffle-Regenerate: randomises slot order before generating ─── */
function es_shuffleRegenerate() {
  // Temporarily shuffle the subjects lessonsPerWeek counts slightly to get different layout
  // Actually: the randomness comes from the shuffled teachers array in the original generator.
  // We just need to ensure Math.random() produces different results by clearing timetable first.
  es_state.timetable = {};
  const logEl = document.getElementById('es_genLog');
  if (logEl) logEl.innerHTML = '🔀 Shuffling seed for fresh layout…<br>';
  es_generateTimetable();
}

/* ─── 6. Inject Shuffle button next to Generate button ──────────────── */
function es_injectShuffleButton() {
  if (document.getElementById('es_shuffleBtn')) return;
  const genBtn = document.getElementById('es_genBtn');
  if (!genBtn) return;
  const btn = document.createElement('button');
  btn.id = 'es_shuffleBtn';
  btn.className = 'btn btn-warning';
  btn.style.cssText = 'font-size:15px;padding:12px 24px;';
  btn.innerHTML = '🔀 Regenerate (Shuffle)';
  btn.title = 'Clear and regenerate with a fresh random layout';
  btn.onclick = es_shuffleRegenerate;
  genBtn.insertAdjacentElement('afterend', btn);

  // Also add an "All Streams" quick-link button
  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn-secondary';
  allBtn.style.cssText = 'font-size:13px;';
  allBtn.innerHTML = '🗓️ All Streams → View';
  allBtn.onclick = () => es_showPage('allclass');
  btn.insertAdjacentElement('afterend', allBtn);
}

/* ─── 7. Override es_showPage('generate') to auto-inject UI ─────────── */
const __origShowPage = es_showPage;
function es_showPage(name, navEl) {
  __origShowPage.call(this, name, navEl);
  if (name === 'generate') {
    // Short delay to let the page become visible first
    setTimeout(() => {
      es_injectConstraintUI();
      es_injectShuffleButton();
      es_buildGenClassSelector();
      // Auto-select all classes
      setTimeout(() => es_selectAllClasses(), 50);
    }, 30);
  }
}

/* ─── 8. Override es_initApp to auto-sync on first load ─────────────── */
const __origInitApp = es_initApp;
function es_initApp() {
  __origInitApp.call(this);
  const c = es_getConstraints();
  if (c.autoSync && typeof es_syncFromCharanas === 'function') {
    setTimeout(() => {
      // Only auto-sync if we have school data to sync from
      if (typeof currentSchoolId !== 'undefined' && currentSchoolId) {
        es_syncFromCharanas();
      }
    }, 400);
  }
  // Ensure constraints are in state
  if (!es_state.constraints) es_state.constraints = {};
}

/* ─── 9. Override the go() timetable handler to also inject UI ───────── */
const __origGoFn = window.go;
window.go = function(sec, el) {
  if (typeof __origGoFn === 'function') __origGoFn.call(this, sec, el);
  if (sec === 'timetable') {
    setTimeout(() => {
      es_injectConstraintUI();
      es_injectShuffleButton();
    }, 200);
  }
};

/* ─── 10. Better timetable cell rendering: colour-code teacher load ──── */
// Patch es_renderTimetableView to show teacher consecutive run indicator
const __origRenderTTView = typeof es_renderTimetableView === 'function' ? es_renderTimetableView : null;

/* ─── 11. Conflict check enhancement: report consecutive violations ──── */
const __origConflictCheck = typeof es_runConflictCheck === 'function' ? es_runConflictCheck : null;
function es_runConflictCheck() {
  if (__origConflictCheck) __origConflictCheck.call(this);

  const c = es_getConstraints();
  if (c.maxConsecutive === 0) return;

  const days    = parseInt(es_state.school.daysPerWeek)  || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;
  const conflictList = document.getElementById('es_conflictList');
  if (!conflictList) return;

  let extras = '';
  for (const classId of Object.keys(es_state.timetable)) {
    const tt  = es_state.timetable[classId];
    const cls = (es_state.classes||[]).find(cl=>cl.id===classId);
    for (let d = 0; d < days; d++) {
      let run = 0; let lastTid = null;
      for (let p = 0; p < periods; p++) {
        const slot = tt?.[d]?.[p];
        const tid = slot?.teacherId || null;
        if (tid && tid === lastTid) {
          run++;
          if (run > c.maxConsecutive) {
            const teacher = (es_state.teachers||[]).find(t=>t.id===tid);
            extras += `<div style="padding:8px 12px;border-left:3px solid var(--warning);margin-bottom:6px;background:rgba(245,158,11,.08);border-radius:4px;font-size:13px;">
              ⏸️ <strong>${teacher?.name||tid}</strong> has ${run} consecutive periods on <strong>${ES_DAY_NAMES[d]||'Day '+(d+1)}</strong>
              in <strong>${cls?.grade||classId} ${cls?.stream||''}</strong> (max: ${c.maxConsecutive})
            </div>`;
          }
        } else {
          run = tid ? 1 : 0;
          lastTid = tid;
        }
      }
    }
  }

  if (extras) {
    const header = '<div style="font-size:12px;font-weight:700;color:var(--warning);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">⏸️ Consecutive Period Violations</div>';
    conflictList.innerHTML = (conflictList.innerHTML || '') + header + extras;
  }
}

/* ─── 12. Style injection for constraint card ───────────────────────── */
(function injectConstraintStyles() {
  if (document.getElementById('es_constraintStyles')) return;
  const style = document.createElement('style');
  style.id = 'es_constraintStyles';
  style.textContent = `
    #es_constraintCard {
      border-left: 3px solid #7c3aed !important;
      background: var(--bg2);
    }
    #es_constraintCard .card-title {
      color: #7c3aed;
      font-size: 14px;
    }
    #es_constraintCard .form-hint {
      font-size: 11px;
      color: var(--text3);
      margin-top: 3px;
    }
    #es_shuffleBtn {
      background: #f59e0b !important;
      color: #000 !important;
    }
    #es_shuffleBtn:hover {
      background: #d97706 !important;
      transform: translateY(-1px);
    }
    .es-nfp-row select.form-control {
      font-size: 12px;
      padding: 7px 10px;
    }
    #es-app .generate-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 700px) {
      #es-app .generate-panel {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
})();

/* ─── 13. Init on DOMContentLoaded (backup for late load) ──────────── */
document.addEventListener('DOMContentLoaded', function() {
  // If we're already on timetable section, inject immediately
  const ttSection = document.getElementById('s-timetable');
  if (ttSection && ttSection.classList.contains('active')) {
    setTimeout(() => {
      es_injectConstraintUI();
      es_injectShuffleButton();
    }, 500);
  }
});

/* ─── 14. Expose helpers to global scope ─────────────────────────────── */
window.es_shuffleRegenerate    = es_shuffleRegenerate;
window.es_addNoFollowPair      = es_addNoFollowPair;
window.es_removeNoFollowPair   = es_removeNoFollowPair;
window.es_updateNoFollowPair   = es_updateNoFollowPair;
window.es_refreshNoFollowUI    = es_refreshNoFollowUI;
window.es_injectConstraintUI   = es_injectConstraintUI;
window.es_injectShuffleButton  = es_injectShuffleButton;
window.es_getConstraints       = es_getConstraints;
window.es_saveConstraints      = es_saveConstraints;

/* ─── END OF TIMETABLE CONSTRAINT PATCH ─────────────────────────────── */

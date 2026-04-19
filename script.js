/* ═══════════════════════════════════════════════
   Charanas Analyzer — script.js
   Full school exam management system
═══════════════════════════════════════════════ */

'use strict';

// ═══════════════ PLATFORM MULTI-SCHOOL ═══════════════
const PLATFORM_SCHOOLS_KEY  = 'ei_platform_schools';  // [{id,name,username,password,email,createdAt}]
const PLATFORM_CREDS_KEY    = 'ei_platform_creds';    // {username, password} — set on first run
const K_BROADCAST           = 'ei_platform_broadcast'; // platform broadcast message string
const K_PLATFORM_EXAMS      = 'ei_platform_exams';     // [{id,title,subject,class,term,year,maxScore,notes,createdAt,gradingSystemId,timetable}]
const K_PLATFORM_SCHOOL_MARKS = 'ei_platform_school_marks'; // {examId: {schoolId: [{studentName,adm,subject,score}]}}
const K_PLATFORM_RESULTS    = 'ei_platform_results';    // {examId: {analysed:bool, generatedAt, schoolSummaries:[{schoolId,schoolName,...}]}}
let   platformSchools       = [];
let   currentSchoolId       = null;

function loadPlatform()  { try { platformSchools = JSON.parse(localStorage.getItem(PLATFORM_SCHOOLS_KEY)) || []; } catch { platformSchools = []; } }
function savePlatform()  { localStorage.setItem(PLATFORM_SCHOOLS_KEY, JSON.stringify(platformSchools)); }

// ═══════════════ SCHOOL ARCHIVE (GRADUATED STUDENTS) ═══════════════
const K_SCHOOL_ARCHIVE = schoolId => schoolId + '_ei_archived_students';
function getSchoolArchive(schoolId)       { try { return JSON.parse(localStorage.getItem(K_SCHOOL_ARCHIVE(schoolId))) || []; } catch { return []; } }
function saveSchoolArchive(schoolId, data){ localStorage.setItem(K_SCHOOL_ARCHIVE(schoolId), JSON.stringify(data)); }
function getCurrentArchive()              { return getSchoolArchive(currentSchoolId); }
function saveCurrentArchive(data)         { saveSchoolArchive(currentSchoolId, data); }

function getPlatformCreds() {
  try { return JSON.parse(localStorage.getItem(PLATFORM_CREDS_KEY)) || null; } catch { return null; }
}
function setPlatformCreds(u, p) {
  localStorage.setItem(PLATFORM_CREDS_KEY, JSON.stringify({ username: u, password: p }));
}

function schoolPrefix() { return currentSchoolId ? currentSchoolId + '_' : ''; }

// ═══════════════ STORAGE ═══════════════
const K = {
  get students()   { return schoolPrefix() + 'ei_students';  },
  get subjects()   { return schoolPrefix() + 'ei_subjects';  },
  get teachers()   { return schoolPrefix() + 'ei_teachers';  },
  get classes()    { return schoolPrefix() + 'ei_classes';   },
  get streams()    { return schoolPrefix() + 'ei_streams';   },
  get exams()      { return schoolPrefix() + 'ei_exams';     },
  get marks()      { return schoolPrefix() + 'ei_marks';     },
  get settings()   { return schoolPrefix() + 'ei_settings';  },
  get admins()     { return schoolPrefix() + 'ei_admins';    },
  get msgLog()     { return schoolPrefix() + 'ei_msglog';    },
  get dark()       { return schoolPrefix() + 'ei_dark';      },
  get smsCredits() { return schoolPrefix() + 'ei_sms';       },
};
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid  = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

// ═══════════════ APP STATE ═══════════════
let students=[], subjects=[], teachers=[], classes=[], streams=[];
let exams=[], marks=[], settings={}, admins=[], msgLog=[];
let currentUser = null;   // { username, role, name, canAnalyse, canReport, canMerit }

// ── Sort state for each list table ──
const sortState = {
  students:  { col: 'name',  dir: 'asc' },
  teachers:  { col: 'name',  dir: 'asc' },
  subjects:  { col: 'name',  dir: 'asc' },
  classes:   { col: 'name',  dir: 'asc' },
  streams:   { col: 'name',  dir: 'asc' },
};
function sortList(arr, col, dir) {
  return [...arr].sort((a, b) => {
    let va = a[col] ?? '';
    let vb = b[col] ?? '';
    // numeric detection
    if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb))) { va = parseFloat(va); vb = parseFloat(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}
function setSortState(table, col) {
  if (sortState[table].col === col) {
    sortState[table].dir = sortState[table].dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState[table].col = col;
    sortState[table].dir = 'asc';
  }
}
function sortIcon(table, col) {
  if (sortState[table].col !== col) return '<span style="color:var(--muted);font-size:.65rem;margin-left:2px">⇅</span>';
  return sortState[table].dir === 'asc'
    ? '<span style="color:var(--primary);font-size:.7rem;margin-left:2px">▲</span>'
    : '<span style="color:var(--primary);font-size:.7rem;margin-left:2px">▼</span>';
}
function thSort(table, col, label) {
  return `<th style="cursor:pointer;user-select:none;white-space:nowrap" onclick="onSortClick('${table}','${col}')">${label}${sortIcon(table,col)}</th>`;
}
function onSortClick(table, col) {
  setSortState(table, col);
  if      (table === 'students') renderStudents();
  else if (table === 'teachers') renderTeachers();
  else if (table === 'subjects') renderSubjects();
  else if (table === 'classes')  renderClasses();
  else if (table === 'streams')  renderStreams();
}
let smsCredits = 0;

// ═══════════════ GRADING ═══════════════
function getGrade(marks, maxMarks=100) {
  return getGradeFromSystem(marks, maxMarks);
}
function getMeanGrade(mean) {
  return getMeanGradeFromSystem(mean);
}
function gradeTag(g) { return `<span class="badge ${g.cls}">${g.grade}</span>`; }

// ═══════════════ TEACHER INITIALS ═══════════════
function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').filter(Boolean).map(w=>w[0].toUpperCase()).slice(0,2).join('');
}
function teacherInitialsTag(teacher) {
  if (!teacher) return '<span class="tch-init tch-none">—</span>';
  const ini = getInitials(teacher.name);
  const colors = ['b-blue','b-teal','b-green','b-amber','b-purple','b-coral'];
  const idx = teacher.name.charCodeAt(0) % colors.length;
  return `<span class="tch-init badge ${colors[idx]}" title="${teacher.name}">${ini}</span>`;
}

// ═══════════════ AUTO COMMENTS ═══════════════
function generateCTComment(mean, grade, gender, name, rank, total) {
  const firstName = name.split(' ')[1] || name.split(' ')[0];
  const pronoun = gender==='F' ? 'She' : 'He';
  if (grade === 'EE1') return `${firstName} has delivered an outstanding performance this term. ${pronoun} demonstrates exceptional dedication and intellectual ability.`;
  if (grade === 'EE2') return `${firstName} has performed excellently, showing strong command across all subjects. ${pronoun} is consistently focused and hardworking.`;
  if (grade === 'ME1') return `${firstName} has shown very good performance this term. ${pronoun} demonstrates a solid understanding of the curriculum.`;
  if (grade === 'ME2') return `${firstName} has shown good performance this term. With continued effort, ${firstName.toLowerCase()} can achieve even better results.`;
  if (grade === 'AE1') return `${firstName} has shown average performance. ${pronoun} should dedicate more time to revision and seek help where needed.`;
  if (grade === 'AE2') return `${firstName}'s performance is fair. ${pronoun} needs to improve study habits and actively engage in class activities.`;
  return `${firstName} needs significant improvement. ${pronoun} should work closely with teachers and not give up — consistent effort leads to better outcomes.`;
}
function generatePrincipalComment(mean, grade, rank, total) {
  if (grade === 'EE1' || grade === 'EE2') return `A commendable performance. Keep up the excellent work and continue to aim for the highest standards.`;
  if (grade === 'ME1' || grade === 'ME2') return `A satisfactory performance. The student shows good potential and is encouraged to put in more effort next term.`;
  if (grade === 'AE1') return `The student must work harder. Regular attendance, revision, and interaction with teachers will yield better results.`;
  return `The student's performance is below expectation. Parents/guardians are advised to support the student closely. We remain committed to their academic growth.`;
}

// ═══════════════ GRADING SYSTEMS ═══════════════
let gradingSystems = [];
const K_GS = 'ei_gradingsystems';
const DEFAULT_GS_ID = 'default_cbc';

function loadGradingSystems() {
  gradingSystems = (() => { try { return JSON.parse(localStorage.getItem(K_GS)) || []; } catch { return []; } })();
  if (!gradingSystems.length) {
    gradingSystems = [{
      id: DEFAULT_GS_ID, name: 'CBC Standard (Default)', isDefault: true,
      bands: [
        { min:90, max:100, grade:'EE1', points:8, label:'Outstanding',    cls:'b-green'  },
        { min:80, max:89,  grade:'EE2', points:7, label:'Excellent',      cls:'b-teal'   },
        { min:65, max:79,  grade:'ME1', points:6, label:'Very Good',      cls:'b-blue'   },
        { min:50, max:64,  grade:'ME2', points:5, label:'Good',           cls:'b-lblue'  },
        { min:35, max:49,  grade:'AE1', points:4, label:'Average',        cls:'b-amber'  },
        { min:25, max:34,  grade:'AE2', points:3, label:'Fair',           cls:'b-orange' },
        { min:13, max:24,  grade:'BE1', points:2, label:'Needs Attention', cls:'b-red'   },
        { min:0,  max:12,  grade:'BE2', points:1, label:'Needs Attention', cls:'b-dkred' },
      ]
    }];
    localStorage.setItem(K_GS, JSON.stringify(gradingSystems));
  }
}

function getActiveGradingSystemId() {
  return localStorage.getItem('ei_active_gs') || DEFAULT_GS_ID;
}
function setActiveGradingSystem(id) {
  localStorage.setItem('ei_active_gs', id);
}
function getActiveGradingSystem() {
  const id = getActiveGradingSystemId();
  return gradingSystems.find(g=>g.id===id) || gradingSystems[0];
}
function getGradeFromSystem(marks, maxMarks=100, gs=null) {
  if (!gs) gs = getActiveGradingSystem();
  const pct = (marks / maxMarks) * 100;
  for (const b of gs.bands) {
    if (pct >= b.min && pct <= b.max) return { grade:b.grade, points:b.points, label:b.label, cls:b.cls };
  }
  return gs.bands[gs.bands.length-1];
}
function getMeanGradeFromSystem(mean, gs=null) {
  if (!gs) gs = getActiveGradingSystem();

  // ── Custom overall thresholds (set in Settings → Overall Grade Thresholds) ──
  const mode = settings?.overallGradingMode || 'auto';
  if (mode === 'custom' && Array.isArray(settings?.overallGradeThresholds) && settings.overallGradeThresholds.length) {
    const thresholds = [...settings.overallGradeThresholds].sort((a,b) => b.minMean - a.minMean);
    for (const t of thresholds) {
      if (mean >= t.minMean) return { grade:t.grade, label:t.label, cls:t.cls };
    }
    const last = thresholds[thresholds.length - 1];
    return { grade:last.grade, label:last.label, cls:last.cls };
  }

  // ── Auto mode: evenly distribute bands across the 0→subjectMax range ──
  // mean here arrives pre-scaled as mean/maxAvg*8 (0-8 scale)
  if (mean >= 7.5) return { grade: gs.bands[0]?.grade||'EE1', label: gs.bands[0]?.label||'Outstanding',     cls: gs.bands[0]?.cls||'b-green'  };
  const numBands  = gs.bands.length || 8;
  const step      = 8 / numBands;
  const bandsSorted = [...gs.bands].sort((a,b) => b.min - a.min); // highest first
  for (let i = 0; i < bandsSorted.length; i++) {
    const threshold = 8 - step * (i + 1);
    if (mean >= threshold) return { grade:bandsSorted[i].grade, label:bandsSorted[i].label, cls:bandsSorted[i].cls };
  }
  const last = bandsSorted[bandsSorted.length-1];
  return { grade:last.grade, label:last.label, cls:last.cls };
}

// Compute evenly-distributed mean thresholds for the given grading system (used by UI preview)
function computeAutoThresholds(gs, subjectMax) {
  if (!gs || !gs.bands || !gs.bands.length) return [];
  const max = subjectMax || 100;
  const bandsSorted = [...gs.bands].sort((a,b) => b.min - a.min);
  const step = max / bandsSorted.length;
  return bandsSorted.map((b, i) => ({
    grade:   b.grade,
    label:   b.label,
    cls:     b.cls,
    minMean: parseFloat((max - step * (i + 1)).toFixed(2)),
    maxMean: parseFloat((max - step * i - 0.01).toFixed(2))
  }));
}
function renderGradingSystemsTab() {
  const gs = getActiveGradingSystemId();
  const list = document.getElementById('gsSystemList');
  if (!list) return;
  list.innerHTML = gradingSystems.map(s=>`
    <div class="gs-item ${s.id===gs?'gs-active':''}">
      <div class="gs-item-info">
        <strong>${s.name}</strong>
        ${s.isDefault?'<span class="badge b-teal" style="font-size:.65rem">Built-in</span>':''}
        ${s.id===gs?'<span class="badge b-green" style="font-size:.65rem">Active</span>':''}
      </div>
      <div class="gs-item-btns">
        ${s.id!==gs?`<button class="btn btn-sm btn-outline" onclick="activateGS('${s.id}')">Set Active</button>`:''}
        <button class="btn btn-sm btn-outline" onclick="editGS('${s.id}')">✏️ Edit</button>
        ${!s.isDefault?`<button class="btn btn-sm btn-danger-sm" onclick="deleteGS('${s.id}')">Delete</button>`:''}
      </div>
    </div>`).join('') || '<p style="color:var(--muted)">No grading systems.</p>';
}
function activateGS(id) {
  setActiveGradingSystem(id);
  renderGradingSystemsTab();
  // If auto mode, recompute thresholds for new active GS
  if ((settings.overallGradingMode || 'auto') === 'auto') {
    settings.overallGradeThresholds = null; // clear cached custom so auto re-derives
  }
  renderOverallGradingCard();
  showToast('Grading system changed ✓','success');
}
function deleteGS(id) {
  if (!confirm('Delete this grading system?')) return;
  gradingSystems = gradingSystems.filter(g=>g.id!==id);
  localStorage.setItem(K_GS, JSON.stringify(gradingSystems));
  if (getActiveGradingSystemId()===id) setActiveGradingSystem(DEFAULT_GS_ID);
  renderGradingSystemsTab();
  showToast('Grading system deleted','info');
}
function saveNewGradingSystem() {
  const name = document.getElementById('gsNewName')?.value.trim();
  if (!name) { showToast('Enter a name for the grading system','error'); return; }
  const rows = document.querySelectorAll('.gs-band-row');
  const bands = [];
  let valid = true;
  rows.forEach(row => {
    const min = parseInt(row.querySelector('.gs-min').value);
    const max = parseInt(row.querySelector('.gs-max').value);
    const grade = row.querySelector('.gs-grade').value.trim();
    const points = parseFloat(row.querySelector('.gs-pts').value);
    const label = row.querySelector('.gs-lbl').value.trim();
    if (!grade || isNaN(min) || isNaN(max) || isNaN(points)) { valid=false; return; }
    const clsMap = { EE1:'b-green',EE2:'b-teal',ME1:'b-blue',ME2:'b-lblue',AE1:'b-amber',AE2:'b-orange',BE1:'b-red',BE2:'b-dkred' };
    bands.push({ min, max, grade, points, label, cls: clsMap[grade]||'b-blue' });
  });
  if (!valid || !bands.length) { showToast('Fill all band rows correctly','error'); return; }
  bands.sort((a,b)=>b.min-a.min);
  gradingSystems.push({ id:'gs_'+Date.now(), name, isDefault:false, bands });
  localStorage.setItem(K_GS, JSON.stringify(gradingSystems));
  renderGradingSystemsTab();
  showToast('New grading system added ✓','success');
  document.getElementById('gsNewName').value='';
}
function addGSBandRow() {
  const tbody = document.getElementById('gsBandsBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'gs-band-row';
  tr.innerHTML = `
    <td><input type="number" class="gs-min" placeholder="0" min="0" max="100" style="width:60px"/></td>
    <td><input type="number" class="gs-max" placeholder="100" min="0" max="100" style="width:60px"/></td>
    <td><input type="text" class="gs-grade" placeholder="EE1" maxlength="4" style="width:60px"/></td>
    <td><input type="number" class="gs-pts" placeholder="8" min="0" max="10" step="0.5" style="width:60px"/></td>
    <td><input type="text" class="gs-lbl" placeholder="Outstanding" style="width:120px"/></td>
    <td><button type="button" class="icb dl" onclick="this.closest('tr').remove()">🗑</button></td>`;
  tbody.appendChild(tr);
}


// ═══════════════ PORTAL NAVIGATION ═══════════════
function showUnifiedLogin() {
  ['app'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  // Hide fixed-position elements that escape parent display:none
  const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
  const tb = document.getElementById('topbar'); if (tb) tb.style.display = 'none';
  const mbn = document.getElementById('mobileBottomNav'); if (mbn) mbn.style.display = 'none';
  const mbnR = document.getElementById('mbnRestoreTab'); if (mbnR) mbnR.style.display = 'none';
  const ul = document.getElementById('unifiedLogin');
  if (ul) { ul.style.display='flex'; }
  const u=document.getElementById('uniUser'); const p=document.getElementById('uniPass');
  const err=document.getElementById('uniErr'); if(err) err.style.display='none';
  // Pre-fill saved credentials if "Remember me" was checked
  try {
    const saved = JSON.parse(localStorage.getItem('ei_saved_login') || 'null');
    if (saved && saved.username) {
      if(u) u.value = saved.username;
      if(p) p.value = saved.password || '';
      const rem = document.getElementById('uniRemember'); if(rem) rem.checked = true;
    } else {
      if(u) u.value=''; if(p) p.value='';
    }
  } catch(e) { if(u) u.value=''; if(p) p.value=''; }
  setTimeout(()=>{ if(u && !u.value) u.focus(); else if(p && !p.value) p.focus(); else if(u) u.focus(); },100);
}
function showDualPortal() { showUnifiedLogin(); } // backward compat alias
function showPlatformLogin() {
  document.getElementById('dualPortal').style.display = 'none';
  document.getElementById('platformLogin').style.display = 'flex';
  const creds = getPlatformCreds();
  const plTitle    = document.getElementById('plTitle');
  const plSubtitle = document.getElementById('plSubtitle');
  const plBtn      = document.getElementById('plBtn');
  const note       = document.getElementById('plFirstTimeNote');
  if (!creds) {
    if (plTitle)    plTitle.textContent    = 'Set Up Platform Account';
    if (plSubtitle) plSubtitle.textContent = 'Create your master admin credentials';
    if (plBtn)      plBtn.textContent      = 'Create Account & Continue →';
    if (note)       note.style.display     = '';
  } else {
    if (plTitle)    plTitle.textContent    = 'Platform Administration';
    if (plSubtitle) plSubtitle.textContent = 'Sign in to manage school accounts';
    if (plBtn)      plBtn.textContent      = 'Sign In →';
    if (note)       note.style.display     = 'none';
  }
}

function resetPlatformAccount() {
  if (!confirm('This will DELETE your platform admin credentials.\n\nYour school data will NOT be lost.\n\nProceed?')) return;
  localStorage.removeItem(PLATFORM_CREDS_KEY);
  document.getElementById('plUser').value = '';
  document.getElementById('plPass').value = '';
  document.getElementById('plErr').style.display = 'none';
  showToast('Platform account reset. Set new credentials below.', 'info');
  showPlatformLogin(); // re-render with first-time labels
}
function showUnifiedLogin() {
  // If no schools registered yet, redirect to platform admin setup
  loadPlatform();
  if (!platformSchools.length) {
    showPlatformLogin();
    const plErr = document.getElementById('plErr');
    if (plErr) {
      plErr.textContent = 'ℹ️ No schools registered yet. Set up your platform account first, then create a school.';
      plErr.style.display = 'block';
    }
    return;
  }
  // Go straight to school login without showing school list
  ['dualPortal','platformLogin','schoolSelector','app'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  // Hide fixed-position elements that escape parent display:none
  const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
  const tb = document.getElementById('topbar'); if (tb) tb.style.display = 'none';
  const mbn = document.getElementById('mobileBottomNav'); if (mbn) mbn.style.display = 'none';
  const mbnR = document.getElementById('mbnRestoreTab'); if (mbnR) mbnR.style.display = 'none';
  document.getElementById('lUser').value = '';
  document.getElementById('lPass').value = '';
  document.getElementById('loginErr').style.display = 'none';
  document.getElementById('schoolLoginLabel').textContent = 'School Login';
  // Flag that we are in direct-login mode (no pre-selected school)
  currentSchoolId = null;
  document.getElementById('loginScreen').style.display = 'flex';
}

// ═══════════════ FORGOT PASSWORD ═══════════════
// In-memory state for the reset flow
let _fpState = null; // { type:'school'|'teacher', id, schoolId, code, expiry }

function _maskContact(val) {
  if (!val) return null;
  val = val.trim();
  if (!val) return null;
  // Email
  if (val.includes('@')) {
    const [local, domain] = val.split('@');
    const masked = local.length <= 2 ? local[0] + '*'.repeat(local.length - 1)
      : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    return masked + '@' + domain;
  }
  // Phone
  if (val.length >= 6) {
    return val.slice(0, 3) + '*'.repeat(val.length - 5) + val.slice(-2);
  }
  return val[0] + '****';
}

function _fpGenCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function _fpFindAccount(username) {
  // Check school accounts first
  loadPlatform();
  const school = platformSchools.find(s => s.username === username);
  if (school) {
    return { type: 'school', record: school, schoolId: school.id };
  }
  // Check teachers across all schools — need to search each school's teacher list
  for (const sch of platformSchools) {
    const prefix = 'ei_' + sch.id + '_';
    let tchList = [];
    try { tchList = JSON.parse(localStorage.getItem(prefix + 'ei_teachers') || '[]'); } catch(e) {}
    const tch = tchList.find(t => t.username === username);
    if (tch) return { type: 'teacher', record: tch, schoolId: sch.id };
  }
  // Also check current loaded teachers (if school session active)
  if (teachers && teachers.length) {
    const tch = teachers.find(t => t.username === username);
    if (tch) return { type: 'teacher', record: tch, schoolId: currentSchoolId };
  }
  return null;
}

function showForgotPassword() {
  const panel = document.getElementById('fpPanel');
  if (!panel) return;
  // Reset to step 1
  document.getElementById('fpStep1').style.display = '';
  document.getElementById('fpStep2').style.display = 'none';
  document.getElementById('fpStep3').style.display = 'none';
  document.getElementById('fpUsername').value = '';
  const e1 = document.getElementById('fpStep1Err'); if (e1) { e1.style.display='none'; e1.textContent=''; }
  _fpState = null;
  panel.style.display = '';
  setTimeout(() => { const u = document.getElementById('fpUsername'); if (u) u.focus(); }, 100);
}

function fpCancel() {
  const panel = document.getElementById('fpPanel');
  if (panel) panel.style.display = 'none';
  _fpState = null;
}

function fpSendCode() {
  const username = (document.getElementById('fpUsername').value || '').trim();
  const errEl = document.getElementById('fpStep1Err');
  errEl.style.display = 'none'; errEl.textContent = '';

  if (!username) { errEl.textContent = '⚠️ Please enter your username.'; errEl.style.display = 'block'; return; }

  const found = _fpFindAccount(username);
  if (!found) {
    errEl.textContent = '❌ No account found with that username. Check spelling and try again.';
    errEl.style.display = 'block';
    return;
  }

  const { type, record, schoolId } = found;
  const phone = record.phone || '';
  const email = record.email || '';

  if (!phone && !email) {
    errEl.textContent = '❌ No phone number or email is registered for this account. Contact your administrator to reset your password.';
    errEl.style.display = 'block';
    return;
  }

  const code = _fpGenCode();
  _fpState = { type, id: record.id, schoolId, code, expiry: Date.now() + 10 * 60 * 1000, username };

  // Build sent-to message
  const contacts = [];
  if (phone) contacts.push('📱 Phone: ' + _maskContact(phone));
  if (email) contacts.push('✉️ Email: ' + _maskContact(email));

  // Simulate sending — show code in a dev-friendly toast for local use
  // In production, integrate with Africa's Talking / SMTP here
  console.info('[ForgotPassword] Reset code for', username, ':', code);
  showToast('Reset code generated. Check console or integrate SMS/email gateway.', 'info');

  // Show code inline for demo/local use (remove in production with real gateway)
  const sentMsg = document.getElementById('fpSentMsg');
  sentMsg.innerHTML = `A reset code has been sent to:<br><strong>${contacts.join('<br>')}</strong><br><br>
    <span style="font-size:.75rem;color:#64748b">Demo mode: your code is <strong style="color:#7c3aed;letter-spacing:.1em">${code}</strong></span>`;

  // Switch to step 2
  document.getElementById('fpStep1').style.display = 'none';
  document.getElementById('fpStep2').style.display = '';
  document.getElementById('fpCode').value = '';
  const e2 = document.getElementById('fpStep2Err'); if (e2) { e2.style.display='none'; e2.textContent=''; }
  setTimeout(() => { const c = document.getElementById('fpCode'); if (c) c.focus(); }, 100);
}

function fpResend() {
  if (!_fpState) { showForgotPassword(); return; }
  // Regenerate code and re-show step 2
  const newCode = _fpGenCode();
  _fpState.code = newCode;
  _fpState.expiry = Date.now() + 10 * 60 * 1000;
  console.info('[ForgotPassword] Resent reset code for', _fpState.username, ':', newCode);

  // Re-find account to get fresh contacts
  const found = _fpFindAccount(_fpState.username);
  const record = found ? found.record : null;
  const phone = record ? (record.phone||'') : '';
  const email = record ? (record.email||'') : '';
  const contacts = [];
  if (phone) contacts.push('📱 Phone: ' + _maskContact(phone));
  if (email) contacts.push('✉️ Email: ' + _maskContact(email));

  const sentMsg = document.getElementById('fpSentMsg');
  sentMsg.innerHTML = `A new reset code has been sent to:<br><strong>${contacts.join('<br>')}</strong><br><br>
    <span style="font-size:.75rem;color:#64748b">Demo mode: your code is <strong style="color:#7c3aed;letter-spacing:.1em">${newCode}</strong></span>`;

  document.getElementById('fpCode').value = '';
  const e2 = document.getElementById('fpStep2Err'); if (e2) { e2.style.display='none'; e2.textContent=''; }
  showToast('New reset code sent ✓', 'success');
}

function fpVerifyCode() {
  const entered = (document.getElementById('fpCode').value || '').trim();
  const errEl = document.getElementById('fpStep2Err');
  errEl.style.display = 'none'; errEl.textContent = '';

  if (!_fpState) { fpCancel(); return; }
  if (Date.now() > _fpState.expiry) {
    errEl.textContent = '⏰ Code expired. Please request a new one.';
    errEl.style.display = 'block';
    return;
  }
  if (entered !== _fpState.code) {
    errEl.textContent = '❌ Incorrect code. Please try again.';
    errEl.style.display = 'block';
    return;
  }

  // Code correct — move to step 3
  document.getElementById('fpStep2').style.display = 'none';
  document.getElementById('fpStep3').style.display = '';
  document.getElementById('fpNewPass').value = '';
  document.getElementById('fpConfPass').value = '';
  const e3 = document.getElementById('fpStep3Err'); if (e3) { e3.style.display='none'; e3.textContent=''; }
  setTimeout(() => { const p = document.getElementById('fpNewPass'); if (p) p.focus(); }, 100);
}

function fpSetPassword() {
  const newPass = document.getElementById('fpNewPass').value;
  const confPass = document.getElementById('fpConfPass').value;
  const errEl = document.getElementById('fpStep3Err');
  errEl.style.display = 'none'; errEl.textContent = '';

  if (!newPass || newPass.length < 6) {
    errEl.textContent = '⚠️ Password must be at least 6 characters.';
    errEl.style.display = 'block'; return;
  }
  if (newPass !== confPass) {
    errEl.textContent = '❌ Passwords do not match.';
    errEl.style.display = 'block'; return;
  }
  if (!_fpState) { fpCancel(); return; }

  const { type, id, schoolId } = _fpState;

  if (type === 'school') {
    loadPlatform();
    const school = platformSchools.find(s => s.id === id);
    if (!school) { errEl.textContent = '❌ Account not found.'; errEl.style.display='block'; return; }
    school.password = newPass;
    savePlatform();
  } else if (type === 'teacher') {
    // Load that school's teacher list, update, save
    const prefix = 'ei_' + schoolId + '_';
    const tchKey = prefix + 'ei_teachers';
    let tchList = [];
    try { tchList = JSON.parse(localStorage.getItem(tchKey) || '[]'); } catch(e) {}
    const tch = tchList.find(t => t.id === id);
    if (tch) {
      tch.password = newPass;
      localStorage.setItem(tchKey, JSON.stringify(tchList));
    }
    // Also update in-memory teachers array if same school is loaded
    const inMem = teachers.find(t => t.id === id);
    if (inMem) {
      inMem.password = newPass;
      save(K.teachers, teachers);
    }
  }

  _fpState = null;
  fpCancel();
  showToast('✅ Password updated successfully! Please log in with your new password.', 'success');
}

// ═══════════════ AUTH ═══════════════
// ── Platform Login ──
function doPlatformLogin() {
  const u = document.getElementById('plUser').value.trim();
  const p = document.getElementById('plPass').value;
  const errEl = document.getElementById('plErr');
  errEl.style.display = 'none';
  const btn = document.getElementById('plBtn');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  const re = () => { if (btn) { btn.disabled = false; btn.textContent = origText; } };
  const creds = getPlatformCreds();

  // First-ever run: no creds saved yet — confirm before creating account
  if (!creds) {
    if (!u || !p) {
      re();
      errEl.textContent = '❌ Enter a username and password to create your platform account.';
      errEl.style.display = 'block';
      return;
    }
    if (p.length < 6) {
      re();
      errEl.textContent = '❌ Password must be at least 6 characters.';
      errEl.style.display = 'block';
      return;
    }
    // Confirm before creating — prevents accidental overwrites
    if (!confirm(`Create a new Platform Admin account?\n\nUsername: ${u}\n\nMake sure you remember these credentials — they cannot be recovered without resetting.`)) {
      re();
      return;
    }
    setPlatformCreds(u, p);
    re();
    showToast('Platform account created ✓', 'success');
    showSchoolSelector(true);
    return;
  }

  if (u === creds.username && p === creds.password) {
    re();
    showSchoolSelector(true);
  } else {
    re();
    // Give a more helpful error — hint about case sensitivity and reset option
    errEl.innerHTML = '❌ Invalid platform credentials. Check your username and password (case-sensitive). <br><span style="font-size:.78rem;color:#64748b">Forgot them? Use the <strong>Reset Platform Account</strong> button below.</span>';
    errEl.style.display = 'block';
  }
}

// ══ UNIFIED LOGIN — single screen, password routes to platform or school ══
function doUnifiedLogin() {
  const u   = document.getElementById('uniUser').value.trim();
  const p   = document.getElementById('uniPass').value;
  const err = document.getElementById('uniErr');
  const btn = document.getElementById('uniBtn');
  err.style.display = 'none';
  if (btn) { btn.disabled=true; btn.textContent='Signing in…'; }
  const re = () => { if(btn){ btn.disabled=false; btn.textContent='Sign In →'; } };
  // Helper: save credentials if "Remember me" is checked
  const maybeSaveCreds = () => {
    try {
      const rem = document.getElementById('uniRemember');
      if (rem && rem.checked) {
        localStorage.setItem('ei_saved_login', JSON.stringify({ username: u, password: p }));
      } else {
        localStorage.removeItem('ei_saved_login');
      }
    } catch(e) {}
  };

  if (!u || !p) { re(); err.textContent='❌ Please enter your username and password.'; err.style.display='block'; return; }

  loadPlatform();

  // ── 1. Check platform admin credentials ──
  const creds = getPlatformCreds();
  if (!creds) {
    // First ever run — if nothing else matches, offer to create platform account
    // Try schools first; if no match, treat as first-time platform setup
    const anySchoolMatch = platformSchools.some(s => s.username===u && s.password===p);
    if (!anySchoolMatch) {
      if (p.length < 6) { re(); err.textContent='❌ No account found. Platform password must be ≥6 chars to create.'; err.style.display='block'; return; }
      if (!confirm('Create a new Platform Admin account?\n\nUsername: '+u+'\n\nRemember these credentials — they cannot be recovered without a reset.')) { re(); return; }
      setPlatformCreds(u, p);
      re();
      maybeSaveCreds();
      showToast('Platform account created ✓','success');
      enterPlatformDashboard();
      return;
    }
  } else if (u === creds.username && p === creds.password) {
    re();
    maybeSaveCreds();
    enterPlatformDashboard();
    return;
  }

  // ── 2. Try school credentials ──
  // superadmin built-in
  if (u==='superadmin' && p==='super123') {
    currentUser = { id:'builtin', name:'Super Admin', username:'superadmin', role:'superadmin', builtin:true, canAnalyse:true, canReport:true, canMerit:true };
    if (platformSchools.length === 0) { re(); err.innerHTML='⚠️ No school accounts yet. Log in with your platform admin credentials to create schools first.'; err.style.display='block'; return; }
    // go to first school or school selector — use school selector via legacy path
    re();
    maybeSaveCreds();
    currentSchoolId = null;
    const school = platformSchools[0];
    loadSchoolContext(school);
    saveSession();
    finishLogin(school);
    return;
  }

  for (const school of platformSchools) {
    if (school.active === false) {
      if (school.username===u && school.password===p) {
        re(); const msg=school.deactivationMessage||'This school account has been suspended.';
        err.innerHTML='🔒 <strong>Account Suspended:</strong> '+msg; err.style.display='block'; return;
      }
      // also check admins/teachers in suspended school — block them too
      loadSchoolContext(school);
      const matchInSuspended = admins.find(a=>a.username===u&&a.password===p) || teachers.find(t=>t.username===u&&t.password===p);
      if (matchInSuspended) { re(); const msg=school.deactivationMessage||'This school account has been suspended.'; err.innerHTML='🔒 <strong>Account Suspended:</strong> '+msg; err.style.display='block'; return; }
      currentSchoolId = null; continue;
    }
    if (school.username===u && school.password===p) {
      loadSchoolContext(school);
      currentUser={ username:school.username, role:'admin', name:school.name, canAnalyse:true, canReport:true, canMerit:true };
      re(); maybeSaveCreds(); finishLogin(school); return;
    }
    loadSchoolContext(school);
    const admin = admins.find(a=>a.username===u&&a.password===p);
    if (admin) { currentUser={...admin,canAnalyse:true,canReport:true,canMerit:true}; re(); maybeSaveCreds(); finishLogin(school); return; }
    const teacher = teachers.find(t=>t.username===u&&t.password===p);
    if (teacher) { currentUser={username:teacher.username,role:'teacher',name:teacher.name,teacherId:teacher.id,canAnalyse:teacher.canAnalyse,canReport:teacher.canReport,canMerit:teacher.canMerit}; re(); maybeSaveCreds(); finishLogin(school); return; }
    currentSchoolId = null;
  }

  re();
  err.innerHTML='❌ Invalid credentials. Check your username and password (case-sensitive).';
  err.style.display='block';
}

function enterPlatformDashboard() {
  currentUser = { username: getPlatformCreds().username, role:'platform_admin', name:'Platform Admin', canAnalyse:true, canReport:true, canMerit:true };
  currentSchoolId = null;
  saveSession();
  document.getElementById('unifiedLogin').style.display='none';
  document.getElementById('app').style.display='flex';
  // Show topbar and sidebar for platform admin
  const tb = document.getElementById('topbar'); if (tb) tb.style.display = '';
  const sb = document.getElementById('sidebar'); if (sb) sb.style.display = '';
  document.getElementById('tbUser').textContent = '⚙️ Platform Admin';
  // Show mobile bottom nav
  const mbn = document.getElementById('mobileBottomNav');
  if (mbn) mbn.style.display = '';
  // Platform portal: hide school-specific nav, only show Platform Admin link
  ['subjects','classes','teachers','students','timetable','exambuilder','exams','reports','papers','fees','messaging','settings'].forEach(s=>{
    const el=document.querySelector('[data-s="'+s+'"]'); if(el) el.style.display='none';
  });
  // Hide school-only exam tabs for platform admin
  ['tbPlatformMarks','tbPlatformResults'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  // Hide school nav items in mobile nav too for platform admin
  document.querySelectorAll('.mbn-item[data-s]').forEach(el=>{
    if (el.dataset.s !== 'platform') el.style.display='none';
  });
  const platLink = document.getElementById('platNavLink'); if(platLink) platLink.style.display='';
  if (localStorage.getItem('ei_dark')==='1') applyDark(true);
  renderPlatformDashboard();
  platRenderNavConfig();
  go('platform', document.getElementById('platNavLink'));
}

// ══ PLATFORM DASHBOARD FUNCTIONS ══
const K_BROADCAST_MSG = () => localStorage.getItem(K_BROADCAST) || '';
function saveBroadcastMessage() {
  const msg = (document.getElementById('broadcastMsgInput').value||'').trim();
  localStorage.setItem(K_BROADCAST, msg);
  const status = document.getElementById('broadcastStatus');
  if (status) { status.textContent = msg ? '✅ Message published to all schools.' : '✅ Banner cleared.'; setTimeout(()=>{status.textContent='';},3000); }
  renderBroadcastPreview();
  showToast(msg ? '📢 Broadcast message published!' : 'Broadcast cleared','success');
}
function clearBroadcastMessage() {
  localStorage.removeItem(K_BROADCAST);
  const inp = document.getElementById('broadcastMsgInput'); if(inp) inp.value='';
  renderBroadcastPreview();
  showToast('Broadcast cleared','info');
}
function renderBroadcastPreview() {
  const msg = localStorage.getItem(K_BROADCAST)||'';
  const prev = document.getElementById('broadcastPreview');
  const prevTxt = document.getElementById('broadcastPreviewText');
  if (!prev) return;
  if (msg) { prev.style.display=''; prevTxt.textContent=msg; } else { prev.style.display='none'; }
}
function loadBroadcastBanner() {
  // Called on school login — show banner if message set
  const msg = localStorage.getItem(K_BROADCAST)||'';
  const banner = document.getElementById('platformBroadcastBanner');
  const bannerTxt = document.getElementById('platformBroadcastText');
  if (!banner) return;
  if (msg) { banner.style.display='flex'; if(bannerTxt) bannerTxt.textContent=msg; }
  else { banner.style.display='none'; }
}
function renderPlatformDashboard() {
  // Broadcast
  const inp = document.getElementById('broadcastMsgInput');
  if (inp) inp.value = localStorage.getItem(K_BROADCAST)||'';
  renderBroadcastPreview();
  // Schools list
  renderPlatformSchoolMgmtList();
  // Promote dropdown
  populatePromoteSchoolDropdown();
  // Platform exams
  populatePlatExamGradingDropdown();
  renderPlatExamList();
  // Platform paper upload list
  renderPlatPapList();
  // API key
  const apiInp = document.getElementById('platApiKeyInput');
  if (apiInp) { const k = ebGetApiKey(); if (k) apiInp.value = k; }
  // Highlight default destination radio
  platPaperDestChange();
}
function renderPlatformSchoolMgmtList() {
  const el = document.getElementById('platformSchoolMgmtList'); if(!el) return;
  loadPlatform();
  populatePromoteSchoolDropdown();
  if (!platformSchools.length) { el.innerHTML='<p style="color:var(--muted);font-size:.85rem">No schools yet. Create one below.</p>'; return; }
  el.innerHTML = platformSchools.map(s => {
    const isActive = s.active !== false;
    const statusBadge = isActive
      ? `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:700;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);border-radius:99px;padding:.15rem .6rem">● Active</span>`
      : `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:700;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);border-radius:99px;padding:.15rem .6rem">● Suspended</span>`;
    return `
    <div style="display:flex;align-items:flex-start;gap:.85rem;padding:.75rem 1rem;border-radius:10px;border:1.5px solid ${isActive?'var(--border)':'rgba(239,68,68,.3)'};margin-bottom:.6rem;background:var(--surface);${isActive?'':'opacity:.92'}">
      <div style="width:2.4rem;height:2.4rem;border-radius:50%;background:${isActive?'linear-gradient(135deg,#1a6fb5,#7c3aed)':'linear-gradient(135deg,#ef4444,#b91c1c)'};color:#fff;font-weight:800;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${s.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.2rem">
          <span style="font-weight:700;font-size:.92rem">${s.name}</span>
          ${statusBadge}
        </div>
        <div style="font-size:.75rem;color:var(--muted)">@${s.username}${s.email?' · '+s.email:''} · Joined ${new Date(s.createdAt).toLocaleDateString()}</div>
        ${!isActive && s.deactivationMessage ? `<div style="font-size:.74rem;color:#f87171;margin-top:.3rem;font-style:italic;line-height:1.4">📢 "${s.deactivationMessage.substring(0,80)}${s.deactivationMessage.length>80?'…':''}"</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:.35rem;flex-shrink:0">
        <button onclick="toggleSchoolActive('${s.id}');setTimeout(renderPlatformSchoolMgmtList,80)" 
          style="font-size:.72rem;font-weight:700;padding:.3rem .7rem;border-radius:7px;cursor:pointer;font-family:inherit;border:1px solid ${isActive?'rgba(239,68,68,.4)':'rgba(16,185,129,.4)'};background:${isActive?'rgba(239,68,68,.08)':'rgba(16,185,129,.08)'};color:${isActive?'#ef4444':'#10b981'}">
          ${isActive ? '⏸ Suspend' : '▶ Activate'}
        </button>
        ${!isActive ? `<button onclick="editDeactivationMessage('${s.id}');setTimeout(renderPlatformSchoolMgmtList,300)" style="font-size:.72rem;font-weight:700;padding:.3rem .7rem;border-radius:7px;cursor:pointer;font-family:inherit;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.08);color:#f59e0b">✏️ Edit Msg</button>` : ''}
        <button onclick="platDeleteSchool('${s.id}')" 
          style="font-size:.72rem;font-weight:700;padding:.3rem .7rem;border-radius:7px;cursor:pointer;font-family:inherit;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.06);color:#ef4444">
          🗑 Delete
        </button>
      </div>
    </div>`;
  }).join('');
}
function platAddSchool() {
  const name  = (document.getElementById('platSchName').value||'').trim();
  const uname = (document.getElementById('platSchUser').value||'').trim();
  const pass  = (document.getElementById('platSchPass').value||'').trim();
  const email = (document.getElementById('platSchEmail').value||'').trim();
  const phone = (document.getElementById('platSchPhone') ? document.getElementById('platSchPhone').value||'' : '').trim();
  if(!name||!uname||!pass){ showToast('Name, username and password are required','error'); return; }
  loadPlatform();
  if(platformSchools.find(s=>s.username===uname)){ showToast('Username already taken','error'); return; }
  const s={id:uid(),name,username:uname,password:pass,email,phone,createdAt:new Date().toISOString(),active:true};
  platformSchools.push(s); savePlatform();
  document.getElementById('platSchName').value=''; document.getElementById('platSchUser').value=''; document.getElementById('platSchPass').value=''; document.getElementById('platSchEmail').value='';
  const phEl=document.getElementById('platSchPhone'); if(phEl) phEl.value='';
  renderPlatformSchoolMgmtList();
  showToast('School "'+name+'" created ✓','success');
}
function platToggleSchool(id) {
  // Delegate to the full toggleSchoolActive system (handles suspend modal)
  toggleSchoolActive(id);
}
function platDeleteSchool(id) {
  loadPlatform();
  const s=platformSchools.find(x=>x.id===id); if(!s) return;
  if(!confirm('Delete "'+s.name+'"?\n\nAll data for this school will be permanently removed.')) return;
  // Wipe school data
  Object.keys(localStorage).filter(k=>k.startsWith(id+'_')).forEach(k=>localStorage.removeItem(k));
  platformSchools = platformSchools.filter(x=>x.id!==id);
  savePlatform(); renderPlatformSchoolMgmtList();
  showToast('School deleted','info');
}
function platUploadExam() {
  const title   = (document.getElementById('platExamTitle').value||'').trim();
  const subject = (document.getElementById('platExamSubject').value||'').trim();
  const cls     = (document.getElementById('platExamClass').value||'').trim();
  const term    = document.getElementById('platExamTerm').value;
  const year    = document.getElementById('platExamYear').value||'2026';
  const maxScore= parseInt(document.getElementById('platExamMax').value||'100');
  const notes   = (document.getElementById('platExamNotes').value||'').trim();
  const gsId    = (document.getElementById('platExamGradingSystem')?.value||'').trim();
  const msgEl   = document.getElementById('platExamMsg');
  if(!title){ if(msgEl){msgEl.textContent='❌ Exam title is required.';msgEl.style.display='';msgEl.style.color='var(--danger)';} return; }
  if(!gsId){ if(msgEl){msgEl.textContent='❌ Select a grading system to lock for this exam.';msgEl.style.display='';msgEl.style.color='var(--danger)';} return; }
  const exam={id:uid(),title,subject,class:cls,term,year,maxScore,notes,gradingSystemId:gsId,timetable:[],createdAt:new Date().toISOString(),isPlatformExam:true};
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  plExams.unshift(exam); localStorage.setItem(K_PLATFORM_EXAMS,JSON.stringify(plExams));
  if(msgEl){msgEl.textContent='✅ Exam pushed to all schools!';msgEl.style.display='';msgEl.style.color='var(--success,#16a34a)';setTimeout(()=>{msgEl.style.display='none';},3500);}
  document.getElementById('platExamTitle').value=''; document.getElementById('platExamSubject').value=''; document.getElementById('platExamClass').value=''; document.getElementById('platExamNotes').value='';
  renderPlatExamList();
  showToast('Exam "'+title+'" pushed to all schools!','success');
}

function populatePlatExamGradingDropdown() {
  const sel = document.getElementById('platExamGradingSystem'); if(!sel) return;
  sel.innerHTML = '<option value="">— Select Grading System —</option>' +
    gradingSystems.map(g=>`<option value="${g.id}">${g.name}${g.isDefault?' (Default)':''}</option>`).join('');
}

function renderPlatExamList() {
  const el=document.getElementById('platExamList'); if(!el) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  if(!plExams.length){el.innerHTML='<p style="color:var(--muted);font-size:.82rem">No platform exams distributed yet.</p>';return;}
  el.innerHTML='<div style="display:flex;flex-direction:column;gap:.75rem">'+plExams.map(e=>{
    const gs = gradingSystems.find(g=>g.id===e.gradingSystemId);
    const gsName = gs ? gs.name : '—';
    const ttCount = (e.timetable||[]).length;
    const marksData = getPlatformSchoolMarks(e.id);
    const schoolsSubmitted = Object.keys(marksData).length;
    const resultsData = getPlatformResults(e.id);
    const analysed = resultsData && resultsData.analysed;
    return `
    <div style="border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden">
      <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-weight:700;font-size:.88rem">${e.title}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${[e.subject,e.class,e.term,e.year].filter(Boolean).join(' · ')} · Max: ${e.maxScore}</div>
          <div style="font-size:.73rem;margin-top:.2rem"><span style="background:#ede9fe;color:#7c3aed;padding:.1rem .45rem;border-radius:4px;font-weight:700">🎓 ${gsName}</span> <span style="background:#f0fdf4;color:#15803d;padding:.1rem .45rem;border-radius:4px;font-weight:700;margin-left:.3rem">📅 ${ttCount} session${ttCount!==1?'s':''}</span> <span style="background:#eff6ff;color:#1d4ed8;padding:.1rem .45rem;border-radius:4px;font-weight:700;margin-left:.3rem">🏫 ${schoolsSubmitted} school${schoolsSubmitted!==1?'s':''} submitted</span>${analysed?'<span style="background:#fef9c3;color:#854d0e;padding:.1rem .45rem;border-radius:4px;font-weight:700;margin-left:.3rem">✅ Results Published</span>':''}</div>
        </div>
        <button class="btn btn-outline btn-sm" style="font-size:.72rem" onclick="platOpenTimetableEditor('${e.id}')">📅 Timetable</button>
        <button class="btn btn-primary btn-sm" style="font-size:.72rem;background:linear-gradient(135deg,#7c3aed,#1d4ed8)" onclick="platAnalyseExamResults('${e.id}')">📊 Analyse</button>
        <button class="btn btn-danger btn-sm" style="font-size:.72rem" onclick="platDeleteExam('${e.id}')">Delete</button>
      </div>
      ${analysed ? `<div style="padding:.55rem .9rem;background:linear-gradient(90deg,rgba(250,204,21,.08),transparent);border-top:2px solid #fbbf24;font-size:.78rem">
        <strong>📊 Results Published</strong> · Generated ${new Date(resultsData.generatedAt).toLocaleDateString()} · ${(resultsData.schoolSummaries||[]).length} schools · <button class="btn btn-outline btn-sm" style="font-size:.7rem;padding:.2rem .55rem" onclick="platViewPublishedResults('${e.id}')">View Results</button></div>` : ''}
    </div>`;
  }).join('')+'</div>';
}

function platDeleteExam(id) {
  if(!confirm('Delete this platform exam? All submitted marks and results will also be removed.')) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  plExams=plExams.filter(e=>e.id!==id); localStorage.setItem(K_PLATFORM_EXAMS,JSON.stringify(plExams));
  // Clean up associated marks and results
  try { const all=JSON.parse(localStorage.getItem(K_PLATFORM_SCHOOL_MARKS)||'{}'); delete all[id]; localStorage.setItem(K_PLATFORM_SCHOOL_MARKS,JSON.stringify(all)); } catch{}
  try { const all=JSON.parse(localStorage.getItem(K_PLATFORM_RESULTS)||'{}'); delete all[id]; localStorage.setItem(K_PLATFORM_RESULTS,JSON.stringify(all)); } catch{}
  renderPlatExamList(); showToast('Exam removed','info');
}

// ─── Helpers for platform marks & results storage ───
function getPlatformSchoolMarks(examId) {
  try { const all=JSON.parse(localStorage.getItem(K_PLATFORM_SCHOOL_MARKS)||'{}'); return all[examId]||{}; } catch { return {}; }
}
function savePlatformSchoolMarks(examId, schoolId, marksArr) {
  try {
    const all=JSON.parse(localStorage.getItem(K_PLATFORM_SCHOOL_MARKS)||'{}');
    if(!all[examId]) all[examId]={};
    all[examId][schoolId]=marksArr;
    localStorage.setItem(K_PLATFORM_SCHOOL_MARKS,JSON.stringify(all));
  } catch(e){ console.error(e); }
}
function getPlatformResults(examId) {
  try { const all=JSON.parse(localStorage.getItem(K_PLATFORM_RESULTS)||'{}'); return all[examId]||null; } catch { return null; }
}
function savePlatformResults(examId, data) {
  try {
    const all=JSON.parse(localStorage.getItem(K_PLATFORM_RESULTS)||'{}');
    all[examId]=data;
    localStorage.setItem(K_PLATFORM_RESULTS,JSON.stringify(all));
  } catch(e){ console.error(e); }
}

// ─── TIMETABLE EDITOR (Platform Admin) ───
function platOpenTimetableEditor(examId) {
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const overlay = document.getElementById('platTimetableOverlay');
  if(!overlay) return;
  overlay.dataset.examId = examId;
  document.getElementById('platTTExamTitle').textContent = exam.title;
  renderPlatTimetableRows(exam.timetable||[]);
  overlay.style.display='flex';
}
function closePlatTimetableEditor() {
  const overlay = document.getElementById('platTimetableOverlay');
  if(overlay) overlay.style.display='none';
}
function renderPlatTimetableRows(rows) {
  const tbody = document.getElementById('platTTBody'); if(!tbody) return;
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.25rem;font-size:.83rem">No sessions added yet. Use the form below to add exam sessions.</td></tr>'; return; }
  tbody.innerHTML = rows.map((r,i)=>`
    <tr>
      <td style="padding:.5rem .6rem;font-size:.82rem;font-weight:600">${r.date||'—'}</td>
      <td style="padding:.5rem .6rem;font-size:.82rem">${r.day||'—'}</td>
      <td style="padding:.5rem .6rem;font-size:.82rem">${r.time||'—'}</td>
      <td style="padding:.5rem .6rem;font-size:.82rem;font-weight:600">${r.subject||'—'}</td>
      <td style="padding:.5rem .6rem;font-size:.82rem">${r.venue||'—'}</td>
      <td style="padding:.5rem .3rem;text-align:center"><button class="btn btn-danger btn-sm" style="font-size:.7rem;padding:.15rem .4rem" onclick="platRemoveTTRow(${i})">✕</button></td>
    </tr>`).join('');
}
function platAddTTRow() {
  const date    = (document.getElementById('platTTDate')?.value||'').trim();
  const day     = (document.getElementById('platTTDay')?.value||'').trim();
  const time    = (document.getElementById('platTTTime')?.value||'').trim();
  const subject = (document.getElementById('platTTSubject')?.value||'').trim();
  const venue   = (document.getElementById('platTTVenue')?.value||'').trim();
  if(!subject){ showToast('Subject is required','error'); return; }
  const examId = document.getElementById('platTimetableOverlay')?.dataset.examId; if(!examId) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const idx = plExams.findIndex(e=>e.id===examId); if(idx<0) return;
  if(!plExams[idx].timetable) plExams[idx].timetable=[];
  plExams[idx].timetable.push({date,day,time,subject,venue});
  localStorage.setItem(K_PLATFORM_EXAMS,JSON.stringify(plExams));
  renderPlatTimetableRows(plExams[idx].timetable);
  ['platTTDate','platTTDay','platTTTime','platTTSubject','platTTVenue'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  showToast('Session added ✓','success');
}
function platRemoveTTRow(rowIdx) {
  const examId = document.getElementById('platTimetableOverlay')?.dataset.examId; if(!examId) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const idx = plExams.findIndex(e=>e.id===examId); if(idx<0) return;
  plExams[idx].timetable.splice(rowIdx,1);
  localStorage.setItem(K_PLATFORM_EXAMS,JSON.stringify(plExams));
  renderPlatTimetableRows(plExams[idx].timetable);
}
function platSaveTimetable() {
  closePlatTimetableEditor();
  renderPlatExamList();
  showToast('Timetable saved ✓','success');
}

// ─── ANALYSE PLATFORM EXAM RESULTS (Admin only) ───
function platAnalyseExamResults(examId) {
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const allMarks = getPlatformSchoolMarks(examId);
  const schoolIds = Object.keys(allMarks);
  if(!schoolIds.length){ showToast('No schools have submitted marks yet for this exam.','warning'); return; }

  const gs = gradingSystems.find(g=>g.id===exam.gradingSystemId) || gradingSystems[0];
  const schoolSummaries = schoolIds.map(schoolId => {
    const school = platformSchools.find(s=>s.id===schoolId);
    const rows = allMarks[schoolId] || [];
    if(!rows.length) return null;
    const scores = rows.map(r=>r.score).filter(s=>typeof s==='number'&&!isNaN(s));
    if(!scores.length) return null;
    const mean = scores.reduce((a,b)=>a+b,0)/scores.length;
    const max  = exam.maxScore||100;
    const passScore = max * 0.5;
    const passed = scores.filter(s=>s>=passScore).length;
    const passRate = (passed/scores.length*100).toFixed(1);
    // Grade distribution
    const gradeDist = {};
    scores.forEach(s=>{ const g=getGradeFromSystem(s,max,gs); gradeDist[g.grade]=(gradeDist[g.grade]||0)+1; });
    return {
      schoolId, schoolName: school?.name||schoolId,
      studentCount: scores.length, mean: parseFloat(mean.toFixed(2)),
      passRate: parseFloat(passRate), passed, gradeDist,
      highest: Math.max(...scores), lowest: Math.min(...scores)
    };
  }).filter(Boolean);

  // Sort by mean score descending (ranking)
  schoolSummaries.sort((a,b)=>b.mean-a.mean);
  schoolSummaries.forEach((s,i)=>{ s.rank=i+1; });

  const resultData = { analysed:true, examId, examTitle:exam.title, generatedAt:new Date().toISOString(), schoolSummaries, gradingSystemName:gs.name, maxScore:exam.maxScore };
  savePlatformResults(examId, resultData);
  renderPlatExamList();
  showToast(`✅ Results analysed for ${schoolSummaries.length} school(s). Results are now visible to all schools.`,'success');
  setTimeout(()=>platViewPublishedResults(examId), 400);
}

// ─── VIEW PUBLISHED RESULTS (Admin preview) ───
function platViewPublishedResults(examId) {
  const data = getPlatformResults(examId); if(!data||!data.analysed) { showToast('No published results for this exam.','info'); return; }
  const overlay = document.getElementById('platResultsOverlay'); if(!overlay) return;
  document.getElementById('platResTitle').textContent = data.examTitle + ' — Results';
  document.getElementById('platResGenDate').textContent = 'Generated: ' + new Date(data.generatedAt).toLocaleString() + ' · Grading: ' + (data.gradingSystemName||'—');
  const tbody = document.getElementById('platResBody');
  const summaries = data.schoolSummaries||[];
  if(!summaries.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--muted)">No data.</td></tr>'; }
  else {
    tbody.innerHTML = summaries.map(s=>`
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:.5rem .65rem;font-weight:700;color:${s.rank===1?'#b45309':s.rank===2?'#475569':s.rank===3?'#92400e':'var(--text)'}">${s.rank===1?'🥇':s.rank===2?'🥈':s.rank===3?'🥉':'#'+s.rank}</td>
        <td style="padding:.5rem .65rem;font-weight:600">${s.schoolName}</td>
        <td style="padding:.5rem .65rem;text-align:center">${s.studentCount}</td>
        <td style="padding:.5rem .65rem;text-align:center;font-weight:700;color:${s.mean>=70?'#15803d':s.mean>=50?'#b45309':'#dc2626'}">${s.mean.toFixed(1)}</td>
        <td style="padding:.5rem .65rem;text-align:center">${s.passRate}%</td>
        <td style="padding:.5rem .65rem;text-align:center">${s.highest}</td>
        <td style="padding:.5rem .65rem;text-align:center">${s.lowest}</td>
      </tr>`).join('');
  }
  overlay.style.display='flex';
}
function closePlatResultsOverlay() {
  const overlay = document.getElementById('platResultsOverlay'); if(overlay) overlay.style.display='none';
}

// ─── SCHOOL: Submit Marks for Platform Exam ───
function renderPlatformExamMarkEntry() {
  const sel = document.getElementById('platMarkExamSel'); if(!sel) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  sel.innerHTML='<option value="">— Select Platform Exam —</option>'+plExams.map(e=>`<option value="${e.id}">${e.title} (${e.term} ${e.year})</option>`).join('');
}
function loadPlatformExamMarkTable() {
  const examId = document.getElementById('platMarkExamSel')?.value; if(!examId) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const gs = gradingSystems.find(g=>g.id===exam.gradingSystemId)||gradingSystems[0];
  const container = document.getElementById('platMarkTableContainer'); if(!container) return;
  const existingMarks = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
  const markMap = {};
  existingMarks.forEach(r=>{ markMap[r.adm+':'+r.subject]=r.score; });
  // Show/hide timetable download button
  const ttWrap = document.getElementById('platMarkTTDownloadWrap');
  if(ttWrap) { ttWrap.style.display = (exam.timetable&&exam.timetable.length) ? '' : 'none'; }
  // Show grading lock notice
  const notice = document.getElementById('platMarkGradingNotice');
  if(notice){ notice.textContent = `🔒 Grading locked to: ${gs.name}`; notice.style.display=''; }
  // Build a simple subject+student entry form
  container.innerHTML = `
    <p style="font-size:.8rem;color:var(--muted);margin-bottom:.75rem">Enter student marks below. Grading is automatically applied using <strong>${gs.name}</strong> as set by the platform.</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
      <div class="fg" style="flex:1;min-width:160px"><label style="font-size:.78rem">Subject</label><input type="text" id="platMarkSubject" placeholder="e.g. Mathematics" style="width:100%"/></div>
      <div class="fg" style="flex:1;min-width:120px"><label style="font-size:.78rem">Adm No</label><input type="text" id="platMarkAdm" placeholder="e.g. 001" style="width:100%"/></div>
      <div class="fg" style="flex:1;min-width:140px"><label style="font-size:.78rem">Student Name</label><input type="text" id="platMarkName" placeholder="Full name" style="width:100%"/></div>
      <div class="fg" style="width:90px"><label style="font-size:.78rem">Score</label><input type="number" id="platMarkScore" min="0" max="${exam.maxScore}" placeholder="0-${exam.maxScore}" style="width:100%"/></div>
      <div style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-sm" onclick="platAddMarkRow('${examId}')">Add</button></div>
    </div>
    <div style="margin-bottom:.75rem;display:flex;gap:.5rem;flex-wrap:wrap">
      <label class="btn btn-outline btn-sm" style="cursor:pointer;font-size:.78rem">📤 Upload Excel <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="platHandleMarksExcel(this,'${examId}')"/></label>
      <button class="btn btn-outline btn-sm" style="font-size:.78rem" onclick="platDownloadMarksTemplate('${examId}')">⬇️ Download Template</button>
    </div>
    <div id="platMarkRows" style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
      <table style="width:100%;border-collapse:collapse">
        <thead style="position:sticky;top:0;background:var(--surface);font-size:.78rem;z-index:1">
          <tr style="border-bottom:2px solid var(--border)">
            <th style="padding:.4rem .6rem;text-align:left">Adm No</th>
            <th style="padding:.4rem .6rem;text-align:left">Name</th>
            <th style="padding:.4rem .6rem;text-align:left">Subject</th>
            <th style="padding:.4rem .6rem;text-align:center">Score</th>
            <th style="padding:.4rem .6rem;text-align:center">Grade</th>
            <th style="padding:.4rem .1rem"></th>
          </tr>
        </thead>
        <tbody id="platMarkRowsBody"></tbody>
      </table>
    </div>
    <div id="platMarkCount" style="font-size:.78rem;color:var(--muted);margin-top:.4rem"></div>
    <div style="margin-top:.75rem;display:flex;gap:.75rem">
      <button class="btn btn-primary" onclick="platSubmitSchoolMarks('${examId}')">✅ Submit Marks to Platform</button>
    </div>`;
  refreshPlatMarkRowsBody(examId);
}
function refreshPlatMarkRowsBody(examId) {
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const gs = gradingSystems.find(g=>g.id===exam.gradingSystemId)||gradingSystems[0];
  const rows = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
  const tbody = document.getElementById('platMarkRowsBody'); if(!tbody) return;
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem;font-size:.8rem">No marks entered yet.</td></tr>'; }
  else {
    tbody.innerHTML = rows.map((r,i)=>{
      const g = getGradeFromSystem(r.score, exam.maxScore, gs);
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:.35rem .6rem;font-size:.8rem;font-family:var(--mono)">${r.adm}</td>
        <td style="padding:.35rem .6rem;font-size:.8rem">${r.studentName}</td>
        <td style="padding:.35rem .6rem;font-size:.8rem">${r.subject}</td>
        <td style="padding:.35rem .6rem;text-align:center;font-weight:700">${r.score}</td>
        <td style="padding:.35rem .6rem;text-align:center"><span class="badge ${g.cls}" style="font-size:.68rem">${g.grade}</span></td>
        <td style="padding:.35rem .2rem;text-align:center"><button onclick="platRemoveMarkRow('${examId}',${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.85rem">✕</button></td>
      </tr>`;
    }).join('');
  }
  const cnt = document.getElementById('platMarkCount');
  if(cnt) cnt.textContent = rows.length ? `${rows.length} record${rows.length!==1?'s':''} ready to submit` : '';
}
function platAddMarkRow(examId) {
  const subj  = (document.getElementById('platMarkSubject')?.value||'').trim();
  const adm   = (document.getElementById('platMarkAdm')?.value||'').trim();
  const name  = (document.getElementById('platMarkName')?.value||'').trim();
  const score = parseInt(document.getElementById('platMarkScore')?.value||'');
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId);
  if(!subj||!adm||!name||isNaN(score)){ showToast('Fill all fields (subject, adm, name, score)','error'); return; }
  if(exam && (score<0||score>exam.maxScore)){ showToast(`Score must be 0–${exam.maxScore}`,'error'); return; }
  const existing = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
  const dupIdx = existing.findIndex(r=>r.adm===adm&&r.subject===subj);
  if(dupIdx>-1) existing[dupIdx].score=score;
  else existing.push({adm,studentName:name,subject:subj,score});
  savePlatformSchoolMarks(examId,currentSchoolId,existing);
  ['platMarkAdm','platMarkName','platMarkScore'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  refreshPlatMarkRowsBody(examId);
}
function platRemoveMarkRow(examId, idx) {
  const existing = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
  existing.splice(idx,1);
  savePlatformSchoolMarks(examId,currentSchoolId,existing);
  refreshPlatMarkRowsBody(examId);
}
function platHandleMarksExcel(input, examId) {
  const file=input.files[0]; if(!file) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb=XLSX.read(e.target.result,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws);
      if(!data.length){ showToast('File is empty','warning'); return; }
      const existing = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
      let added=0, skipped=0;
      data.forEach(row=>{
        const adm  = String(row['AdmNo']||row['admno']||row['Adm No']||row['ADM']||'').trim();
        const name = String(row['Name']||row['name']||row['Student']||row['StudentName']||'').trim();
        const subj = String(row['Subject']||row['subject']||'').trim();
        const sc   = parseInt(row['Score']||row['score']||row['Marks']||row['marks']||0);
        if(!adm||!name||!subj||isNaN(sc)){ skipped++; return; }
        const score = Math.min(Math.max(sc,0),exam.maxScore);
        const dupIdx=existing.findIndex(r=>r.adm===adm&&r.subject===subj);
        if(dupIdx>-1) existing[dupIdx].score=score;
        else existing.push({adm,studentName:name,subject:subj,score});
        added++;
      });
      savePlatformSchoolMarks(examId,currentSchoolId,existing);
      refreshPlatMarkRowsBody(examId);
      showToast(`${added} record(s) imported${skipped?' ('+skipped+' skipped)':''}  ✓`,'success');
    } catch(err){ showToast('Error reading file: '+err.message,'error'); }
  };
  reader.readAsArrayBuffer(file); input.value='';
}
function platDownloadMarksTemplate(examId) {
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const data=[{AdmNo:'001',Name:'Student Name',Subject:exam.subject||'Mathematics',Score:75},{AdmNo:'002',Name:'Another Student',Subject:exam.subject||'Mathematics',Score:88}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Marks');
  XLSX.writeFile(wb,`platform_marks_template_${exam.title.replace(/\s+/g,'_')}.xlsx`);
}
function platSubmitSchoolMarks(examId) {
  const rows = getPlatformSchoolMarks(examId)[currentSchoolId]||[];
  if(!rows.length){ showToast('No marks to submit.','warning'); return; }
  if(!confirm(`Submit ${rows.length} mark record(s) to the platform? The platform admin will use these for analysis.`)) return;
  showToast(`✅ ${rows.length} mark records submitted to platform successfully!`,'success');
  // Marks are already saved in storage, just confirm
}

// ─── SCHOOL: Download Timetable for Platform Exam ───
function schoolDownloadPlatformTimetable(examId) {
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const exam = plExams.find(e=>e.id===examId); if(!exam) return;
  const tt = exam.timetable||[];
  if(!tt.length){ showToast('No timetable has been set for this exam yet.','info'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const school = platformSchools.find(s=>s.id===currentSchoolId)||{name:''};
  const pageW = 210; const margin=15;
  // Header
  doc.setFillColor(28,86,181); doc.rect(0,0,pageW,28,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('EXAM TIMETABLE',pageW/2,11,{align:'center'});
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text(exam.title,pageW/2,17,{align:'center'});
  doc.setFontSize(8.5);
  doc.text(`${exam.term} ${exam.year}  ·  Max Score: ${exam.maxScore}`,pageW/2,23,{align:'center'});
  // School name
  doc.setTextColor(30,30,30); doc.setFontSize(9); doc.setFont('helvetica','bold');
  if(school.name) doc.text(school.name, margin, 36);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(`Downloaded: ${new Date().toLocaleDateString()}`, pageW-margin, 36, {align:'right'});
  // Table header
  let y=44; const colW=[28,22,28,70,32]; const cols=['Date','Day','Time','Subject / Paper','Venue'];
  doc.setFillColor(240,244,255);
  doc.rect(margin, y, pageW-2*margin, 8, 'F');
  doc.setTextColor(30,30,90); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
  let cx=margin;
  cols.forEach((c,i)=>{ doc.text(c,cx+2,y+5.5); cx+=colW[i]; });
  y+=8;
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  tt.forEach((r,i)=>{
    if(i%2===0){ doc.setFillColor(250,252,255); doc.rect(margin,y,pageW-2*margin,8,'F'); }
    doc.setFontSize(8); cx=margin;
    [r.date||'—',r.day||'—',r.time||'—',r.subject||'—',r.venue||'—'].forEach((v,j)=>{ doc.text(String(v).substring(0,j===3?40:20),cx+2,y+5.3); cx+=colW[j]; });
    y+=8;
    if(y>270){ doc.addPage(); y=20; }
  });
  // Footer
  doc.setFontSize(7.5); doc.setTextColor(120,120,120);
  doc.text('This timetable is issued by the platform. Contact the platform admin for queries.',pageW/2,290,{align:'center'});
  doc.save(`Timetable_${exam.title.replace(/\s+/g,'_')}.pdf`);
}
function schoolDownloadPlatformTimetableFromSel() {
  const examId = document.getElementById('platMarkExamSel')?.value;
  if(!examId){ showToast('Select an exam first','error'); return; }
  schoolDownloadPlatformTimetable(examId);
}

// ─── SCHOOL: View Platform Results ───
function renderSchoolPlatformResults() {
  const container = document.getElementById('schoolPlatResultsContainer'); if(!container) return;
  let plExams=[]; try{plExams=JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]');}catch{}
  const examSel = document.getElementById('schoolPlatResExamSel');
  if(examSel) {
    const prev = examSel.value;
    examSel.innerHTML='<option value="">— Select Platform Exam —</option>'+plExams.map(e=>`<option value="${e.id}">${e.title} (${e.term} ${e.year})</option>`).join('');
    if(prev) examSel.value=prev;
  }
  const examId = examSel?.value;
  if(!examId){ container.innerHTML='<p style="color:var(--muted);font-size:.83rem;padding:1rem 0">Select a platform exam above to view comparative results.</p>'; return; }
  const data = getPlatformResults(examId);
  if(!data||!data.analysed){ container.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.85rem"><div style="font-size:2rem;margin-bottom:.5rem">⏳</div><p>Results have not been published by the platform admin yet.<br>Check back after the exam analysis is complete.</p></div>'; return; }
  const summaries = data.schoolSummaries||[];
  const mySchool = platformSchools.find(s=>s.id===currentSchoolId);
  const myEntry = summaries.find(s=>s.schoolId===currentSchoolId);
  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem">
      <div style="font-size:.95rem;font-weight:800">${data.examTitle}</div>
      <div style="font-size:.78rem;opacity:.85;margin-top:.2rem">Results published · ${new Date(data.generatedAt).toLocaleDateString()} · Grading: ${data.gradingSystemName||'Platform Standard'}</div>
      ${myEntry?`<div style="margin-top:.65rem;background:rgba(255,255,255,.15);border-radius:8px;padding:.55rem .8rem;display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><div style="font-size:.72rem;opacity:.8">Your Rank</div><div style="font-size:1.35rem;font-weight:900">${myEntry.rank===1?'🥇 1st':myEntry.rank===2?'🥈 2nd':myEntry.rank===3?'🥉 3rd':'#'+myEntry.rank}</div></div>
        <div><div style="font-size:.72rem;opacity:.8">Mean Score</div><div style="font-size:1.35rem;font-weight:900">${myEntry.mean.toFixed(1)}%</div></div>
        <div><div style="font-size:.72rem;opacity:.8">Pass Rate</div><div style="font-size:1.35rem;font-weight:900">${myEntry.passRate}%</div></div>
        <div><div style="font-size:.72rem;opacity:.8">Students</div><div style="font-size:1.35rem;font-weight:900">${myEntry.studentCount}</div></div>
      </div>`:''}
    </div>
    <h4 style="font-size:.88rem;font-weight:700;margin-bottom:.65rem;color:var(--text)">📊 All Schools — Comparative Results</h4>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="background:var(--primary-lt,#eff6ff)">
        <th style="padding:.5rem .65rem;text-align:center">Rank</th>
        <th style="padding:.5rem .65rem;text-align:left">School</th>
        <th style="padding:.5rem .65rem;text-align:center">Students</th>
        <th style="padding:.5rem .65rem;text-align:center">Mean</th>
        <th style="padding:.5rem .65rem;text-align:center">Pass Rate</th>
        <th style="padding:.5rem .65rem;text-align:center">Highest</th>
        <th style="padding:.5rem .65rem;text-align:center">Lowest</th>
      </tr></thead>
      <tbody>
      ${summaries.map(s=>{
        const isMe = s.schoolId===currentSchoolId;
        return `<tr style="border-bottom:1px solid var(--border);${isMe?'background:rgba(124,58,237,.06);font-weight:700;':''}">
          <td style="padding:.45rem .65rem;text-align:center;font-weight:800;color:${s.rank===1?'#b45309':s.rank===2?'#475569':s.rank===3?'#92400e':'var(--muted)'}">${s.rank===1?'🥇':s.rank===2?'🥈':s.rank===3?'🥉':'#'+s.rank}</td>
          <td style="padding:.45rem .65rem">${s.schoolName}${isMe?' <span style="background:#ede9fe;color:#7c3aed;font-size:.7rem;padding:.1rem .35rem;border-radius:4px">You</span>':''}</td>
          <td style="padding:.45rem .65rem;text-align:center">${s.studentCount}</td>
          <td style="padding:.45rem .65rem;text-align:center;color:${s.mean>=70?'#15803d':s.mean>=50?'#b45309':'#dc2626'}">${s.mean.toFixed(1)}</td>
          <td style="padding:.45rem .65rem;text-align:center">${s.passRate}%</td>
          <td style="padding:.45rem .65rem;text-align:center">${s.highest}</td>
          <td style="padding:.45rem .65rem;text-align:center">${s.lowest}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    </div>`;
}
function platChangePassword() {
  const cur=document.getElementById('platCurPwd').value; const nw=document.getElementById('platNewPwd').value; const cf=document.getElementById('platConfPwd').value;
  const msgEl=document.getElementById('platPwdMsg');
  const creds=getPlatformCreds();
  if(!creds||cur!==creds.password){if(msgEl){msgEl.textContent='❌ Current password incorrect.';msgEl.style.color='var(--danger)';msgEl.style.display='';}return;}
  if(nw.length<6){if(msgEl){msgEl.textContent='❌ New password must be ≥6 characters.';msgEl.style.color='var(--danger)';msgEl.style.display='';}return;}
  if(nw!==cf){if(msgEl){msgEl.textContent='❌ Passwords do not match.';msgEl.style.color='var(--danger)';msgEl.style.display='';}return;}
  setPlatformCreds(creds.username,nw);
  if(msgEl){msgEl.textContent='✅ Password updated!';msgEl.style.color='var(--success,#16a34a)';msgEl.style.display='';setTimeout(()=>{msgEl.style.display='none';},3000);}
  document.getElementById('platCurPwd').value=''; document.getElementById('platNewPwd').value=''; document.getElementById('platConfPwd').value='';
}

// ── Platform AI API Key ──
function platSaveApiKey() {
  const key = (document.getElementById('platApiKeyInput')?.value||'').trim();
  const status = document.getElementById('platApiKeyStatus');
  if (!key) { if(status){status.style.color='var(--danger)';status.textContent='❌ Please enter an API key.';} return; }
  // Save via the shared ebSaveApiKey mechanism (stores in settings.ebApiKey)
  // We call the underlying save directly
  settings.ebApiKey = key;
  save(K.settings, [settings]);
  showToast('API key saved ✅', 'success');
  if(status){status.style.color='#10b981';status.textContent='✅ Saved!';}
  setTimeout(()=>{if(status)status.textContent='';},3000);
}
async function platTestApiKey() {
  const status = document.getElementById('platApiKeyStatus');
  if(status){status.style.color='var(--muted)';status.textContent='⏳ Testing...';}
  // Test built-in proxy first
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:10,messages:[{role:'user',content:'Hi'}]})
    });
    if(res.ok){if(status){status.style.color='#10b981';status.textContent='✅ AI Connected (built-in — no key needed)!';}showToast('AI is connected!','success');return;}
  } catch(e){}
  // Try the saved key
  const key=(document.getElementById('platApiKeyInput')?.value||'').trim()||ebGetApiKey();
  if(!key){if(status){status.style.color='var(--danger)';status.textContent='❌ No key entered and built-in proxy unavailable.';}return;}
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:10,messages:[{role:'user',content:'Hello'}]})
    });
    if(res.ok){if(status){status.style.color='#10b981';status.textContent='✅ API Key works!';}showToast('API key connected!','success');}
    else{const e=await res.json().catch(()=>({}));if(status){status.style.color='var(--danger)';status.textContent='❌ '+(e.error?.message||'Invalid key');}}
  } catch(err){if(status){status.style.color='var(--danger)';status.textContent='❌ '+err.message;}}
}

// ══ PLATFORM NAV & TAB VISIBILITY CONFIG ══
const K_NAV_CONFIG = 'ei_platform_nav_config';

const NAV_CONFIG_SCHEMA = [
  { section:'dashboard',   label:'🏠 Dashboard',         tabs:[] },
  { section:'subjects',    label:'📚 Subjects',           tabs:[] },
  { section:'classes',     label:'🏫 Classes & Streams',  tabs:[] },
  { section:'teachers',    label:'👨‍🏫 Teachers',           tabs:[] },
  { section:'students',    label:'🎓 Students',           tabs:[] },
  { section:'timetable',   label:'🕐 Timetables',         tabs:[] },
  { section:'exambuilder', label:'✏️ Exam Builder',        tabs:[] },
  { section:'exams',       label:'📝 Exams', tabs:[
    { id:'tabCreateExam',       label:'Create Exam' },
    { id:'tabExamList',         label:'Exam List' },
    { id:'tabExamTimetable',    label:'📅 Exam Timetable' },
    { id:'tabUploadMarks',      label:'Upload Marks' },
    { id:'tabAnalyse',          label:'Analyse' },
    { id:'tabMeritList',        label:'Merit List' },
    { id:'tabSummaryAnalytics', label:'📊 Summary Analytics' },
  ]},
  { section:'reports',     label:'📄 Report Forms',       tabs:[] },
  { section:'papers',      label:'📂 Papers & Resources', tabs:[
    { id:'tabTermlyExams', label:'📝 Termly Exams' },
    { id:'tabRevision',    label:'📖 Revision' },
  ]},
  { section:'fees',        label:'💰 Fees', tabs:[
    { id:'tabFeeOverview',   label:'📊 Overview' },
    { id:'tabFeeStructure',  label:'🏗 Fee Structure' },
    { id:'tabFeePayments',   label:'💳 Record Payment' },
    { id:'tabFeeStudents',   label:'🎓 Student Balances' },
    { id:'tabFeeImport',     label:'⬆ Import Fees' },
    { id:'tabFeeReminders',  label:'🔔 Reminders' },
    { id:'tabFeeReceipts',   label:'🧾 Receipts' },
  ]},
  { section:'messaging',   label:'💬 Messaging',          tabs:[] },
  { section:'settings',    label:'🛠️ Settings',            tabs:[] },
];

// ── Nav config mode: 'global' or 'school' ──
let _navCfgMode = 'global';

function loadNavConfig(schoolId) {
  // schoolId = undefined/null → global config
  // schoolId = 'sch_xxx'     → per-school override
  const key = schoolId ? K_NAV_CONFIG + '_' + schoolId : K_NAV_CONFIG;
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function saveNavConfig(cfg, schoolId) {
  const key = schoolId ? K_NAV_CONFIG + '_' + schoolId : K_NAV_CONFIG;
  localStorage.setItem(key, JSON.stringify(cfg));
}
function hasSchoolNavOverride(schoolId) {
  if (!schoolId) return false;
  return localStorage.getItem(K_NAV_CONFIG + '_' + schoolId) !== null;
}

// Switch between Global / Per-School mode in the UI
function navCfgSwitchMode(mode) {
  _navCfgMode = mode;
  const btnG = document.getElementById('navCfgTabGlobal');
  const btnS = document.getElementById('navCfgTabSchool');
  const picker = document.getElementById('navCfgSchoolPicker');
  if (btnG) { btnG.className = mode==='global' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'; }
  if (btnS) { btnS.className = mode==='school' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'; }
  if (picker) picker.style.display = mode==='school' ? '' : 'none';
  if (mode === 'school') {
    // Populate school dropdown
    const sel = document.getElementById('navCfgSchoolSelect');
    if (sel) {
      loadPlatform();
      sel.innerHTML = '<option value="">— Choose a school —</option>' +
        platformSchools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  }
  platRenderNavConfig();
}

// Get currently selected school id (in per-school mode)
function _navCfgCurrentSchoolId() {
  if (_navCfgMode !== 'school') return null;
  const sel = document.getElementById('navCfgSchoolSelect');
  return (sel && sel.value) ? sel.value : null;
}

function platRenderNavConfig() {
  const root = document.getElementById('platNavConfigRoot');
  if (!root) return;
  const schoolId = _navCfgCurrentSchoolId();

  // In per-school mode, show override note if applicable
  const note = document.getElementById('navCfgSchoolNote');
  if (note) note.style.display = (schoolId && hasSchoolNavOverride(schoolId)) ? '' : 'none';

  // If per-school mode but no school selected yet, show prompt
  if (_navCfgMode === 'school' && !schoolId) {
    root.innerHTML = '<p style="color:var(--muted);font-size:.84rem;padding:.5rem 0">👆 Select a school above to view and edit its navigation settings.</p>';
    return;
  }

  // Load effective config:
  // Per-school: use school override if it exists, else fall back to global
  const globalCfg = loadNavConfig(null);
  const schoolCfg = schoolId ? loadNavConfig(schoolId) : null;
  const effectiveCfg = schoolCfg !== null && Object.keys(schoolCfg).length > 0
    ? schoolCfg : globalCfg;

  const modeLabel = schoolId ? '<span style="font-size:.75rem;color:#f59e0b;margin-left:.5rem">school override</span>' : '';

  let html = '';
  if (schoolId && Object.keys(schoolCfg||{}).length === 0) {
    html += '<div style="font-size:.78rem;color:#64748b;background:var(--bg);border:1px dashed var(--border);border-radius:8px;padding:.5rem .75rem;margin-bottom:.75rem">ℹ️ No overrides set — showing global defaults. Saving will create a school-specific override.</div>';
  }

  NAV_CONFIG_SCHEMA.forEach(sec => {
    const secVisible = effectiveCfg[sec.section] !== false;
    html += `<div style="margin-bottom:.75rem;border:1.5px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem;background:var(--surface)">
        <span style="font-weight:700;font-size:.88rem">${sec.label}${modeLabel}</span>
        <label class="plat-nav-toggle">
          <input type="checkbox" id="navSec_${sec.section}" ${secVisible?'checked':''}
            onchange="(function(cb){var tl=document.getElementById('navTabList_${sec.section}');if(tl)tl.style.display=cb.checked?'':'none';})(this)"/>
          <span class="plat-nav-slider"></span>
        </label>
      </div>`;
    if (sec.tabs.length) {
      html += `<div id="navTabList_${sec.section}" style="${secVisible?'':'display:none'}">`;
      sec.tabs.forEach(tab => {
        const tabKey = sec.section + '__' + tab.id;
        const tabVisible = effectiveCfg[tabKey] !== false;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem 1rem .4rem 2rem;border-top:1px solid var(--border-lt);background:var(--bg)">
          <span style="font-size:.82rem;color:var(--muted)">${tab.label}</span>
          <label class="plat-nav-toggle sm">
            <input type="checkbox" id="navTab_${tab.id}" ${tabVisible?'checked':''}/>
            <span class="plat-nav-slider"></span>
          </label>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  root.innerHTML = html;
}

function platSaveNavConfig() {
  const schoolId = _navCfgCurrentSchoolId();
  const cfg = {};
  NAV_CONFIG_SCHEMA.forEach(sec => {
    const secCb = document.getElementById('navSec_' + sec.section);
    if (secCb) cfg[sec.section] = secCb.checked;
    sec.tabs.forEach(tab => {
      const tabCb = document.getElementById('navTab_' + tab.id);
      if (tabCb) cfg[sec.section + '__' + tab.id] = tabCb.checked;
    });
  });
  saveNavConfig(cfg, schoolId);
  const status = document.getElementById('platNavConfigStatus');
  const msg = schoolId
    ? '✅ Saved for this school. Other schools use global settings.'
    : '✅ Saved — applies to all schools without a specific override.';
  if (status) { status.textContent = msg; status.style.color='#10b981'; setTimeout(()=>{status.textContent='';},4000); }
  // Update override note visibility
  const note = document.getElementById('navCfgSchoolNote');
  if (note) note.style.display = (schoolId && hasSchoolNavOverride(schoolId)) ? '' : 'none';
  showToast('Navigation visibility saved!', 'success');
}

function platResetNavConfig() {
  const schoolId = _navCfgCurrentSchoolId();
  if (schoolId) {
    // Only reset global if explicitly in global mode
    if (!confirm('Reset GLOBAL defaults? This affects all schools that don\'t have a specific override.')) return;
  }
  localStorage.removeItem(K_NAV_CONFIG);
  platRenderNavConfig();
  const status = document.getElementById('platNavConfigStatus');
  if (status) { status.textContent = '↺ Global defaults reset.'; setTimeout(()=>{status.textContent='';},3000); }
  showToast('Global navigation reset to defaults', 'info');
}

function navCfgResetSchool() {
  const schoolId = _navCfgCurrentSchoolId();
  if (!schoolId) return;
  loadPlatform();
  const school = platformSchools.find(s => s.id === schoolId);
  const name = school ? school.name : 'this school';
  if (!confirm(`Remove custom overrides for "${name}"?\n\nThis school will then use the global settings.`)) return;
  localStorage.removeItem(K_NAV_CONFIG + '_' + schoolId);
  platRenderNavConfig();
  showToast('School overrides cleared — now using global settings.', 'info');
}

function applyPlatformNavConfig() {
  // Use school-specific config if it exists, else fall back to global
  const globalCfg = loadNavConfig(null);
  const schoolCfg = currentSchoolId ? loadNavConfig(currentSchoolId) : null;
  const cfg = (schoolCfg && Object.keys(schoolCfg).length > 0) ? schoolCfg : globalCfg;

  // First reset all school nav items to visible as baseline
  NAV_CONFIG_SCHEMA.forEach(sec => {
    if (sec.section !== 'dashboard') {
      const sbLink = document.querySelector('.sb-nav [data-s="'+sec.section+'"]');
      if (sbLink) { sbLink.dataset.platHidden = ''; sbLink.style.display = ''; }
      const mbnLink = document.querySelector('.mbn-item[data-s="'+sec.section+'"]');
      if (mbnLink) mbnLink.style.display = '';
    }
    sec.tabs.forEach(tab => {
      const allBtns = document.querySelectorAll('#'+sec.section+'TabBar .tb, [onclick*="'+tab.id+'"]');
      allBtns.forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tab.id)) {
          btn.style.display = '';
        }
      });
    });
  });

  // Then apply platform config — hide anything explicitly disabled
  NAV_CONFIG_SCHEMA.forEach(sec => {
    const secVisible = cfg[sec.section] !== false;
    if (sec.section !== 'dashboard') {
      const sbLink = document.querySelector('.sb-nav [data-s="'+sec.section+'"]');
      if (sbLink) {
        sbLink.dataset.platHidden = secVisible ? '' : '1';
        if (!secVisible) sbLink.style.display = 'none';
      }
      const mbnLink = document.querySelector('.mbn-item[data-s="'+sec.section+'"]');
      if (mbnLink && !secVisible) mbnLink.style.display = 'none';
    }
    sec.tabs.forEach(tab => {
      const tabKey = sec.section + '__' + tab.id;
      const tabVisible = cfg[tabKey] !== false;
      if (!tabVisible) {
        const allBtns = document.querySelectorAll('#'+sec.section+'TabBar .tb, [onclick*="'+tab.id+'"]');
        allBtns.forEach(btn => {
          if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tab.id)) {
            btn.style.display = 'none';
          }
        });
      }
    });
  });
}


function renderPlatformSummary() {
  const kpiRow   = document.getElementById('platformKpiRow');
  const tbody    = document.getElementById('platformSchoolTableBody');
  const breakdown= document.getElementById('platformExamBreakdown');
  if (!kpiRow || !tbody) return;

  const schools  = platformSchools;
  let totalStudents=0, totalExams=0, totalMarksCount=0, totalMarksSum=0;

  const schoolStats = schools.map(s => {
    const prefix = s.id + '_';
    const getLS  = key => { try { return JSON.parse(localStorage.getItem(prefix+key)) || []; } catch { return []; } };
    const students = getLS('ei_students');
    const exams    = getLS('ei_exams');
    const subjects = getLS('ei_subjects');
    const marks    = getLS('ei_marks');

    // Compute average score across all marks
    let sum=0, cnt=0;
    marks.forEach(m => { if (typeof m.score === 'number') { sum+=m.score; cnt++; } });
    const avg = cnt ? (sum/cnt) : null;

    // Find top exam by mark count
    const examMarkCount = {};
    marks.forEach(m => { if (m.examId) examMarkCount[m.examId] = (examMarkCount[m.examId]||0)+1; });
    let topExam = null;
    if (exams.length) {
      const sorted = [...exams].sort((a,b) => (examMarkCount[b.id]||0)-(examMarkCount[a.id]||0));
      topExam = sorted[0];
    }

    totalStudents += students.length;
    totalExams    += exams.length;
    if (cnt) { totalMarksSum += sum; totalMarksCount += cnt; }

    return { school:s, students, exams, subjects, marks, avg, topExam, cnt };
  });

  const overallAvg = totalMarksCount ? (totalMarksSum/totalMarksCount) : null;

  // KPI cards
  const kpis = [
    { icon:'🏫', label:'Schools',  value: schools.length, color:'#3b82f6' },
    { icon:'👨‍🎓', label:'Students', value: totalStudents.toLocaleString(), color:'#10b981' },
    { icon:'📝', label:'Exams',    value: totalExams.toLocaleString(), color:'#f59e0b' },
    { icon:'📈', label:'Avg Score',value: overallAvg !== null ? overallAvg.toFixed(1)+'%' : '—', color:'#8b5cf6' },
  ];
  kpiRow.innerHTML = kpis.map(k => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:.85rem 1rem;display:flex;align-items:center;gap:.75rem">
      <div style="font-size:1.4rem">${k.icon}</div>
      <div>
        <div style="font-size:1.25rem;font-weight:800;color:${k.color}">${k.value}</div>
        <div style="font-size:.72rem;color:#64748b;font-weight:500">${k.label}</div>
      </div>
    </div>`).join('');

  // Table rows
  if (!schools.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:1.5rem">No schools yet</td></tr>';
  } else {
    tbody.innerHTML = schoolStats.map((st,i) => {
      const avgTxt = st.avg !== null ? st.avg.toFixed(1)+'%' : '—';
      const avgColor = st.avg===null?'#94a3b8':st.avg>=60?'#10b981':st.avg>=40?'#f59e0b':'#ef4444';
      const joined = st.school.createdAt ? new Date(st.school.createdAt).toLocaleDateString() : '—';
      const topExamName = st.topExam ? (st.topExam.name||'Exam '+(i+1)) : '—';
      return `<tr style="border-top:1px solid #f1f5f9;${i%2?'background:#fafafa':''}">
        <td style="padding:.6rem 1rem;font-weight:600;color:#0f172a">${st.school.name}<br><span style="font-size:.7rem;color:#94a3b8;font-weight:400">${st.school.username}</span></td>
        <td style="padding:.6rem .75rem;text-align:center;font-weight:700;color:#3b82f6">${st.students.length}</td>
        <td style="padding:.6rem .75rem;text-align:center;font-weight:700;color:#f59e0b">${st.exams.length}</td>
        <td style="padding:.6rem .75rem;text-align:center;color:#475569">${st.subjects.length}</td>
        <td style="padding:.6rem .75rem;text-align:center;font-weight:700;color:${avgColor}">${avgTxt}</td>
        <td style="padding:.6rem .75rem;text-align:center;font-size:.75rem;color:#475569;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${topExamName}</td>
        <td style="padding:.6rem 1rem;text-align:center;font-size:.74rem;color:#94a3b8">${joined}</td>
      </tr>`;
    }).join('');
  }

  // Exam breakdown cards
  if (schools.length) {
    breakdown.innerHTML = '<div style="font-size:.85rem;font-weight:700;color:#0f172a;margin-bottom:.75rem">📋 Exam Breakdown by School</div>' +
      schoolStats.map(st => {
        if (!st.exams.length) return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:.75rem 1rem;margin-bottom:.75rem;font-size:.8rem;color:#94a3b8"><strong style="color:#475569">${st.school.name}</strong> — No exams yet</div>`;
        const rows = st.exams.map(ex => {
          const exMarks = st.marks.filter(m=>m.examId===ex.id);
          const exStudents = new Set(exMarks.map(m=>m.studentId)).size;
          let s=0,c=0; exMarks.forEach(m=>{ if(typeof m.score==='number'){s+=m.score;c++;} });
          const avg = c ? (s/c).toFixed(1)+'%' : '—';
          const avgColor = c===0?'#94a3b8':s/c>=60?'#10b981':s/c>=40?'#f59e0b':'#ef4444';
          return `<tr style="border-top:1px solid #f8fafc">
            <td style="padding:.4rem .75rem;font-size:.78rem;color:#0f172a">${ex.name||'Unnamed Exam'}</td>
            <td style="padding:.4rem .75rem;text-align:center;font-size:.78rem;color:#3b82f6;font-weight:600">${exStudents}</td>
            <td style="padding:.4rem .75rem;text-align:center;font-size:.78rem;font-weight:700;color:${avgColor}">${avg}</td>
          </tr>`;
        }).join('');
        return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:.75rem">
          <div style="padding:.6rem 1rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:.8rem;font-weight:700;color:#0f172a">🏫 ${st.school.name} <span style="font-weight:400;color:#94a3b8">(${st.exams.length} exam${st.exams.length!==1?'s':''})</span></div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc"><th style="padding:.4rem .75rem;text-align:left;font-size:.74rem;color:#64748b;font-weight:600">Exam</th><th style="padding:.4rem .75rem;text-align:center;font-size:.74rem;color:#64748b;font-weight:600">Students</th><th style="padding:.4rem .75rem;text-align:center;font-size:.74rem;color:#64748b;font-weight:600">Avg Score</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      }).join('');
  } else {
    breakdown.innerHTML = '';
  }
}

function showSchoolSelector(isPlatformAdmin) {
  loadPlatform();
  ['dualPortal','platformLogin','loginScreen','app'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const sel = document.getElementById('schoolSelector');
  sel.style.display = 'flex';
  sel.dataset.isPlatformAdmin = isPlatformAdmin ? '1' : '0';

  const grid = document.getElementById('schoolGrid');
  if (!platformSchools.length) {
    grid.innerHTML = isPlatformAdmin
      ? '<div style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1">No school accounts yet. Create one below.</div>'
      : '<div style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1">No schools registered yet. Contact your platform admin.</div>';
  } else {
    grid.innerHTML = platformSchools.map(s => {
      const isActive = s.active !== false; // default active if field missing
      const statusBadge = isActive
        ? `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.68rem;font-weight:700;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);border-radius:99px;padding:.15rem .55rem">● Active</span>`
        : `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.68rem;font-weight:700;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);border-radius:99px;padding:.15rem .55rem">● Suspended</span>`;
      return `
      <div class="school-card" style="display:flex;flex-direction:row;align-items:center;gap:.85rem;text-align:left;${!isActive?'opacity:.82;border-color:rgba(239,68,68,.35);':''}" onclick="${isActive||isPlatformAdmin?`enterSchool('${s.id}')`:'void(0)'}">
        <div class="sc-avatar" style="flex-shrink:0;${!isActive?'background:linear-gradient(135deg,#ef4444,#b91c1c)':''}">
          ${s.name.charAt(0).toUpperCase()}
        </div>
        <div class="sc-info" style="flex:1;min-width:0">
          <div class="sc-name" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            ${s.name}
            ${statusBadge}
          </div>
          <div class="sc-meta">${s.username}</div>
          ${s.email ? '<div class="sc-meta">' + s.email + '</div>' : ''}
          ${!isActive && s.deactivationMessage ? `<div style="font-size:.72rem;color:#fca5a5;margin-top:.3rem;font-style:italic">📢 ${s.deactivationMessage.substring(0,70)}${s.deactivationMessage.length>70?'…':''}</div>` : ''}
        </div>
        ${isPlatformAdmin ? `
          <div style="display:flex;flex-direction:column;gap:.4rem;flex-shrink:0;position:relative;z-index:2" onclick="event.stopPropagation()">
            <button onclick="toggleSchoolActive('${s.id}')" style="position:static;display:block;background:${isActive?'rgba(239,68,68,.12)':'rgba(16,185,129,.12)'};color:${isActive?'#ef4444':'#10b981'};border:1px solid ${isActive?'rgba(239,68,68,.35)':'rgba(16,185,129,.35)'};border-radius:7px;font-size:.72rem;font-weight:700;padding:.35rem .75rem;cursor:pointer;white-space:nowrap;font-family:inherit;opacity:1">
              ${isActive ? '⏸ Suspend' : '▶ Resume'}
            </button>
            ${!isActive ? `<button onclick="editDeactivationMessage('${s.id}')" style="position:static;display:block;background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:7px;font-size:.72rem;font-weight:700;padding:.35rem .75rem;cursor:pointer;white-space:nowrap;font-family:inherit;opacity:1">✏️ Message</button>` : ''}
            <button onclick="deleteSchoolAccount('${s.id}')" style="position:static;display:block;background:rgba(239,68,68,.07);color:#ef4444;border:1px solid rgba(239,68,68,.2);border-radius:7px;font-size:.72rem;font-weight:700;padding:.35rem .75rem;cursor:pointer;white-space:nowrap;font-family:inherit;opacity:1">🗑️ Delete</button>
          </div>` : ''}
      </div>`;
    }).join('');
  }

  document.getElementById('addSchoolPanel').style.display   = isPlatformAdmin ? '' : 'none';
  document.getElementById('selectorBackBtn').style.display  = ''; // always show back btn

  // Show platform summary for admin
  const summaryPanel = document.getElementById('platformSummaryPanel');
  if (summaryPanel) {
    summaryPanel.style.display = isPlatformAdmin ? '' : 'none';
    if (isPlatformAdmin) renderPlatformSummary();
  }
}

function enterSchool(schoolId) {
  loadPlatform();
  const school = platformSchools.find(s => s.id === schoolId);
  if (!school) return;
  // Just set the school context — do NOT render the full app yet.
  // Full rendering happens in finishLogin() after credentials are verified.
  currentSchoolId = school.id;
  document.getElementById('schoolSelector').style.display = 'none';
  document.getElementById('loginScreen').style.display    = 'flex';
  document.getElementById('schoolLoginLabel').textContent = school.name;
  document.getElementById('lUser').value = '';
  document.getElementById('lPass').value = '';
  document.getElementById('loginErr').style.display = 'none';
}

function backToSchoolSelector() {
  currentUser     = null;
  currentSchoolId = null;
  ['app','loginScreen','platformLogin','schoolSelector'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('lUser').value = '';
  document.getElementById('lPass').value = '';
  showDualPortal();
}

function addSchoolAccount() {
  const name  = document.getElementById('psName').value.trim();
  const user  = document.getElementById('psUser').value.trim();
  const pass  = document.getElementById('psPass').value;
  const email = document.getElementById('psEmail').value.trim();
  const phone = (document.getElementById('psPhone') ? document.getElementById('psPhone').value||'' : '').trim();
  if (!name||!user||!pass) { showToast('Name, username and password required','error'); return; }
  loadPlatform();
  if (platformSchools.find(s=>s.username===user)) { showToast('Username already taken','error'); return; }
  platformSchools.push({ id:'sch_'+uid(), name, username:user, password:pass, email, phone, createdAt:new Date().toISOString() });
  savePlatform();
  ['psName','psUser','psPass','psEmail'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const psPhEl=document.getElementById('psPhone'); if(psPhEl) psPhEl.value='';
  showToast('School account created ✓','success');
  showSchoolSelector(true);
}

function deleteSchoolAccount(id) {
  if (!confirm('Delete this school? ALL its data will be permanently removed. This cannot be undone.')) return;
  loadPlatform();
  // Wipe all school-scoped localStorage keys
  Object.keys(localStorage).filter(k=>k.startsWith(id+'_')).forEach(k=>localStorage.removeItem(k));
  platformSchools = platformSchools.filter(s=>s.id!==id);
  savePlatform();
  showToast('School deleted','info');
  showSchoolSelector(true);
}

// ── Activate / Suspend school ──
function toggleSchoolActive(id) {
  loadPlatform();
  const school = platformSchools.find(s => s.id === id);
  if (!school) return;

  const isCurrentlyActive = school.active !== false;

  if (isCurrentlyActive) {
    // Suspending — open message editor modal
    openSuspendModal(id, school);
  } else {
    // Reactivating — just flip it on
    school.active = true;
    school.deactivationMessage = '';
    savePlatform();
    showToast(`✅ ${school.name} has been reactivated`, 'success');
    if (currentUser && currentUser.role === 'platform_admin') { renderPlatformSchoolMgmtList(); }
    else { showSchoolSelector(true); }
  }
}

function openSuspendModal(id, school) {
  // Build a modal in the existing modal system
  const defaultMessages = [
    { label: '💳 Payment Due', msg: `Dear ${school.name} team,\n\nYour subscription payment is due. Please make payment to continue accessing the Charanas Analyzer system.\n\nContact us: support@charanas.co.ke` },
    { label: '🆓 Free Trial Active', msg: `Dear ${school.name} team,\n\nYou are currently on a free trial of Charanas Analyzer. Your trial gives you full access to all features.\n\nContact us to subscribe before your trial ends: support@charanas.co.ke` },
    { label: '⏳ Trial Over', msg: `Dear ${school.name} team,\n\nYour free trial period has ended. Please subscribe to continue using Charanas Analyzer.\n\nContact support to get started: support@charanas.co.ke` },
    { label: '⚠️ Overdue Balance', msg: `Dear ${school.name} team,\n\nYour account has been temporarily suspended due to an outstanding balance. Please clear your balance to restore access.\n\nContact us: support@charanas.co.ke` },
    { label: '🔒 Subscription Expired', msg: `Dear ${school.name} team,\n\nYour Charanas Analyzer subscription has expired. Kindly renew your subscription to regain access.\n\nContact us: support@charanas.co.ke` },
    { label: '✏️ Custom Message', msg: school.deactivationMessage || '' },
  ];

  const body = `
    <div style="font-size:.85rem;color:var(--muted);margin-bottom:1rem">
      Suspending <strong style="color:var(--text)">${school.name}</strong>. Staff will be blocked from logging in and will see the message below.
    </div>
    <div style="margin-bottom:.85rem">
      <label style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:.5rem">Quick Templates</label>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem">
        ${defaultMessages.map((m,i) => `
          <button onclick="setSuspendTemplate(${i})" style="font-size:.74rem;padding:.3rem .65rem;background:var(--bg);border:1px solid var(--border-lt);border-radius:6px;cursor:pointer;color:var(--text);font-family:inherit;transition:border-color .15s" onmouseenter="this.style.borderColor='var(--primary)'" onmouseleave="this.style.borderColor='var(--border-lt)'">${m.label}</button>
        `).join('')}
      </div>
    </div>
    <div>
      <label style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:.4rem">Suspension Message Shown to School</label>
      <textarea id="suspendMsgInput" rows="4" style="width:100%;box-sizing:border-box;background:var(--bg);border:1.5px solid var(--border-lt);color:var(--text);font-family:inherit;font-size:.85rem;border-radius:8px;padding:.65rem .8rem;resize:vertical;line-height:1.5;outline:none" placeholder="Enter message to display when school tries to log in...">${school.deactivationMessage||defaultMessages[0].msg}</textarea>
      <div style="font-size:.72rem;color:var(--muted);margin-top:.3rem">This message will be shown to ALL staff of this school when they try to log in.</div>
    </div>`;

  // Store templates for quick-fill
  window._suspendTemplates = defaultMessages;
  window._suspendSchoolId  = id;

  showModal('🔒 Suspend School Account', body, [
    { label: 'Cancel', cls: 'btn-outline', action: 'closeModal()' },
    { label: '⏸ Suspend School', cls: 'btn-danger', action: `confirmSuspendSchool('${id}')` }
  ]);
}

window._suspendTemplates = [];
function setSuspendTemplate(idx) {
  const t = window._suspendTemplates[idx];
  if (!t) return;
  const el = document.getElementById('suspendMsgInput');
  if (el) el.value = t.msg;
}

function confirmSuspendSchool(id) {
  const msg = (document.getElementById('suspendMsgInput')?.value || '').trim();
  if (!msg) { showToast('Please enter a suspension message', 'error'); return; }
  loadPlatform();
  const school = platformSchools.find(s => s.id === id);
  if (!school) return;
  school.active = false;
  school.deactivationMessage = msg;
  // refresh platform dashboard list if open
  school.suspendedAt = new Date().toISOString();
  savePlatform();
  closeModal();
  showToast(`⏸ ${school.name} has been suspended`, 'info');
  if (currentUser && currentUser.role === 'platform_admin') { renderPlatformSchoolMgmtList(); }
  else { showSchoolSelector(true); }
}

function editDeactivationMessage(id) {
  loadPlatform();
  const school = platformSchools.find(s => s.id === id);
  if (!school) return;
  openSuspendModal(id, school);
}

// ── School Login ──
function loadSchoolContext(school) {
  currentSchoolId = school.id;
  students = load(K.students); subjects = load(K.subjects);
  teachers = load(K.teachers); classes  = load(K.classes);
  streams  = load(K.streams);  exams    = load(K.exams);
  marks    = load(K.marks);    settings = load(K.settings)[0] || defaultSettings();
  admins   = load(K.admins);   msgLog   = load(K.msgLog);
  smsCredits = parseInt(localStorage.getItem(K.smsCredits) || '0');
  loadFees(); loadStreamAssignments(); loadGradingSystems(); loadTermlyPapers();
  if (!settings.schoolName) { settings.schoolName = school.name; save(K.settings,[settings]); }
  seedData();
}

function doLogin() {
  const u = document.getElementById('lUser').value.trim();
  const p = document.getElementById('lPass').value;
  document.getElementById('loginErr').style.display = 'none';

  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  const re = () => { if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; } };

  loadPlatform();

  // 1. Built-in superadmin — checked FIRST, before any school loop,
  //    so it always works even when no schools have been registered yet.
  if (u === 'superadmin' && p === 'super123') {
    currentUser = {
      id: 'builtin',
      name: 'Super Admin',
      username: 'superadmin',
      role: 'superadmin',
      builtin: true,
      canAnalyse: true, canReport: true, canMerit: true
    };
    // If a specific school was pre-selected, log into it; otherwise show selector.
    if (currentSchoolId) {
      const school = platformSchools.find(s => s.id === currentSchoolId);
      if (school) { loadSchoolContext(school); re(); finishLogin(school); return; }
    }
    // No school pre-selected or school not found — go to school selector as platform admin.
    re();
    document.getElementById('loginScreen').style.display = 'none';
    saveSession();
    showSchoolSelector(true);
    return;
  }

  // If a school was pre-selected via enterSchool(), only check that school.
  // If coming from showUnifiedLogin() (no preselection), check all schools.
  const savedSchoolId = currentSchoolId;
  const targetSchools = savedSchoolId
    ? platformSchools.filter(s => s.id === savedSchoolId)
    : platformSchools;

  if (targetSchools.length === 0) {
    re();
    const errEl = document.getElementById('loginErr');
    errEl.innerHTML = '⚠️ No school accounts found.<br><span style="font-size:.78rem;color:#64748b">Please contact your Platform Admin to register a school first, or use the Platform Admin login.</span>';
    errEl.style.display = 'block';
    return;
  }

  for (const school of targetSchools) {
    // 2. Check school's own platform credentials (school admin login)
    if (school.username === u && school.password === p) {
      // Check if school is suspended — block login and show custom message
      if (school.active === false) {
        re();
        const errEl = document.getElementById('loginErr');
        const msg = school.deactivationMessage || 'This school account has been suspended. Please contact the platform administrator.';
        errEl.innerHTML = `<div style="text-align:left">
          <div style="font-weight:700;margin-bottom:.35rem;color:#ef4444">🔒 Account Suspended</div>
          <div style="font-size:.82rem;line-height:1.55;color:#fca5a5">${msg}</div>
        </div>`;
        errEl.style.display = 'block';
        return;
      }
      loadSchoolContext(school);
      currentUser = {
        username: school.username,
        role: 'admin',
        name: school.name,
        canAnalyse: true, canReport: true, canMerit: true
      };
      re(); finishLogin(school);
      return;
    }

    // 3. Load this school's data so we can check its admins/teachers
    loadSchoolContext(school);

    // 4. Check admins registered inside this school
    const admin = admins.find(a => a.username === u && a.password === p);
    if (admin) {
      // Block if school is suspended
      if (school.active === false) {
        re();
        const errEl = document.getElementById('loginErr');
        const msg = school.deactivationMessage || 'This school account has been suspended. Please contact the platform administrator.';
        errEl.innerHTML = `<div style="text-align:left">
          <div style="font-weight:700;margin-bottom:.35rem;color:#ef4444">🔒 Account Suspended</div>
          <div style="font-size:.82rem;line-height:1.55;color:#fca5a5">${msg}</div>
        </div>`;
        errEl.style.display = 'block';
        return;
      }
      currentUser = { ...admin, canAnalyse:true, canReport:true, canMerit:true };
      re(); finishLogin(school);
      return;
    }

    // 5. Check teachers registered inside this school
    const teacher = teachers.find(t => t.username === u && t.password === p);
    if (teacher) {
      if (school.active === false) {
        re();
        const errEl = document.getElementById('loginErr');
        const msg = school.deactivationMessage || 'This school account has been suspended. Please contact the platform administrator.';
        errEl.innerHTML = `<div style="text-align:left">
          <div style="font-weight:700;margin-bottom:.35rem;color:#ef4444">🔒 Account Suspended</div>
          <div style="font-size:.82rem;line-height:1.55;color:#fca5a5">${msg}</div>
        </div>`;
        errEl.style.display = 'block';
        return;
      }
      currentUser = { username:teacher.username, role:'teacher', name:teacher.name, teacherId:teacher.id,
        canAnalyse:teacher.canAnalyse, canReport:teacher.canReport, canMerit:teacher.canMerit };
      re(); finishLogin(school);
      return;
    }

    // Not matched — restore school context and try next school
    currentSchoolId = savedSchoolId;
  }

  re();
  document.getElementById('loginErr').style.display = 'block';
}

function saveSession() {
  try {
    localStorage.setItem('ei_session_user',     JSON.stringify(currentUser));
    localStorage.setItem('ei_session_school_id', currentSchoolId || '');
  } catch(e) {}
}
function clearSession() {
  try { localStorage.removeItem('ei_session_user'); localStorage.removeItem('ei_session_school_id'); } catch(e) {}
}

function finishLogin(school) {
  // hide unified login screen
  const ul=document.getElementById('unifiedLogin'); if(ul) ul.style.display='none';
  try { renderDashboard(); } catch(e) { console.warn('renderDashboard', e); }
  try { populateAllDropdowns(); } catch(e) { console.warn('populateAllDropdowns', e); }
  try { renderStudents(); } catch(e) { console.warn('renderStudents', e); }
  try { renderTeachers(); } catch(e) { console.warn('renderTeachers', e); }
  try { renderSubjects(); } catch(e) { console.warn('renderSubjects', e); }
  try { renderClasses(); } catch(e) { console.warn('renderClasses', e); }
  try { renderStreams(); } catch(e) { console.warn('renderStreams', e); }
  try { renderExamList(); } catch(e) { console.warn('renderExamList', e); }
  try { populateExamDropdowns(); } catch(e) { console.warn('populateExamDropdowns', e); }
  try { renderMsgLog(); } catch(e) { console.warn('renderMsgLog', e); }
  try { renderAdminList(); } catch(e) { console.warn('renderAdminList', e); }
  try { loadSettings(); } catch(e) { console.warn('loadSettings', e); }
  try { populateGSDropdowns(); } catch(e) { console.warn('populateGSDropdowns', e); }
  try { renderGradingSystemsTab(); } catch(e) { console.warn('renderGradingSystemsTab', e); }
  try { setExamCategory('regular'); } catch(e) { console.warn('setExamCategory', e); }
  try { hookReportFeeAutoFill(); } catch(e) { console.warn('hookReportFeeAutoFill', e); }
  try { renderExamSubjectCheckboxes([]); } catch(e) { console.warn('renderExamSubjectCheckboxes', e); }
  try { renderArchivedStudents(); } catch(e) { console.warn('renderArchivedStudents', e); }
  const smsCEl = document.getElementById('smsCredits'); if (smsCEl) smsCEl.textContent = smsCredits;
  document.getElementById('loginScreen').style.display = 'none';
  saveSession();
  launchApp();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const pl = document.getElementById('platformLogin');
  const ls = document.getElementById('loginScreen');
  if (pl && pl.style.display !== 'none') doPlatformLogin();
  else if (ls && ls.style.display !== 'none') doLogin();
});
function doLogout() {
  currentUser = null;
  currentSchoolId = null;
  clearSession();
  // Hide app and all fixed-position elements
  document.getElementById('app').style.display = 'none';
  const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
  const tb = document.getElementById('topbar'); if (tb) tb.style.display = 'none';
  const mbn = document.getElementById('mobileBottomNav');
  if (mbn) { mbn.style.display = 'none'; mbn.classList.remove('mbn-collapsed'); }
  const mbnRestore = document.getElementById('mbnRestoreTab');
  if (mbnRestore) { mbnRestore.classList.remove('visible'); mbnRestore.style.display = 'none'; }
  document.body.classList.remove('mbn-hidden');
  // Restore all sidebar nav links for next login
  ['subjects','classes','teachers','students','timetable','exambuilder','exams','reports','papers','fees','messaging','settings'].forEach(s=>{
    const el=document.querySelector('[data-s="'+s+'"]'); if(el) el.style.display='';
  });
  const platLink=document.getElementById('platNavLink'); if(platLink) platLink.style.display='none';
  // Hide all login screens, then show the main unified login
  ['loginScreen','platformLogin','dualPortal','schoolSelector'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const ul = document.getElementById('unifiedLogin');
  if (ul) {
    ul.style.display = 'flex';
    const u = document.getElementById('uniUser');
    const p = document.getElementById('uniPass');
    const err = document.getElementById('uniErr');
    if (u) u.value = '';
    if (p) p.value = '';
    if (err) err.style.display = 'none';
    setTimeout(() => { if (u) u.focus(); }, 100);
  }
}
function togglePw() {
  const f = document.getElementById('lPass');
  f.type = f.type === 'password' ? 'text' : 'password';
}
function launchApp() {
  try { document.getElementById('loginScreen').style.display = 'none'; } catch(e) {}
  try { document.getElementById('app').style.display = 'flex'; } catch(e) {}
  try { const sb = document.getElementById('sidebar'); if (sb) sb.style.display = ''; } catch(e) {}
  try { const tb = document.getElementById('topbar'); if (tb) tb.style.display = ''; } catch(e) {}
  // Show mobile bottom nav
  const mbn = document.getElementById('mobileBottomNav');
  if (mbn) mbn.style.display = '';
  const mbnRestore = document.getElementById('mbnRestoreTab');
  if (mbnRestore) mbnRestore.style.display = '';

  document.getElementById('tbUser').textContent = '👤 ' + currentUser.name;

  // Show Platform Marks and Platform Results tabs for school users
  const tbPlatMarks = document.getElementById('tbPlatformMarks');
  const tbPlatRes   = document.getElementById('tbPlatformResults');
  if(tbPlatMarks) tbPlatMarks.style.display = '';
  if(tbPlatRes)   tbPlatRes.style.display   = '';

  // Role-based: hide analyse if no rights (full check done in applyRoleBasedUI)
  const anBtn = document.getElementById('tbAnalyse');
  if (anBtn) {
    const isTeacherRole = currentUser.role === 'teacher';
    const globalRestrictAn = isTeacherRole && !!settings.restrictTeacherAnalytics;
    anBtn.style.display = (!isTeacherRole || (!globalRestrictAn && (currentUser.canAnalyse || currentUserIsClassTeacher()))) ? '' : 'none';
  }

  // Settings: visible to all (admins see full settings; teachers see only their prefs)
  const settingsLink = document.querySelector('[data-s="settings"]');
  if (settingsLink) settingsLink.style.display = '';

  // Apply teacher-specific UI restrictions
  applyRoleBasedUI();

  // Exam Builder: visible to admins, principals and teachers (all roles)
  const ebLink = document.getElementById('examBuilderNavLink');
  if (ebLink) ebLink.style.display = '';

  if (localStorage.getItem(K.dark) === '1') applyDark(true);
  // manageSchoolsCard is now platform-only — always hide in school portal
  const msc = document.getElementById('manageSchoolsCard');
  if (msc) msc.style.display = 'none';
  // Show broadcast banner if platform has a message
  loadBroadcastBanner();
  // Show platform nav link only for platform_admin role
  const platLink = document.getElementById('platNavLink');
  if (platLink) platLink.style.display = 'none';

  // Apply platform nav visibility config to school portal
  applyPlatformNavConfig();

  go('dashboard', document.querySelector('[data-s="dashboard"]'));
}
function initApp() {
  initLang();
  if (localStorage.getItem('ei_dark') === '1') applyDark(true);

  // ── Restore session after refresh / back navigation ──
  try {
    const savedUser     = JSON.parse(localStorage.getItem('ei_session_user') || 'null');
    const savedSchoolId = localStorage.getItem('ei_session_school_id') || '';

    if (!savedUser) { showUnifiedLogin(); return; }

    // Platform admin has no schoolId
    if (savedUser.role === 'platform_admin') {
      currentUser = savedUser;
      loadPlatform();
      enterPlatformDashboard();
      return;
    }

    // School user
    if (savedSchoolId) {
      currentUser     = savedUser;
      currentSchoolId = savedSchoolId;
      loadPlatform();
      const school = platformSchools.find(s => s.id === savedSchoolId);
      if (school) {
        loadSchoolContext(school);
        renderDashboard(); populateAllDropdowns();
        renderStudents(); renderTeachers(); renderSubjects();
        renderClasses(); renderStreams(); renderExamList();
        populateExamDropdowns(); renderMsgLog();
        renderAdminList(); loadSettings();
        populateGSDropdowns(); renderGradingSystemsTab();
        setExamCategory('regular'); hookReportFeeAutoFill();
        renderExamSubjectCheckboxes([]);
        try { renderArchivedStudents(); } catch(e) {}
        const smsCEl = document.getElementById('smsCredits'); if (smsCEl) smsCEl.textContent = smsCredits;
        launchApp();
        return;
      }
    }
  } catch(e) { /* fall through to login */ }

  // No valid session — show portal
  showUnifiedLogin();
}
function defaultSettings() {
  return { schoolName:'', address:'', phone:'', email:'', term:'Term 1', year:'2025',
    restrictTeacherAnalytics: false, restrictTeacherFees: false, restrictTeacherList: false,
    overallGradingMode: 'auto',
    overallGradeThresholds: null
  };
}

// ═══════════════ SEED DATA ═══════════════
function seedData() {
  if (!classes.length) {
    classes = [{ id:'cls1', name:'Grade 9', level:'9' }, { id:'cls2', name:'Grade 8', level:'8' }];
    save(K.classes, classes);
  }
  if (!streams.length) {
    streams = [{ id:'str1', name:'E/W', classId:'cls1' }, { id:'str2', name:'North', classId:'cls2' }];
    save(K.streams, streams);
  }
  if (!subjects.length) {
    subjects = [
      { id:'s1', name:'English',       code:'ENG', max:100, category:'Core',      teacherId:'', studentIds:[] },
      { id:'s2', name:'Kiswahili',      code:'KIS', max:100, category:'Languages', teacherId:'', studentIds:[] },
      { id:'s3', name:'Mathematics',    code:'MTH', max:100, category:'Core',      teacherId:'', studentIds:[] },
      { id:'s4', name:'Science',        code:'SCI', max:100, category:'Core',      teacherId:'', studentIds:[] },
      { id:'s5', name:'Social Studies', code:'SST', max:100, category:'Core',      teacherId:'', studentIds:[] },
      { id:'s6', name:'CRE',            code:'CRE', max:100, category:'Core',      teacherId:'', studentIds:[] },
      { id:'s7', name:'Creative Arts',  code:'ART', max:100, category:'Elective',  teacherId:'', studentIds:[] },
      { id:'s8', name:'Agriculture',    code:'AGR', max:100, category:'Technical', teacherId:'', studentIds:[] },
      { id:'s9', name:'Pre-Technical',  code:'PRT', max:100, category:'Technical', teacherId:'', studentIds:[] },
    ];
    save(K.subjects, subjects);
  }
  if (!students.length) {
    const raw = [];
    students = raw.map(r => ({
      id: uid(), adm:r[0], name:r[1], gender:r[2],
      classId:r[3], streamId:r[4], parent:r[5], contact:r[6], dob:'', notes:'',
      subjectIds: subjects.map(s=>s.id)
    }));
    save(K.students, students);
    // Enrol all in all subjects
    subjects.forEach(sub => { sub.studentIds = students.map(s=>s.id); });
    save(K.subjects, subjects);
  }
  if (!exams.length) {
    exams = [];
    save(K.exams, exams);
  }
  if (!marks.length) {
    const sampleData = [];
    sampleData.forEach(([adm, scores]) => {
      const stu = students.find(s=>s.adm===adm);
      if (!stu) return;
      subjects.forEach((sub, i) => {
        marks.push({ id:uid(), examId:'ex1', studentId:stu.id, subjectId:sub.id, score:scores[i]||0 });
      });
    });
    save(K.marks, marks);
  }
}

// ═══════════════ NAVIGATION ═══════════════
// Full go() defined at end of file (includes timetable support)
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }
function toggleSidebar() {
  const app = document.getElementById('app');
  const isCollapsed = app.classList.toggle('sidebar-collapsed');
  // On mobile, also handle open class
  if (window.innerWidth < 960) {
    if (isCollapsed) closeSidebar(); else openSidebar();
    app.classList.remove('sidebar-collapsed');
  }
}
function openExamTab(id, btn) {
  document.querySelectorAll('#s-exams .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#examTabBar .tb').forEach(b => b.classList.remove('active'));
  const p = document.getElementById(id); if (p) p.classList.add('active');
  if (btn) btn.classList.add('active');
  else { const b = document.querySelector(`#examTabBar .tb[onclick*="${id}"]`); if(b) b.classList.add('active'); }
  if (id === 'tabAnalyse') checkAnalyseAccess();
  if (id === 'tabMeritList') populateMeritDropdowns();
  if (id === 'tabUploadMarks') populateUmDropdowns();
  if (id === 'tabSummaryAnalytics') {
    const allowed = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||
      (currentUser.role==='teacher' && !settings.restrictTeacherAnalytics && (currentUser.canAnalyse||currentUserIsClassTeacher())));
    document.getElementById('smAccessDenied').style.display = allowed ? 'none' : '';
    document.getElementById('smContent').style.display      = allowed ? '' : 'none';
    if (allowed) populateSummaryAnalyticsDropdowns();
  }
}

function setUmUploadMode(mode, btn) {
  document.querySelectorAll('#umExcelCard .tb').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('umSingleHint').style.display = mode==='single' ? '' : 'none';
  document.getElementById('umAllHint').style.display    = mode==='all'    ? '' : 'none';
}

// ═══════════════ DARK MODE ═══════════════
function toggleDark() { const d=document.body.classList.toggle('dark'); applyDark(d); }
function applyDark(d) {
  document.body.classList.toggle('dark',d);
  const tbDmIco = document.getElementById('tbDmIco'); if(tbDmIco) tbDmIco.textContent = d?'☀️':'🌙';
  const mbnDmIco = document.getElementById('mbnDmIco'); if(mbnDmIco) mbnDmIco.textContent = d?'☀️':'🌙';
  const mbnDmLbl = document.getElementById('mbnDmLbl'); if(mbnDmLbl) mbnDmLbl.textContent = d?'Light':'Dark';
  localStorage.setItem(K.dark, d?'1':'0');
}

// ═══════════════ DASHBOARD ═══════════════
let dashCharts = {};
function renderDashboard() {
  const sw = students.filter(s => getStudentTotalForLatestExam(s.id) !== null);
  const latestExam = exams[exams.length-1];
  const classMean = sw.length ? (sw.reduce((a,s)=>a+getStudentTotalForLatestExam(s.id),0)/sw.length/subjects.length).toFixed(2) : '—';

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card sc-blue"><div class="sc-num">${students.length}</div><div class="sc-lbl">Total Students</div><div class="sc-ico">🎓</div></div>
    <div class="stat-card sc-green"><div class="sc-num">${teachers.length}</div><div class="sc-lbl">Teachers</div><div class="sc-ico">👨‍🏫</div></div>
    <div class="stat-card sc-teal"><div class="sc-num">${subjects.length}</div><div class="sc-lbl">Subjects</div><div class="sc-ico">📚</div></div>
    <div class="stat-card sc-amber"><div class="sc-num">${exams.length}</div><div class="sc-lbl">Exams</div><div class="sc-ico">📝</div></div>
    <div class="stat-card sc-purple"><div class="sc-num">${classMean}</div><div class="sc-lbl">Latest Mean</div><div class="sc-ico">📊</div></div>
    <div class="stat-card sc-cyan"><div class="sc-num">${students.filter(s=>s.gender==='F').length}</div><div class="sc-lbl">Female Students</div><div class="sc-ico">👩</div></div>
  `;

  // Subject performance chart
  if (dashCharts.sub) { dashCharts.sub.destroy(); }
  if (latestExam && document.getElementById('dashSubChart')) {
    const subMeans = subjects.map(sub => {
      const subMarks = marks.filter(m => m.examId===latestExam.id && m.subjectId===sub.id);
      return subMarks.length ? (subMarks.reduce((a,m)=>a+m.score,0)/subMarks.length).toFixed(1) : 0;
    });
    dashCharts.sub = new Chart(document.getElementById('dashSubChart'), {
      type:'bar',
      data:{ labels:subjects.map(s=>s.code), datasets:[{
        label:'Mean Score', data:subMeans,
        backgroundColor:['#1a6fb5','#16a34a','#0d9488','#d97706','#7c3aed','#0891b2','#ea580c','#dc2626','#9333ea'],
        borderRadius:6
      }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{grid:{color:'rgba(100,116,139,.1)'},min:0,max:100}} }
    });
  }

  // Gender pie
  if (dashCharts.gender) { dashCharts.gender.destroy(); }
  if (document.getElementById('dashGenderChart')) {
    const m = students.filter(s=>s.gender==='M').length;
    const f = students.filter(s=>s.gender==='F').length;
    dashCharts.gender = new Chart(document.getElementById('dashGenderChart'), {
      type:'doughnut',
      data:{ labels:['Male','Female'], datasets:[{data:[m,f],backgroundColor:['#1a6fb5','#db2777'],borderWidth:0}]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}} }
    });
  }

  // Grade distribution chart
  if (dashCharts.gradeDist) { dashCharts.gradeDist.destroy(); }
  if (latestExam && document.getElementById('dashGradeChart')) {
    const latestMarks = marks.filter(m=>m.examId===latestExam.id);
    const gradeCount = {};
    latestMarks.forEach(m=>{const g=getGrade(m.score);gradeCount[g.grade]=(gradeCount[g.grade]||0)+1;});
    const gLabels=Object.keys(gradeCount); const gData=gLabels.map(k=>gradeCount[k]);
    const gColors=['#16a34a','#0d9488','#1a6fb5','#2563eb','#d97706','#ea580c','#dc2626','#991b1b'];
    dashCharts.gradeDist = new Chart(document.getElementById('dashGradeChart'),{
      type:'doughnut',
      data:{labels:gLabels,datasets:[{data:gData,backgroundColor:gColors.slice(0,gLabels.length),borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}},cutout:'55%'}
    });
  }

  // Top 5
  if (latestExam) {
    const ranked = students
      .map(s => { const t=getStudentTotalForLatestExam(s.id); return t!==null?{...s,total:t}:null; })
      .filter(Boolean).sort((a,b)=>b.total-a.total).slice(0,5);
    document.getElementById('dashTop5').innerHTML = ranked.length ? ranked.map((s,i)=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-lt)">
        <div style="display:flex;align-items:center;gap:.6rem">
          <span class="badge ${i===0?'b-amber':i<3?'b-blue':'b-teal'}">#${i+1}</span>
          <span style="font-weight:600;font-size:.85rem">${s.name}</span>
        </div>
        <span style="font-weight:700;color:var(--primary)">${s.total}</span>
      </div>`).join('') : '<p style="color:var(--muted);text-align:center;padding:1rem">No marks data yet.</p>';
  }

  // Recent exams
  document.getElementById('dashRecentExams').innerHTML = exams.slice(-4).reverse().map(e=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-lt)">
      <div><div style="font-weight:600;font-size:.85rem">${e.name}</div><div style="font-size:.75rem;color:var(--muted)">${e.type} · ${e.term} ${e.year}</div></div>
      <span class="badge b-blue">${e.subjectIds.length} subs</span>
    </div>`).join('') || '<p style="color:var(--muted);text-align:center;padding:1rem">No exams yet.</p>';
}

function getStudentTotalForLatestExam(studentId) {
  const latest = exams[exams.length-1];
  if (!latest) return null;
  const studentMarks = marks.filter(m => m.examId===latest.id && m.studentId===studentId);
  if (!studentMarks.length) return null;
  return studentMarks.reduce((a,m)=>a+m.score,0);
}

// ═══════════════ POPULATE DROPDOWNS ═══════════════
function populateAllDropdowns() {
  populateStrTeacherDropdown();
  populateStudentFilterDropdowns();
  // Classes
  ['examClass','stuClass','strClass','rpStream'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (id === 'rpStream') {
      el.innerHTML = '<option value="">— All Streams —</option>' + streams.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    } else {
      const ph = id==='examClass' ? '— All Classes —' : '— Select —';
      el.innerHTML = `<option value="">${ph}</option>` + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    }
  });
  // Streams for student form
  const stuStr = document.getElementById('stuStream');
  if (stuStr) stuStr.innerHTML = '<option value="">— Select —</option>' + streams.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

  // Teacher dropdown in subject form
  const subTch = document.getElementById('subTeacher');
  if (subTch) subTch.innerHTML = '<option value="">— None —</option>' + teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');

  // Populate exam subject checkboxes
  renderExamSubjectCheckboxes();

  // Student class triggers stream update
  const stuCls = document.getElementById('stuClass');
  if (stuCls) stuCls.addEventListener('change', updateStuStreamDropdown);
  // Student class filter triggers stream filter update
  const stuClassFilter = document.getElementById('stuClassFilter');
  if (stuClassFilter) stuClassFilter.addEventListener('change', () => { populateStudentFilterDropdowns(); applyStudentFilters(); });
}

function updateStuStreamDropdown() {
  const clsId = document.getElementById('stuClass').value;
  const stuStr = document.getElementById('stuStream');
  const filtered = clsId ? streams.filter(s=>s.classId===clsId) : streams;
  stuStr.innerHTML = '<option value="">— Select —</option>' + filtered.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}

function populateGSDropdowns() {
  ['anGradingSystem'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;
    el.innerHTML=gradingSystems.map(g=>`<option value="${g.id}" ${g.id===getActiveGradingSystemId()?'selected':''}>${g.name}</option>`).join('');
    if(cur)el.value=cur;
  });
}
function populateExamDropdowns() {
  const isTeacherForExams = currentUser && currentUser.role === 'teacher';
  const mySubIdsForExams = isTeacherForExams ? getMySubjectIds() : [];
  const myClassIdsForExams = isTeacherForExams
    ? [...new Set(getMyClassTeacherStreams().map(s => s.classId))]
    : [];
  const filteredExams = isTeacherForExams
    ? exams.filter(e => {
        const hasSubject = e.subjectIds.some(sid => mySubIdsForExams.includes(sid));
        const isMyClass  = !e.classId || myClassIdsForExams.length === 0 || myClassIdsForExams.includes(e.classId);
        return hasSubject || isMyClass;
      })
    : exams;
  ['umExam','anExam','mlExam'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    // Consolidated exams cannot have marks uploaded — they are computed automatically
    const examList = id === 'umExam' ? filteredExams.filter(e => e.category !== 'consolidated') : filteredExams;
    el.innerHTML = '<option value="">— Select Exam —</option>' + examList.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  });
}
function populateMeritDropdowns() {
  populateExamDropdowns();
  // Populate class dropdown
  const classEl = document.getElementById('mlClass');
  if (classEl) {
    classEl.innerHTML = '<option value="">— All Classes —</option>' +
      classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
}
function populateUmDropdowns() {
  populateExamDropdowns();
  document.getElementById('umMode')?.addEventListener('change', function() {
    document.getElementById('umExcelCard').style.display = this.value==='excel' ? '' : 'none';
    document.getElementById('umManualCard').style.display = this.value==='manual' ? '' : 'none';
  });
}

function populateReportDropdowns() {
  const rpEx = document.getElementById('rpExam');
  if (rpEx) rpEx.innerHTML = '<option value="">— Select Exam —</option>' + exams.map(e=>`<option value="${e.id}">${e.name} (${e.term} ${e.year})</option>`).join('');
  const rpStu = document.getElementById('rpStudent');
  if (rpStu) {
    const sorted = [...students].sort((a,b)=>a.name.localeCompare(b.name));
    rpStu.innerHTML = '<option value="">— All Students —</option>' + sorted.map(s=>`<option value="${s.id}">${s.name} (${s.adm})</option>`).join('');
  }
  const rpClass = document.getElementById('rpClass');
  if (rpClass) {
    rpClass.innerHTML = '<option value="">— All Classes —</option>' + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  // Populate rpYear with years from exams + current year
  const rpYear = document.getElementById('rpYear');
  if (rpYear) {
    const years = [...new Set([...exams.map(e=>e.year), String(new Date().getFullYear())])].sort((a,b)=>b-a);
    rpYear.innerHTML = '<option value="">— Auto from Exam —</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
  }
}

// Called when class filter changes — cascade to stream and student dropdowns
function onRpClassChange() {
  const classId = document.getElementById('rpClass')?.value || '';
  // Update stream dropdown to only show streams in selected class
  const rpStream = document.getElementById('rpStream');
  if (rpStream) {
    const relevantStreams = classId ? streams.filter(s=>s.classId===classId) : streams;
    rpStream.innerHTML = '<option value="">— All Streams —</option>' + relevantStreams.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  // Update student dropdown to only show students in selected class
  const rpStu = document.getElementById('rpStudent');
  if (rpStu) {
    const sorted = [...students].filter(s=>!classId||s.classId===classId).sort((a,b)=>a.name.localeCompare(b.name));
    rpStu.innerHTML = '<option value="">— All Students —</option>' + sorted.map(s=>`<option value="${s.id}">${s.name} (${s.adm})</option>`).join('');
  }
  onRpStudentChange();
}


  const examId = document.getElementById('rpExam')?.value;
  const exam   = examId ? exams.find(e => e.id === examId) : null;
  const rpTerm = document.getElementById('rpTerm');
  const rpYear = document.getElementById('rpYear');
  if (exam) {
    // Auto-set term and year from exam (only if user hasn't manually picked)
    if (rpTerm && !rpTerm.dataset.manuallySet) {
      for (const opt of rpTerm.options) { if (opt.value === exam.term) { opt.selected = true; break; } }
    }
    if (rpYear && !rpYear.dataset.manuallySet) {
      for (const opt of rpYear.options) { if (opt.value === String(exam.year)) { opt.selected = true; break; } }
    }
  }
  onRpStudentChange();
  // Also update the stream dropdown
  const rpStream = document.getElementById('rpStream');
  if (rpStream) {
    const relevantStreams = exam?.classId ? streams.filter(s=>s.classId===exam.classId) : streams;
    rpStream.innerHTML = '<option value="">— All Streams —</option>' + relevantStreams.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }

// Called when student changes
function onRpStudentChange() {
  refreshRpFeeAutoLink();
}

// Called when term or year manually changed
function onRpTermYearChange() {
  const rpTerm = document.getElementById('rpTerm');
  const rpYear = document.getElementById('rpYear');
  if (rpTerm) rpTerm.dataset.manuallySet = rpTerm.value ? '1' : '';
  if (rpYear) rpYear.dataset.manuallySet = rpYear.value ? '1' : '';
  refreshRpFeeAutoLink();
}

// Central fee auto-link refresh for report form
function refreshRpFeeAutoLink() {
  const examId  = document.getElementById('rpExam')?.value;
  const stuId   = document.getElementById('rpStudent')?.value;
  const exam    = examId ? exams.find(e => e.id === examId) : null;

  // Resolve effective term and year (manual overrides > exam auto)
  const rpTermVal = document.getElementById('rpTerm')?.value;
  const rpYearVal = document.getElementById('rpYear')?.value;
  const effectiveTerm = rpTermVal || (exam?.term) || '';
  const effectiveYear = rpYearVal || (exam?.year ? String(exam.year) : '');

  const balEl      = document.getElementById('rpFeeBalance');
  const nextTermEl = document.getElementById('rpFeeNextTerm');
  const statusEl   = document.getElementById('rpFeeAutoLinkText');
  const statusBox  = document.getElementById('rpFeeAutoLinkStatus');
  const badge      = document.getElementById('rpFeeStatusBadge');

  if (!effectiveTerm || !effectiveYear) {
    if (statusEl) statusEl.textContent = 'Select exam or set term/year to auto-link fees';
    return;
  }

  loadFees();

  if (stuId) {
    // Single student — show their exact balance
    const stu = students.find(s => s.id === stuId);
    const rec = feeRecords.find(r => r.studentId===stuId && r.term===effectiveTerm && String(r.year)===effectiveYear);
    if (rec) {
      const bal = getRecordBalance(rec);
      if (balEl && !balEl.dataset.manuallySet) balEl.value = bal;
      if (badge) {
        badge.style.display = '';
        badge.textContent   = bal <= 0 ? '✅ Cleared' : `⚠️ Owes KES ${bal.toLocaleString()}`;
        badge.style.color   = bal <= 0 ? '#16a34a' : '#dc2626';
      }
      if (statusEl) {
        statusEl.innerHTML = bal <= 0
          ? `<span style="color:#16a34a;font-weight:700">✅ Fees cleared</span> — ${effectiveTerm} ${effectiveYear}`
          : `<span style="color:#dc2626;font-weight:700">⚠️ KES ${bal.toLocaleString()} outstanding</span> — ${effectiveTerm} ${effectiveYear}`;
      }
      if (statusBox) statusBox.style.borderColor = bal <= 0 ? '#16a34a' : '#dc2626';
    } else {
      if (badge) { badge.style.display=''; badge.textContent='— No fee record'; badge.style.color='var(--muted)'; }
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--muted)">No fee record for ${effectiveTerm} ${effectiveYear}</span>`;
      if (statusBox) statusBox.style.borderColor = 'var(--border)';
    }
    // Next-term fee
    if (nextTermEl && !nextTermEl.dataset.manuallySet && stu) {
      const termMap = {'Term 1':'Term 2','Term 2':'Term 3','Term 3':'Term 1'};
      const nxtTerm = termMap[effectiveTerm] || effectiveTerm;
      const nxtYear = effectiveTerm==='Term 3' ? String(parseInt(effectiveYear)+1) : effectiveYear;
      const struct  = feeStructures.find(f => f.classId===stu.classId && f.term===nxtTerm && String(f.year)===nxtYear);
      if (struct) nextTermEl.value = struct.totalFee;
    }
  } else {
    // No student — show class/school-wide summary for this term/year
    const examClassId = exam?.classId;
    let totalRec=0, totalPaid=0, totalBal=0;
    feeRecords.filter(r => r.term===effectiveTerm && String(r.year)===effectiveYear && (!examClassId || r.classId===examClassId)).forEach(r => {
      totalRec++;
      totalPaid += getRecordTotalPaid(r);
      totalBal  += getRecordBalance(r);
    });
    if (statusEl) {
      statusEl.innerHTML = totalRec
        ? `🔗 <strong>${effectiveTerm} ${effectiveYear}</strong> — ${totalRec} records | Paid: KES ${totalPaid.toLocaleString()} | Outstanding: <span style="color:${totalBal>0?'#dc2626':'#16a34a'}">KES ${totalBal.toLocaleString()}</span>`
        : `🔗 <strong>${effectiveTerm} ${effectiveYear}</strong> — No fee records found`;
    }
    if (statusBox) statusBox.style.borderColor = totalBal > 0 ? '#f59e0b' : 'var(--border)';
  }
}

// ═══════════════ UPLOAD MARKS: Dynamic subject load ═══════════════

function loadUmStudents() {
  const examId   = document.getElementById('umExam').value;
  const subjectId= document.getElementById('umSubject').value;
  const streamId = document.getElementById('umStream').value;
  const body     = document.getElementById('umBody');
  const empty    = document.getElementById('umEmpty');
  const maxLabel = document.getElementById('umMaxLabel');
  const subLabel = document.getElementById('umSubjectLabel');
  body.innerHTML = '';

  if (!examId || !subjectId) { empty.style.display=''; return; }
  empty.style.display = 'none';

  const sub = subjects.find(s=>s.id===subjectId);
  if (!sub) return;
  maxLabel.textContent = `(Max: ${sub.max})`;
  subLabel.textContent = `— ${sub.name}`;

  // Determine if current user is a teacher (hide grade/points from teachers)
  const isTeacher = currentUser && currentUser.role === 'teacher';

  // Toggle grade/points columns visibility
  document.querySelectorAll('.um-grade-col, .um-points-col').forEach(el => {
    el.style.display = isTeacher ? 'none' : '';
  });

  // Get enrolled students for this subject, filtered by selected stream
  const enrolledIds = sub.studentIds && sub.studentIds.length ? sub.studentIds : students.map(s=>s.id);
  let enrolled = students.filter(s => enrolledIds.includes(s.id));

  // Filter by stream if selected
  if (streamId) {
    enrolled = enrolled.filter(s => s.streamId === streamId);
  }
  // Always sort alphabetically
  enrolled.sort((a,b) => a.name.localeCompare(b.name));

  if (!enrolled.length) { empty.textContent='No students found in this stream for the selected subject.'; empty.style.display=''; return; }

  enrolled.forEach((stu, idx) => {
    const existing = marks.find(m => m.examId===examId && m.studentId===stu.id && m.subjectId===subjectId);
    const score    = existing ? existing.score : '';
    const g        = score !== '' ? getGrade(score, sub.max) : null;
    const cls      = g ? (g.points>=6?'good':g.points>=4?'avg':'poor') : '';
    const stream   = streams.find(s=>s.id===stu.streamId);

    const gradeCell   = isTeacher ? '' : `<td id="gr_${stu.id}">${g ? gradeTag(g) : '—'}</td>`;
    const pointsCell  = isTeacher ? '' : `<td id="pt_${stu.id}">${g ? g.points : '—'}</td>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td style="font-family:var(--mono);font-size:.82rem">${stu.adm}</td>
      <td style="font-weight:600">${stu.name}</td>
      <td><span class="badge ${stu.gender==='M'?'b-m':'b-f'}">${stu.gender}</span></td>
      <td>${stream?stream.name:'—'}</td>
      <td>
        <input type="number" class="marks-input ${cls}" id="mk_${stu.id}"
          min="0" max="${sub.max}" value="${score}"
          data-stuId="${stu.id}" data-idx="${idx}" data-total="${enrolled.length}"
          oninput="onMarkInput(this)" onkeydown="onMarkKey(event,this)"/>
      </td>
      ${gradeCell}
      ${pointsCell}
    `;
    body.appendChild(tr);
  });
}

function onMarkInput(inp) {
  const val = parseInt(inp.value);
  const sub = subjects.find(s=>s.id===document.getElementById('umSubject').value);
  const max = sub ? sub.max : 100;
  const isTeacher = currentUser && currentUser.role === 'teacher';
  if (!isNaN(val) && val >= 0 && val <= max) {
    const g = getGrade(val, max);
    if (!isTeacher) {
      const grEl = document.getElementById('gr_'+inp.dataset.stuId);
      const ptEl = document.getElementById('pt_'+inp.dataset.stuId);
      if (grEl) grEl.innerHTML = gradeTag(g);
      if (ptEl) ptEl.textContent = g.points;
    }
    inp.className = 'marks-input ' + (g.points>=6?'good':g.points>=4?'avg':'poor');
    autoSaveMark(inp.dataset.stuId, val);
  }
}

function onMarkKey(e, inp) {
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const idx   = parseInt(inp.dataset.idx);
    const total = parseInt(inp.dataset.total);
    const next  = idx + 1;
    if (next < total) {
      const allInputs = document.querySelectorAll('.marks-input');
      if (allInputs[next]) allInputs[next].focus();
    }
  }
}

function autoSaveMark(studentId, score) {
  const examId    = document.getElementById('umExam').value;
  const subjectId = document.getElementById('umSubject').value;
  const existing  = marks.findIndex(m => m.examId===examId && m.studentId===studentId && m.subjectId===subjectId);
  if (existing > -1) marks[existing].score = score;
  else marks.push({ id:uid(), examId, studentId, subjectId, score });
  save(K.marks, marks);
}

function saveAllMarks() {
  const examId    = document.getElementById('umExam').value;
  const subjectId = document.getElementById('umSubject').value;
  const streamId  = document.getElementById('umStream').value;
  if (!examId||!streamId||!subjectId) { showToast('Select exam, class, stream and subject first','error'); return; }
  document.querySelectorAll('.marks-input').forEach(inp => {
    const val = parseInt(inp.value);
    if (!isNaN(val)) autoSaveMark(inp.dataset.stuId, val);
  });
  showToast('All marks saved ✓','success');
  renderDashboard();
}

// ═══════════════ MARKS EXCEL UPLOAD ═══════════════
// Supports TWO modes:
//   A) Single-subject: columns AdmNo, Name, Marks  (when a subject is selected)
//   B) All-subjects:   columns AdmNo, Name, [SubjectCode or SubjectName per column]
function handleMarksUpload(input) {
  const file = input.files[0]; if (!file) return;
  const examId    = document.getElementById('umExam').value;
  const subjectId = document.getElementById('umSubject').value;
  if (!examId) { showToast('Select an exam first','error'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type:'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      if (!data.length) { showToast('File is empty','warning'); return; }

      // Detect mode: if file has "Marks" column → single subject mode
      // If file has subject codes/names as columns → all-subjects mode
      const firstRow  = data[0];
      const colKeys   = Object.keys(firstRow);
      const hasSingle = colKeys.some(k => k.toLowerCase()==='marks' || k.toLowerCase()==='score');

      let count = 0, skipped = 0;

      if (hasSingle || subjectId) {
        // ── MODE A: single subject ──
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub && !hasSingle) { showToast('Select a subject for single-subject upload','error'); return; }
        data.forEach(row => {
          const adm   = String(row['AdmNo']||row['admno']||row['Adm No']||'').trim();
          const score = parseInt(row['Marks']||row['marks']||row['Score']||row['score']||0);
          const stu   = students.find(s => s.adm === adm); if (!stu) { skipped++; return; }
          const maxM  = sub ? sub.max : 100;
          // Temporarily set subjectId for autoSaveMark
          const origSubId = document.getElementById('umSubject').value;
          if (subjectId) {
            autoSaveMark(stu.id, Math.min(Math.max(score,0), maxM));
          }
          count++;
        });
        showToast(`${count} marks uploaded${skipped?' ('+skipped+' skipped)':''} ✓`, 'success');
        loadUmStudents();

      } else {
        // ── MODE B: all subjects in one file ──
        // Map column headers to subject ids
        // Column can be subject code (ENG, KIS...) or subject name (English, Kiswahili...)
        const exam = exams.find(e => e.id === examId);
        const examSubIds = exam ? exam.subjectIds : subjects.map(s=>s.id);
        const colSubMap = {}; // colKey → { subjectId, maxMarks }
        colKeys.forEach(col => {
          const colU = col.trim().toUpperCase();
          const byCode = subjects.find(s => s.code.toUpperCase() === colU && examSubIds.includes(s.id));
          const byName = subjects.find(s => s.name.toUpperCase() === col.trim().toUpperCase() && examSubIds.includes(s.id));
          const matched = byCode || byName;
          if (matched) colSubMap[col] = { subjectId: matched.id, max: matched.max };
        });

        if (!Object.keys(colSubMap).length) {
          showToast('No subject columns found. Use subject codes (ENG, KIS, MTH…) or names as column headers.','error');
          return;
        }

        data.forEach(row => {
          const adm = String(row['AdmNo']||row['admno']||row['Adm No']||'').trim();
          const stu = students.find(s => s.adm === adm); if (!stu) { skipped++; return; }
          let rowSaved = 0;
          Object.entries(colSubMap).forEach(([col, {subjectId:sid, max}]) => {
            const raw   = row[col];
            const score = parseInt(raw);
            if (isNaN(score)) return;
            const clampedScore = Math.min(Math.max(score,0), max);
            const existing = marks.findIndex(m => m.examId===examId && m.studentId===stu.id && m.subjectId===sid);
            if (existing > -1) marks[existing].score = clampedScore;
            else marks.push({ id:uid(), examId, studentId:stu.id, subjectId:sid, score:clampedScore });
            rowSaved++;
          });
          if (rowSaved) count++;
        });
        save(K.marks, marks);
        showToast(`All-subjects upload: ${count} students processed${skipped?' ('+skipped+' not found)':''} ✓`, 'success');
        loadUmStudents();
        renderDashboard();
      }
    } catch(err) { showToast('Error reading file: ' + err.message, 'error'); console.error(err); }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

// Download template for ALL subjects (for bulk upload)
function downloadAllSubjectsTemplate() {
  const examId  = document.getElementById('umExam').value;
  const streamId= document.getElementById('umStream').value;
  const exam    = examId ? exams.find(e=>e.id===examId) : null;
  const examSubIds = exam ? exam.subjectIds : subjects.map(s=>s.id);
  const examSubs   = examSubIds.map(sid=>subjects.find(s=>s.id===sid)).filter(Boolean);

  // Build student list filtered by stream
  let studentList = students;
  if (streamId) studentList = studentList.filter(s=>s.streamId===streamId);
  studentList = [...studentList].sort((a,b)=>a.name.localeCompare(b.name));

  let data;
  if (studentList.length) {
    data = studentList.map(s => {
      const row = { AdmNo: s.adm, Name: s.name };
      examSubs.forEach(sub => { row[sub.code] = ''; });
      return row;
    });
  } else {
    const row = { AdmNo: 'A000000001', Name: 'Student Name' };
    examSubs.forEach(sub => { row[sub.code] = ''; });
    data = [row];
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'All Marks');
  XLSX.writeFile(wb, `all_subjects_template${exam?'_'+exam.name:''}.xlsx`);
}

function downloadMarksTemplate() {
  const examId    = document.getElementById('umExam').value;
  const subjectId = document.getElementById('umSubject').value;
  const streamId  = document.getElementById('umStream').value;
  const sub = subjects.find(s=>s.id===subjectId);
  const enrolledIds = sub?.studentIds?.length ? sub.studentIds : students.map(s=>s.id);
  let enrolled = students.filter(s=>enrolledIds.includes(s.id));
  if (streamId) enrolled = enrolled.filter(s=>s.streamId===streamId);
  enrolled.sort((a,b)=>a.name.localeCompare(b.name));
  const data = enrolled.map(s=>({ AdmNo:s.adm, Name:s.name, Marks:'' }));
  if (!data.length) data.push({ AdmNo:'A000000001', Name:'Student Name', Marks:0 });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `marks_template_${sub?.code||'subject'}.xlsx`);
}

function exportMarksExcel() {
  const examId    = document.getElementById('umExam').value;
  const subjectId = document.getElementById('umSubject').value;
  const streamId  = document.getElementById('umStream').value;
  if (!examId||!subjectId) { showToast('Select exam and subject first','error'); return; }
  const sub = subjects.find(s=>s.id===subjectId);
  let studentList = students;
  if (streamId) studentList = studentList.filter(s=>s.streamId===streamId);
  const data = studentList.map(s => {
    const m = marks.find(mk=>mk.examId===examId&&mk.studentId===s.id&&mk.subjectId===subjectId);
    const g = m ? getGrade(m.score, sub?.max||100) : null;
    return { AdmNo:s.adm, Name:s.name, Gender:s.gender, Marks:m?m.score:'', Grade:g?g.grade:'', Points:g?g.points:'' };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  XLSX.writeFile(wb, `marks_${sub?.code||'subject'}.xlsx`);
}

// ═══════════════ EXAM CATEGORY UI ═══════════════
let currentExamCategory = 'regular'; // 'regular' | 'consolidated'

function setExamCategory(cat) {
  currentExamCategory = cat;
  document.getElementById('catBtnRegular').classList.toggle('active', cat === 'regular');
  document.getElementById('catBtnConsolidated').classList.toggle('active', cat === 'consolidated');
  document.getElementById('examTypeWrap').style.display = cat === 'regular' ? '' : 'none';
  document.getElementById('examConsolidatedWrap').style.display = cat === 'consolidated' ? '' : 'none';
  document.getElementById('consolidatedSourceWrap').style.display = cat === 'consolidated' ? '' : 'none';
  if (cat === 'consolidated') renderConsolidatedSourceCheckboxes();
}

function renderExamSubjectCheckboxes(selectedIds) {
  const wrap = document.getElementById('examSubjectCheckboxes');
  if (!wrap) return;
  wrap.innerHTML = subjects.map(s => `
    <label class="sub-check-label">
      <input type="checkbox" value="${s.id}" class="exam-sub-chk" ${selectedIds && selectedIds.includes(s.id) ? 'checked' : ''} onchange="updateExamSelectAll()"/>
      <span class="sub-chk-code badge b-teal" style="font-size:.65rem">${s.code}</span>
      <span class="sub-chk-name">${s.name}</span>
    </label>`).join('');
  updateExamSelectAll();
}

function toggleExamAllSubjects(cb) {
  document.querySelectorAll('#examSubjectCheckboxes input[type=checkbox]').forEach(c => c.checked = cb.checked);
}

function updateExamSelectAll() {
  const all = document.querySelectorAll('#examSubjectCheckboxes input[type=checkbox]');
  const checked = document.querySelectorAll('#examSubjectCheckboxes input[type=checkbox]:checked');
  const sa = document.getElementById('examSelectAllSubjects');
  if (sa) { sa.checked = all.length > 0 && checked.length === all.length; sa.indeterminate = checked.length > 0 && checked.length < all.length; }
}

function renderConsolidatedSourceCheckboxes(selectedIds) {
  const wrap = document.getElementById('consolidatedSourceCheckboxes');
  if (!wrap) return;
  const regularExams = exams.filter(e => e.category !== 'consolidated');
  if (!regularExams.length) { wrap.innerHTML = '<p style="color:var(--muted);font-size:.82rem">No regular exams available yet.</p>'; return; }
  wrap.innerHTML = regularExams.map(e => `
    <label class="sub-check-label">
      <input type="checkbox" value="${e.id}" class="consol-src-chk" ${selectedIds && selectedIds.includes(e.id) ? 'checked' : ''}/>
      <span class="sub-chk-code badge b-blue" style="font-size:.65rem">${e.type||'Exam'}</span>
      <span class="sub-chk-name">${e.name} (${e.term} ${e.year})</span>
    </label>`).join('');
}

// ═══════════════ EXAMS CRUD ═══════════════
function saveExam() {
  if (currentUser && currentUser.role === 'teacher') { showToast('Teachers cannot create exams','error'); return; }
  const name  = document.getElementById('examName').value.trim();
  const term  = document.getElementById('examTerm').value;
  const year  = document.getElementById('examYear').value;
  const date  = document.getElementById('examDate').value;
  const clsId = document.getElementById('examClass').value;
  const notes = document.getElementById('examNotes').value;
  const subIds = [...document.querySelectorAll('#examSubjectCheckboxes input[type=checkbox]:checked')].map(cb => cb.value);
  const cat   = currentExamCategory;

  let type = '';
  if (cat === 'regular') {
    type = document.getElementById('examType').value;
    if (!name || !type) { showToast('Name and exam type are required','error'); return; }
  } else {
    const scope = document.getElementById('examConsolidatedScope').value;
    type = 'Consolidated';
    if (!name) { showToast('Exam name is required','error'); return; }
  }
  if (!subIds.length) { showToast('Select at least one subject','error'); return; }

  const sourceExamIds = cat === 'consolidated'
    ? [...document.querySelectorAll('.consol-src-chk:checked')].map(cb => cb.value)
    : [];

  const editId = document.getElementById('editExamId').value;
  if (editId) {
    const i = exams.findIndex(e => e.id === editId);
    if (i > -1) exams[i] = { ...exams[i], name, category:cat, type, term, year, date, classId:clsId, subjectIds:subIds, sourceExamIds, notes };
    showToast('Exam updated ✓','success');
  } else {
    exams.push({ id:uid(), name, category:cat, type, term, year, date, classId:clsId, subjectIds:subIds, sourceExamIds, notes });
    showToast('Exam created ✓','success');
  }
  save(K.exams, exams);
  cancelExamEdit(); renderExamList(); populateExamDropdowns();
}

function getPlatformExams() {
  try { return JSON.parse(localStorage.getItem(K_PLATFORM_EXAMS)||'[]'); } catch { return []; }
}
function renderExamList() {
  const schoolRows = exams.map((e,i)=>{
    const catBadge = e.category === 'consolidated'
      ? '<span class="badge b-purple" style="font-size:.65rem">Consolidated</span>'
      : '<span class="badge b-teal" style="font-size:.65rem">Regular</span>';
    return `<tr>
      <td>${i+1}</td><td><strong>${e.name}</strong></td>
      <td>${catBadge}</td>
      <td><span class="badge b-blue">${e.type||''}</span></td>
      <td>${e.term}</td><td>${e.year}</td>
      <td>${classes.find(c=>c.id===e.classId)?.name||'All'}</td>
      <td>${e.subjectIds.length} subjects</td>
      <td>${e.date||'—'}</td>
      <td><div class="act-cell">
        <button class="icb ed" onclick="editExam('${e.id}')" title="Edit">✏️</button>
        <button class="icb dl" onclick="deleteExam('${e.id}')" title="Delete">🗑️</button>
      </div></td>
    </tr>`;
  });
  // Append platform-distributed exams (read-only)
  const platExams = getPlatformExams();
  const platRows = platExams.map((e,i)=>{
    return `<tr style="background:linear-gradient(90deg,rgba(124,58,237,.04),transparent)">
      <td style="color:var(--muted)">${exams.length+i+1}</td>
      <td><strong>${e.title}</strong> <span style="font-size:.67rem;background:#ede9fe;color:#7c3aed;padding:.1rem .4rem;border-radius:4px;font-weight:700">PLATFORM</span></td>
      <td><span class="badge b-purple" style="font-size:.65rem">Platform</span></td>
      <td><span class="badge b-blue" style="font-size:.65rem">${e.subject||'All Subjects'}</span></td>
      <td>${e.term}</td><td>${e.year}</td>
      <td>${e.class||'All Classes'}</td>
      <td>—</td>
      <td>—</td>
      <td><span style="font-size:.72rem;color:var(--muted)">Read-only</span></td>
    </tr>`;
  });
  const allRows = [...schoolRows, ...platRows];
  document.getElementById('examListBody').innerHTML = allRows.join('') || '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:1.5rem">No exams yet.</td></tr>';
}

function editExam(id) {
  const e=exams.find(x=>x.id===id); if(!e) return;
  document.getElementById('editExamId').value=e.id;
  document.getElementById('examName').value=e.name;
  document.getElementById('examTerm').value=e.term;
  document.getElementById('examYear').value=e.year;
  document.getElementById('examDate').value=e.date||'';
  document.getElementById('examClass').value=e.classId||'';
  document.getElementById('examNotes').value=e.notes||'';
  // Restore category
  const cat = e.category || 'regular';
  setExamCategory(cat);
  if (cat === 'regular') {
    document.getElementById('examType').value=e.type||'';
  } else {
    const scopeSel = document.getElementById('examConsolidatedScope');
    if (scopeSel) scopeSel.value = e.consolidatedScope || 'term';
    renderConsolidatedSourceCheckboxes(e.sourceExamIds || []);
  }
  renderExamSubjectCheckboxes(e.subjectIds || []);
  document.getElementById('examFormTitle').textContent='✏️ Edit Exam';
  openExamTab('tabCreateExam');
}
function cancelExamEdit() {
  ['editExamId','examName','examNotes','examDate'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('examType').value=''; document.getElementById('examYear').value='2025';
  document.getElementById('examFormTitle').textContent='➕ Create New Exam';
  setExamCategory('regular');
  renderExamSubjectCheckboxes([]);
}
function deleteExam(id) {
  if(!confirm('Delete this exam? All marks for this exam will also be removed.')) return;
  exams=exams.filter(e=>e.id!==id);
  marks=marks.filter(m=>m.examId!==id);
  save(K.exams,exams); save(K.marks,marks);
  renderExamList(); populateExamDropdowns();
  showToast('Exam deleted','info');
}

// ═══════════════ ANALYSIS ═══════════════
let anCharts = {};

// ═══════════════ MERIT LIST ═══════════════

// Build a scored+ranked array for an exam.
// filterClassId  — restrict to one class (ranks within that class)
// filterStreamId — further restrict to one stream (ranks within that stream)
// If neither is given, scores all students but ranks per-class then per-stream.
function buildMeritData(examId, filterStreamId, filterClassId) {
  const exam      = exams.find(e => e.id === examId); if (!exam) return [];
  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
  const examMarks = isConsolidated ? [] : marks.filter(m => m.examId === examId);
  const totalSubs = exam.subjectIds.length || 1;

  // Determine effective classId restriction
  const effectiveClassId = filterClassId || exam.classId || null;

  let stuList = students.filter(s => {
    if (effectiveClassId && s.classId !== effectiveClassId) return false;
    return true;
  });
  if (filterStreamId) stuList = stuList.filter(s => s.streamId === filterStreamId);

  const scored = stuList.map(stu => {
    let total, pts;
    if (isConsolidated && sourceExamObjs.length > 0) {
      let hasAnyScore = false;
      const subTotals = exam.subjectIds.map(sid => {
        const scores = sourceExamObjs.map(src => {
          const mk = marks.find(m=>m.examId===src.id&&m.studentId===stu.id&&m.subjectId===sid);
          return mk ? mk.score : null;
        }).filter(sc=>sc!==null);
        if (scores.length) hasAnyScore = true;
        return scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
      });
      if (!hasAnyScore) return null;
      total = parseFloat(subTotals.reduce((a,b)=>a+b,0).toFixed(1));
      pts   = exam.subjectIds.reduce((acc,sid,i) => {
        const sub = subjects.find(s=>s.id===sid);
        return acc + getGrade(subTotals[i], sub?.max||100).points;
      }, 0);
    } else {
      const stuMarks = examMarks.filter(m => m.studentId === stu.id);
      if (!stuMarks.length) return null;
      total = stuMarks.reduce((a,m) => a+m.score, 0);
      pts   = stuMarks.reduce((a,m) => a + getGrade(m.score, subjects.find(s=>s.id===m.subjectId)?.max||100).points, 0);
    }
    const mean   = total / totalSubs;
    const maxAvg = (exam.subjectIds.map(sid=>subjects.find(s=>s.id===sid)?.max||100).reduce((a,b)=>a+b,0)/totalSubs) || 100;
    const g      = getMeanGrade(mean / maxAvg * 8);
    return { ...stu, total, mean, grade:g, points:pts };
  }).filter(Boolean).sort((a,b) => b.total - a.total);

  // ── Rank within class (overallRank = position in this class, not whole school) ──
  if (filterStreamId) {
    // Filtered to a single stream: rank within that stream = overallRank
    scored.forEach((s,i) => { s.overallRank = i+1; s.streamRank = i+1; });
  } else {
    // Rank within each class separately
    const byClass = {};
    scored.forEach(s => {
      const key = s.classId||'none';
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(s);
    });
    // overallRank = position within class
    Object.values(byClass).forEach(grp => grp.forEach((s,i) => s.overallRank = i+1));

    // Rank within each stream (within this filtered set)
    const byStream = {};
    scored.forEach(s => {
      const key = (s.classId||'none') + '_' + (s.streamId||'none');
      if (!byStream[key]) byStream[key] = [];
      byStream[key].push(s);
    });
    Object.values(byStream).forEach(grp => grp.forEach((s,i) => s.streamRank = i+1));
  }

  return scored;
}

// Build subject-analysis block (grade distribution + gender means per subject)
function buildSubjectAnalysisHTML(examId, scopeStudentIds) {
  const exam      = exams.find(e => e.id === examId); if (!exam) return '';
  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
  const examMarks = isConsolidated ? [] : marks.filter(m => m.examId === examId &&
    (scopeStudentIds ? scopeStudentIds.includes(m.studentId) : true));
  const gs        = getActiveGradingSystem();
  const gradeKeys = gs.bands.map(b => b.grade);

  // Helper: get averaged score for a student+subject on a consolidated exam
  function getConsolidatedScore(studentId, subjectId) {
    const scores = sourceExamObjs.map(src => {
      const mk = marks.find(m => m.examId===src.id && m.studentId===studentId && m.subjectId===subjectId);
      return mk ? mk.score : null;
    }).filter(sc => sc !== null);
    return scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null;
  }

  const scopeStudents = scopeStudentIds
    ? students.filter(s => scopeStudentIds.includes(s.id))
    : students;

  const rows = exam.subjectIds.map(sid => {
    const sub = subjects.find(s => s.id === sid); if (!sub) return '';

    let vals, maleVals, femaleVals;
    if (isConsolidated && sourceExamObjs.length > 0) {
      // Build per-student averaged scores for this subject
      const studentScores = scopeStudents.map(stu => {
        const avg = getConsolidatedScore(stu.id, sid);
        return avg !== null ? { score: avg, gender: stu.gender } : null;
      }).filter(Boolean);
      if (!studentScores.length) return '';
      vals       = studentScores.map(x => x.score);
      maleVals   = studentScores.filter(x => x.gender === 'M').map(x => x.score);
      femaleVals = studentScores.filter(x => x.gender === 'F').map(x => x.score);
    } else {
      const subMarks = examMarks.filter(m => m.subjectId === sid);
      if (!subMarks.length) return '';
      vals       = subMarks.map(m => m.score);
      maleVals   = subMarks.filter(m => { const s=students.find(x=>x.id===m.studentId); return s && s.gender==='M'; }).map(m=>m.score);
      femaleVals = subMarks.filter(m => { const s=students.find(x=>x.id===m.studentId); return s && s.gender==='F'; }).map(m=>m.score);
    }

    const mn       = vals.reduce((a,b)=>a+b,0) / vals.length;
    const mx       = Math.max(...vals);
    const lo       = Math.min(...vals);

    // grade distribution counts
    const distCounts = {};
    gradeKeys.forEach(g => distCounts[g] = 0);
    vals.forEach(v => {
      const g = getGrade(v, sub.max);
      if (distCounts[g.grade] !== undefined) distCounts[g.grade]++;
    });

    const mMn = maleVals.length   ? (maleVals.reduce((a,b)=>a+b,0)/maleVals.length).toFixed(1)   : '—';
    const fMn = femaleVals.length ? (femaleVals.reduce((a,b)=>a+b,0)/femaleVals.length).toFixed(1) : '—';

    const distCells = gradeKeys.map(g =>
      `<td style="text-align:center;font-size:.78rem">${distCounts[g] || ''}</td>`
    ).join('');

    const mainGrade = getGrade(mn, sub.max);

    return `<tr>
      <td><strong>${sub.name}</strong></td>
      <td>${vals.length}</td>
      <td><strong style="color:var(--primary)">${mn.toFixed(1)}</strong></td>
      <td><span class="badge b-green">${mx}</span></td>
      <td><span class="badge b-red">${lo}</span></td>
      ${distCells}
      <td style="text-align:center"><span class="badge ${mainGrade.cls}">${mainGrade.grade}</span></td>
      <td style="text-align:center">${mMn}</td>
      <td style="text-align:center">${fMn}</td>
    </tr>`;
  }).join('');

  const gradeHeaders = gradeKeys.map(g => `<th style="text-align:center;font-size:.7rem">${g}</th>`).join('');

  return `
  <div style="margin-top:1.25rem">
    <h4 style="font-family:var(--font);font-weight:700;font-size:.95rem;margin-bottom:.75rem;color:var(--primary)">📊 Subject Analysis — Grade Distribution & Gender Performance</h4>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2">Subject</th>
            <th rowspan="2">Entries</th>
            <th rowspan="2">Mean</th>
            <th rowspan="2">High</th>
            <th rowspan="2">Low</th>
            <th colspan="${gradeKeys.length}" style="text-align:center;background:var(--primary-lt);color:var(--primary)">Grade Distribution</th>
            <th rowspan="2">Overall Grade</th>
            <th rowspan="2" style="text-align:center">♂ Mean</th>
            <th rowspan="2" style="text-align:center">♀ Mean</th>
          </tr>
          <tr>${gradeHeaders}</tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="20" style="text-align:center;color:var(--muted)">No data</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

// Build the HTML rows for a merit list table (shared by overall + per-stream)
function buildMeritTableHTML(scored, examId, showStreamCol) {
  const exam       = exams.find(e => e.id === examId); if (!exam) return '';
  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
  const examMarks  = isConsolidated ? [] : marks.filter(m => m.examId === examId);
  const examSubIds = exam.subjectIds;
  const examSubs   = examSubIds.map(sid => subjects.find(s=>s.id===sid)).filter(Boolean);

  const subHeaders = examSubs.map(s=>`<th style="text-align:center;font-size:.72rem" title="${s.name}">${s.code}</th>`).join('');
  const colCount   = 6 + (showStreamCol?2:0) + examSubs.length + 4;

  const headerRow = `<tr>
    <th>Class Rank</th><th>Adm No</th><th>Name</th><th>G</th>
    ${showStreamCol ? '<th>Stream</th><th>Str.Pos</th>' : ''}
    ${subHeaders}
    <th>Total</th><th>Mean</th><th>Grade</th><th>Points</th>
  </tr>`;

  const bodyRows = scored.length ? scored.map(s => {
    const stream   = streams.find(x=>x.id===s.streamId);
    const subCells = examSubs.map(sub => {
      let score, g;
      if (isConsolidated && sourceExamObjs.length > 0) {
        const scores = sourceExamObjs.map(src => {
          const mk = marks.find(m=>m.examId===src.id&&m.studentId===s.id&&m.subjectId===sub.id);
          return mk ? mk.score : null;
        }).filter(sc=>sc!==null);
        score = scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null;
        g = score !== null ? getGrade(score, sub.max) : null;
      } else {
        const mk = examMarks.find(m=>m.studentId===s.id && m.subjectId===sub.id);
        score = mk ? mk.score : null;
        g  = mk ? getGrade(mk.score, sub.max) : null;
      }
      return `<td style="text-align:center;font-size:.78rem">${score !== null
        ? `<span style="font-weight:600">${score}</span><br><span style="font-size:.62rem;color:var(--muted)">${g?.grade||''}</span>`
        : '—'}</td>`;
    }).join('');
    return `<tr>
      <td><span class="badge ${s.overallRank===1?'b-amber':s.overallRank<=3?'b-blue':'b-teal'}">#${s.overallRank}</span></td>
      <td style="font-family:var(--mono);font-size:.78rem">${s.adm}</td>
      <td><strong style="font-size:.85rem">${s.name}</strong></td>
      <td><span class="badge ${s.gender==='M'?'b-m':'b-f'}" style="font-size:.65rem">${s.gender}</span></td>
      ${showStreamCol ? `<td>${stream?.name||'—'}</td><td>#${s.streamRank}</td>` : ''}
      ${subCells}
      <td><strong>${s.total}</strong></td>
      <td>${s.mean.toFixed(2)}</td>
      <td>${gradeTag(s.grade)}</td>
      <td>${s.points}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="${colCount}" style="text-align:center;color:var(--muted);padding:1.5rem">No marks data.</td></tr>`;

  return { headerRow, bodyRows, examSubs, colCount };
}

// renderMeritList — full implementation is at the bottom of this file (overrides this stub)

function printMeritList() {
  const wrap = document.getElementById('meritListWrap');
  if (!wrap || !wrap.innerHTML.trim() || wrap.innerHTML.includes('Select an exam')) {
    showToast('Generate the merit list first', 'warning');
    return;
  }
  const sch = settings.schoolName || 'School';
  const win = window.open('', '_blank', 'width=1000,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Merit List — ${sch}</title><style>
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;box-sizing:border-box}
    @page{size:A4 landscape;margin:10mm}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:1rem;font-size:9pt}
    h2{color:#1a6fb5;margin:0 0 .5rem;font-size:13pt}
    h3{color:#1a6fb5;font-size:11pt;margin:.75rem 0 .4rem}
    h4{color:#16a34a;font-size:10pt;margin:.6rem 0 .3rem}
    table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:.75rem}
    thead{background:#f0f7ff!important}
    th{background:#1a6fb5!important;color:#fff!important;padding:4px 7px;text-align:left;font-weight:700;border:1px solid #a0bdd8;font-size:8pt}
    td{padding:3px 7px;border:1px solid #d1dfe8;vertical-align:middle}
    tr:nth-child(even) td{background:#f8fbff!important}
    tr:first-child td{background:#dbeafe!important;font-weight:700}
    .tbl-wrap{overflow:visible;border-radius:0;border:none}
    @media print{button{display:none!important}.no-print{display:none!important}}
  </style></head><body>
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1a6fb5;padding-bottom:.5rem;margin-bottom:1rem">
      <div>
        <div style="font-size:14pt;font-weight:800;color:#1a6fb5">${sch}</div>
        <div style="font-size:9pt;color:#64748b">Merit List &bull; Printed: ${new Date().toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'})}</div>
      </div>
      <button class="no-print" onclick="window.print()" style="padding:.4rem 1.2rem;background:#1a6fb5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85rem">🖨 Print</button>
    </div>
    ${wrap.innerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 500);
}

function exportMeritExcel() {
  const examId = document.getElementById('mlExam').value; if (!examId) { showToast('Select an exam','error'); return; }
  const exam   = exams.find(e=>e.id===examId);
  const isConsolidated = exam?.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
  const mlType      = document.getElementById('mlType')?.value || 'class_overall_and_stream';
  const classFilter = document.getElementById('mlClass')?.value || null;
  const streamFilter = mlType === 'class_stream' ? (document.getElementById('mlStream')?.value||null) : null;
  const scored = buildMeritData(examId, streamFilter, classFilter);
  const examSubs = (exam?.subjectIds||[]).map(sid=>subjects.find(s=>s.id===sid)).filter(Boolean);
  const examMarks= isConsolidated ? [] : marks.filter(m=>m.examId===examId);
  const wb = XLSX.utils.book_new();

  const rows = scored.map(s => {
    const stream = streams.find(x=>x.id===s.streamId);
    const row = {
      Rank:s.overallRank, StreamPos:'#'+s.streamRank,
      AdmNo:s.adm, Name:s.name, Gender:s.gender,
      Class: classes.find(c=>c.id===s.classId)?.name||'',
      Stream: stream?.name||'',
    };
    examSubs.forEach(sub => {
      if (isConsolidated && sourceExamObjs.length > 0) {
        const scores = sourceExamObjs.map(src=>{const mk=marks.find(m=>m.examId===src.id&&m.studentId===s.id&&m.subjectId===sub.id);return mk?mk.score:null;}).filter(sc=>sc!==null);
        row[sub.code] = scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : '';
      } else {
        const mk = examMarks.find(m=>m.studentId===s.id&&m.subjectId===sub.id);
        row[sub.code] = mk ? mk.score : '';
      }
    });
    row['Total']  = s.total;
    row['Mean']   = s.mean.toFixed(2);
    row['Grade']  = s.grade?.grade||'';
    row['Points'] = s.points;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Merit List');

  // Subject analysis sheet — for consolidated use averaged scores
  const gs = getActiveGradingSystem();
  const gradeKeys = gs.bands.map(b=>b.grade);
  const subRows = (exam?.subjectIds||[]).map(sid=>{
    const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
    let vals;
    if (isConsolidated && sourceExamObjs.length > 0) {
      vals = scored.map(s => {
        const scores = sourceExamObjs.map(src=>{const mk=marks.find(m=>m.examId===src.id&&m.studentId===s.id&&m.subjectId===sid);return mk?mk.score:null;}).filter(sc=>sc!==null);
        return scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
      }).filter(v=>v!==null);
    } else {
      vals = examMarks.filter(m=>m.subjectId===sid).map(m=>m.score);
    }
    const mn   = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    const dist = {};
    gradeKeys.forEach(g=>dist[g]=0);
    vals.forEach(v=>{ const g=getGrade(v,sub.max); if(dist[g.grade]!==undefined)dist[g.grade]++; });
    const maleV  = scored.filter(s=>s.gender==='M').map(s=>{ /* get score */ const sc = isConsolidated && sourceExamObjs.length > 0 ? (()=>{const ss=sourceExamObjs.map(src=>{const mk=marks.find(m=>m.examId===src.id&&m.studentId===s.id&&m.subjectId===sid);return mk?mk.score:null;}).filter(sc=>sc!==null);return ss.length?ss.reduce((a,b)=>a+b,0)/ss.length:null;})() : (examMarks.find(m=>m.studentId===s.id&&m.subjectId===sid)?.score??null); return sc; }).filter(v=>v!==null);
    const femV   = scored.filter(s=>s.gender==='F').map(s=>{ const sc = isConsolidated && sourceExamObjs.length > 0 ? (()=>{const ss=sourceExamObjs.map(src=>{const mk=marks.find(m=>m.examId===src.id&&m.studentId===s.id&&m.subjectId===sid);return mk?mk.score:null;}).filter(sc=>sc!==null);return ss.length?ss.reduce((a,b)=>a+b,0)/ss.length:null;})() : (examMarks.find(m=>m.studentId===s.id&&m.subjectId===sid)?.score??null); return sc; }).filter(v=>v!==null);
    const row = { Subject:sub.name, Entries:vals.length, Mean:mn.toFixed(1), Highest:vals.length?Math.max(...vals):'', Lowest:vals.length?Math.min(...vals):'' };
    gradeKeys.forEach(g=>row[g]=dist[g]);
    row['Male Mean']   = maleV.length   ? (maleV.reduce((a,b)=>a+b,0)/maleV.length).toFixed(1) : '';
    row['Female Mean'] = femV.length    ? (femV.reduce((a,b)=>a+b,0)/femV.length).toFixed(1) : '';
    return row;
  }).filter(Boolean);
  const ws2 = XLSX.utils.json_to_sheet(subRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Subject Analysis');

  XLSX.writeFile(wb, `merit_${exam?.name||'exam'}.xlsx`);
  showToast('Merit list exported to Excel ✓','success');
}

// ─── PDF EXPORT FOR MERIT LIST ───────────────────────────────
function exportMeritPDF() {
  const examId = document.getElementById('mlExam').value;
  if (!examId) { showToast('Select an exam first','error'); return; }
  try {
    const { jsPDF } = window.jspdf;
    const exam      = exams.find(e=>e.id===examId);
    const isConsolidated = exam?.category === 'consolidated';
    const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
    const mlType     = document.getElementById('mlType')?.value || 'class_overall_and_stream';
    const classFilter2 = document.getElementById('mlClass')?.value || null;
    const filterStr  = mlType === 'class_stream' ? (document.getElementById('mlStream')?.value||null) : null;
    const scored     = buildMeritData(examId, filterStr||null, classFilter2);
    const examSubs  = (exam?.subjectIds||[]).map(sid=>subjects.find(s=>s.id===sid)).filter(Boolean);
    const examMarks = isConsolidated ? [] : marks.filter(m=>m.examId===examId);
    // Helper: get a student's averaged score for a subject (handles both regular & consolidated)
    const getStuSubScore = (stuId, subId) => {
      if (isConsolidated && sourceExamObjs.length > 0) {
        const scores = sourceExamObjs.map(src=>{const mk=marks.find(m=>m.examId===src.id&&m.studentId===stuId&&m.subjectId===subId);return mk?mk.score:null;}).filter(sc=>sc!==null);
        return scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null;
      }
      return examMarks.find(m=>m.studentId===stuId&&m.subjectId===subId)?.score??null;
    };
    const gs        = getActiveGradingSystem();
    const gradeKeys = gs.bands.map(b=>b.grade);
    const sch       = settings;

    // Landscape for wide tables
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const PW  = doc.internal.pageSize.getWidth();

    const addPageHeader = (title, subtitle='') => {
      doc.setFillColor(26,111,181);
      doc.rect(0,0,PW,16,'F');
      doc.setFontSize(12); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
      doc.text(sch.schoolName||'School', 14, 10);
      doc.setFontSize(9); doc.setFont(undefined,'normal');
      doc.text(`${exam?.name||''} | ${exam?.term||''} ${exam?.year||''}`, PW-14, 10, {align:'right'});
      doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(26,111,181);
      doc.text(title, 14, 24);
      if (subtitle) { doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(100,116,139); doc.text(subtitle, 14, 30); }
      doc.setTextColor(0,0,0);
    };

    // ── PAGE 1: Overall merit list ──
    addPageHeader('OVERALL MERIT LIST', `${sch.address||''} | Printed: ${new Date().toLocaleDateString()}`);
    const meritHead = [['#','Adm No','Name','G','Stream','Str.P', ...examSubs.map(s=>s.code), 'Total','Mean','Grade','Pts']];
    const meritBody = scored.map(s => {
      const stream = streams.find(x=>x.id===s.streamId);
      const subScores = examSubs.map(sub=>{
        const sc = getStuSubScore(s.id, sub.id);
        return sc !== null ? String(sc) : '—';
      });
      return [s.overallRank, s.adm, s.name, s.gender, stream?.name||'—', '#'+s.streamRank,
              ...subScores, s.total, s.mean.toFixed(2), s.grade?.grade||'—', s.points];
    });
    doc.autoTable({
      startY: 34, head: meritHead, body: meritBody,
      theme:'striped', styles:{fontSize:7, cellPadding:1.5},
      headStyles:{fillColor:[26,111,181], textColor:255, fontStyle:'bold', fontSize:7},
      alternateRowStyles:{fillColor:[240,247,255]},
      columnStyles:{ 0:{cellWidth:8}, 1:{cellWidth:22, font:'courier'}, 2:{cellWidth:30}, 3:{cellWidth:7} },
    });

    // ── PAGE 2+: Subject analysis ──
    doc.addPage();
    addPageHeader('SUBJECT ANALYSIS — Grade Distribution & Gender Performance');
    const subHead  = [['Subject','Count','Mean','High','Low', ...gradeKeys, 'Grade','♂ Mean','♀ Mean']];
    const subBody  = (exam?.subjectIds||[]).map(sid=>{
      const sub      = subjects.find(s=>s.id===sid); if(!sub) return null;
      const vals     = scored.map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
      if (!vals.length) return null;
      const mn       = vals.reduce((a,b)=>a+b,0)/vals.length;
      const dist     = {}; gradeKeys.forEach(g=>dist[g]=0);
      vals.forEach(v=>{const g=getGrade(v,sub.max);if(dist[g.grade]!==undefined)dist[g.grade]++;});
      const mV = scored.filter(s=>s.gender==='M').map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
      const fV = scored.filter(s=>s.gender==='F').map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
      const mMn = mV.length ? (mV.reduce((a,b)=>a+b,0)/mV.length).toFixed(1) : '—';
      const fMn = fV.length ? (fV.reduce((a,b)=>a+b,0)/fV.length).toFixed(1) : '—';
      const grd = getGrade(mn, sub.max);
      return [sub.name, vals.length, mn.toFixed(1), Math.max(...vals), Math.min(...vals),
              ...gradeKeys.map(g=>dist[g]||''), grd.grade, mMn, fMn];
    }).filter(Boolean);
    doc.autoTable({
      startY:34, head:subHead, body:subBody,
      theme:'striped', styles:{fontSize:8, cellPadding:2},
      headStyles:{fillColor:[22,163,74], textColor:255, fontStyle:'bold'},
      alternateRowStyles:{fillColor:[240,255,244]},
    });

    // ── Per-stream pages ──
    const examStreams = [...new Set(scored.map(s=>s.streamId))].map(sid=>streams.find(x=>x.id===sid)).filter(Boolean);
    examStreams.forEach(str => {
      doc.addPage();
      const strScored = buildMeritData(examId, str.id);
      addPageHeader(`STREAM MERIT LIST — ${str.name}`, `${strScored.length} students`);
      const sHead = [['#','Adm No','Name','G', ...examSubs.map(s=>s.code), 'Total','Mean','Grade','Pts']];
      const sBody = strScored.map(s=>{
        const subScores = examSubs.map(sub=>{
          const sc = getStuSubScore(s.id, sub.id);
          return sc !== null ? String(sc) : '—';
        });
        return [s.overallRank, s.adm, s.name, s.gender, ...subScores, s.total, s.mean.toFixed(2), s.grade?.grade||'—', s.points];
      });
      doc.autoTable({
        startY:34, head:sHead, body:sBody,
        theme:'striped', styles:{fontSize:7, cellPadding:1.5},
        headStyles:{fillColor:[13,148,136], textColor:255, fontStyle:'bold', fontSize:7},
        alternateRowStyles:{fillColor:[240,253,250]},
      });

      // Stream subject analysis
      const strStudentIds = strScored.map(s=>s.id);
      const strSubBody = (exam?.subjectIds||[]).map(sid=>{
        const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
        const vals = strScored.map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
        if (!vals.length) return null;
        const mn   = vals.reduce((a,b)=>a+b,0)/vals.length;
        const dist = {}; gradeKeys.forEach(g=>dist[g]=0);
        vals.forEach(v=>{const g=getGrade(v,sub.max);if(dist[g.grade]!==undefined)dist[g.grade]++;});
        const mV = strScored.filter(s=>s.gender==='M').map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
        const fV = strScored.filter(s=>s.gender==='F').map(s=>getStuSubScore(s.id,sid)).filter(v=>v!==null);
        return [sub.name, vals.length, mn.toFixed(1), Math.max(...vals), Math.min(...vals),
                ...gradeKeys.map(g=>dist[g]||''), getGrade(mn,sub.max).grade,
                mV.length?(mV.reduce((a,b)=>a+b,0)/mV.length).toFixed(1):'—',
                fV.length?(fV.reduce((a,b)=>a+b,0)/fV.length).toFixed(1):'—'];
      }).filter(Boolean);
      const lastY = (doc.lastAutoTable?.finalY||34)+8;
      doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(13,148,136);
      doc.text(`Subject Analysis — ${str.name}`, 14, lastY);
      doc.setTextColor(0,0,0);
      doc.autoTable({
        startY:lastY+4, head:[['Subject','Count','Mean','High','Low', ...gradeKeys, 'Grade','♂','♀']],
        body: strSubBody,
        theme:'striped', styles:{fontSize:7.5, cellPadding:2},
        headStyles:{fillColor:[13,148,136], textColor:255, fontStyle:'bold', fontSize:7},
        alternateRowStyles:{fillColor:[240,253,250]},
      });
    });

    // Page numbers
    const total = doc.internal.getNumberOfPages();
    for (let i=1; i<=total; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text(`Page ${i} of ${total}`, PW-10, doc.internal.pageSize.getHeight()-5, {align:'right'});
      doc.text('Generated by Charanas Analyzer', 14, doc.internal.pageSize.getHeight()-5);
    }

    doc.save(`merit_list_${exam?.name||'exam'}.pdf`);
    showToast('Merit list PDF exported ✓','success');
  } catch(err) {
    showToast('PDF export failed: ' + err.message, 'error');
    console.error(err);
  }
}

// ─── SUMMARY ANALYTICS TAB ────────────────────────────────────

function populateSummaryAnalyticsDropdowns() {
  const smEx = document.getElementById('smExam');
  const smCl = document.getElementById('smClass');
  if (smEx) smEx.innerHTML = '<option value="">— Select Exam —</option>' + exams.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  if (smCl) smCl.innerHTML = '<option value="">— All Classes —</option>' + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

// Core helper: get a student's averaged score for a subject (handles consolidated)
function smGetSubjectScore(exam, isConsolidated, sourceExamObjs, studentId, subjectId) {
  if (isConsolidated && sourceExamObjs.length > 0) {
    const scores = sourceExamObjs.map(src => {
      const mk = marks.find(m=>m.examId===src.id&&m.studentId===studentId&&m.subjectId===subjectId);
      return mk ? mk.score : null;
    }).filter(sc=>sc!==null);
    return scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null;
  }
  const mk = marks.find(m=>m.examId===exam.id&&m.studentId===studentId&&m.subjectId===subjectId);
  return mk ? mk.score : null;
}

// Get a student's total across all subjects of this exam
function smGetStudentTotal(exam, isConsolidated, sourceExamObjs, studentId) {
  let total = 0, hasAny = false;
  for (const sid of (exam.subjectIds||[])) {
    const sc = smGetSubjectScore(exam, isConsolidated, sourceExamObjs, studentId, sid);
    if (sc !== null) { total += sc; hasAny = true; }
  }
  return hasAny ? parseFloat(total.toFixed(1)) : null;
}

// Get a student's mean across all subjects
function smGetStudentMean(exam, isConsolidated, sourceExamObjs, studentId) {
  const n = (exam.subjectIds||[]).length; if (!n) return null;
  const t = smGetStudentTotal(exam, isConsolidated, sourceExamObjs, studentId);
  return t !== null ? parseFloat((t/n).toFixed(2)) : null;
}

function renderSummaryAnalytics() {
  const examId   = document.getElementById('smExam').value;
  const classFilter = document.getElementById('smClass').value;
  const res      = document.getElementById('smResults');
  if (!examId) { res.innerHTML='<p style="color:var(--muted);padding:1rem">Select an exam above and click Generate.</p>'; return; }
  const exam = exams.find(e=>e.id===examId);
  if (!exam) return;
  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];

  // Determine which classes to show
  const targetClasses = classFilter ? classes.filter(c=>c.id===classFilter) : classes;

  // Find previous exam for "most improved" — same classId, not consolidated, earlier date
  function findPrevExam(classId) {
    const candidates = exams.filter(e=>
      e.id !== examId &&
      e.category !== 'consolidated' &&
      (!e.classId || e.classId === classId || !classId) &&
      (e.date||'') < (exam.date||'9')
    ).sort((a,b)=>(b.date||'') < (a.date||'') ? -1 : 1);
    return candidates[0] || null;
  }

  const gs = getActiveGradingSystem();

  let html = '';
  let hasAnyData = false;

  for (const cls of targetClasses) {
    // Students in this class
    const clsStudents = students.filter(s=>s.classId===cls.id);
    if (!clsStudents.length) continue;

    // Check if any student has data for this exam
    const clsStudentData = clsStudents.map(s=>{
      const total = smGetStudentTotal(exam, isConsolidated, sourceExamObjs, s.id);
      const mean  = smGetStudentMean(exam, isConsolidated, sourceExamObjs, s.id);
      return { stu:s, total, mean };
    }).filter(x=>x.total !== null).sort((a,b)=>b.total-a.total);

    if (!clsStudentData.length) continue;
    hasAnyData = true;

    // ── 1. Best 3 overall (class) ──
    const top3Overall = clsStudentData.slice(0,3);
    const podiumLabels = ['🥇','🥈','🥉'];
    const podiumColors = ['#f59e0b','#94a3b8','#cd7f32'];
    const podiumHTML = top3Overall.map((d,i)=>{
      const stu = d.stu;
      const stream = streams.find(st=>st.id===stu.streamId);
      const grade  = getMeanGrade ? getMeanGrade((d.mean/100)*8) : {grade:'—',cls:''};
      return `<div class="sm-podium-card" style="border-top:4px solid ${podiumColors[i]}">
        <div class="sm-podium-rank">${podiumLabels[i]}</div>
        <div class="sm-podium-name">${stu.name}</div>
        <div class="sm-podium-adm">${stu.adm}</div>
        <div class="sm-podium-stream">${stream?.name||'—'}</div>
        <div class="sm-podium-score">${d.total.toFixed(1)} <span class="sm-podium-mean">avg ${d.mean.toFixed(1)}</span></div>
        <span class="badge ${grade.cls||'b-blue'}" style="font-size:.7rem;margin-top:.25rem">${grade.grade||'—'}</span>
      </div>`;
    }).join('');

    // ── 2. Subject ranking by mean ──
    const subjectRankRows = (exam.subjectIds||[]).map(sid=>{
      const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
      const vals = clsStudents.map(s=>smGetSubjectScore(exam,isConsolidated,sourceExamObjs,s.id,sid)).filter(v=>v!==null);
      if (!vals.length) return null;
      const mn = parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1));
      const mx = Math.max(...vals);
      const lo = Math.min(...vals);
      const grd = getGrade(mn, sub.max);
      return { sub, mn, mx, lo, grd, n:vals.length };
    }).filter(Boolean).sort((a,b)=>b.mn-a.mn);

    const subRankHTML = subjectRankRows.map((r,i)=>`<tr>
      <td style="text-align:center;font-weight:700;color:var(--muted)">${i+1}</td>
      <td><strong>${r.sub.name}</strong> <span class="badge b-blue" style="font-size:.62rem">${r.sub.code}</span></td>
      <td style="text-align:center"><strong style="color:var(--primary)">${r.mn}</strong></td>
      <td style="text-align:center"><span class="badge b-green" style="font-size:.72rem">${r.mx}</span></td>
      <td style="text-align:center"><span class="badge b-red" style="font-size:.72rem">${r.lo}</span></td>
      <td style="text-align:center">${r.n}</td>
      <td style="text-align:center"><span class="badge ${r.grd.cls}">${r.grd.grade}</span></td>
    </tr>`).join('');

    // ── 3. Best 3 per subject ──
    const bestPerSubHTML = (exam.subjectIds||[]).map(sid=>{
      const sub = subjects.find(s=>s.id===sid); if(!sub) return '';
      const ranked = clsStudents.map(s=>{
        const sc = smGetSubjectScore(exam,isConsolidated,sourceExamObjs,s.id,sid);
        return sc !== null ? {stu:s, sc} : null;
      }).filter(Boolean).sort((a,b)=>b.sc-a.sc).slice(0,3);
      if (!ranked.length) return '';
      const rows = ranked.map((r,i)=>`<div class="sm-top3-row">
        <span class="sm-top3-pos">${podiumLabels[i]||`${i+1}.`}</span>
        <span class="sm-top3-name">${r.stu.name}</span>
        <span class="sm-top3-score">${r.sc}</span>
      </div>`).join('');
      return `<div class="sm-subcard">
        <div class="sm-subcard-title">${sub.name}</div>
        ${rows}
      </div>`;
    }).join('');

    // ── 4. Most improved overall ──
    const prevExam = findPrevExam(cls.id);
    let mostImprovedHTML = '';
    if (prevExam) {
      const improvements = clsStudents.map(s=>{
        const prevTotal = smGetStudentTotal(prevExam, false, [], s.id);
        const prevMean  = prevExam.subjectIds?.length && prevTotal !== null ? parseFloat((prevTotal/prevExam.subjectIds.length).toFixed(2)) : null;
        const currMean  = smGetStudentMean(exam, isConsolidated, sourceExamObjs, s.id);
        if (prevMean === null || currMean === null) return null;
        return { stu:s, prevMean, currMean, delta: parseFloat((currMean - prevMean).toFixed(2)) };
      }).filter(Boolean).sort((a,b)=>b.delta-a.delta).slice(0,5);

      if (improvements.length) {
        const rows = improvements.map((r,i)=>`<tr>
          <td>${i+1}</td>
          <td><strong>${r.stu.name}</strong><br><span style="font-size:.72rem;color:var(--muted)">${r.stu.adm}</span></td>
          <td style="text-align:center">${r.prevMean.toFixed(1)}</td>
          <td style="text-align:center"><strong style="color:var(--primary)">${r.currMean.toFixed(1)}</strong></td>
          <td style="text-align:center"><strong style="color:${r.delta>=0?'var(--success,#16a34a)':'var(--danger,#dc2626)'}">${r.delta>=0?'▲ +':'▼ '}${Math.abs(r.delta).toFixed(2)}</strong></td>
        </tr>`).join('');
        mostImprovedHTML = `<div class="card sm-section">
          <h4 class="sm-section-title">📈 Most Improved Overall <span class="sm-prev-badge">vs ${prevExam.name}</span></h4>
          <div class="tbl-wrap"><table>
            <thead><tr><th>#</th><th>Student</th><th>Prev Mean</th><th>Curr Mean</th><th>Improvement</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </div>`;
      }
    }

    // ── 5. Most improved per subject ──
    let mostImprovedSubHTML = '';
    if (prevExam) {
      const subImpCards = (exam.subjectIds||[]).map(sid=>{
        const sub = subjects.find(s=>s.id===sid); if(!sub) return '';
        const ranked = clsStudents.map(s=>{
          const prev = smGetSubjectScore(prevExam, false, [], s.id, sid);
          const curr = smGetSubjectScore(exam, isConsolidated, sourceExamObjs, s.id, sid);
          if (prev===null||curr===null) return null;
          return { stu:s, prev, curr, delta: parseFloat((curr-prev).toFixed(1)) };
        }).filter(Boolean).sort((a,b)=>b.delta-a.delta).slice(0,3);
        if (!ranked.length) return '';
        const rows = ranked.map((r,i)=>`<div class="sm-top3-row">
          <span class="sm-top3-pos">${podiumLabels[i]||`${i+1}.`}</span>
          <span class="sm-top3-name">${r.stu.name}</span>
          <span class="sm-top3-score" style="color:${r.delta>=0?'var(--success,#16a34a)':'var(--danger,#dc2626)'}">${r.delta>=0?'▲+':'▼'}${Math.abs(r.delta).toFixed(1)}</span>
        </div>`).join('');
        return `<div class="sm-subcard">
          <div class="sm-subcard-title">${sub.name}</div>
          ${rows}
        </div>`;
      }).join('');
      if (subImpCards.trim()) {
        mostImprovedSubHTML = `<div class="card sm-section">
          <h4 class="sm-section-title">🚀 Most Improved Per Subject <span class="sm-prev-badge">vs ${prevExam.name}</span></h4>
          <div class="sm-subgrid">${subImpCards}</div>
        </div>`;
      }
    }

    // ── 6. Per-stream breakdown ──
    const clsStreams = streams.filter(st=>st.classId===cls.id);
    let streamsHTML = '';
    if (clsStreams.length > 1) {
      streamsHTML = clsStreams.map(st=>{
        const stStudents = clsStudentData.filter(d=>d.stu.streamId===st.id);
        if (!stStudents.length) return '';
        const top3St = stStudents.slice(0,3);
        const top3Rows = top3St.map((d,i)=>`<div class="sm-top3-row">
          <span class="sm-top3-pos">${podiumLabels[i]||`${i+1}.`}</span>
          <span class="sm-top3-name">${d.stu.name}</span>
          <span class="sm-top3-score">${d.mean.toFixed(1)}</span>
        </div>`).join('');
        // Grade distribution for stream
        const gradeCount = {};
        gs.bands.forEach(b=>gradeCount[b.grade]=0);
        stStudents.forEach(d=>{
          const g = getMeanGrade ? getMeanGrade((d.mean/100)*8) : {grade:'—'};
          if (gradeCount[g.grade]!==undefined) gradeCount[g.grade]++;
        });
        const gradeBars = gs.bands.map(b=>{
          const pct = stStudents.length ? Math.round((gradeCount[b.grade]||0)/stStudents.length*100) : 0;
          return pct > 0 ? `<div class="sm-grade-bar-item"><span class="sm-grade-label">${b.grade}</span><div class="sm-grade-bar"><div class="sm-grade-bar-fill" style="width:${pct}%;background:var(--primary)"></div></div><span class="sm-grade-pct">${gradeCount[b.grade]}(${pct}%)</span></div>` : '';
        }).filter(Boolean).join('');

        return `<div class="sm-stream-card">
          <div class="sm-stream-title">🏫 ${st.name} <span style="font-size:.75rem;color:var(--muted);font-weight:400">${stStudents.length} students</span></div>
          <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1;min-width:180px">
              <div style="font-size:.75rem;font-weight:600;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase">Top Students</div>
              ${top3Rows}
            </div>
            <div style="flex:2;min-width:220px">
              <div style="font-size:.75rem;font-weight:600;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase">Grade Distribution</div>
              ${gradeBars||'<span style="color:var(--muted);font-size:.8rem">No data</span>'}
            </div>
          </div>
        </div>`;
      }).join('');
    }

    // Assemble class section
    html += `<div class="sm-class-section">
      <div class="sm-class-header">
        <h3>🏫 ${cls.name}</h3>
        <span class="sm-class-badge">${clsStudentData.length} students with data</span>
      </div>

      <div class="card sm-section">
        <h4 class="sm-section-title">🏆 Best 3 Students — Class Overall</h4>
        <div class="sm-podium">${podiumHTML||'<p style="color:var(--muted)">No data</p>'}</div>
      </div>

      <div class="card sm-section">
        <h4 class="sm-section-title">📊 Subject Ranking by Mean</h4>
        <div class="tbl-wrap"><table>
          <thead><tr><th>#</th><th>Subject</th><th>Mean</th><th>Highest</th><th>Lowest</th><th>Entries</th><th>Grade</th></tr></thead>
          <tbody>${subRankHTML||'<tr><td colspan="7" style="text-align:center;color:var(--muted)">No data</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card sm-section">
        <h4 class="sm-section-title">⭐ Best 3 Per Subject</h4>
        <div class="sm-subgrid">${bestPerSubHTML||'<p style="color:var(--muted)">No data</p>'}</div>
      </div>

      ${mostImprovedHTML}
      ${mostImprovedSubHTML}

      ${streamsHTML ? `<div class="card sm-section">
        <h4 class="sm-section-title">🌊 Per-Stream Breakdown</h4>
        <div class="sm-streams">${streamsHTML}</div>
      </div>` : ''}
    </div>`;
  }

  res.innerHTML = hasAnyData ? html : '<div class="card" style="padding:2rem;text-align:center;color:var(--muted)">No student data found for this exam. Please ensure marks have been entered.</div>';
}

// ═══════════════ STUDENTS CRUD ═══════════════
function applyStudentFilters() {
  const text    = (document.getElementById('stuSearchBox')?.value || '').toLowerCase();
  const gender  = document.getElementById('stuGenderFilter')?.value || '';
  const classId = document.getElementById('stuClassFilter')?.value || '';
  const streamId= document.getElementById('stuStreamFilter')?.value || '';
  renderStudents(text, gender, classId, streamId);
}

function populateStudentFilterDropdowns() {
  const clsSel = document.getElementById('stuClassFilter');
  const strSel = document.getElementById('stuStreamFilter');
  if (clsSel) {
    const cur = clsSel.value;
    clsSel.innerHTML = '<option value="">All Classes</option>' + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    clsSel.value = cur;
  }
  if (strSel) {
    const cur = strSel.value;
    const classId = document.getElementById('stuClassFilter')?.value || '';
    const filteredStreams = classId ? streams.filter(s=>s.classId===classId) : streams;
    strSel.innerHTML = '<option value="">All Streams</option>' + filteredStreams.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    strSel.value = (cur && filteredStreams.find(s=>s.id===cur)) ? cur : '';
  }
}

function renderStudents(filter='', genderFilter='', classFilter='', streamFilter='') {
  let list = [...students];
  if (filter)       list = list.filter(s=>s.name.toLowerCase().includes(filter)||s.adm.toLowerCase().includes(filter));
  if (genderFilter) list = list.filter(s=>s.gender===genderFilter);
  if (classFilter)  list = list.filter(s=>s.classId===classFilter);
  if (streamFilter) list = list.filter(s=>s.streamId===streamFilter);
  // Apply column sort
  const sc=sortState.students.col, sd=sortState.students.dir;
  list.sort((a,b)=>{
    let va,vb;
    if(sc==='class'){va=classes.find(c=>c.id===a.classId)?.name||'';vb=classes.find(c=>c.id===b.classId)?.name||'';}
    else if(sc==='stream'){va=streams.find(s=>s.id===a.streamId)?.name||'';vb=streams.find(s=>s.id===b.streamId)?.name||'';}
    else{va=a[sc]||'';vb=b[sc]||'';}
    va=String(va).toLowerCase();vb=String(vb).toLowerCase();
    return sd==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  // Inject sortable header row
  const stuThead=document.querySelector('#stuTbl thead tr');
  if(stuThead) stuThead.innerHTML=
    '<th><input type="checkbox" id="stuSelectAll" onchange="toggleSelectAllStudents(this)" title="Select all"/></th><th>#</th>'+
    thSort('students','adm','Adm No')+
    thSort('students','name','Name')+
    thSort('students','gender','Gender')+
    thSort('students','class','Class')+
    thSort('students','stream','Stream')+
    thSort('students','parent','Parent')+
    thSort('students','contact','Contact')+
    '<th>Subjects</th><th>Actions</th>';
  document.getElementById('stuBody').innerHTML = list.map((s,i)=>{
    const cls   = classes.find(c=>c.id===s.classId);
    const str   = streams.find(st=>st.id===s.streamId);
    const subs  = (s.subjectIds||[]).map(sid=>{ const sub=subjects.find(x=>x.id===sid); return sub?`<span class="badge b-teal" style="font-size:.65rem">${sub.code}</span>`:''; }).join(' ');
    const _isT  = currentUser && currentUser.role === 'teacher';
    return `<tr>
      <td>${_isT ? '' : `<input type="checkbox" class="stu-sel-chk" data-id="${s.id}" onchange="onStuSelChange()"/>`}</td>
      <td>${i+1}</td>
      <td style="font-family:var(--mono);font-size:.8rem">${s.adm}</td>
      <td><strong>${s.name}</strong></td>
      <td><span class="badge ${s.gender==='M'?'b-m':'b-f'}">${s.gender==='M'?'Male':'Female'}</span></td>
      <td>${cls?.name||'—'}</td><td>${str?.name||'—'}</td>
      <td>${s.parent||'—'}</td><td>${s.contact||'—'}</td>
      <td style="max-width:150px;overflow:hidden">${subs||'—'}</td>
      <td><div class="act-cell">
        ${_isT ? '' : `<button class="icb ed" onclick="editStudent('${s.id}')" title="Edit">✏️</button>`}
        ${_isT ? '' : `<button class="icb dl" onclick="deleteStudent('${s.id}')" title="Delete">🗑️</button>`}
        <button class="icb" style="background:var(--purple,#7c3aed);color:#fff;border:none" title="View Analytics" onclick="showStudentAnalytics('${s.id}')">📊</button>
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:1.5rem">No students yet.</td></tr>`;
  const saChk = document.getElementById('stuSelectAll');
  if (saChk) { saChk.checked = false; saChk.indeterminate = false; }
  updateBulkDeleteUI();
}

function filterStudentsGender(g) { applyStudentFilters(); }

function onStuSelChange() {
  const all  = document.querySelectorAll('.stu-sel-chk');
  const chkd = document.querySelectorAll('.stu-sel-chk:checked');
  const sa   = document.getElementById('stuSelectAll');
  if (sa) { sa.checked = chkd.length===all.length && all.length>0; sa.indeterminate = chkd.length>0 && chkd.length<all.length; }
  updateBulkDeleteUI();
}

function toggleSelectAllStudents(cb) {
  document.querySelectorAll('.stu-sel-chk').forEach(c=>c.checked=cb.checked);
  updateBulkDeleteUI();
}

function updateBulkDeleteUI() {
  const chkd = document.querySelectorAll('.stu-sel-chk:checked');
  const btn  = document.getElementById('stuBulkDelBtn');
  const cnt  = document.getElementById('stuSelCount');
  if (btn)  btn.style.display = chkd.length>0 ? '' : 'none';
  if (cnt)  cnt.textContent   = chkd.length;
}

function deleteSelectedStudents() {
  const ids = [...document.querySelectorAll('.stu-sel-chk:checked')].map(c=>c.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} selected student(s) and all their marks? This cannot be undone.`)) return;
  ids.forEach(id=>{
    students = students.filter(s=>s.id!==id);
    marks    = marks.filter(m=>m.studentId!==id);
    subjects.forEach(sub=>{ sub.studentIds=(sub.studentIds||[]).filter(x=>x!==id); });
  });
  save(K.students,students); save(K.marks,marks); save(K.subjects,subjects);
  renderStudents(); renderDashboard(); populateAllDropdowns(); renderArchivedStudents();
  showToast(`${ids.length} student(s) deleted`,'info');
}


// ═══════════════ STUDENT ANALYTICS MODAL ═══════════════
function showStudentAnalytics(stuId) {
  const stu = students.find(s=>s.id===stuId); if(!stu) return;
  const cls = classes.find(c=>c.id===stu.classId);
  const stream = streams.find(s=>s.id===stu.streamId);

  // Build per-exam data
  const examData = exams.map(ex => {
    const exMarks = marks.filter(m=>m.examId===ex.id&&m.studentId===stuId);
    if (!exMarks.length) return null;
    const total = exMarks.reduce((a,m)=>a+m.score,0);
    const mean  = ex.subjectIds.length ? total/ex.subjectIds.length : 0;
    const subMax = subjects.filter(s=>ex.subjectIds.includes(s.id)).reduce((a,s)=>a+(s.max||100),0)/(ex.subjectIds.length||1);
    const g = getMeanGrade(mean/subMax*8);
    // Stream rank
    const strStudents = students.filter(s=>s.streamId===stu.streamId).map(s=>{
      const tm=marks.filter(m=>m.examId===ex.id&&m.studentId===s.id).reduce((a,m)=>a+m.score,0);
      return {id:s.id,total:tm};
    }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);
    const streamRank = strStudents.findIndex(s=>s.id===stuId)+1;
    // Overall rank
    const allTotals = students.map(s=>{
      const tm=marks.filter(m=>m.examId===ex.id&&m.studentId===s.id).reduce((a,m)=>a+m.score,0);
      return {id:s.id,total:tm};
    }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);
    const overallRank = allTotals.findIndex(s=>s.id===stuId)+1;
    // Subject rows
    const subRows = ex.subjectIds.map(sid=>{
      const sub=subjects.find(s=>s.id===sid); if(!sub) return null;
      const mk=exMarks.find(m=>m.subjectId===sid);
      const score=mk?mk.score:null;
      const gr=score!==null?getGrade(score,sub.max):null;
      return {name:sub.name,code:sub.code,max:sub.max,score,grade:gr?.grade||'—',points:gr?.points||'—'};
    }).filter(Boolean);
    return {exam:ex,total,mean:parseFloat(mean.toFixed(2)),grade:g.grade,label:g.label,streamRank,overallRank,subRows};
  }).filter(Boolean);

  const hasData = examData.length > 0;
  const chartId = 'saModalChart_'+stuId;

  const examCards = examData.map((d,i)=>`
    <div style="border:1px solid var(--border);border-radius:8px;padding:.75rem;margin-bottom:.75rem;background:var(--surface)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:.3rem">
        <strong style="font-size:.9rem">${d.exam.name}</strong>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <span class="badge b-blue" style="font-size:.65rem">Mean: ${d.mean}</span>
          <span class="badge b-green" style="font-size:.65rem">Grade: ${d.grade}</span>
          <span class="badge b-teal" style="font-size:.65rem">Stream #${d.streamRank}</span>
          <span class="badge b-amber" style="font-size:.65rem">Overall #${d.overallRank}</span>
        </div>
      </div>
      <table style="width:100%;font-size:.78rem;border-collapse:collapse">
        <thead><tr style="background:var(--border-lt)"><th style="text-align:left;padding:.25rem .4rem">Subject</th><th style="text-align:center;padding:.25rem .4rem">Score</th><th style="text-align:center;padding:.25rem .4rem">Out Of</th><th style="text-align:center;padding:.25rem .4rem">Grade</th><th style="text-align:center;padding:.25rem .4rem">Pts</th></tr></thead>
        <tbody>${d.subRows.map(r=>`<tr><td style="padding:.2rem .4rem">${r.name}</td><td style="text-align:center;font-weight:600;color:${r.score!==null?(r.score/r.max>=0.6?'var(--secondary)':r.score/r.max>=0.4?'var(--amber)':'var(--danger)'):'var(--muted)'}">${r.score!==null?r.score:'—'}</td><td style="text-align:center;color:var(--muted)">${r.max}</td><td style="text-align:center"><strong>${r.grade}</strong></td><td style="text-align:center">${r.points}</td></tr>`).join('')}</tbody>
      </table>
    </div>`).join('');

  showModal(
    `📊 Analytics — ${stu.name} (${stu.adm})`,
    `<div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">${cls?.name||''}${stream?' · '+stream.name+' Stream':''} · ${stu.gender==='M'?'Male':'Female'}</div>
    ${!hasData?'<p style="color:var(--muted);text-align:center;padding:2rem">No exam data found for this student.</p>':''}
    ${hasData && examData.length > 1 ? `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.75rem;margin-bottom:1rem">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:.5rem;color:var(--primary)">📈 Performance Trend</div>
      <canvas id="${chartId}" height="90"></canvas>
    </div>` : ''}
    ${examCards}`,
    [{label:'Close', cls:'btn-outline', action:'closeModal()'}]
  );

  // Draw chart after modal renders
  if (hasData && examData.length > 1) {
    setTimeout(() => {
      const ctx = document.getElementById(chartId); if (!ctx) return;
      new Chart(ctx, {
        type:'line',
        data:{
          labels: examData.map(d=>d.exam.name),
          datasets:[
            {label:'Mean Score',data:examData.map(d=>d.mean),borderColor:'#1a6fb5',backgroundColor:'rgba(26,111,181,0.1)',tension:0.4,fill:true,pointRadius:5,pointBackgroundColor:'#1a6fb5'},
            {label:'Stream Rank',data:examData.map(d=>d.streamRank),borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.05)',tension:0.4,fill:false,pointRadius:4,pointBackgroundColor:'#16a34a',yAxisID:'y2'}
          ]
        },
        options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{y:{beginAtZero:false,title:{display:true,text:'Mean Score',font:{size:9}}},y2:{type:'linear',display:true,position:'right',reverse:true,title:{display:true,text:'Stream Rank (lower=better)',font:{size:9}},grid:{drawOnChartArea:false}}}}
      });
    }, 120);
  }
}

function renderStudentSubjectCheckboxes() {
  const wrap = document.getElementById('stuSubjectsCheckboxes');
  if (!wrap) return;
  wrap.innerHTML = subjects.map(s=>`
    <label class="sub-check-label">
      <input type="checkbox" value="${s.id}" class="sub-chk" onchange="updateSelectAllCheckbox()"/>
      <span class="sub-chk-code badge b-teal" style="font-size:.65rem">${s.code}</span>
      <span class="sub-chk-name">${s.name}</span>
    </label>`).join('');
}
function toggleSelectAllSubjects(cb) {
  document.querySelectorAll('#stuSubjectsCheckboxes input[type=checkbox]').forEach(c=>c.checked=cb.checked);
}

function enrollStudentInStreamSubjects() {
  // Pre-check subjects that are assigned to the currently selected stream
  const streamId = document.getElementById('stuStream').value;
  if (!streamId) { showToast('Select a stream first','warning'); return; }
  // Get subjects with assignments for this stream
  const assignedSubIds = streamAssignments.filter(a=>a.streamId===streamId).map(a=>a.subjectId);
  if (!assignedSubIds.length) {
    showToast('No subject assignments configured for this stream. Set them up in Classes & Streams → Manage.','info');
    return;
  }
  document.querySelectorAll('#stuSubjectsCheckboxes input[type=checkbox]').forEach(cb=>{
    cb.checked = assignedSubIds.includes(cb.value);
  });
  updateSelectAllCheckbox();
  showToast(`${assignedSubIds.length} subjects pre-selected based on stream assignments ✓`,'success');
}
function updateSelectAllCheckbox() {
  const all = document.querySelectorAll('#stuSubjectsCheckboxes input[type=checkbox]');
  const checked = document.querySelectorAll('#stuSubjectsCheckboxes input[type=checkbox]:checked');
  const sa = document.getElementById('stuSelectAll');
  if (sa) { sa.checked = all.length>0 && checked.length===all.length; sa.indeterminate = checked.length>0 && checked.length<all.length; }
}

function saveStudent() {
  if (currentUser && currentUser.role === 'teacher') { showToast('Teachers cannot add or edit students','error'); return; }
  const adm     = document.getElementById('stuAdm').value.trim();
  const name    = document.getElementById('stuName').value.trim();
  const gender  = document.getElementById('stuGender').value;
  const classId = document.getElementById('stuClass').value;
  const streamId= document.getElementById('stuStream').value;
  const parent  = document.getElementById('stuParent').value.trim();
  const contact = document.getElementById('stuContact').value.trim();
  const dob     = document.getElementById('stuDOB').value;
  const notes   = document.getElementById('stuNotes').value;
  // All subjects apply to all students
  const subIds = subjects.map(s => s.id);
  if (!adm||!name||!classId||!streamId) { showToast('Adm No, Name, Class and Stream are required','error'); return; }
  const editId = document.getElementById('editStuId').value;
  if (editId) {
    const i=students.findIndex(s=>s.id===editId);
    if(i>-1) students[i]={...students[i],adm,name,gender,classId,streamId,parent,contact,dob,notes,subjectIds:subIds};
    showToast('Student updated ✓','success');
  } else {
    if(students.find(s=>s.adm===adm)){showToast('Admission number exists','error');return;}
    const stu={id:uid(),adm,name,gender,classId,streamId,parent,contact,dob,notes,subjectIds:subIds};
    students.push(stu);
    // Enrol in all subjects
    subIds.forEach(sid=>{const sub=subjects.find(x=>x.id===sid);if(sub&&!sub.studentIds.includes(stu.id))sub.studentIds.push(stu.id);});
    save(K.subjects,subjects);
    showToast('Student added ✓','success');
  }
  save(K.students,students); cancelStuEdit(); renderStudents(); renderDashboard(); populateAllDropdowns(); renderArchivedStudents();
}

function editStudent(id) {
  if (currentUser && currentUser.role === 'teacher') { showToast('Teachers cannot edit students','error'); return; }
  const s=students.find(x=>x.id===id); if(!s) return;
  document.getElementById('editStuId').value=s.id;
  document.getElementById('stuAdm').value=s.adm;
  document.getElementById('stuName').value=s.name;
  document.getElementById('stuGender').value=s.gender;
  document.getElementById('stuClass').value=s.classId;
  updateStuStreamDropdown();
  document.getElementById('stuStream').value=s.streamId;
  document.getElementById('stuParent').value=s.parent||'';
  document.getElementById('stuContact').value=s.contact||'';
  document.getElementById('stuDOB').value=s.dob||'';
  document.getElementById('stuNotes').value=s.notes||'';
  document.querySelectorAll('#stuSubjectsCheckboxes input[type=checkbox]').forEach(cb=>{cb.checked=(s.subjectIds||[]).includes(cb.value);});
  updateSelectAllCheckbox();
  document.getElementById('stuFormTitle').textContent='✏️ Edit Student';
  document.getElementById('stuAdm').scrollIntoView({behavior:'smooth',block:'center'});
}

function cancelStuEdit() {
  ['editStuId','stuAdm','stuName','stuParent','stuContact','stuDOB','stuNotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('stuGender').value='M';
  document.getElementById('stuFormTitle').textContent='➕ Add Student';
}

function deleteStudent(id) {
  if (currentUser && currentUser.role === 'teacher') { showToast('Teachers cannot delete students','error'); return; }
  if(!confirm('Delete student and their marks?')) return;
  students=students.filter(s=>s.id!==id);
  marks=marks.filter(m=>m.studentId!==id);
  subjects.forEach(sub=>{sub.studentIds=(sub.studentIds||[]).filter(x=>x!==id);});
  save(K.students,students); save(K.marks,marks); save(K.subjects,subjects);
  renderStudents(); renderDashboard(); renderArchivedStudents(); showToast('Student deleted','info');
}

// Student Excel upload
function showStudentUpload() {
  const card=document.getElementById('stuUploadCard');
  card.style.display=card.style.display==='none'?'':'none';
}

function handleStudentUpload(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws);
      let added=0, skipped=0;
      data.forEach(row=>{
        const adm    =String(row['AdmNo']||row['admno']||row['Adm No']||'').trim();
        const name   =String(row['Name']||row['name']||'').trim();
        const gender =(String(row['Gender']||row['gender']||'M')).trim().toUpperCase().startsWith('F')?'F':'M';
        const clsName=String(row['Class']||row['class']||'').trim();
        const strName=String(row['Stream']||row['stream']||'').trim();
        const contact=String(row['ParentContact']||row['parent_contact']||'').trim();
        const parent =String(row['ParentName']||row['parent_name']||'').trim();
        if(!adm||!name){skipped++;return;}
        if(students.find(s=>s.adm===adm)){skipped++;return;}
        const cls=classes.find(c=>c.name.toLowerCase()===clsName.toLowerCase());
        // Match stream by name AND classId so "East" in Grade 7 ≠ "East" in Grade 8
        const str=streams.find(s=>s.name.toLowerCase()===strName.toLowerCase()&&(!cls||s.classId===cls.id))
               || (strName ? streams.find(s=>s.name.toLowerCase()===strName.toLowerCase()) : null);
        const stu={id:uid(),adm,name,gender,classId:cls?.id||'',streamId:str?.id||'',parent,contact,dob:'',notes:'',subjectIds:subjects.map(s=>s.id)};
        students.push(stu);
        subjects.forEach(sub=>{if(!sub.studentIds.includes(stu.id))sub.studentIds.push(stu.id);});
        added++;
      });
      save(K.students,students); save(K.subjects,subjects);
      renderStudents(); populateAllDropdowns(); renderDashboard();
      showToast(`${added} students added, ${skipped} skipped ✓`,'success');
    } catch(err){showToast('Error reading file','error');console.error(err);}
  };
  reader.readAsArrayBuffer(file); input.value='';
}

function downloadStudentTemplate() {
  const data=[{AdmNo:'',Name:'',Gender:'',Class:'',Stream:'',ParentName:'',ParentContact:''}];
  const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Students');
  XLSX.writeFile(wb,'students_template.xlsx');
}

function exportStudentsExcel() { exportFilteredStudentsExcel(); }

function exportFilteredStudentsExcel() {
  const text     = (document.getElementById('stuSearchBox')?.value || '').toLowerCase();
  const gender   = document.getElementById('stuGenderFilter')?.value || '';
  const classId  = document.getElementById('stuClassFilter')?.value || '';
  const streamId = document.getElementById('stuStreamFilter')?.value || '';
  let list = [...students];
  if (text)     list = list.filter(s=>s.name.toLowerCase().includes(text)||s.adm.toLowerCase().includes(text));
  if (gender)   list = list.filter(s=>s.gender===gender);
  if (classId)  list = list.filter(s=>s.classId===classId);
  if (streamId) list = list.filter(s=>s.streamId===streamId);
  if (!list.length) { showToast('No students match current filters','warning'); return; }
  list.sort((a,b)=>a.name.localeCompare(b.name));
  const data = list.map((s,i)=>{
    const cls=classes.find(c=>c.id===s.classId); const str=streams.find(x=>x.id===s.streamId);
    const subNames=(s.subjectIds||[]).map(sid=>subjects.find(x=>x.id===sid)?.name||'').filter(Boolean).join(', ');
    return { '#':i+1, AdmNo:s.adm, Name:s.name, Gender:s.gender==='M'?'Male':'Female', Class:cls?.name||'', Stream:str?.name||'', DOB:s.dob||'', ParentName:s.parent||'', Contact:s.contact||'', Subjects:subNames };
  });
  const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new();
  const clsName = classId ? (classes.find(c=>c.id===classId)?.name||'Class') : 'All';
  const strName = streamId ? (streams.find(s=>s.id===streamId)?.name||'Stream') : '';
  const sheetLabel = [clsName, strName].filter(Boolean).join('_') || 'Students';
  XLSX.utils.book_append_sheet(wb,ws,sheetLabel.slice(0,31));
  XLSX.writeFile(wb,`students_${sheetLabel.replace(/\s+/g,'_')}.xlsx`);
  showToast(`${list.length} student(s) exported ✓`,'success');
}

// ═══════════════ TEACHERS CRUD ═══════════════
function showTeacherUpload() {
  const card = document.getElementById('tchUploadCard');
  card.style.display = card.style.display === 'none' ? '' : 'none';
}

function handleTeacherUpload(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      let added = 0, skipped = 0, updated = 0;
      data.forEach(row => {
        const name     = String(row['Name']     || row['name']     || '').trim();
        const phone    = String(row['Phone']    || row['phone']    || '').trim();
        const email    = String(row['Email']    || row['email']    || '').trim();
        const username = String(row['Username'] || row['username'] || '').trim();
        const password = String(row['Password'] || row['password'] || '').trim();
        const clsStr   = String(row['Classes']  || row['classes']  || '').trim();
        if (!name) { skipped++; return; }
        const existing = teachers.find(t => (username && t.username === username) || t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          // Update existing
          if (phone)    existing.phone    = phone;
          if (email)    existing.email    = email;
          if (password) existing.password = password;
          if (clsStr)   existing.classes  = clsStr;
          updated++;
        } else {
          teachers.push({ id: uid(), name, phone, email, username, password, classes: clsStr, subjectIds: [], canAnalyse: false, canReport: false, canMerit: false });
          added++;
        }
      });
      save(K.teachers, teachers);
      renderTeachers(); renderDashboard();
      showToast(`${added} added, ${updated} updated, ${skipped} skipped ✓`, 'success');
      document.getElementById('tchUploadCard').style.display = 'none';
    } catch(err) { showToast('Error reading file', 'error'); console.error(err); }
  };
  reader.readAsArrayBuffer(file); input.value = '';
}

function downloadTeacherTemplate() {
  const data = [{ Name: 'Mr. John Kamau', Phone: '0712345678', Email: 'john@school.ke', Username: 'jkamau', Password: 'pass123', Classes: 'Grade 7, Grade 8' }];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
  XLSX.writeFile(wb, 'teachers_template.xlsx');
}

function exportTeachersExcel() {
  const data = teachers.map(t => ({
    Name: t.name, Phone: t.phone || '', Email: t.email || '',
    Username: t.username || '', Classes: t.classes || '',
    CanAnalyse: t.canAnalyse ? 'Yes' : 'No', CanReport: t.canReport ? 'Yes' : 'No', CanMerit: t.canMerit ? 'Yes' : 'No'
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
  XLSX.writeFile(wb, 'teachers_list.xlsx');
}


function renderTeachers() {
  const sc=sortState.teachers.col, sd=sortState.teachers.dir;
  const list=[...teachers].sort((a,b)=>{
    let va=a[sc]||'', vb=b[sc]||'';
    va=String(va).toLowerCase(); vb=String(vb).toLowerCase();
    return sd==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  const tchThead=document.querySelector('#tchTbl thead tr');
  if(tchThead) tchThead.innerHTML='<th>#</th>'+
    thSort('teachers','name','Name')+
    thSort('teachers','phone','Phone')+
    thSort('teachers','email','Email')+
    '<th>Subjects</th>'+
    thSort('teachers','classes','Classes')+
    thSort('teachers','username','Username')+
    '<th>Rights</th><th>Actions</th>';
  document.getElementById('tchBody').innerHTML = list.map((t,i)=>{
    const allSubIds = getTeacherSubjectIds(t.id);
    const subs = allSubIds.map(sid=>{
      const sub=subjects.find(x=>x.id===sid);
      if (!sub) return '';
      return `<span class="tch-sub-tag" style="display:inline-flex;align-items:center;gap:2px;background:var(--blue-lt);border:1px solid var(--border);border-radius:12px;padding:1px 6px 1px 8px;font-size:.65rem;margin:2px">
        ${sub.code}
        <button onclick="removeSubjectFromTeacher('${t.id}','${sub.id}')" title="Remove ${sub.name}" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.75rem;line-height:1;padding:0 0 0 2px" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">✕</button>
      </span>`;
    }).join('');
    const rights=[t.canAnalyse?'Analysis':'',t.canReport?'Reports':'',t.canMerit?'Merit':''].filter(Boolean).join(', ');
    return `<tr>
      <td>${i+1}</td><td><div style="display:flex;align-items:center;gap:.5rem">${teacherInitialsTag(t)}<strong>${t.name}</strong></div></td>
      <td>${t.phone}</td><td>${t.email||'—'}</td>
      <td style="max-width:200px"><div style="display:flex;flex-wrap:wrap;gap:2px">${subs||'<span style="color:var(--muted);font-size:.78rem">None</span>'}</div></td>
      <td>${t.classes||'—'}</td>
      <td style="font-family:var(--mono);font-size:.8rem">${t.username||'—'}</td>
      <td>${rights?`<span class="badge b-green" style="font-size:.65rem">${rights}</span>`:'—'}</td>
      <td><div class="act-cell">
        <button class="icb ed" onclick="editTeacher('${t.id}')" title="Edit">✏️</button>
        <button class="icb dl" onclick="deleteTeacher('${t.id}')" title="Delete">🗑️</button>
        <button class="icb" style="background:#0d9488;color:#fff;border:none;font-size:.68rem;padding:.2rem .45rem;border-radius:5px" onclick="downloadTeacherSubjectList('${t.id}')" title="Download class list for subjects taught">⬇ Class List</button>
      </div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:1.5rem">No teachers yet.</td></tr>';
}

function removeSubjectFromTeacher(teacherId, subjectId) {
  // Remove from stream assignments
  streamAssignments = streamAssignments.filter(a => !(a.teacherId === teacherId && a.subjectId === subjectId));
  saveStreamAssignments();
  // Remove from subject default teacher
  const sub = subjects.find(s => s.id === subjectId);
  if (sub && sub.teacherId === teacherId) { sub.teacherId = ''; save(K.subjects, subjects); }
  // Remove from teacher's subjectIds
  const t = teachers.find(x => x.id === teacherId);
  if (t) { t.subjectIds = (t.subjectIds || []).filter(x => x !== subjectId); save(K.teachers, teachers); }
  renderTeachers(); renderSubjects();
  showToast('Subject removed from teacher ✓', 'info');
}

function saveTeacher() {
  const name  = document.getElementById('tchName').value.trim();
  const phone = document.getElementById('tchPhone').value.trim();
  const email = document.getElementById('tchEmail').value.trim();
  const user  = document.getElementById('tchUser').value.trim();
  const passEl= document.getElementById('tchPass');
  const pass  = passEl ? passEl.value : '';
  const cls   = document.getElementById('tchClasses').value.trim();
  const qualEl= document.getElementById('tchQual');
  const qual  = qualEl ? qualEl.value.trim() : '';
  if (!name || !phone) { showToast('Name and phone are required','error'); return; }
  const editId = document.getElementById('editTchId').value;
  // Rights are managed in Settings > Teacher Access Manager — preserve existing rights when editing
  const existingTeacher = editId ? teachers.find(t => t.id === editId) : null;
  const canAn = existingTeacher ? !!existingTeacher.canAnalyse : false;
  const canRp = existingTeacher ? !!existingTeacher.canReport  : false;
  const canMr = existingTeacher ? !!existingTeacher.canMerit   : false;
  const obj = { name, phone, email, username:user, password:pass, classes:cls, qual, canAnalyse:canAn, canReport:canRp, canMerit:canMr };
  if (editId) {
    const i = teachers.findIndex(t => t.id === editId);
    if (i > -1) {
      if (!pass) delete obj.password;
      // Preserve existing subjectIds from stream assignments
      teachers[i] = { ...teachers[i], ...obj };
    }
    showToast('Teacher updated ✓','success');
  } else {
    teachers.push({ id:uid(), subjectIds:[], ...obj });
    showToast('Teacher added ✓','success');
  }
  save(K.teachers, teachers);
  cancelTchEdit();
  renderTeachers();
  populateAllDropdowns();
  renderDashboard();
}

function editTeacher(id) {
  const t=teachers.find(x=>x.id===id); if(!t) return;
  document.getElementById('editTchId').value=t.id;
  document.getElementById('tchName').value=t.name;
  document.getElementById('tchPhone').value=t.phone;
  document.getElementById('tchEmail').value=t.email||'';
  document.getElementById('tchUser').value=t.username||'';
  document.getElementById('tchPass').value=t.password||'';
  document.getElementById('tchClasses').value=t.classes||'';
  // Rights are read-only here (managed in Settings) — no UI to update
  document.getElementById('tchFormTitle').textContent='✏️ Edit Teacher';
  document.getElementById('tchName').scrollIntoView({behavior:'smooth',block:'center'});
}

function cancelTchEdit() {
  ['editTchId','tchName','tchPhone','tchEmail','tchUser','tchPass','tchClasses'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tchFormTitle').textContent='➕ Add Teacher';
}

function deleteTeacher(id) {
  if(!confirm('Delete this teacher?')) return;
  teachers=teachers.filter(t=>t.id!==id);
  save(K.teachers,teachers); renderTeachers(); renderDashboard(); showToast('Teacher deleted','info');
}

// ═══════════════ SUBJECTS CRUD ═══════════════
function renderSubjects() {
  const sc=sortState.subjects.col, sd=sortState.subjects.dir;
  const list=[...subjects].sort((a,b)=>{
    let va,vb;
    if(sc==='teacher'){va=teachers.find(t=>t.id===a.teacherId)?.name||'';vb=teachers.find(t=>t.id===b.teacherId)?.name||'';}
    else if(sc==='enrolled'){va=(a.studentIds||[]).length;vb=(b.studentIds||[]).length;return sd==='asc'?va-vb:vb-va;}
    else if(sc==='max'){va=parseFloat(a.max||0);vb=parseFloat(b.max||0);return sd==='asc'?va-vb:vb-va;}
    else{va=a[sc]||'';vb=b[sc]||'';}
    va=String(va).toLowerCase();vb=String(vb).toLowerCase();
    return sd==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  const subThead=document.querySelector('#subTbl thead tr');
  if(subThead) subThead.innerHTML='<th>#</th>'+
    thSort('subjects','name','Name')+
    thSort('subjects','code','Code')+
    thSort('subjects','max','Max')+
    thSort('subjects','category','Category')+
    thSort('subjects','teacher','Teacher')+
    thSort('subjects','enrolled','Enrolled Students')+
    '<th>Actions</th>';
  document.getElementById('subBody').innerHTML=list.map((s,i)=>{
    const tch=teachers.find(t=>t.id===s.teacherId);
    return `<tr>
      <td>${i+1}</td><td><strong>${s.name}</strong></td>
      <td><span class="badge b-blue">${s.code}</span></td>
      <td>${s.max}</td>
      <td><span class="badge ${s.category==='Core'?'b-green':s.category==='Technical'?'b-amber':s.category==='Languages'?'b-teal':'b-purple'}">${s.category}</span></td>
      <td>${tch?`<div style="display:flex;align-items:center;gap:.5rem">${teacherInitialsTag(tch)}<span>${tch.name}</span></div>`:'—'}</td>
      <td>${(s.studentIds||[]).length} students</td>
      <td><div class="act-cell">
        <button class="icb ed" onclick="editSubject('${s.id}')" title="Edit">✏️</button>
        <button class="icb dl" onclick="deleteSubject('${s.id}')" title="Delete">🗑️</button>
      </div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.5rem">No subjects yet.</td></tr>';
}

function saveSubject() {
  const name  =document.getElementById('subName').value.trim();
  const code  =document.getElementById('subCode').value.trim().toUpperCase();
  const max   =parseInt(document.getElementById('subMax').value)||100;
  const cat   =document.getElementById('subCat').value;
  const tchId =document.getElementById('subTeacher').value;
  if(!name||!code){showToast('Name and code required','error');return;}
  const editId=document.getElementById('editSubId').value;
  if(editId){
    const i=subjects.findIndex(s=>s.id===editId);
    // Preserve existing studentIds
    if(i>-1)subjects[i]={...subjects[i],name,code,max,category:cat,teacherId:tchId};
    showToast('Subject updated ✓','success');
  } else {
    if(subjects.find(s=>s.code===code)){showToast('Code already exists','error');return;}
    // Auto-enrol all existing students in new subject
    const allStudentIds = students.map(s=>s.id);
    subjects.push({id:uid(),name,code,max,category:cat,teacherId:tchId,studentIds:allStudentIds});
    // Also update each student's subjectIds
    allStudentIds.forEach(sid=>{
      const stu=students.find(s=>s.id===sid);
      if(stu){const newSubId=subjects[subjects.length-1].id;if(!stu.subjectIds)stu.subjectIds=[];if(!stu.subjectIds.includes(newSubId))stu.subjectIds.push(newSubId);}
    });
    save(K.students,students);
    showToast('Subject added ✓','success');
  }
  save(K.subjects,subjects); cancelSubEdit(); renderSubjects(); populateAllDropdowns();
}

function editSubject(id) {
  const s=subjects.find(x=>x.id===id); if(!s) return;
  document.getElementById('editSubId').value=s.id;
  document.getElementById('subName').value=s.name;
  document.getElementById('subCode').value=s.code;
  document.getElementById('subMax').value=s.max;
  document.getElementById('subCat').value=s.category;
  document.getElementById('subTeacher').value=s.teacherId||'';
  document.getElementById('subFormTitle').textContent='✏️ Edit Subject';
  document.getElementById('subName').scrollIntoView({behavior:'smooth',block:'center'});
}
function cancelSubEdit() {
  ['editSubId','subName','subCode'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('subMax').value='100';
  document.getElementById('subFormTitle').textContent='➕ Add Subject';
}
function deleteSubject(id) {
  if(!confirm('Delete this subject? Marks data for this subject will also be removed.')) return;
  subjects=subjects.filter(s=>s.id!==id);
  marks=marks.filter(m=>m.subjectId!==id);
  save(K.subjects,subjects); save(K.marks,marks);
  renderSubjects(); showToast('Subject deleted','info');
}

// ═══════════════ CLASSES & STREAMS ═══════════════
function renderClasses() {
  const sc=sortState.classes.col, sd=sortState.classes.dir;
  const list=[...classes].sort((a,b)=>{
    let va,vb;
    if(sc==='students'){va=students.filter(s=>s.classId===a.id).length;vb=students.filter(s=>s.classId===b.id).length;return sd==='asc'?va-vb:vb-va;}
    else{va=a[sc]||'';vb=b[sc]||'';}
    va=String(va).toLowerCase();vb=String(vb).toLowerCase();
    return sd==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  const clsThead=document.querySelector('#clsTbl thead tr');
  if(clsThead) clsThead.innerHTML='<th>#</th>'+
    thSort('classes','name','Class Name')+
    thSort('classes','level','Level')+
    thSort('classes','students','Students')+
    '<th>Actions</th>';
  document.getElementById('clsBody').innerHTML=list.map((c,i)=>{
    const cnt=students.filter(s=>s.classId===c.id).length;
    return `<tr><td>${i+1}</td><td><strong>${c.name}</strong></td><td>${c.level||'—'}</td><td>${cnt}</td>
      <td><div class="act-cell">
        <button class="icb ed" onclick="editClass('${c.id}')" title="Edit">✏️</button>
        <button class="icb dl" onclick="deleteClass('${c.id}')" title="Delete">🗑️</button>
        <button class="icb" style="background:var(--primary);color:#fff;border:none" onclick="manageClassStudents('${c.id}')" title="Manage Students">👥</button>
        <button class="icb" style="background:var(--secondary,#16a34a);color:#fff;border:none;font-size:.68rem;padding:.2rem .45rem;border-radius:5px" onclick="downloadClassList('${c.id}')" title="Download class student list">⬇</button>
      </div></td></tr>`;
  }).join('');
  const strCls=document.getElementById('strClass');
  if(strCls) strCls.innerHTML='<option value="">— Select Class —</option>'+classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

function saveClass() {
  const name=document.getElementById('clsName').value.trim();
  const level=document.getElementById('clsLevel').value.trim();
  if(!name){showToast('Class name required','error');return;}
  const editId=document.getElementById('editClsId').value;
  if(editId){const i=classes.findIndex(c=>c.id===editId);if(i>-1)classes[i]={...classes[i],name,level};}
  else classes.push({id:uid(),name,level});
  save(K.classes,classes); cancelClsEdit(); renderClasses(); populateAllDropdowns();
  showToast('Class saved ✓','success');
}
function editClass(id){
  const c=classes.find(x=>x.id===id);if(!c)return;
  document.getElementById('editClsId').value=c.id;
  document.getElementById('clsName').value=c.name;
  document.getElementById('clsLevel').value=c.level||'';
  document.getElementById('clsFormTitle').textContent='✏️ Edit Class';
}
function manageClassStudents(classId){
  const cls=classes.find(c=>c.id===classId);if(!cls)return;
  const classStreams=streams.filter(s=>s.classId===classId);
  const classStudents=students.filter(s=>s.classId===classId);
  const allStudents=students;
  showModal('👥 Manage Class — '+cls.name,`
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:1rem">Students in this class: <strong>${classStudents.length}</strong></p>
    <div style="max-height:300px;overflow-y:auto">
      ${classStudents.map(s=>{
        const str=streams.find(x=>x.id===s.streamId);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border-lt);font-size:.83rem">
          <div><strong>${s.name}</strong> <span style="color:var(--muted)">${s.adm}</span></div>
          <span class="badge b-teal" style="font-size:.65rem">${str?.name||'—'}</span>
        </div>`;
      }).join('')}
    </div>
    <p style="font-size:.78rem;color:var(--muted);margin-top:.75rem">To move or reassign students, edit the student record.</p>
  `,[{label:'Close',cls:'btn-outline',action:'closeModal()'}]);
}
function cancelClsEdit(){['editClsId','clsName','clsLevel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('clsFormTitle').textContent='➕ Add Class';}
function deleteClass(id){if(!confirm('Delete class?'))return;classes=classes.filter(c=>c.id!==id);save(K.classes,classes);renderClasses();showToast('Class deleted','info');}

function renderStreams() {
  const sc=sortState.streams.col, sd=sortState.streams.dir;
  const list=[...streams].sort((a,b)=>{
    let va,vb;
    if(sc==='class'){va=classes.find(c=>c.id===a.classId)?.name||'';vb=classes.find(c=>c.id===b.classId)?.name||'';}
    else if(sc==='students'){va=students.filter(x=>x.streamId===a.id).length;vb=students.filter(x=>x.streamId===b.id).length;return sd==='asc'?va-vb:vb-va;}
    else if(sc==='teacher'){va=teachers.find(t=>t.id===a.streamTeacherId)?.name||'';vb=teachers.find(t=>t.id===b.streamTeacherId)?.name||'';}
    else{va=a[sc]||'';vb=b[sc]||'';}
    va=String(va).toLowerCase();vb=String(vb).toLowerCase();
    return sd==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  const strThead=document.querySelector('#strTbl thead tr');
  if(strThead) strThead.innerHTML='<th>#</th>'+
    thSort('streams','name','Stream')+
    thSort('streams','class','Class')+
    thSort('streams','students','Students')+
    thSort('streams','teacher','Class Teacher')+
    '<th>Subject Coverage</th><th>Actions</th>';
  document.getElementById('strBody').innerHTML=list.map((s,i)=>{
    const cls=classes.find(c=>c.id===s.classId);
    const cnt=students.filter(x=>x.streamId===s.id).length;
    const assignedCount = streamAssignments.filter(a=>a.streamId===s.id&&a.teacherId).length;
    const clsTeacher=teachers.find(t=>t.id===s.streamTeacherId);
    return `<tr><td>${i+1}</td><td><strong>${s.name}</strong></td><td>${cls?.name||'—'}</td><td>${cnt}</td>
      <td>${clsTeacher?`<div style="display:flex;align-items:center;gap:.4rem">${teacherInitialsTag(clsTeacher)}<span style="font-size:.82rem">${clsTeacher.name}</span></div>`:'<span style="color:var(--muted);font-size:.8rem">Not assigned</span>'}</td>
      <td>${assignedCount ? `<span class="badge b-green" style="font-size:.65rem">${assignedCount} subjects</span>` : '<span style="color:var(--muted);font-size:.75rem">Not configured</span>'}</td>
      <td><div class="act-cell">
        <button class="icb" style="background:var(--primary);color:#fff;border:none;padding:.2rem .5rem;font-size:.68rem;border-radius:5px;cursor:pointer" onclick="openManageStream('${s.id}')" title="Manage">⚙</button>
        <button class="icb ed" onclick="editStream('${s.id}')" title="Edit">✏️</button>
        <button class="icb dl" onclick="deleteStream('${s.id}')" title="Delete">🗑️</button>
        <button class="icb" style="background:var(--secondary,#16a34a);color:#fff;border:none;font-size:.68rem;padding:.2rem .45rem;border-radius:5px" onclick="downloadStreamList('${s.id}')" title="Download stream student list">⬇</button>
      </div></td></tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem">No streams yet.</td></tr>';
}

function saveStream(){
  const name=document.getElementById('strName').value.trim();
  const classId=document.getElementById('strClass').value;
  const streamTeacherId=document.getElementById('strTeacher')?.value||'';
  if(!name){showToast('Stream name required','error');return;}
  const editId=document.getElementById('editStrId').value;
  if(editId){const i=streams.findIndex(s=>s.id===editId);if(i>-1)streams[i]={...streams[i],name,classId,streamTeacherId};}
  else streams.push({id:uid(),name,classId,streamTeacherId});
  save(K.streams,streams); cancelStrEdit(); renderStreams(); populateAllDropdowns();
  showToast('Stream saved ✓','success');
}
function editStream(id){
  const s=streams.find(x=>x.id===id);if(!s)return;
  document.getElementById('editStrId').value=s.id;
  document.getElementById('strName').value=s.name;
  document.getElementById('strClass').value=s.classId||'';
  populateStrTeacherDropdown();
  const strTch=document.getElementById('strTeacher');
  if(strTch) strTch.value=s.streamTeacherId||'';
  document.getElementById('strFormTitle').textContent='✏️ Edit Stream';
}
function populateStrTeacherDropdown(){
  const el=document.getElementById('strTeacher');if(!el)return;
  el.innerHTML='<option value="">— None —</option>'+teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
}
function cancelStrEdit(){['editStrId','strName'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('strFormTitle').textContent='➕ Add Stream';}
function deleteStream(id){if(!confirm('Delete stream?'))return;streams=streams.filter(s=>s.id!==id);save(K.streams,streams);renderStreams();showToast('Stream deleted','info');}

// ═══════════════ STREAM SUBJECT-TEACHER ASSIGNMENTS ═══════════════
// streamAssignments: [{ id, streamId, subjectId, teacherId }]
let streamAssignments = [];
const K_SA = 'ei_streamassign';

function loadStreamAssignments() {
  streamAssignments = (() => { try { return JSON.parse(localStorage.getItem(K_SA)) || []; } catch { return []; } })();
}

function saveStreamAssignments() {
  localStorage.setItem(K_SA, JSON.stringify(streamAssignments));
}

function getStreamTeacher(streamId, subjectId) {
  // First check stream-specific assignment
  const sa = streamAssignments.find(a => a.streamId === streamId && a.subjectId === subjectId);
  if (sa && sa.teacherId) return teachers.find(t => t.id === sa.teacherId) || null;
  // Fall back to subject's default teacher
  const sub = subjects.find(s => s.id === subjectId);
  if (sub && sub.teacherId) return teachers.find(t => t.id === sub.teacherId) || null;
  return null;
}

function openManageStream(streamId) {
  const stream = streams.find(s => s.id === streamId);
  if (!stream) return;
  const cls = classes.find(c => c.id === stream.classId);

  const rows = subjects.map(sub => {
    const sa = streamAssignments.find(a => a.streamId === streamId && a.subjectId === sub.id);
    const assignedId = sa ? sa.teacherId : (sub.teacherId || '');
    const tOpts = '<option value="">— None —</option>' + 
      teachers.map(t => `<option value="${t.id}" ${t.id === assignedId ? 'selected' : ''}>${t.name}</option>`).join('');
    return `<tr>
      <td><span class="badge b-blue" style="font-size:.68rem">${sub.code}</span> <strong>${sub.name}</strong></td>
      <td>
        <select class="sa-teacher-sel" data-stream="${streamId}" data-subject="${sub.id}" style="width:100%;font-size:.82rem;padding:.3rem .5rem">
          ${tOpts}
        </select>
      </td>
      <td>
        <select class="sa-enroll-all" data-stream="${streamId}" data-subject="${sub.id}" style="width:100%;font-size:.82rem;padding:.3rem .5rem">
          <option value="">— Enroll action —</option>
          <option value="all">Enroll all stream students</option>
          <option value="none">Remove all stream students</option>
        </select>
      </td>
    </tr>`;
  }).join('');

  showModal(
    `📚 Manage Stream: ${stream.name}${cls ? ' — ' + cls.name : ''}`,
    `<p style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">Assign teachers to subjects for this stream. Teachers will only see & upload marks for their assigned subjects.</p>
    <div class="tbl-wrap" style="max-height:400px;overflow-y:auto">
      <table>
        <thead><tr><th>Subject</th><th>Teacher for this Stream</th><th>Enrolment</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`,
    [{label:'💾 Save Assignments', cls:'btn-primary', action:"saveStreamAssignmentsFromModal('"+streamId+"')"},
     {label:'Close', cls:'btn-outline', action:'closeModal()'}]
  );
}

function saveStreamAssignmentsFromModal(streamId) {
  document.querySelectorAll('.sa-teacher-sel').forEach(sel => {
    const sid = sel.dataset.subject;
    const tid = sel.value;
    const existing = streamAssignments.findIndex(a => a.streamId === streamId && a.subjectId === sid);
    if (existing > -1) streamAssignments[existing].teacherId = tid;
    else streamAssignments.push({ id: uid(), streamId, subjectId: sid, teacherId: tid });
  });
  // Handle enrolment actions
  document.querySelectorAll('.sa-enroll-all').forEach(sel => {
    const sid = sel.dataset.subject;
    const action = sel.value;
    if (!action) return;
    const sub = subjects.find(s => s.id === sid);
    if (!sub) return;
    const streamStudentIds = students.filter(st => st.streamId === streamId).map(st => st.id);
    if (action === 'all') {
      streamStudentIds.forEach(stId => {
        if (!sub.studentIds.includes(stId)) sub.studentIds.push(stId);
        const stu = students.find(s => s.id === stId);
        if (stu && !(stu.subjectIds || []).includes(sid)) {
          if (!stu.subjectIds) stu.subjectIds = [];
          stu.subjectIds.push(sid);
        }
      });
    } else if (action === 'none') {
      sub.studentIds = sub.studentIds.filter(id => !streamStudentIds.includes(id));
      students.forEach(stu => {
        if (stu.streamId === streamId) {
          stu.subjectIds = (stu.subjectIds || []).filter(x => x !== sid);
        }
      });
    }
  });
  saveStreamAssignments();
  save(K.subjects, subjects);
  save(K.students, students);
  closeModal();
  showToast('Stream assignments saved ✓', 'success');
  // Update teacher subject list derived from assignments
  syncTeacherSubjectsFromAssignments();
}

function syncTeacherSubjectsFromAssignments() {
  // Each teacher's subjectIds = union of subjects assigned to them across all streams
  teachers.forEach(t => {
    const assignedSubs = streamAssignments.filter(a => a.teacherId === t.id).map(a => a.subjectId);
    // Also keep subjects directly assigned to teacher
    const directSubs = subjects.filter(s => s.teacherId === t.id).map(s => s.id);
    const allSubs = [...new Set([...assignedSubs, ...directSubs])];
    t.subjectIds = allSubs;
  });
  save(K.teachers, teachers);
  renderTeachers();
}

// ═══════════════ TEACHER: get subjects they are assigned to (stream or default) ═══════════════
// ═══════════════ TEACHER ROLE HELPERS ═══════════════
// Returns true if the current user is a class teacher of any stream
function currentUserIsClassTeacher() {
  if (!currentUser || currentUser.role !== 'teacher') return false;
  const tId = currentUser.teacherId;
  return streams.some(s => s.streamTeacherId === tId);
}
// Returns stream IDs where teacher is class teacher
function getClassTeacherStreamIds(teacherId) {
  return streams.filter(s => s.streamTeacherId === teacherId).map(s => s.id);
}

function getTeacherSubjectIds(teacherId) {
  // From stream assignments
  const fromStreams = streamAssignments.filter(a => a.teacherId === teacherId).map(a => a.subjectId);
  // From subject default teacher
  const fromDefault = subjects.filter(s => s.teacherId === teacherId).map(s => s.id);
  return [...new Set([...fromStreams, ...fromDefault])];
}


// ═══════════════ REPORT FORMS ═══════════════
function getStudentReport(stuId, examId) {
  const stu    = students.find(s=>s.id===stuId); if(!stu) return null;
  const exam   = exams.find(e=>e.id===examId);   if(!exam) return null;
  const cls    = classes.find(c=>c.id===stu.classId);
  const stream = streams.find(s=>s.id===stu.streamId);

  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated
    ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean)
    : [];

  let subjectRows, total, mean, mGrade, totalPoints;

  if (isConsolidated && sourceExamObjs.length > 0) {
    // Compute each subject's score as the average across source exams
    subjectRows = exam.subjectIds.map(sid => {
      const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
      const scores = sourceExamObjs.map(src => {
        const mk = marks.find(m=>m.examId===src.id&&m.studentId===stuId&&m.subjectId===sid);
        return mk ? mk.score : null;
      });
      const validScores = scores.filter(sc=>sc!==null);
      const avgScore = validScores.length > 0 ? parseFloat((validScores.reduce((a,b)=>a+b,0)/validScores.length).toFixed(1)) : null;
      const g = avgScore !== null ? getGrade(avgScore, sub.max) : null;
      return {
        name:sub.name, code:sub.code, max:sub.max, score:avgScore,
        grade:g?.grade||'—', points:g?.points||'—', label:g?.label||'—',
        sourceScores: scores  // one per source exam (null if missing)
      };
    }).filter(Boolean);
  } else {
    const examMarks = marks.filter(m=>m.examId===examId&&m.studentId===stuId);
    subjectRows = exam.subjectIds.map(sid=>{
      const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
      const mk  = examMarks.find(m=>m.subjectId===sid);
      const score = mk ? mk.score : null;
      const g   = score !== null ? getGrade(score, sub.max) : null;
      return { name:sub.name, code:sub.code, max:sub.max, score, grade:g?.grade||'—', points:g?.points||'—', label:g?.label||'—' };
    }).filter(Boolean);
  }

  total  = subjectRows.reduce((a,r)=>a+(r.score!==null?r.score:0),0);
  mean   = exam.subjectIds.length ? total/exam.subjectIds.length : 0;
  mGrade = getMeanGrade(mean/(subjectRows.reduce((a,r)=>a+(r.max||100),0)/exam.subjectIds.length||100)*8);
  totalPoints = subjectRows.reduce((a,r)=>a+(typeof r.points==='number'?r.points:0),0);

  // Helper: compute a student's total for this exam (handles consolidated via averaging)
  function getStudentExamTotal(sId) {
    if (isConsolidated && sourceExamObjs.length > 0) {
      let hasAny = false;
      const t = exam.subjectIds.reduce((acc, sid) => {
        const scores = sourceExamObjs.map(src => {
          const mk = marks.find(m=>m.examId===src.id&&m.studentId===sId&&m.subjectId===sid);
          return mk ? mk.score : null;
        }).filter(sc=>sc!==null);
        if (scores.length) hasAny = true;
        return acc + (scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0);
      }, 0);
      return hasAny ? parseFloat(t.toFixed(1)) : 0;
    }
    return marks.filter(m=>m.examId===examId&&m.studentId===sId).reduce((a,m)=>a+m.score,0);
  }

  // Rank: overall
  const allStudentTotals = students.map(s=>{
    const tm = getStudentExamTotal(s.id);
    return {id:s.id, total:tm};
  }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);
  const overallRank = allStudentTotals.findIndex(s=>s.id===stuId)+1;

  // Stream rank
  const streamStudents = students.filter(s=>s.streamId===stu.streamId).map(s=>{
    const tm = getStudentExamTotal(s.id);
    return {id:s.id, total:tm};
  }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);
  const streamRank = streamStudents.findIndex(s=>s.id===stuId)+1;

  // Historical performance across all non-consolidated exams
  const history = exams.filter(ex => ex.category !== 'consolidated').map(ex => {
    const exMarks = marks.filter(m=>m.examId===ex.id&&m.studentId===stuId);
    if (!exMarks.length) return null;
    const exTotal = exMarks.reduce((a,m)=>a+m.score,0);
    const exMean  = ex.subjectIds.length ? exTotal/ex.subjectIds.length : 0;
    const exG     = getMeanGrade(exMean/(subjects.filter(s=>ex.subjectIds.includes(s.id)).reduce((a,s)=>a+(s.max||100),0)/(ex.subjectIds.length||1)||100)*8);
    // Stream rank for this exam
    const strStudents = students.filter(s=>s.streamId===stu.streamId).map(s=>{
      const tm=marks.filter(m=>m.examId===ex.id&&m.studentId===s.id).reduce((a,m)=>a+m.score,0);
      return {id:s.id,total:tm};
    }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);
    const exStreamRank = strStudents.findIndex(s=>s.id===stuId)+1;
    return { examName:ex.name, term:ex.term, year:ex.year, mean:parseFloat(exMean.toFixed(2)), grade:exG.grade, total:exTotal, streamRank:exStreamRank };
  }).filter(Boolean);

  return { stu, exam, cls, stream, subjectRows, total, mean, mGrade, totalPoints, overallRank, streamRank, history, isConsolidated, sourceExamObjs };
}

function buildReportHTML(data, ctRemarks, principalRemarks, nextOpen, schoolClosed, feeBalance, feeNextTerm, feeStatus) {
  data.schoolClosed = schoolClosed;
  data.feeBalance = feeBalance;
  data.feeNextTerm = feeNextTerm;
  data.feeStatus = feeStatus;
  const s = settings;
  // Build table rows — for consolidated exams include one column per source exam + average
  const srcExams = data.sourceExamObjs || [];
  const rows = data.subjectRows.map((r,i)=>{
    if (data.isConsolidated && srcExams.length > 0) {
      const srcCols = (r.sourceScores||[]).map((sc,si)=>
        `<td style="text-align:center;padding:.18rem .3rem;font-size:.78rem">${sc !== null ? sc : '—'}</td>`
      ).join('');
      return `<tr>
      <td style="padding:.18rem .3rem;font-size:.78rem">${i+1}</td>
      <td style="padding:.18rem .3rem;font-size:.78rem">${r.name}</td>
      ${srcCols}
      <td style="text-align:center;font-weight:700;background:#f0fdf4;padding:.18rem .3rem;font-size:.78rem">${r.score !== null ? r.score : '—'}</td>
      <td style="text-align:center;padding:.18rem .3rem;font-size:.78rem"><strong>${r.grade}</strong></td>
      <td style="text-align:center;padding:.18rem .3rem;font-size:.78rem">${r.points}</td>
      <td style="padding:.18rem .3rem;font-size:.72rem">${r.label}</td>
    </tr>`;
    } else {
      return `<tr>
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td style="text-align:center">${r.max}</td>
      <td style="text-align:center;font-weight:600">${r.score !== null ? r.score : '—'}</td>
      <td style="text-align:center"><strong>${r.grade}</strong></td>
      <td style="text-align:center">${r.points}</td>
      <td>${r.label}</td>
    </tr>`;
    }
  }).join('');

  return `
  <div class="report-form">
    <!-- HEADER -->
    <div class="rf-header">
      <div class="rf-logo">CA</div>
      <div class="rf-school-info">
        <h2>${s.schoolName||'School Name'}</h2>
        <p>${s.address||''} ${s.phone?'| Tel: '+s.phone:''} ${s.email?'| '+s.email:''}</p>
        <p style="font-weight:700;color:#16a34a">STUDENT PROGRESS REPORT — ${data.exam.term} ${data.exam.year}</p>
      </div>
    </div>

    <!-- STUDENT INFO -->
    <div class="rf-section">
      <div class="rf-section-title">Student Information</div>
      <div class="rf-section-body">
        <div class="rf-info-grid">
          <div class="rf-info-item"><span class="rf-info-label">Full Name</span><span class="rf-info-value">${data.stu.name}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Admission No</span><span class="rf-info-value">${data.stu.adm}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Gender</span><span class="rf-info-value">${data.stu.gender==='M'?'Male':'Female'}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Class</span><span class="rf-info-value">${data.cls?.name||'—'}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Stream</span><span class="rf-info-value">${data.stream?.name||'—'}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Exam</span><span class="rf-info-value">${data.exam.name}</span></div>
        </div>
      </div>
    </div>

    <!-- ACADEMIC PERFORMANCE -->
    <div class="rf-section">
      <div class="rf-section-title">Academic Performance</div>
      <div class="rf-section-body" style="padding:0">
        <table class="rf-marks-table" style="${data.isConsolidated && srcExams.length > 0 ? 'font-size:.78rem;' : ''}">
          <thead>
            <tr>
              <th style="${data.isConsolidated && srcExams.length > 0 ? 'padding:.2rem .3rem;width:1.5rem' : ''}">#</th>
              <th style="${data.isConsolidated && srcExams.length > 0 ? 'padding:.2rem .3rem' : ''}">Subject</th>
              ${data.isConsolidated && srcExams.length > 0
                ? srcExams.map(e=>`<th style="text-align:center;font-size:.68rem;padding:.2rem .3rem;white-space:nowrap">${e.name}</th>`).join('')
                  + '<th style="text-align:center;background:#dcfce7;padding:.2rem .3rem">Avg</th>'
                : '<th style="text-align:center">Out Of</th><th style="text-align:center">Score</th>'}
              <th style="text-align:center${data.isConsolidated && srcExams.length > 0 ? ';padding:.2rem .3rem' : ''}">Grade</th>
              <th style="text-align:center${data.isConsolidated && srcExams.length > 0 ? ';padding:.2rem .3rem' : ''}">Pts</th>
              <th style="${data.isConsolidated && srcExams.length > 0 ? 'padding:.2rem .3rem' : ''}">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="2" style="text-align:right;${data.isConsolidated && srcExams.length > 0 ? 'padding:.2rem .3rem;font-size:.75rem' : ''}">${data.isConsolidated ? 'AVG TOTAL / MEAN' : 'TOTALS / MEAN'}</td>
              ${data.isConsolidated && srcExams.length > 0
                ? srcExams.map((_,si)=>{
                    const colTotal = data.subjectRows.reduce((a,r)=>{
                      const sc=(r.sourceScores||[])[si]; return a+(sc!==null&&sc!==undefined?sc:0);
                    },0);
                    return `<td style="text-align:center;padding:.2rem .3rem;font-size:.75rem">${parseFloat(colTotal.toFixed(1))}</td>`;
                  }).join('') + `<td style="text-align:center;font-weight:700;background:#f0fdf4;padding:.2rem .3rem;font-size:.75rem">${parseFloat(data.total.toFixed(1))}</td>`
                : `<td style="text-align:center">${data.subjectRows.reduce((a,r)=>a+r.max,0)}</td><td style="text-align:center">${data.total}</td>`}
              <td style="text-align:center${data.isConsolidated && srcExams.length > 0 ? ';padding:.2rem .3rem;font-size:.75rem' : ''}">${data.mGrade.grade}</td>
              <td style="text-align:center${data.isConsolidated && srcExams.length > 0 ? ';padding:.2rem .3rem;font-size:.75rem' : ''}">${data.totalPoints}</td>
              <td style="${data.isConsolidated && srcExams.length > 0 ? 'padding:.2rem .3rem;font-size:.72rem' : ''}">${data.mGrade.label}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PERFORMANCE SUMMARY -->
    <div class="rf-section">
      <div class="rf-section-title">Performance Summary</div>
      <div class="rf-section-body">
        <div class="rf-info-grid">
          <div class="rf-info-item"><span class="rf-info-label">Total Marks</span><span class="rf-info-value" style="color:#1a6fb5;font-size:11pt">${data.total}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Mean Score</span><span class="rf-info-value" style="color:#1a6fb5;font-size:11pt">${data.mean.toFixed(2)}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Grade</span><span class="rf-info-value" style="color:#16a34a;font-size:11pt">${data.mGrade.grade} — ${data.mGrade.label}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Stream Position</span><span class="rf-info-value">${data.streamRank > 0 ? data.streamRank + ' / ' + (students.filter(s=>s.streamId===data.stu.streamId).length) : '—'}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Overall Position</span><span class="rf-info-value">${data.overallRank > 0 ? data.overallRank + ' / ' + students.length : '—'}</span></div>
          <div class="rf-info-item"><span class="rf-info-label">Total Points</span><span class="rf-info-value">${data.totalPoints}</span></div>
        </div>
      </div>
    </div>

    <!-- PERFORMANCE TREND -->
    ${data.history && data.history.length > 1 ? `
    <div class="rf-section" style="margin-top:.5rem">
      <div class="rf-section-title" style="background:#7c3aed">📈 Performance Trend</div>
      <div class="rf-section-body">
        <canvas id="rfTrendChart_${data.stu.id}_${data.exam.id}" height="80" data-history="${encodeURIComponent(JSON.stringify(data.history))}"></canvas>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
          ${data.history.map(h=>`<div style="flex:1;min-width:80px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:.35rem .5rem;text-align:center;font-size:.72rem">
            <div style="font-weight:700;color:#1a6fb5">${h.mean}</div>
            <div style="color:#64748b">${h.grade}</div>
            <div style="color:#94a3b8;font-size:.65rem">${h.examName}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- REMARKS -->
    <div class="rf-bottom">
      <div class="rf-remarks-box">
        <div class="rf-remarks-label">Class Teacher's Remarks</div>
        <div class="rf-remarks-text">${ctRemarks||'………………………………………………………………'}</div>
        <div class="rf-sig-line">Signature: ……………………………………  Date: ………………………</div>
      </div>
      <div class="rf-remarks-box">
        <div class="rf-remarks-label">Principal's Remarks</div>
        <div class="rf-remarks-text">${principalRemarks||'………………………………………………………………'}</div>
        <div class="rf-sig-line">Signature: ……………………………………  Date: ………………………</div>
      </div>
    </div>

    <!-- FEES SECTION -->
    ${(data.feeBalance !== undefined && data.feeBalance !== '') || data.feeStatus ? `
    <div class="rf-section" style="margin-top:.5rem;page-break-inside:avoid">
      <div class="rf-section-title" style="background:#1a6fb5">💰 Fee Statement</div>
      <div class="rf-section-body">
        <div class="rf-info-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="rf-info-item">
            <span class="rf-info-label">Fee Balance This Term</span>
            <span class="rf-info-value" style="color:${parseFloat(data.feeBalance||0)>0?'#dc2626':'#16a34a'};font-weight:700">KES ${parseFloat(data.feeBalance||0).toLocaleString()}</span>
          </div>
          <div class="rf-info-item">
            <span class="rf-info-label">Fees for Next Term</span>
            <span class="rf-info-value" style="font-weight:700">KES ${parseFloat(data.feeNextTerm||0).toLocaleString()}</span>
          </div>
          <div class="rf-info-item">
            <span class="rf-info-label">Payment Status</span>
            <span class="rf-info-value" style="color:${parseFloat(data.feeBalance||0)<=0?'#16a34a':'#dc2626'};font-weight:700;font-size:.82rem">
              ${parseFloat(data.feeBalance||0)<=0 ? '✅ FEES CLEARED' : '⚠️ BALANCE OUTSTANDING'}
            </span>
          </div>
        </div>
        ${parseFloat(data.feeBalance||0) > 0 ? `
        <div style="margin-top:.5rem;padding:.5rem .75rem;background:#fff1f2;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;font-size:.77rem;color:#dc2626">
          ⚠️ Outstanding balance of KES ${parseFloat(data.feeBalance||0).toLocaleString()} must be cleared. Please contact the school bursar for payment arrangements.
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- FOOTER -->
    <div class="rf-footer">
      <span>School Closed: <strong>${data.schoolClosed||'…………………'}</strong></span>
      <span>Next Term Opens: <strong>${nextOpen||'…………………………'}</strong></span>
    </div>
    <div class="rf-footer" style="border-top:none;padding-top:0">
      <span style="color:#1a6fb5;font-weight:700">${s.schoolName||''}</span>
      <span>Printed: ${new Date().toLocaleDateString()}</span>
    </div>

    <!-- QR CODE SECTION (auto-generated, shows on print) -->
    <div class="rf-qr-section" id="rf-qr-${data.stu.id}-${data.exam.id}"
         style="display:flex;align-items:center;gap:1rem;margin-top:.6rem;padding:.75rem 1rem;
                background:#f0f7ff;border:1.5px dashed #b3d4f5;border-radius:8px;page-break-inside:avoid">
      <div id="rf-qr-canvas-${data.stu.id}-${data.exam.id}" style="flex-shrink:0;background:#fff;padding:5px;border-radius:5px;width:80px;height:80px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:.6rem;color:#94a3b8;text-align:center">Loading QR…</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.7rem;font-weight:700;color:#1a6fb5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem">📱 Scan to View Results Online</div>
        <div style="font-size:.68rem;color:#555;line-height:1.5">Student can scan this QR code anytime to access their full results on any device.</div>
        <div style="font-size:.62rem;color:#94a3b8;margin-top:.2rem;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="rf-qr-url-${data.stu.id}-${data.exam.id}"></div>
      </div>
    </div>
  </div>`;
}

function generateReport() {
  const examId      = document.getElementById('rpExam').value;
  const stuId       = document.getElementById('rpStudent').value;
  const streamId    = document.getElementById('rpStream').value;
  let ctR           = document.getElementById('rpCTRemarks').value;
  let prR           = document.getElementById('rpPrincipalRemarks').value;
  const nextOpen    = document.getElementById('rpNextOpen').value;
  const schoolClosed= document.getElementById('rpSchoolClosed')?.value || '';
  const feeBalance  = document.getElementById('rpFeeBalance')?.value || '';
  const feeNextTerm = document.getElementById('rpFeeNextTerm')?.value || '';
  const autoComments = document.getElementById('rpAutoComments')?.checked !== false;
  // Resolve effective term/year for fee auto-link (manual override > exam derived)
  const rpTermOverride = document.getElementById('rpTerm')?.value || '';
  const rpYearOverride = document.getElementById('rpYear')?.value || '';
  const classId = document.getElementById('rpClass')?.value || '';
  if (!examId) { showToast('Select an exam','error'); return; }

  let stuList = stuId ? [students.find(s=>s.id===stuId)].filter(Boolean)
    : streamId ? students.filter(s=>s.streamId===streamId)
    : classId  ? students.filter(s=>s.classId===classId)
    : [...students];
  stuList = stuList.sort((a,b)=>a.name.localeCompare(b.name));

  const area = document.getElementById('reportPreviewArea');
  area.innerHTML = stuList.map(stu => {
    const d = getStudentReport(stu.id, examId);
    if (!d) return '';
    let finalCT = ctR;
    let finalPR = prR;
    if (autoComments) {
      finalCT = generateCTComment(d.mean, d.mGrade.grade, stu.gender, stu.name, d.streamRank, stuList.length);
      finalPR = generatePrincipalComment(d.mean, d.mGrade.grade, d.overallRank, students.length);
    }
    // Auto-lookup fee balance per student from fee records
    loadFees();
    let autoFeeBalance = '';
    let autoFeeStatus  = '';
    let autoFeeNextTerm = feeNextTerm;
    const feeLookupTerm = rpTermOverride || (d.exam?.term) || '';
    const feeLookupYear = rpYearOverride || (d.exam?.year ? String(d.exam.year) : '');

    // Primary: exact match for the exam's term/year
    const exactRec = feeLookupTerm && feeLookupYear
      ? feeRecords.find(r => r.studentId===stu.id && r.term===feeLookupTerm && String(r.year)===feeLookupYear)
      : null;

    if (exactRec) {
      const bal = getRecordBalance(exactRec);
      autoFeeBalance = bal;
      autoFeeStatus  = bal <= 0 ? 'FEES CLEARED ✅' : `BALANCE: KES ${bal.toLocaleString()}`;
    } else {
      // Fallback: most recent fee record for this student
      const stuRecs = feeRecords.filter(r => r.studentId===stu.id);
      if (stuRecs.length) {
        // Sort by year desc, then term desc (Term 3 > Term 2 > Term 1)
        const termOrder = {'Term 1':1,'Term 2':2,'Term 3':3};
        stuRecs.sort((a,b) => {
          const yd = parseInt(b.year) - parseInt(a.year);
          if (yd !== 0) return yd;
          return (termOrder[b.term]||0) - (termOrder[a.term]||0);
        });
        const latestRec = stuRecs[0];
        const bal = getRecordBalance(latestRec);
        autoFeeBalance = bal;
        autoFeeStatus  = bal <= 0 ? 'FEES CLEARED ✅' : `BALANCE: KES ${bal.toLocaleString()}`;
      }
    }

    // Next-term fee auto-lookup
    if (autoFeeNextTerm === '' && feeLookupTerm && feeLookupYear) {
      const termMap = {'Term 1':'Term 2','Term 2':'Term 3','Term 3':'Term 1'};
      const nxtTerm = termMap[feeLookupTerm] || feeLookupTerm;
      const nxtYear = feeLookupTerm==='Term 3' ? String(parseInt(feeLookupYear)+1) : feeLookupYear;
      const struct  = feeStructures.find(f => f.classId===stu.classId && f.term===nxtTerm && String(f.year)===nxtYear);
      if (struct) autoFeeNextTerm = struct.totalFee;
    }
    return buildReportHTML(d, finalCT, finalPR, nextOpen, schoolClosed, autoFeeBalance, autoFeeNextTerm, autoFeeStatus);
  }).join('');

  showToast(`${stuList.length} report(s) generated ✓`,'success');
  area.scrollIntoView({behavior:'smooth'});
  // Draw trend charts after DOM settles
  setTimeout(() => {
    area.querySelectorAll('canvas[id^="rfTrendChart_"]').forEach(canvas => {
      if (canvas.dataset.drawn) return;
      canvas.dataset.drawn = '1';
      try {
        const hist = JSON.parse(decodeURIComponent(canvas.dataset.history||'[]'));
        if (hist.length < 2) return;
        new Chart(canvas, {
          type:'line',
          data:{
            labels: hist.map(h=>h.examName),
            datasets:[
              {label:'Mean Score',data:hist.map(h=>h.mean),borderColor:'#1a6fb5',backgroundColor:'rgba(26,111,181,0.08)',tension:0.4,fill:true,pointRadius:5,pointBackgroundColor:'#1a6fb5'},
              {label:'Stream Rank',data:hist.map(h=>h.streamRank),borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.05)',tension:0.4,fill:false,pointRadius:4,pointBackgroundColor:'#16a34a',yAxisID:'y2'}
            ]
          },
          options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{y:{beginAtZero:false,title:{display:true,text:'Mean Score',font:{size:9}}},y2:{type:'linear',display:true,position:'right',reverse:true,title:{display:true,text:'Stream Rank',font:{size:9}},grid:{drawOnChartArea:false}}}}
        });
      } catch(e) { console.warn('Trend chart error', e); }
    });
  }, 200);

  // ── Generate QR codes on each printed report card ────────────
  setTimeout(() => {
    area.querySelectorAll('.rf-qr-section').forEach(section => {
      const canvasEl = section.querySelector('[id^="rf-qr-canvas-"]');
      const urlEl    = section.querySelector('[id^="rf-qr-url-"]');
      if (!canvasEl) return;

      // Locate admNo from this report card's info grid
      const reportDiv = section.closest('.report-form');
      let stuId = null;
      if (reportDiv) {
        reportDiv.querySelectorAll('.rf-info-item').forEach(item => {
          const lbl = item.querySelector('.rf-info-label');
          const val = item.querySelector('.rf-info-value');
          if (lbl && val && lbl.textContent.trim() === 'Admission No') {
            const stu = students.find(s => s.adm === val.textContent.trim());
            if (stu) stuId = stu.id;
          }
        });
      }
      const examSel = document.getElementById('rpExam');
      const examId2 = examSel ? examSel.value : null;
      if (!stuId || !examId2) { canvasEl.innerHTML = ''; return; }

      const stuAdm = students.find(s => s.id === stuId)?.adm || '';
      // Build results.html URL relative to current page
      const base = location.href.split('?')[0].replace(/[^/]+$/, '') + 'results.html';
      const params = new URLSearchParams({ adm: stuAdm, exam: examId2 });
      if (currentSchoolId) params.set('school', currentSchoolId);
      const url = base + '?' + params.toString();

      if (urlEl) urlEl.textContent = url;
      canvasEl.innerHTML = '';
      try {
        new QRCode(canvasEl, {
          text: url, width: 70, height: 70,
          colorDark: '#0f172a', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      } catch(e) { canvasEl.innerHTML = '<span style="font-size:.55rem;color:#aaa">QR unavailable</span>'; }
    });
  }, 500);
}

function previewReport() { generateReport(); }

// ═══════════════ MESSAGING ═══════════════
function loadMsgRecipients() {
  const type    = document.getElementById('msgType').value;
  const filter  = document.getElementById('msgFilter').value;
  const list    = document.getElementById('msgRecipientsList');
  let recipients = [];
  if (type==='parent'||type==='all') {
    let stuList = filter ? students.filter(s=>s.streamId===filter||s.classId===filter) : students;
    recipients = stuList.filter(s=>s.contact).map(s=>({name:s.parent||s.name, phone:s.contact, student:s.name}));
  } else if (type==='teacher') {
    recipients = teachers.filter(t=>t.phone).map(t=>({name:t.name,phone:t.phone,student:''}));
  } else if (type==='individual') {
    const filterStu = filter ? students.filter(s=>s.streamId===filter||s.classId===filter) : students;
    recipients = filterStu.filter(s=>s.contact).map(s=>({name:s.parent||s.name,phone:s.contact,student:s.name}));
  }
  list.innerHTML = recipients.length ? recipients.map(r=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border-lt);font-size:.85rem">
      <div><strong>${r.name}</strong>${r.student?' — '+r.student:''}</div>
      <span style="font-family:var(--mono);color:var(--muted);font-size:.78rem">${r.phone}</span>
    </div>`).join('')
  : '<p style="color:var(--muted);text-align:center;padding:1rem">No recipients found.</p>';

  // update filter dropdown
  const mf=document.getElementById('msgFilter');
  mf.innerHTML='<option value="">All</option>'+
    streams.map(s=>`<option value="${s.id}">Stream: ${s.name}</option>`).join('')+
    classes.map(c=>`<option value="${c.id}">Class: ${c.name}</option>`).join('');
}

function sendBulkSMS() {
  const msg=document.getElementById('msgText').value.trim();
  if(!msg){showToast('Enter a message first','error');return;}
  const count=document.querySelectorAll('#msgRecipientsList > div').length;
  if(!count){showToast('No recipients selected','error');return;}
  if(smsCredits<count){showToast(`Insufficient credits. Need ${count}, have ${smsCredits}`,'warning');return;}
  smsCredits-=count;
  localStorage.setItem(K.smsCredits,smsCredits);
  document.getElementById('smsCredits').textContent=smsCredits;
  const log={id:uid(),date:new Date().toLocaleString(),to:`${count} recipients`,preview:msg.slice(0,60)+'...',status:'Sent',credits:count};
  msgLog.unshift(log); save(K.msgLog,msgLog);
  renderMsgLog(); showToast(`SMS sent to ${count} recipients ✓`,'success');
}

function sendResultsSMS() {
  showToast('Connect to an SMS gateway (e.g. Africa\'s Talking) to enable this feature','info');
}

function renderMsgLog() {
  document.getElementById('msgLogBody').innerHTML=msgLog.map((m,i)=>`
    <tr>
      <td>${i+1}</td><td>${m.date}</td><td>${m.to}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${m.preview}</td>
      <td><span class="badge b-green">${m.status}</span></td>
      <td>${m.credits}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem">No messages sent yet.</td></tr>';
}

function openMpesaModal() {
  showModal('💳 Buy SMS Credits (M-Pesa)',`
    <p style="margin-bottom:1rem;font-size:.875rem;color:var(--muted)">Enter amount to purchase SMS credits. 1 credit = 1 SMS.</p>
    <div class="fg" style="margin-bottom:1rem"><label>Amount (KES)</label><input type="number" id="mpesaAmount" placeholder="e.g. 500" min="100"/></div>
    <div class="fg"><label>M-Pesa Phone</label><input type="tel" id="mpesaPhone" placeholder="07XX XXX XXX"/></div>
    <p style="margin-top:1rem;font-size:.78rem;color:var(--muted)">KES 100 = 100 SMS credits. A payment prompt will be sent to your phone.</p>
  `,[
    {label:'💳 Pay Now', cls:'btn-primary', action:'processMpesa()'},
    {label:'Cancel', cls:'btn-outline', action:'closeModal()'}
  ]);
}

function processMpesa() {
  const amt=parseInt(document.getElementById('mpesaAmount')?.value||0);
  if(!amt||amt<100){showToast('Minimum KES 100','error');return;}
  smsCredits+=amt; localStorage.setItem(K.smsCredits,smsCredits);
  document.getElementById('smsCredits').textContent=smsCredits;
  closeModal(); showToast(`${amt} SMS credits added ✓`,'success');
}

// ═══════════════ SETTINGS ═══════════════
function loadSettings() {
  const s=settings;
  document.getElementById('setSchoolName').value=s.schoolName||'';
  document.getElementById('setSchoolAddr').value=s.address||'';
  document.getElementById('setSchoolPhone').value=s.phone||'';
  document.getElementById('setSchoolEmail').value=s.email||'';
  document.getElementById('setTerm').value=s.term||'Term 1';
  document.getElementById('setYear').value=s.year||'2025';
  document.getElementById('sbSchoolName').textContent=s.schoolName||'School';
  // Global teacher restrictions (super admin only)
  const rta = document.getElementById('restrictTeacherAnalytics');
  const rtf = document.getElementById('restrictTeacherFees');
  const rtl = document.getElementById('restrictTeacherList');
  if (rta) rta.checked = !!s.restrictTeacherAnalytics;
  if (rtf) rtf.checked = !!s.restrictTeacherFees;
  if (rtl) rtl.checked = !!s.restrictTeacherList;
  renderAdminList();
  renderOverallGradingCard();
}

function saveSettings() {
  settings={
    schoolName:document.getElementById('setSchoolName').value.trim(),
    address:document.getElementById('setSchoolAddr').value.trim(),
    phone:document.getElementById('setSchoolPhone').value.trim(),
    email:document.getElementById('setSchoolEmail').value.trim(),
    term:document.getElementById('setTerm').value,
    year:document.getElementById('setYear').value,
    restrictTeacherAnalytics: settings.restrictTeacherAnalytics || false,
    restrictTeacherFees:      settings.restrictTeacherFees      || false,
    restrictTeacherList:      settings.restrictTeacherList      || false,
  };
  save(K.settings,[settings]);
  document.getElementById('sbSchoolName').textContent=settings.schoolName||'School';
  showToast('Settings saved ✓','success');
}

function saveGlobalTeacherRestrictions() {
  settings.restrictTeacherAnalytics = !!document.getElementById('restrictTeacherAnalytics')?.checked;
  settings.restrictTeacherFees      = !!document.getElementById('restrictTeacherFees')?.checked;
  settings.restrictTeacherList      = !!document.getElementById('restrictTeacherList')?.checked;
  save(K.settings, [settings]);
  // Re-apply UI if a teacher is currently logged in
  if (currentUser && currentUser.role === 'teacher') applyRoleBasedUI();
  showToast('Teacher restrictions saved ✓', 'success');
}

// ═══════════════ OVERALL GRADE THRESHOLDS ═══════════════

function renderOverallGradingCard() {
  const card = document.getElementById('overallGradingCard');
  if (!card) return;
  const mode = settings.overallGradingMode || 'auto';
  const gs   = getActiveGradingSystem();

  // Toggle the mode radio buttons
  const autoRad   = document.getElementById('ogModeAuto');
  const customRad = document.getElementById('ogModeCustom');
  if (autoRad)   autoRad.checked   = (mode === 'auto');
  if (customRad) customRad.checked = (mode === 'custom');

  // Build the preview / edit table
  renderOverallGradingTable(mode, gs);
}

function renderOverallGradingTable(mode, gs) {
  const wrap = document.getElementById('ogTableWrap');
  if (!wrap) return;
  gs = gs || getActiveGradingSystem();
  mode = mode || (settings.overallGradingMode || 'auto');

  const subjectMax = gs.bands.reduce((max, b) => Math.max(max, b.max), 100); // use 100 as base
  const autoThresh = computeAutoThresholds(gs, 100);

  if (mode === 'auto') {
    // Show read-only preview of auto-computed thresholds
    const rows = autoThresh.map(t => `
      <tr>
        <td><span class="badge ${t.cls}">${t.grade}</span></td>
        <td>${t.label}</td>
        <td style="text-align:center;font-weight:700;color:var(--primary)">&ge; ${(t.minMean).toFixed(1)}</td>
        <td style="text-align:center;color:var(--muted)">&le; ${(t.maxMean).toFixed(1)}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">
        Thresholds are automatically calculated by dividing <strong>100</strong> (subject max) evenly across all
        <strong>${gs.bands.length}</strong> grade bands in the active grading system
        (<em>${gs.name}</em>). Switch to <strong>Custom</strong> to set your own values.
      </p>
      <div class="tbl-wrap">
        <table style="font-size:.85rem">
          <thead><tr><th>Grade</th><th>Label</th><th>Min Mean</th><th>Max Mean</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    // Custom mode — editable rows, pre-filled from saved thresholds or auto-computed defaults
    const saved = Array.isArray(settings.overallGradeThresholds) && settings.overallGradeThresholds.length
      ? settings.overallGradeThresholds
      : autoThresh;
    const rows = saved.map((t,i) => `
      <tr class="og-row" data-idx="${i}">
        <td><span class="badge ${t.cls}">${t.grade}</span></td>
        <td style="color:var(--muted);font-size:.8rem">${t.label}</td>
        <td style="text-align:center">
          <input type="number" class="og-min" value="${t.minMean}" min="0" max="100" step="0.5"
            style="width:70px;padding:.3rem .4rem;border:1px solid var(--border);border-radius:5px;
                   background:var(--surface);color:var(--text);font-family:var(--font);font-size:.82rem;text-align:center"/>
        </td>
        <td style="text-align:center;color:var(--muted);font-size:.8rem">${(t.maxMean||100).toFixed(1)}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      <p style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">
        Set the minimum mean score required to achieve each grade. Values are in the same unit as subject marks
        (e.g. if subjects are out of 100, enter the mean mark out of 100).
        The system will award the <em>highest</em> grade whose minimum threshold the student meets.
      </p>
      <div class="tbl-wrap" style="margin-bottom:.75rem">
        <table style="font-size:.85rem">
          <thead><tr><th>Grade</th><th>Label</th><th>Min Mean Score</th><th>Max Mean (auto)</th></tr></thead>
          <tbody id="ogRows">${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="ogResetToAuto()">↺ Reset to Auto Defaults</button>
        <button class="btn btn-primary btn-sm" onclick="saveOverallGradeThresholds()">💾 Save Thresholds</button>
      </div>`;
  }
}

function onOgModeChange(mode) {
  settings.overallGradingMode = mode;
  save(K.settings, [settings]);
  renderOverallGradingTable(mode);
  showToast(mode === 'auto' ? 'Auto grading mode active ✓' : 'Custom mode — set your thresholds below', 'success');
}

function ogResetToAuto() {
  const gs = getActiveGradingSystem();
  const autoThresh = computeAutoThresholds(gs, 100);
  settings.overallGradeThresholds = autoThresh;
  save(K.settings, [settings]);
  renderOverallGradingTable('custom');
  showToast('Thresholds reset to auto-computed values ✓', 'info');
}

function saveOverallGradeThresholds() {
  const rows = document.querySelectorAll('#ogRows .og-row');
  if (!rows.length) { showToast('No thresholds to save','error'); return; }
  const gs = getActiveGradingSystem();
  const bandsSorted = [...gs.bands].sort((a,b) => b.min - a.min);
  const clsMap = { EE1:'b-green',EE2:'b-teal',ME1:'b-blue',ME2:'b-lblue',AE1:'b-amber',AE2:'b-orange',BE1:'b-red',BE2:'b-dkred' };
  const thresholds = [];
  let valid = true;
  rows.forEach((row, i) => {
    const minInput = row.querySelector('.og-min');
    const minMean  = parseFloat(minInput?.value);
    if (isNaN(minMean) || minMean < 0) { valid = false; return; }
    const band = bandsSorted[i] || {};
    thresholds.push({
      grade:   band.grade || row.dataset.grade || '?',
      label:   band.label || '',
      cls:     clsMap[band.grade] || band.cls || 'b-blue',
      minMean: minMean,
      maxMean: i === 0 ? 100 : parseFloat((thresholds[i-1]?.minMean - 0.01).toFixed(2))
    });
  });
  if (!valid) { showToast('Please fill all minimum values correctly','error'); return; }
  // Sort descending by minMean and fix maxMean chain
  thresholds.sort((a,b) => b.minMean - a.minMean);
  thresholds.forEach((t,i) => { t.maxMean = i===0 ? 100 : parseFloat((thresholds[i-1].minMean - 0.01).toFixed(2)); });
  settings.overallGradeThresholds = thresholds;
  save(K.settings, [settings]);
  renderOverallGradingTable('custom');
  showToast('Overall grade thresholds saved ✓', 'success');
}


function renderAdminList() {
  const list=[
    {name:'Super Admin',username:'superadmin',role:'superadmin',builtin:true},
    ...admins
  ];
  document.getElementById('adminList').innerHTML=list.map(a=>`
    <div class="admin-item">
      <div><div class="ai-name">${a.name}</div><div class="ai-role">${a.username} · <span class="badge ${a.role==='superadmin'?'b-amber':a.role==='principal'?'b-teal':a.role==='bursar'?'b-green':'b-blue'}">${a.role}</span></div></div>
      ${!a.builtin?`<button class="icb dl" onclick="deleteAdmin('${a.id||''}')">🗑️</button>`:'<span style="font-size:.75rem;color:var(--muted)">Built-in</span>'}
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem">No admin accounts.</p>';
}

function addAdminAccount() {
  const name=document.getElementById('newAdminName').value.trim();
  const user=document.getElementById('newAdminUser').value.trim();
  const pass=document.getElementById('newAdminPass').value;
  const role=document.getElementById('newAdminRole').value;
  if(!name||!user||!pass){showToast('All fields required','error');return;}
  if(admins.find(a=>a.username===user)){showToast('Username already exists','error');return;}
  admins.push({id:uid(),name,username:user,password:pass,role});
  save(K.admins,admins);
  ['newAdminName','newAdminUser','newAdminPass'].forEach(id=>document.getElementById(id).value='');
  renderAdminList(); showToast('Admin account created ✓','success');
}

function deleteAdmin(id) {
  if(!id||!confirm('Delete this admin account?'))return;
  admins=admins.filter(a=>a.id!==id);
  save(K.admins,admins); renderAdminList(); showToast('Account deleted','info');
}

// ═══════════════ DATA EXPORT/IMPORT ═══════════════
function exportAllData() {
  const data={students,subjects,teachers,classes,streams,exams,marks,settings,admins};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`examinsight_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
  showToast('Data exported ✓','success');
}

function importData(input) {
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const data=JSON.parse(e.target.result);
      if(data.students){students=data.students;save(K.students,students);}
      if(data.subjects){subjects=data.subjects;save(K.subjects,subjects);}
      if(data.teachers){teachers=data.teachers;save(K.teachers,teachers);}
      if(data.classes){classes=data.classes;save(K.classes,classes);}
      if(data.streams){streams=data.streams;save(K.streams,streams);}
      if(data.exams){exams=data.exams;save(K.exams,exams);}
      if(data.marks){marks=data.marks;save(K.marks,marks);}
      if(data.settings){settings=data.settings;save(K.settings,[settings]);}
      if(data.admins){admins=data.admins;save(K.admins,admins);}
      renderStudents();renderTeachers();renderSubjects();renderClasses();renderStreams();renderExamList();
      populateAllDropdowns();populateExamDropdowns();renderDashboard();loadSettings();
      showToast('Data imported successfully ✓','success');
    } catch(err){showToast('Invalid JSON file','error');console.error(err);}
  };
  reader.readAsText(file); input.value='';
}

function clearAllData() {
  if(!confirm('DELETE ALL DATA? This cannot be undone!'))return;
  if(!confirm('Are you absolutely sure? All students, marks, and exams will be lost.'))return;
  Object.values(K).forEach(k=>localStorage.removeItem(k));
  location.reload();
}

// ═══════════════ ANALYSIS EXPORT ═══════════════
function exportAnalysisPDF() {
  try {
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    doc.setFontSize(16);doc.setFont(undefined,'bold');
    doc.text(`Charanas Analyzer — Analysis Report`,14,18);
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()} | School: ${settings.schoolName||''}`,14,26);

    const examId=document.getElementById('anExam')?.value;
    const exam=exams.find(e=>e.id===examId);
    if(exam){
      doc.setFontSize(12);doc.setFont(undefined,'bold');
      doc.text(`Exam: ${exam.name} — ${exam.term} ${exam.year}`,14,36);
      const subjectData=exam.subjectIds.map(sid=>{
        const sub=subjects.find(s=>s.id===sid);
        const vals=marks.filter(m=>m.examId===examId&&m.subjectId===sid).map(m=>m.score);
        const mn=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
        return [sub?.name||'?',vals.length,mn.toFixed(1),vals.length?Math.max(...vals):'—',vals.length?Math.min(...vals):'—'];
      });
      doc.autoTable({startY:44,head:[['Subject','Count','Mean','Max','Min']],body:subjectData,theme:'striped',headStyles:{fillColor:[26,111,181]}});
    }
    doc.save('analysis_report.pdf');
    showToast('PDF exported ✓','success');
  } catch(e){showToast('PDF export error','error');console.error(e);}
}

function exportAnalysisExcel() {
  const examId=document.getElementById('anExam')?.value; if(!examId) return;
  const exam=exams.find(e=>e.id===examId);
  const rows=exam?.subjectIds.map(sid=>{
    const sub=subjects.find(s=>s.id===sid);
    const vals=marks.filter(m=>m.examId===examId&&m.subjectId===sid).map(m=>m.score);
    const mn=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
    return {Subject:sub?.name,Count:vals.length,Mean:mn.toFixed(1),Highest:vals.length?Math.max(...vals):'',Lowest:vals.length?Math.min(...vals):''};
  })||[];
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Analysis');
  XLSX.writeFile(wb,`analysis_${exam?.name||'exam'}.xlsx`);
}

// ─── SUMMARY ANALYTICS EXPORTS ────────────────────────────────
function exportSummaryAnalyticsPDF() {
  const examId = document.getElementById('smExam').value;
  if (!examId) { showToast('Select an exam first','error'); return; }
  // Trigger browser print on the rendered results
  const res = document.getElementById('smResults');
  if (!res || !res.innerHTML.trim()) { showToast('Generate the report first','error'); return; }
  const exam = exams.find(e=>e.id===examId);
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Summary Analytics — ${exam?.name||''}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:15px}
    h3{margin:.5rem 0 .25rem;color:#1a6fb5}h4{margin:.4rem 0 .2rem;color:#334155}
    table{border-collapse:collapse;width:100%;margin-bottom:.75rem}
    th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left;font-size:10px}
    thead th{background:#1a6fb5;color:#fff}
    .sm-class-section{page-break-before:auto;margin-bottom:1.5rem}
    .sm-podium{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem}
    .sm-podium-card{border:1px solid #e2e8f0;padding:8px;border-radius:6px;min-width:130px}
    .sm-subgrid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:.5rem}
    .sm-subcard{border:1px solid #e2e8f0;padding:6px;border-radius:5px;min-width:120px}
    .sm-subcard-title{font-weight:700;font-size:10px;margin-bottom:3px;color:#1a6fb5}
    .sm-top3-row{display:flex;gap:4px;font-size:9px;margin:1px 0}
    @media print{.sm-class-section{page-break-before:always}}
    @media print{.sm-class-section:first-child{page-break-before:avoid}}
  </style></head><body>
  <h2 style="color:#1a6fb5">${settings.schoolName||'School'} — Summary Analytics</h2>
  <p style="color:#64748b;font-size:10px">${exam?.name||''} | ${exam?.term||''} ${exam?.year||''}</p>
  ${res.innerHTML}
  </body></html>`);
  win.document.close();
  setTimeout(()=>win.print(), 600);
  showToast('Print dialog opened ✓','success');
}

function exportSummaryAnalyticsExcel() {
  const examId = document.getElementById('smExam').value;
  const classFilter = document.getElementById('smClass').value;
  if (!examId) { showToast('Select an exam first','error'); return; }
  const exam = exams.find(e=>e.id===examId);
  if (!exam) return;
  const isConsolidated = exam.category === 'consolidated';
  const sourceExamObjs = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];
  const wb = XLSX.utils.book_new();
  const targetClasses = classFilter ? classes.filter(c=>c.id===classFilter) : classes;

  for (const cls of targetClasses) {
    const clsStudents = students.filter(s=>s.classId===cls.id);
    if (!clsStudents.length) continue;

    // Student ranking sheet
    const stuRows = clsStudents.map((s,i)=>{
      const total = smGetStudentTotal(exam, isConsolidated, sourceExamObjs, s.id);
      const mean  = smGetStudentMean(exam, isConsolidated, sourceExamObjs, s.id);
      if (total===null) return null;
      const stream = streams.find(st=>st.id===s.streamId);
      const grade  = getMeanGrade ? getMeanGrade((mean/100)*8) : {grade:'—'};
      return { 'Rank':'', 'Adm No':s.adm, 'Name':s.name, 'Gender':s.gender==='M'?'Male':'Female',
               'Stream':stream?.name||'—', 'Total':total, 'Mean':mean, 'Grade':grade.grade||'—' };
    }).filter(Boolean).sort((a,b)=>b.Total-a.Total).map((r,i)=>({...r,'Rank':i+1}));

    // Subject ranking
    const subRows = (exam.subjectIds||[]).map(sid=>{
      const sub = subjects.find(s=>s.id===sid); if(!sub) return null;
      const vals = clsStudents.map(s=>smGetSubjectScore(exam,isConsolidated,sourceExamObjs,s.id,sid)).filter(v=>v!==null);
      if (!vals.length) return null;
      const mn = parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1));
      return { 'Subject':sub.name, 'Code':sub.code, 'Entries':vals.length,
               'Mean':mn, 'Highest':Math.max(...vals), 'Lowest':Math.min(...vals),
               'Grade':getGrade(mn,sub.max).grade };
    }).filter(Boolean).sort((a,b)=>b.Mean-a.Mean).map((r,i)=>({...r,'Rank':i+1}));

    const wsName = cls.name.replace(/[\\\/\*\?\[\]]/g,'').slice(0,28);
    if (stuRows.length) {
      const ws = XLSX.utils.json_to_sheet(stuRows);
      // Add subject ranking below with a gap
      const gap = stuRows.length + 3;
      XLSX.utils.sheet_add_json(ws, subRows, {origin: gap});
      XLSX.utils.book_append_sheet(wb, ws, wsName+' Rankings');
    }
  }

  if (!wb.SheetNames.length) { showToast('No data to export','error'); return; }
  XLSX.writeFile(wb, `summary_analytics_${exam?.name||'exam'}.xlsx`);
  showToast('Exported to Excel ✓','success');
}

// ═══════════════ UTILITIES ═══════════════
function filterTbl(id, q) {
  const lq=q.toLowerCase();
  document.querySelectorAll(`#${id} tbody tr`).forEach(r=>{
    r.style.display=r.textContent.toLowerCase().includes(lq)?'':'none';
  });
}

function showModal(title, bodyHTML, buttons=[]) {
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=bodyHTML;
  document.getElementById('modalFt').innerHTML=buttons.map(b=>`<button class="btn ${b.cls}" onclick="${b.action}">${b.label}</button>`).join('');
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
document.getElementById('modalOverlay')?.addEventListener('click',e=>{ if(e.target===document.getElementById('modalOverlay'))closeModal(); });

let toastT;
function showToast(msg, type='success') {
  const t=document.getElementById('toast');
  const icons={success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  t.innerHTML=`${icons[type]||''} ${msg}`;
  t.className=`toast ${type} show`;
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),3500);
}

// Drag-drop upload zones
document.addEventListener('DOMContentLoaded',()=>{
  ['marksUploadZone'].forEach(zoneId=>{
    const zone=document.getElementById(zoneId); if(!zone) return;
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.style.borderColor='var(--primary)';});
    zone.addEventListener('dragleave',()=>zone.style.borderColor='');
    zone.addEventListener('drop',e=>{
      e.preventDefault();zone.style.borderColor='';
      const f=e.dataTransfer.files[0]; if(!f) return;
      const inp=document.getElementById('marksFile');
      const dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files;
      handleMarksUpload(inp);
    });
  });
});

// ═══════════════ CLASS & STREAM LIST DOWNLOADS ═══════════════
function downloadClassList(classId) {
  const cls = classes.find(c=>c.id===classId); if(!cls) return;
  const stuList = students.filter(s=>s.classId===classId).sort((a,b)=>a.name.localeCompare(b.name));
  const rows = stuList.map((s,i)=>{
    const str = streams.find(x=>x.id===s.streamId);
    return { '#':i+1, AdmNo:s.adm, Name:s.name, Gender:s.gender, Class:cls.name, Stream:str?.name||'—', ParentName:s.parent||'', Contact:s.contact||'' };
  });
  if (!rows.length) { showToast('No students in this class','warning'); return; }
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,cls.name);
  XLSX.writeFile(wb,`students_${cls.name.replace(/\s+/g,'_')}.xlsx`);
  showToast(`${cls.name} student list downloaded ✓`,'success');
}

function downloadStreamList(streamId) {
  const str = streams.find(s=>s.id===streamId); if(!str) return;
  const stuList = students.filter(s=>s.streamId===streamId).sort((a,b)=>a.name.localeCompare(b.name));
  const rows = stuList.map((s,i)=>({ '#':i+1, AdmNo:s.adm, Name:s.name, Stream:str.name }));
  if (!rows.length) { showToast('No students in this stream','warning'); return; }
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,str.name.slice(0,31));
  XLSX.writeFile(wb,`stream_${str.name.replace(/\s+/g,'_')}.xlsx`);
  showToast(`${str.name} list downloaded ✓`,'success');
}

// ═══════════════ TEACHER SUBJECT CLASS LIST DOWNLOAD ═══════════════
function downloadTeacherSubjectList(teacherId) {
  const teacher = teachers.find(t=>t.id===teacherId);
  if (!teacher) return;
  // Get all streams where teacher is assigned per subject
  const assignments = streamAssignments.filter(a=>a.teacherId===teacherId);
  if (!assignments.length) { showToast('Teacher has no subject assignments','warning'); return; }
  const wb = XLSX.utils.book_new();
  const processed = new Set();
  assignments.forEach(a => {
    const key = a.streamId + '_' + a.subjectId;
    if (processed.has(key)) return; processed.add(key);
    const str = streams.find(s=>s.id===a.streamId);
    const sub = subjects.find(s=>s.id===a.subjectId);
    if (!str || !sub) return;
    const cls = classes.find(c=>c.id===str.classId);
    const stuList = students.filter(s=>s.streamId===a.streamId && (s.subjectIds||[]).includes(a.subjectId)).sort((a,b)=>a.name.localeCompare(b.name));
    if (!stuList.length) return;
    const rows = stuList.map((s,i)=>({ '#':i+1, AdmNo:s.adm, Name:s.name, Gender:s.gender==='M'?'Male':'Female', Class:cls?.name||'—', Stream:str.name, Subject:sub.name }));
    const sheetName = (sub.code+' '+str.name).slice(0,31);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  if (!wb.SheetNames || !wb.SheetNames.length) { showToast('No student data found for this teacher\'s subjects','warning'); return; }
  XLSX.writeFile(wb, `class_list_${teacher.name.replace(/\s+/g,'_')}.xlsx`);
  showToast(`Class list for ${teacher.name} downloaded ✓`, 'success');
}

// ═══════════════ ARCHIVED STUDENTS (GRADUATED) ═══════════════
function renderArchivedStudents() {
  const card = document.getElementById('archivedStudentsCard');
  const tbody = document.getElementById('archBody');
  if (!card || !tbody) return;
  const isAdmin = currentUser && (currentUser.role==='admin'||currentUser.role==='superadmin');
  if (!isAdmin) { card.style.display='none'; return; }
  const archived = getCurrentArchive();
  card.style.display = archived.length ? '' : 'none';
  if (!archived.length) return;
  const searchTerm = (document.getElementById('archSearchBox')?.value||'').toLowerCase();
  let list = archived;
  if (searchTerm) list = list.filter(s=>s.name.toLowerCase().includes(searchTerm)||s.adm.toLowerCase().includes(searchTerm));
  tbody.innerHTML = list.map((s,i)=>`<tr>
    <td>${i+1}</td>
    <td style="font-family:var(--mono);font-size:.8rem">${s.adm}</td>
    <td><strong>${s.name}</strong></td>
    <td><span class="badge ${s.gender==='M'?'b-m':'b-f'}">${s.gender==='M'?'Male':'Female'}</span></td>
    <td>${s.lastClass||'—'}</td>
    <td>${s.lastStream||'—'}</td>
    <td style="font-size:.8rem;color:var(--muted)">${s.archivedAt ? new Date(s.archivedAt).toLocaleDateString() : '—'}</td>
    <td><button class="icb" style="background:var(--secondary,#16a34a);color:#fff;border:none;font-size:.7rem;padding:.2rem .45rem;border-radius:5px" onclick="restoreArchivedStudent('${s.id}')" title="Restore to active students">↩ Restore</button></td>
  </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1rem">No archived students.</td></tr>';
}

function restoreArchivedStudent(id) {
  const archived = getCurrentArchive();
  const stu = archived.find(s=>s.id===id); if (!stu) return;
  if (!confirm(`Restore ${stu.name} to active students?`)) return;
  const { lastClass, lastStream, archivedAt, ...restored } = stu;
  students.push(restored);
  save(K.students, students);
  saveCurrentArchive(archived.filter(s=>s.id!==id));
  renderStudents(); renderDashboard(); renderArchivedStudents();
  showToast(`${stu.name} restored ✓`,'success');
}

function exportArchivedStudentsExcel() {
  const archived = getCurrentArchive();
  if (!archived.length) { showToast('No archived students','warning'); return; }
  const rows = archived.map((s,i)=>({ '#':i+1, AdmNo:s.adm, Name:s.name, Gender:s.gender==='M'?'Male':'Female', LastClass:s.lastClass||'', LastStream:s.lastStream||'', ArchivedDate:s.archivedAt?new Date(s.archivedAt).toLocaleDateString():'' }));
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Archived');
  XLSX.writeFile(wb,'archived_students.xlsx');
  showToast('Archive exported ✓','success');
}

// ═══════════════ PLATFORM PROMOTE LEARNERS ═══════════════
function populatePromoteSchoolDropdown() {
  const sel = document.getElementById('promoteSchoolSel'); if (!sel) return;
  loadPlatform();
  sel.innerHTML = '<option value="__all__">🌐 All Schools (Global Promotion)</option>' +
    platformSchools.filter(s=>s.active!==false).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}

function platPreviewPromotion() {
  const schoolId = document.getElementById('promoteSchoolSel')?.value;
  const box = document.getElementById('promotePreviewBox'); if (!box) return;
  loadPlatform();
  const schoolList = schoolId==='__all__' ? platformSchools.filter(s=>s.active!==false) : platformSchools.filter(s=>s.id===schoolId);
  if (!schoolList.length) { showToast('No schools found','warning'); return; }
  // Build preview
  let lines = [];
  schoolList.forEach(sch => {
    const prefix = sch.id + '_';
    const schStudents = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_students'))||[]; } catch { return []; } })();
    const schClasses  = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_classes'))||[]; } catch { return []; } })();
    const schStreams   = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_streams'))||[]; } catch { return []; } })();
    if (!schClasses.length) { lines.push(`<div style="margin-bottom:.4rem"><strong>${sch.name}</strong>: No classes configured — skipped.</div>`); return; }
    const orderedClasses = [...schClasses].sort((a,b)=>{
      const lvA=parseFloat(a.level)||0, lvB=parseFloat(b.level)||0;
      return lvA!==lvB ? lvA-lvB : a.name.localeCompare(b.name);
    });
    const finalClassId = orderedClasses[orderedClasses.length-1]?.id;
    const toArchive = schStudents.filter(s=>s.classId===finalClassId).length;
    const toPromote = schStudents.length - toArchive;
    lines.push(`<div style="margin-bottom:.5rem;padding:.5rem .75rem;border-radius:7px;background:rgba(255,255,255,.5);border:1px solid var(--border)">
      <strong>${sch.name}</strong> — ${schStudents.length} students across ${schClasses.length} classes<br>
      <span style="color:#10b981">▲ ${toPromote} will be promoted</span> &nbsp;|&nbsp; <span style="color:#f59e0b">🗃 ${toArchive} will be archived (${orderedClasses[orderedClasses.length-1]?.name||'final class'})</span>
    </div>`);
  });
  box.style.display = '';
  box.innerHTML = `<div style="margin-bottom:.75rem;font-weight:700;font-size:.88rem">📋 Promotion Preview:</div>${lines.join('')}
    <div style="margin-top:1rem;display:flex;gap:.75rem">
      <button class="btn btn-primary btn-sm" onclick="confirmAndPromote('${schoolId}')" style="background:linear-gradient(135deg,#10b981,#059669)">✅ Confirm &amp; Promote All</button>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('promotePreviewBox').style.display='none'">✕ Cancel</button>
    </div>`;
}

function confirmAndPromote(schoolId) {
  loadPlatform();
  const schoolList = schoolId==='__all__' ? platformSchools.filter(s=>s.active!==false) : platformSchools.filter(s=>s.id===schoolId);
  if (!confirm(`Promote all students in ${schoolId==='__all__'?'ALL schools':schoolList[0]?.name}?\n\nThis will move students to the next class. Students in the final class will be archived.\n\nThis action cannot be undone.`)) return;
  let totalPromoted=0, totalArchived=0;
  schoolList.forEach(sch => {
    const prefix = sch.id + '_';
    let schStudents = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_students'))||[]; } catch { return []; } })();
    const schClasses  = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_classes'))||[]; } catch { return []; } })();
    const schStreams   = (() => { try { return JSON.parse(localStorage.getItem(prefix+'ei_streams'))||[]; } catch { return []; } })();
    if (!schClasses.length || !schStudents.length) return;
    const orderedClasses = [...schClasses].sort((a,b)=>{
      const lvA=parseFloat(a.level)||0, lvB=parseFloat(b.level)||0;
      return lvA!==lvB ? lvA-lvB : a.name.localeCompare(b.name);
    });
    const classIndexMap = {}; orderedClasses.forEach((c,i)=>{ classIndexMap[c.id]=i; });
    let archived = getSchoolArchive(sch.id);
    const toArchive=[], promoted=[];
    schStudents.forEach(stu => {
      const idx = classIndexMap[stu.classId];
      if (idx === undefined) { promoted.push(stu); return; }
      if (idx >= orderedClasses.length-1) {
        // Final class — archive
        const clsName = orderedClasses[idx]?.name||'';
        const strName = schStreams.find(s=>s.id===stu.streamId)?.name||'';
        toArchive.push({...stu, lastClass:clsName, lastStream:strName, archivedAt:new Date().toISOString(), classId:'', streamId:''});
      } else {
        // Promote: move to next class, clear stream (find matching stream in next class if possible)
        const nextCls = orderedClasses[idx+1];
        const nextStreamMatch = schStreams.find(s=>s.classId===nextCls.id && schStreams.find(curS=>curS.id===stu.streamId)?.name===s.name);
        promoted.push({...stu, classId:nextCls.id, streamId:nextStreamMatch?.id||''});
      }
    });
    archived = [...archived, ...toArchive];
    saveSchoolArchive(sch.id, archived);
    localStorage.setItem(prefix+'ei_students', JSON.stringify(promoted));
    totalPromoted += promoted.length; totalArchived += toArchive.length;
    // If currently viewing this school, reload
    if (currentSchoolId === sch.id) {
      students = promoted;
      renderStudents(); renderDashboard(); renderArchivedStudents();
    }
  });
  document.getElementById('promotePreviewBox').style.display='none';
  showToast(`✅ Done — ${totalPromoted} promoted, ${totalArchived} archived`,'success');
}

// ═══════════════ MERIT LIST TYPE SWITCHER ═══════════════
function onMlExamChange() {
  // Populate class dropdown with classes that have students in this exam
  const examId = document.getElementById('mlExam').value;
  const classEl = document.getElementById('mlClass');
  if (!classEl) return;
  if (!examId) {
    classEl.innerHTML = '<option value="">— All Classes —</option>';
    document.getElementById('mlStreamRow').style.display = 'none';
    document.getElementById('meritListWrap').innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">Select an exam and click Generate.</p>';
    return;
  }
  const exam = exams.find(e=>e.id===examId);
  // Get classes represented in this exam
  let relevantClasses = classes;
  if (exam?.classId) {
    relevantClasses = classes.filter(c=>c.id===exam.classId);
  }
  classEl.innerHTML = '<option value="">— All Classes —</option>' +
    relevantClasses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  onMlClassChange();
}

function onMlClassChange() {
  const classId = document.getElementById('mlClass')?.value || '';
  onMlTypeChange(true); // refresh stream list, re-render
}

function onMlTypeChange(skipRender) {
  const type    = document.getElementById('mlType').value;
  const classId = document.getElementById('mlClass')?.value || '';
  const streamRow = document.getElementById('mlStreamRow');
  if (type === 'class_stream') {
    streamRow.style.display = '';
    populateMeritStreamDropdown(classId);
  } else {
    streamRow.style.display = 'none';
  }
  if (!skipRender) renderMeritList();
  else renderMeritList();
}

function populateMeritStreamDropdown(classId) {
  const el = document.getElementById('mlStream'); if (!el) return;
  const filtered = classId ? streams.filter(s=>s.classId===classId) : streams;
  el.innerHTML = '<option value="">— Select Stream —</option>' +
    filtered.map(s=>`<option value="${s.id}">${s.name}${!classId ? ' (' + (classes.find(c=>c.id===s.classId)?.name||'') + ')' : ''}</option>`).join('');
}

// ═══════════════ EDIT GRADING SYSTEM ═══════════════
function editGS(id) {
  const gs = gradingSystems.find(g=>g.id===id); if (!gs) return;
  const bandsHTML = gs.bands.map(b=>`
    <tr class="gs-band-row" data-orig-grade="${b.grade}">
      <td><input type="number" class="gs-min" value="${b.min}" min="0" max="100" style="width:60px"/></td>
      <td><input type="number" class="gs-max" value="${b.max}" min="0" max="100" style="width:60px"/></td>
      <td><input type="text" class="gs-grade" value="${b.grade}" maxlength="4" style="width:60px"/></td>
      <td><input type="number" class="gs-pts" value="${b.points}" min="0" max="10" step="0.5" style="width:60px"/></td>
      <td><input type="text" class="gs-lbl" value="${b.label||''}" style="width:120px"/></td>
      <td><button type="button" class="icb dl" onclick="this.closest('tr').remove()">🗑</button></td>
    </tr>`).join('');

  showModal(`✏️ Edit Grading System — ${gs.name}`, `
    <div style="margin-bottom:.75rem">
      <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:.4rem">System Name</label>
      <input type="text" id="editGsName" value="${gs.name}" style="width:100%;padding:.5rem;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit"/>
    </div>
    <div class="tbl-wrap">
      <table style="font-size:.82rem">
        <thead><tr><th>Min%</th><th>Max%</th><th>Grade</th><th>Points</th><th>Label</th><th></th></tr></thead>
        <tbody id="editGsBandsBody">${bandsHTML}</tbody>
      </table>
    </div>
    <button type="button" class="btn btn-outline btn-sm" style="margin-top:.5rem" onclick="addEditGSBandRow()">➕ Add Band</button>
  `, [
    { label:'💾 Save Changes', cls:'btn-primary', action:`saveEditedGS('${id}')` },
    { label:'Cancel', cls:'btn-outline', action:'closeModal()' }
  ]);
}

function addEditGSBandRow() {
  const tbody = document.getElementById('editGsBandsBody'); if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'gs-band-row';
  tr.innerHTML = `
    <td><input type="number" class="gs-min" placeholder="0" min="0" max="100" style="width:60px"/></td>
    <td><input type="number" class="gs-max" placeholder="100" min="0" max="100" style="width:60px"/></td>
    <td><input type="text" class="gs-grade" placeholder="EE1" maxlength="4" style="width:60px"/></td>
    <td><input type="number" class="gs-pts" placeholder="8" min="0" max="10" step="0.5" style="width:60px"/></td>
    <td><input type="text" class="gs-lbl" placeholder="Outstanding" style="width:120px"/></td>
    <td><button type="button" class="icb dl" onclick="this.closest('tr').remove()">🗑</button></td>`;
  tbody.appendChild(tr);
}

function saveEditedGS(id) {
  const nameEl = document.getElementById('editGsName');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('System name required','error'); return; }
  const rows = document.querySelectorAll('#editGsBandsBody .gs-band-row');
  const bands = [];
  let valid = true;
  rows.forEach(row => {
    const min = parseInt(row.querySelector('.gs-min').value);
    const max = parseInt(row.querySelector('.gs-max').value);
    const grade = row.querySelector('.gs-grade').value.trim();
    const points = parseFloat(row.querySelector('.gs-pts').value);
    const label = row.querySelector('.gs-lbl').value.trim();
    if (!grade || isNaN(min) || isNaN(max) || isNaN(points)) { valid=false; return; }
    const clsMap = { EE1:'b-green',EE2:'b-teal',ME1:'b-blue',ME2:'b-lblue',AE1:'b-amber',AE2:'b-orange',BE1:'b-red',BE2:'b-dkred' };
    bands.push({ min, max, grade, points, label, cls: clsMap[grade]||'b-blue' });
  });
  if (!valid || !bands.length) { showToast('Fill all band rows correctly','error'); return; }
  bands.sort((a,b)=>b.min-a.min);
  const idx = gradingSystems.findIndex(g=>g.id===id);
  if (idx > -1) { gradingSystems[idx] = { ...gradingSystems[idx], name, bands }; }
  localStorage.setItem(K_GS, JSON.stringify(gradingSystems));
  closeModal();
  renderGradingSystemsTab();
  showToast('Grading system updated ✓','success');
}

// ═══════════════ MERIT LIST – UPDATED RENDER ═══════════════
function renderMeritList() {
  const examId    = document.getElementById('mlExam').value;
  const type      = document.getElementById('mlType')?.value || 'class_overall_and_stream';
  const classId   = document.getElementById('mlClass')?.value || '';
  const container = document.getElementById('meritListWrap');

  if (!examId) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">Select an exam and click Generate.</p>';
    return;
  }

  const exam = exams.find(e=>e.id===examId);

  // ── Single stream view ──────────────────────────────────────────────────
  if (type === 'class_stream') {
    const streamId = document.getElementById('mlStream')?.value;
    if (!streamId) {
      container.innerHTML = '<p style="color:var(--muted);padding:1rem">Select a stream from the dropdown above.</p>';
      return;
    }
    const str = streams.find(s=>s.id===streamId);
    const cls = classes.find(c=>c.id===str?.classId);
    // Build merit data scoped to just this stream (ranks within stream)
    const streamScored = buildMeritData(examId, streamId, str?.classId||classId||null);
    const { headerRow, bodyRows } = buildMeritTableHTML(streamScored, examId, false);
    const subAnalysis = buildSubjectAnalysisHTML(examId, streamScored.map(s=>s.id));
    container.innerHTML = `
      <h3 style="margin-bottom:.75rem;font-family:var(--font);font-weight:700">
        🌊 ${cls ? cls.name + ' &rsaquo; ' : ''}${str?.name||streamId} &mdash; Stream Merit List
        <span style="font-size:.78rem;font-weight:400;color:var(--muted);margin-left:.5rem">${exam?.name||''}</span>
      </h3>
      <div class="tbl-wrap">
        <table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
      </div>
      ${subAnalysis}`;
    return;
  }

  // ── Determine which classes to render ───────────────────────────────────
  // If a class is selected, only show that class; otherwise show all classes in exam
  let targetClasses;
  if (classId) {
    const cls = classes.find(c=>c.id===classId);
    targetClasses = cls ? [cls] : [];
  } else {
    // Find all classes that have scored students in this exam
    const allScored = buildMeritData(examId, null, null);
    const cids = [...new Set(allScored.map(s=>s.classId).filter(Boolean))];
    targetClasses = cids.map(id=>classes.find(c=>c.id===id)).filter(Boolean);
    targetClasses.sort((a,b)=>a.name.localeCompare(b.name));
  }

  if (!targetClasses.length) {
    container.innerHTML = '<p style="color:var(--muted);padding:1rem">No scored students found for this exam.</p>';
    return;
  }

  // ── Render one section per class ────────────────────────────────────────
  const classSections = targetClasses.map((cls, ci) => {
    // Score & rank WITHIN this class only
    const classScored = buildMeritData(examId, null, cls.id);
    if (!classScored.length) return '';

    const { headerRow: clsHdr, bodyRows: clsRows } = buildMeritTableHTML(classScored, examId, true);
    const clsSubAnalysis = buildSubjectAnalysisHTML(examId, classScored.map(s=>s.id));

    let streamSections = '';
    if (type === 'class_overall_and_stream') {
      // All streams belonging to this class that have scored students
      const clsStreamIds = [...new Set(classScored.map(s=>s.streamId).filter(Boolean))];
      const clsStreams = clsStreamIds.map(sid=>streams.find(x=>x.id===sid)).filter(Boolean);
      clsStreams.sort((a,b)=>a.name.localeCompare(b.name));

      streamSections = clsStreams.map(str => {
        // Score & rank within this stream only (pass classId so ranking is scoped)
        const strScored = buildMeritData(examId, str.id, cls.id);
        if (!strScored.length) return '';
        const { headerRow, bodyRows } = buildMeritTableHTML(strScored, examId, false);
        const strSubAnalysis = buildSubjectAnalysisHTML(examId, strScored.map(s=>s.id));
        return `
          <div style="margin-top:1.5rem">
            <h4 style="margin-bottom:.6rem;font-family:var(--font);font-weight:700;color:var(--secondary);font-size:.95rem">
              🌊 ${str.name} Stream
              <span style="font-size:.75rem;font-weight:400;color:var(--muted);margin-left:.4rem">${strScored.length} student${strScored.length!==1?'s':''}</span>
            </h4>
            <div class="tbl-wrap">
              <table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>
            </div>
            ${strSubAnalysis}
          </div>`;
      }).join('');
    }

    const pageBreak = ci > 0 ? 'margin-top:2.5rem;padding-top:1.5rem;border-top:2px solid var(--border);' : '';
    return `
      <div style="${pageBreak}">
        <h3 style="margin-bottom:.75rem;font-family:var(--font);font-weight:700;color:var(--primary)">
          🏆 ${cls.name} &mdash; Class Merit List
          <span style="font-size:.78rem;font-weight:400;color:var(--muted);margin-left:.5rem">${exam?.name||''} &bull; ${classScored.length} students</span>
        </h3>
        <div class="tbl-wrap">
          <table><thead>${clsHdr}</thead><tbody>${clsRows}</tbody></table>
        </div>
        ${clsSubAnalysis}
        ${streamSections}
      </div>`;
  }).join('');

  container.innerHTML = classSections || '<p style="color:var(--muted);padding:1rem">No data found.</p>';
}

// ═══════════════ DOWNLOAD ALL REPORT FORMS AS PDF ═══════════════
function downloadAllReportsPDF() {
  const examId   = document.getElementById('rpExam').value;
  if (!examId) { showToast('Select an exam first','error'); return; }

  // Make sure reports are generated first
  const area = document.getElementById('reportPreviewArea');
  const forms = area ? area.querySelectorAll('.report-form') : [];
  if (!forms.length) {
    showToast('Generate reports first, then export','warning');
    return;
  }

  if (!window.html2canvas) {
    showToast('html2canvas not loaded — try refreshing the page', 'error');
    return;
  }

  const exam = exams.find(e => e.id === examId);
  const fileName = `reports_${exam?.name||'exam'}.pdf`;

  showToast(`Exporting ${forms.length} report(s) as PDF — please wait…`, 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297;

  const renderForm = (form, idx) => new Promise(resolve => {
    // Temporarily force exact A4 pixel size for clean capture
    const origStyle = form.getAttribute('style') || '';
    form.style.width = '794px';  // 210mm at 96dpi
    form.style.height = '1123px'; // 297mm at 96dpi
    form.style.overflow = 'hidden';
    form.style.boxSizing = 'border-box';

    html2canvas(form, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: 1123,
      windowWidth: 794,
    }).then(canvas => {
      // Restore original style
      form.setAttribute('style', origStyle);

      if (idx > 0) doc.addPage();
      const imgData = canvas.toDataURL('image/jpeg', 0.97);
      doc.addImage(imgData, 'JPEG', 0, 0, PW, PH);
      resolve();
    }).catch(err => {
      form.setAttribute('style', origStyle);
      console.error('html2canvas error:', err);
      resolve();
    });
  });

  // Render all forms sequentially then save
  (async () => {
    for (let i = 0; i < forms.length; i++) {
      await renderForm(forms[i], i);
    }
    doc.save(fileName);
    showToast(`PDF with ${forms.length} report(s) downloaded ✓`, 'success');
  })();
}


function es_initApp() {
  if (!es_initialized) {
    es_initialized = true;
    es_loadData();
    es_buildColorPicker();
    document.querySelectorAll('#es-app .modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) es_closeModal(m.id); });
    });
    if (!localStorage.getItem(ES_DB_KEY)) setTimeout(es_loadSampleData, 600);
  }
  es_renderAll();
  es_updateDashboard();
}

/* =====================================================
   PERSISTENCE
===================================================== */
function es_saveData() {
  localStorage.setItem(ES_DB_KEY, JSON.stringify(es_state));
}
function es_loadData() {
  const raw = localStorage.getItem(ES_DB_KEY);
  if (raw) { try { Object.assign(es_state, JSON.parse(raw)); } catch(e) {} }
  es_syncSetupForm();
}
function es_syncSetupForm() {
  const s = es_state.school;
  document.getElementById('es_schoolName').value   = s.name || '';
  document.getElementById('es_daysPerWeek').value  = s.daysPerWeek || 5;
  document.getElementById('es_lessonsPerDay').value= s.lessonsPerDay || 9;
  document.getElementById('es_lessonDuration').value= s.lessonDuration || 40;
  document.getElementById('es_schoolStart').value  = s.schoolStart || '07:30';
  es_renderBreakList();
  es_updateSetupUI();
}
function es_exportData() {
  const blob = new Blob([JSON.stringify(es_state, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `eduschedule_${(es_state.school.name||'backup').replace(/\s+/g,'_')}.json`;
  a.click(); es_toast('💾 Data exported!', 'success');
}
function es_importDataPrompt() {
  const input = document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange = e => {
    const r = new FileReader();
    r.onload = ev => {
      try {
        Object.assign(es_state, JSON.parse(ev.target.result));
        es_saveData(); es_syncSetupForm(); es_renderAll(); es_updateDashboard();
        es_toast('📂 Data loaded!', 'success');
      } catch(e) { es_toast('❌ Invalid file', 'danger'); }
    };
    r.readAsText(e.target.files[0]);
  };
  input.click();
}

/* =====================================================
   NAVIGATION
===================================================== */
const PAGE_TITLES = {
  dashboard:'Dashboard', setup:'School Setup', classes:'Classes & Streams',
  subjects:'Subjects', teachers:'Teachers', rooms:'Rooms & Labs',
  generate:'Generate Timetable', view:'View Timetable',
  allclass:'All Classes', conflicts:'Conflicts'
};
function es_showPage(name, navEl) {
  document.querySelectorAll('#es-pages .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#es-nav .nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-'+name);
  if (pg) pg.classList.add('active');
  if (navEl) navEl.classList.add('active');
  else document.querySelectorAll('#es-nav .nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes("'"+name+"'")) n.classList.add('active');
  });
  const titleEl = document.getElementById('es_topbarTitle');
  if (titleEl) titleEl.textContent = '📅 ' + (PAGE_TITLES[name] || name);
  if (name==='view')     { es_populateViewSelects(); es_renderTimetableView(); }
  if (name==='generate') es_buildGenClassSelector();
  if (name==='conflicts') es_runConflictCheck();
  if (name==='dashboard') es_updateDashboard();
  if (name==='allclass') es_renderAllClassView();
}
function es_toggleSidebar() { /* no-op: sub-app has no sidebar */ }
function es_closeSidebar() { /* no-op: sub-app has no sidebar */ }

/* =====================================================
   MODAL
===================================================== */
function es_openModal(id)  { document.getElementById(id).classList.add('open'); }
function es_closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* =====================================================
   TOAST
===================================================== */
function es_toast(msg, type='info') {
  const colors = {success:'var(--success)',danger:'var(--danger)',warning:'var(--warning)',info:'var(--accent)'};
  const icons  = {success:'✅',danger:'❌',warning:'⚠️',info:'ℹ️'};
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderLeft = '3px solid '+(colors[type]||colors.info);
  el.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  const tc = document.getElementById('es_toastContainer'); if(tc) tc.appendChild(el);
  setTimeout(() => { el.classList.add('fading'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* =====================================================
   SCHOOL SETUP
===================================================== */
function es_updateSetupUI() {
  const days    = parseInt(document.getElementById('es_daysPerWeek').value) || 5;
  const lessons = parseInt(document.getElementById('es_lessonsPerDay').value) || 9;
  const start   = document.getElementById('es_schoolStart').value || '07:30';
  const dur     = parseInt(document.getElementById('es_lessonDuration').value) || 40;
  es_renderPeriodPreview(days, lessons, start, dur);
}
function es_renderPeriodPreview(days, lessons, start, dur) {
  const preview = document.getElementById('es_periodPreview');
  if (!preview) return;
  preview.innerHTML = '';
  let [h, m] = start.split(':').map(Number);
  const breaks = es_state.school.breaks || [];
  for (let p = 1; p <= lessons; p++) {
    const brk = breaks.find(b => b.after === p-1);
    if (brk) {
      h += Math.floor((m + brk.duration) / 60);
      m = (m + brk.duration) % 60;
      const bEl = document.createElement('div');
      bEl.style.cssText = 'padding:4px 8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:6px;font-size:11px;color:var(--warning);font-weight:600;';
      bEl.textContent = `☕ ${brk.label||'Break'} ${brk.duration}min`;
      preview.appendChild(bEl);
    }
    const endH = Math.floor((h*60+m+dur)/60) % 24;
    const endM = (m+dur)%60;
    const el = document.createElement('div');
    el.style.cssText = 'padding:4px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text2);';
    el.textContent = `P${p}: ${es_pad(h)}:${es_pad(m)}–${es_pad(endH)}:${es_pad(endM)}`;
    preview.appendChild(el);
    h = endH; m = endM;
  }
}
function es_pad(n) { return String(n).padStart(2,'0'); }

function es_addBreak() { es_openModal('breakModal'); }
function es_clearAllBreaks() {
  if (!es_state.school.breaks || es_state.school.breaks.length === 0) { es_toast('No breaks to clear','warning'); return; }
  if (!confirm('Remove all break periods?')) return;
  es_state.school.breaks = [];
  es_saveData(); es_renderBreakList(); es_updateSetupUI();
  es_toast('🗑 All breaks cleared','success');
}
function es_quickBreak(after, duration, label) {
  if (!es_state.school.breaks) es_state.school.breaks = [];
  // Prevent duplicate after-position
  if (es_state.school.breaks.find(b => b.after === after)) {
    es_toast(`A break already exists after Period ${after}. Remove it first.`, 'warning'); return;
  }
  es_state.school.breaks.push({after, duration, label});
  es_state.school.breaks.sort((a,b) => a.after - b.after);
  es_saveData(); es_renderBreakList(); es_updateSetupUI();
  es_toast(`✅ Added: ${label} after Period ${after}`, 'success');
}
window.es_clearAllBreaks = es_clearAllBreaks;
window.es_quickBreak = es_quickBreak;
function es_saveBreak() {
  const after    = parseInt(document.getElementById('es_breakAfter').value);
  const duration = parseInt(document.getElementById('es_breakDuration').value);
  const label    = document.getElementById('es_breakLabel').value.trim() || 'Break';
  if (!es_state.school.breaks) es_state.school.breaks = [];
  es_state.school.breaks.push({after, duration, label});
  es_state.school.breaks.sort((a,b) => a.after - b.after);
  es_renderBreakList(); es_updateSetupUI(); es_closeModal('breakModal');
}
function es_renderBreakList() {
  const el = document.getElementById('es_breakList');
  if (!el) return;
  const breaks = es_state.school.breaks || [];
  if (breaks.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 4px;">No breaks configured — use quick-add buttons above or add a custom break.</div>';
    return;
  }
  el.innerHTML = breaks.map((b,i) => {
    const isLunch = /lunch/i.test(b.label);
    const icon = isLunch ? '🍽' : '☕';
    const bg   = isLunch ? 'rgba(16,185,129,.08)' : 'rgba(245,158,11,.08)';
    const bdr  = isLunch ? 'rgba(16,185,129,.3)' : 'rgba(245,158,11,.3)';
    const col  = isLunch ? '#065f46' : '#92400e';
    return `
    <div class="break-item" style="background:${bg};border:1px solid ${bdr};">
      <span style="font-size:16px;">${icon}</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:13px;color:${col};">${b.label}</div>
        <div style="font-size:11px;color:var(--text3);">After Period ${b.after} &nbsp;•&nbsp; ${b.duration} minutes</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeBreak(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');
}
function es_removeBreak(i) {
  es_state.school.breaks.splice(i, 1);
  es_saveData();
  es_renderBreakList(); es_updateSetupUI();
}
/* Global alias — inline onclick handlers call removeBreak() without prefix */
window.removeBreak = function(i) { es_removeBreak(i); };
function es_saveSetup() {
  es_state.school.name         = document.getElementById('es_schoolName').value.trim();
  es_state.school.daysPerWeek  = parseInt(document.getElementById('es_daysPerWeek').value);
  es_state.school.lessonsPerDay= parseInt(document.getElementById('es_lessonsPerDay').value);
  es_state.school.lessonDuration= parseInt(document.getElementById('es_lessonDuration').value);
  es_state.school.schoolStart  = document.getElementById('es_schoolStart').value;
  if (!es_state.school.name) { es_toast('Please enter a school name','warning'); return; }
  es_saveData(); es_renderAll(); es_updateDashboard();
  es_toast('✅ School setup saved!','success');
}

/* =====================================================
   CLASSES
===================================================== */
function es_openClassModal() {
  document.getElementById('es_classModalTitle').textContent = 'Add Class';
  document.getElementById('es_classEditId').value = '';
  document.getElementById('es_classGrade').value  = 'Grade 7';
  document.getElementById('es_classStream').value = '';
  document.getElementById('es_classStudents').value = 40;
  es_openModal('classModal');
}
function es_saveClass() {
  const id      = document.getElementById('es_classEditId').value || es_uid();
  const grade   = document.getElementById('es_classGrade').value;
  const stream  = document.getElementById('es_classStream').value.trim();
  const students= parseInt(document.getElementById('es_classStudents').value);
  const obj = {id, grade, stream, students};
  const idx = es_state.classes.findIndex(c => c.id === id);
  if (idx >= 0) es_state.classes[idx] = obj; else es_state.classes.push(obj);
  es_closeModal('classModal');
  es_renderClasses(); es_updateBadges(); es_updateDashboard(); es_saveData();
  es_toast('✅ Class saved!','success');
}
function es_editClass(id) {
  const c = es_state.classes.find(x => x.id === id); if (!c) return;
  document.getElementById('es_classModalTitle').textContent = 'Edit Class';
  document.getElementById('es_classEditId').value   = c.id;
  document.getElementById('es_classGrade').value    = c.grade;
  document.getElementById('es_classStream').value   = c.stream || '';
  document.getElementById('es_classStudents').value = c.students;
  es_openModal('classModal');
}
function es_deleteClass(id) {
  if (!confirm('Delete this class and its timetable?')) return;
  es_state.classes = es_state.classes.filter(c => c.id !== id);
  delete es_state.timetable[id];
  es_renderClasses(); es_updateBadges(); es_updateDashboard(); es_saveData();
  es_toast('🗑️ Class deleted','warning');
}
function es_renderClasses() {
  const tbody = document.getElementById('es_classTableBody');
  if (!tbody) return;
  if (es_state.classes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🏫</div><h3>No classes yet</h3><p>Click "Add Class" to get started</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = es_state.classes.map(c => {
    const hastt = !!es_state.timetable[c.id];
    return `<tr>
      <td><span class="badge badge-blue">${c.grade}</span></td>
      <td>${c.stream||'—'}</td>
      <td><strong>${c.grade}${c.stream?' '+c.stream:''}</strong></td>
      <td>${c.students} students</td>
      <td>${hastt?'<span class="badge badge-green">✅ Generated</span>':'<span class="badge badge-orange">⚪ None</span>'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="viewClassDirect('${c.id}')">📅 View</button>
        <button class="btn btn-sm btn-secondary" onclick="editClass('${c.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClass('${c.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}
function es_viewClassDirect(id) {
  es_showPage('view');
  setTimeout(() => {
    document.getElementById('es_viewClassSelect').value = id;
    es_renderTimetableView();
  }, 50);
}

/* =====================================================
   SUBJECTS
===================================================== */
function es_buildColorPicker(selectedColor) {
  const picker = document.getElementById('es_colorPicker');
  if (!picker) return;
  picker.innerHTML = ES_COLORS.map((c,i) => `
    <div class="color-swatch ${(selectedColor ? c===selectedColor : i===0)?'selected':''}"
         style="background:${c};" data-color="${c}" onclick="selectColor(this)"></div>
  `).join('');
}
function es_selectColor(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}
function es_getSelectedColor() {
  const s = document.querySelector('.color-swatch.selected');
  return s ? s.dataset.color : ES_COLORS[0];
}
function es_openSubjectModal() {
  document.getElementById('es_subjectModalTitle').textContent = 'Add Subject';
  document.getElementById('es_subjectEditId').value  = '';
  document.getElementById('es_subjectName').value    = '';
  document.getElementById('es_subjectLessons').value = 5;
  document.getElementById('es_subjectPriority').value= 'core';
  document.getElementById('es_subjectDouble').value  = 'yes';
  es_buildColorPicker();
  const sel = document.getElementById('es_subjectGrades');
  sel.innerHTML = ES_GRADE_LIST.map(g => `<option value="${g}" selected>${g}</option>`).join('');
  es_openModal('subjectModal');
}
function es_saveSubject() {
  const id           = document.getElementById('es_subjectEditId').value || es_uid();
  const name         = document.getElementById('es_subjectName').value.trim();
  if (!name) { es_toast('Please enter a subject name','warning'); return; }
  const lessonsPerWeek = parseInt(document.getElementById('es_subjectLessons').value);
  const priority     = document.getElementById('es_subjectPriority').value;
  const double_      = document.getElementById('es_subjectDouble').value === 'yes';
  const color        = es_getSelectedColor();
  const gradesEl     = document.getElementById('es_subjectGrades');
  const grades       = Array.from(gradesEl.selectedOptions).map(o => o.value);
  const obj = {id, name, lessonsPerWeek, priority, double: double_, color, grades};
  const idx = es_state.subjects.findIndex(s => s.id === id);
  if (idx >= 0) es_state.subjects[idx] = obj; else es_state.subjects.push(obj);
  es_closeModal('subjectModal');
  es_renderSubjects(); es_updateBadges(); es_updateDashboard(); es_saveData();
  es_toast('✅ Subject saved!','success');
}
function es_editSubject(id) {
  const s = es_state.subjects.find(x => x.id === id); if (!s) return;
  document.getElementById('es_subjectModalTitle').textContent = 'Edit Subject';
  document.getElementById('es_subjectEditId').value   = s.id;
  document.getElementById('es_subjectName').value     = s.name;
  document.getElementById('es_subjectLessons').value  = s.lessonsPerWeek;
  document.getElementById('es_subjectPriority').value = s.priority;
  document.getElementById('es_subjectDouble').value   = s.double ? 'yes' : 'no';
  es_buildColorPicker(s.color);
  const sel = document.getElementById('es_subjectGrades');
  sel.innerHTML = ES_GRADE_LIST.map(g => `<option value="${g}" ${(s.grades||[]).includes(g)?'selected':''}>${g}</option>`).join('');
  es_openModal('subjectModal');
}
function es_deleteSubject(id) {
  if (!confirm('Delete this subject?')) return;
  es_state.subjects = es_state.subjects.filter(s => s.id !== id);
  es_renderSubjects(); es_updateBadges(); es_saveData();
  es_toast('🗑️ Subject deleted','warning');
}
function es_renderSubjects() {
  const tbody = document.getElementById('es_subjectTableBody');
  if (!tbody) return;
  if (es_state.subjects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📚</div><h3>No subjects yet</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = es_state.subjects.map(s => `
    <tr>
      <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${s.color};"></span></td>
      <td><strong>${s.name}</strong></td>
      <td>${s.lessonsPerWeek}/wk</td>
      <td><span class="badge ${s.priority==='core'?'badge-blue':'badge-orange'}">${s.priority}</span></td>
      <td><span class="badge ${s.double?'badge-green':'badge-red'}">${s.double?'Yes':'No'}</span></td>
      <td style="font-size:11px;color:var(--text2)">${(s.grades||[]).join(', ')}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editSubject('${s.id}')">✏️</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteSubject('${s.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

/* =====================================================
   TEACHERS
===================================================== */
function es_openTeacherModal() {
  document.getElementById('es_teacherModalTitle').textContent = 'Add Teacher';
  document.getElementById('es_teacherEditId').value  = '';
  document.getElementById('es_teacherName').value    = '';
  document.getElementById('es_teacherMaxDay').value  = 6;
  document.getElementById('es_teacherMaxWeek').value = 25;
  document.getElementById('es_teacherSubjects').innerHTML =
    es_state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  es_buildAvailGrid(null);
  es_openModal('teacherModal');
}
function es_buildAvailGrid(teacher) {
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const lessons = parseInt(es_state.school.lessonsPerDay) || 9;
  const grid    = document.getElementById('es_teacherAvailGrid');
  let html = '<div class="avail-row"><div class="avail-day-label"></div>';
  for (let p = 1; p <= lessons; p++) html += `<div class="avail-cell" style="background:var(--bg3);color:var(--text3);font-size:9px;font-weight:700;">${p}</div>`;
  html += '</div>';
  for (let d = 0; d < days; d++) {
    html += `<div class="avail-row"><div class="avail-day-label">${ES_DAY_NAMES[d]}</div>`;
    for (let p = 1; p <= lessons; p++) {
      const avail = teacher ? (teacher.availability?.[d]?.[p] !== false) : true;
      html += `<div class="avail-cell ${avail?'available':''}" data-day="${d}" data-period="${p}" onclick="toggleAvail(this)">${avail?'✓':''}</div>`;
    }
    html += '</div>';
  }
  grid.innerHTML = html;
}
function es_toggleAvail(el) {
  el.classList.toggle('available');
  el.textContent = el.classList.contains('available') ? '✓' : '';
}
function es_getAvailFromGrid() {
  const avail = {};
  document.querySelectorAll('#teacherAvailGrid .avail-cell[data-day]').forEach(el => {
    const d = el.dataset.day, p = el.dataset.period;
    if (!avail[d]) avail[d] = {};
    avail[d][p] = el.classList.contains('available');
  });
  return avail;
}
function es_saveTeacher() {
  const id         = document.getElementById('es_teacherEditId').value || es_uid();
  const name       = document.getElementById('es_teacherName').value.trim();
  if (!name) { es_toast('Please enter teacher name','warning'); return; }
  const maxPerDay  = parseInt(document.getElementById('es_teacherMaxDay').value);
  const maxPerWeek = parseInt(document.getElementById('es_teacherMaxWeek').value);
  const subjects   = Array.from(document.getElementById('es_teacherSubjects').selectedOptions).map(o => o.value);
  const availability = es_getAvailFromGrid();
  const obj = {id, name, subjects, maxPerDay, maxPerWeek, availability};
  const idx = es_state.teachers.findIndex(t => t.id === id);
  if (idx >= 0) es_state.teachers[idx] = obj; else es_state.teachers.push(obj);
  es_closeModal('teacherModal');
  es_renderTeachers(); es_updateBadges(); es_updateDashboard(); es_saveData();
  es_toast('✅ Teacher saved!','success');
}
function es_editTeacher(id) {
  const t = es_state.teachers.find(x => x.id === id); if (!t) return;
  document.getElementById('es_teacherModalTitle').textContent = 'Edit Teacher';
  document.getElementById('es_teacherEditId').value   = t.id;
  document.getElementById('es_teacherName').value     = t.name;
  document.getElementById('es_teacherMaxDay').value   = t.maxPerDay;
  document.getElementById('es_teacherMaxWeek').value  = t.maxPerWeek;
  document.getElementById('es_teacherSubjects').innerHTML =
    es_state.subjects.map(s => `<option value="${s.id}" ${(t.subjects||[]).includes(s.id)?'selected':''}>${s.name}</option>`).join('');
  es_buildAvailGrid(t);
  es_openModal('teacherModal');
}
function es_deleteTeacher(id) {
  if (!confirm('Delete this teacher?')) return;
  es_state.teachers = es_state.teachers.filter(t => t.id !== id);
  es_renderTeachers(); es_updateBadges(); es_saveData();
  es_toast('🗑️ Teacher deleted','warning');
}
function es_renderTeachers() {
  const tbody = document.getElementById('es_teacherTableBody');
  if (!tbody) return;
  if (es_state.teachers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👨‍🏫</div><h3>No teachers yet</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = es_state.teachers.map(t => {
    const subNames = (t.subjects||[]).map(sid => {
      const s = es_state.subjects.find(x => x.id === sid);
      return s ? `<span class="badge badge-blue" style="margin:1px;">${s.name}</span>` : '';
    }).join('');
    let load = 0;
    Object.values(es_state.timetable).forEach(ct => {
      Object.values(ct).forEach(day => {
        Object.values(day).forEach(slot => { if (slot?.teacherId === t.id) load++; });
      });
    });
    const pct = Math.min(100, Math.round(load/(t.maxPerWeek||25)*100));
    const col = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
    return `<tr>
      <td><strong>${t.name}</strong></td>
      <td>${subNames||'<span style="color:var(--text3)">None</span>'}</td>
      <td>${t.maxPerDay}</td>
      <td>${t.maxPerWeek}</td>
      <td>
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px;">${load}/${t.maxPerWeek} lessons</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div>
      </td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editTeacher('${t.id}')">✏️</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteTeacher('${t.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

/* =====================================================
   ROOMS
===================================================== */
function es_openRoomModal() {
  document.getElementById('es_roomModalTitle').textContent = 'Add Room / Lab';
  document.getElementById('es_roomEditId').value   = '';
  document.getElementById('es_roomName').value     = '';
  document.getElementById('es_roomType').value     = 'Classroom';
  document.getElementById('es_roomCapacity').value = 40;
  document.getElementById('es_roomSubjects').innerHTML =
    es_state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  es_openModal('roomModal');
}
function es_saveRoom() {
  const id       = document.getElementById('es_roomEditId').value || es_uid();
  const name     = document.getElementById('es_roomName').value.trim();
  if (!name) { es_toast('Please enter room name','warning'); return; }
  const type     = document.getElementById('es_roomType').value;
  const capacity = parseInt(document.getElementById('es_roomCapacity').value);
  const subjects = Array.from(document.getElementById('es_roomSubjects').selectedOptions).map(o => o.value);
  const obj = {id, name, type, capacity, subjects};
  const idx = es_state.rooms.findIndex(r => r.id === id);
  if (idx >= 0) es_state.rooms[idx] = obj; else es_state.rooms.push(obj);
  es_closeModal('roomModal');
  es_renderRooms(); es_updateBadges(); es_saveData();
  es_toast('✅ Room saved!','success');
}
function es_editRoom(id) {
  const r = es_state.rooms.find(x => x.id === id); if (!r) return;
  document.getElementById('es_roomModalTitle').textContent = 'Edit Room';
  document.getElementById('es_roomEditId').value   = r.id;
  document.getElementById('es_roomName').value     = r.name;
  document.getElementById('es_roomType').value     = r.type;
  document.getElementById('es_roomCapacity').value = r.capacity;
  document.getElementById('es_roomSubjects').innerHTML =
    es_state.subjects.map(s => `<option value="${s.id}" ${(r.subjects||[]).includes(s.id)?'selected':''}>${s.name}</option>`).join('');
  es_openModal('roomModal');
}
function es_deleteRoom(id) {
  if (!confirm('Delete this room?')) return;
  es_state.rooms = es_state.rooms.filter(r => r.id !== id);
  es_renderRooms(); es_updateBadges(); es_saveData();
  es_toast('🗑️ Room deleted','warning');
}
function es_renderRooms() {
  const tbody = document.getElementById('es_roomTableBody');
  if (!tbody) return;
  if (es_state.rooms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🚪</div><h3>No rooms yet</h3><p>Rooms are optional</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = es_state.rooms.map(r => {
    const subNames = (r.subjects||[]).map(sid => {
      const s = es_state.subjects.find(x => x.id === sid);
      return s ? `<span class="badge badge-cyan">${s.name}</span>` : '';
    }).join(' ');
    return `<tr>
      <td><strong>${r.name}</strong></td>
      <td><span class="badge badge-purple">${r.type}</span></td>
      <td>${r.capacity}</td>
      <td>${subNames||'—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editRoom('${r.id}')">✏️</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteRoom('${r.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

/* =====================================================
   GENERATE TIMETABLE — Enhanced Greedy Algorithm
===================================================== */
function es_buildGenClassSelector() {
  const container = document.getElementById('es_genClassSelector');
  if (es_state.classes.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:13px;">No classes added yet. Add classes first.</div>';
    return;
  }
  container.innerHTML = es_state.classes.map(c => `
    <div class="class-chip selected" data-class-id="${c.id}">
      ${c.grade}${c.stream?' '+c.stream:''}
    </div>
  `).join('');
  container.querySelectorAll('.class-chip').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('selected'));
  });
}
function es_selectAllClasses()   { document.querySelectorAll('.class-chip').forEach(c => c.classList.add('selected')); }
function es_deselectAllClasses() { document.querySelectorAll('.class-chip').forEach(c => c.classList.remove('selected')); }

async function es_generateTimetable() {
  const selectedClassIds = Array.from(document.querySelectorAll('.class-chip.selected')).map(c => c.dataset.classId);
  if (selectedClassIds.length === 0) { es_toast('Select at least one class','warning'); return; }
  if (es_state.subjects.length === 0)   { es_toast('Add subjects first','warning'); return; }
  if (es_state.teachers.length === 0)   { es_toast('Add teachers first','warning'); return; }

  const btn = document.getElementById('es_genBtn');
  btn.disabled = true; btn.textContent = '⏳ Generating…';
  document.getElementById('es_genLog').innerHTML = '';
  es_setProgress(0);
  es_genLog('🚀 Starting generation…');

  const days      = parseInt(es_state.school.daysPerWeek) || 5;
  const periods   = parseInt(es_state.school.lessonsPerDay) || 9;
  const prioritize= document.getElementById('es_genPrioritize').value;
  const respectLocked = document.getElementById('es_genRespectLocked').checked;
  const evenDist  = document.getElementById('es_genEvenDist').checked;

  // Build teacher-subject map from both teacher.subjects[] AND stream assignments
  const teacherForSubject = {};
  es_state.teachers.forEach(t => {
    (t.subjects||[]).forEach(sid => {
      if (!teacherForSubject[sid]) teacherForSubject[sid] = [];
      if (!teacherForSubject[sid].includes(t.id)) teacherForSubject[sid].push(t.id);
    });
  });
  // Also add teachers from stream assignments stored during sync
  if (es_state._streamAssignments) {
    es_state._streamAssignments.forEach(a => {
      if (!a.teacherId || !a.subjectId) return;
      if (!teacherForSubject[a.subjectId]) teacherForSubject[a.subjectId] = [];
      if (!teacherForSubject[a.subjectId].includes(a.teacherId)) teacherForSubject[a.subjectId].push(a.teacherId);
    });
  }

  // Global teacher usage across classes: {tid: {day: {period: classId}}}
  const teacherUsage = {};
  es_state.teachers.forEach(t => { teacherUsage[t.id] = {}; });
  // Also initialise any teacher referenced in subjects but missing from teachers list
  Object.values(teacherForSubject).forEach(tids => {
    tids.forEach(tid => { if (!teacherUsage[tid]) teacherUsage[tid] = {}; });
  });

  // Room usage
  const roomUsage = {};
  es_state.rooms.forEach(r => { roomUsage[r.id] = {}; });

  // Pre-register locked slots into teacher/room usage
  selectedClassIds.forEach(classId => {
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const slot = es_state.timetable[classId]?.[d]?.[p];
        if (slot?.locked && respectLocked && slot.teacherId) {
          if (!teacherUsage[slot.teacherId][d]) teacherUsage[slot.teacherId][d] = {};
          teacherUsage[slot.teacherId][d][p] = classId;
        }
        if (slot?.locked && respectLocked && slot.roomId) {
          if (!roomUsage[slot.roomId][d]) roomUsage[slot.roomId][d] = {};
          roomUsage[slot.roomId][d][p] = true;
        }
      }
    }
  });

  for (let di = 0; di < selectedClassIds.length; di++) {
    const classId = selectedClassIds[di];
    const cls     = es_state.classes.find(c => c.id === classId);
    if (!cls) continue;

    es_genLog(`📋 Scheduling ${cls.grade}${cls.stream?' '+cls.stream:''}…`);
    es_setProgress(Math.round((di / selectedClassIds.length) * 85));

    // Init class timetable
    if (!es_state.timetable[classId]) es_state.timetable[classId] = {};
    for (let d = 0; d < days; d++) {
      if (!es_state.timetable[classId][d]) es_state.timetable[classId][d] = {};
    }

    // Clear non-locked slots
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const existing = es_state.timetable[classId][d]?.[p];
        if (!existing || !existing.locked || !respectLocked) {
          es_state.timetable[classId][d][p] = null;
        }
      }
    }

    // Build lessons to schedule
    const lessons = [];
    es_state.subjects.forEach(sub => {
      // Only filter by grade if grades array is non-empty
      if (sub.grades && sub.grades.length > 0 && !sub.grades.includes(cls.grade)) return;
      const lpw = parseInt(sub.lessonsPerWeek) || 4; // default 4 if missing/zero
      const teacherIds = teacherForSubject[sub.id] || [];

      // Also pull in stream-assigned teacher for this class (highest priority)
      const streamTeacher = es_getStreamAssignedTeacher(cls, sub.id);
      const mergedTeachers = streamTeacher
        ? [streamTeacher.id, ...teacherIds.filter(id => id !== streamTeacher.id)]
        : teacherIds;
      const teachers = mergedTeachers;
      for (let i = 0; i < lpw; i++) {
        lessons.push({
          subjectId: sub.id,
          teachers,
          priority: sub.priority || 'core',
          isDouble: sub.double && (i % 2 === 1)
        });
      }
    });

    // Sort: core first
    lessons.sort((a, b) => {
      if (a.priority === 'core' && b.priority !== 'core') return -1;
      if (b.priority === 'core' && a.priority !== 'core') return 1;
      return 0;
    });

    // Build available slots list (excluding locked)
    let slots = [];
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const existing = es_state.timetable[classId][d]?.[p];
        if (existing?.locked && respectLocked) continue;
        slots.push({day: d, period: p});
      }
    }

    // Sort slots based on strategy
    if (prioritize === 'morning') {
      // Core subjects → earlier periods; optional → spread
      slots.sort((a, b) => a.period !== b.period ? a.period - b.period : a.day - b.day);
    } else {
      // Spread evenly: interleave by day
      slots.sort((a, b) => a.day !== b.day ? a.day - b.day : a.period - b.period);
    }

    // Even distribution: shuffle so we don't cluster subject on one day
    // Track subject-per-day used
    const subDayCount = {}; // subjectId -> {day: count}

    let placed = 0;

    for (const lesson of lessons) {
      const sid = lesson.subjectId;
      if (!subDayCount[sid]) subDayCount[sid] = {};

      let scheduled = false;
      let triedSlots = [...slots];

      // If even distribution, prefer days where this subject has fewest lessons
      if (evenDist) {
        triedSlots.sort((a, b) => {
          const ca = subDayCount[sid][a.day] || 0;
          const cb = subDayCount[sid][b.day] || 0;
          if (ca !== cb) return ca - cb;
          return a.period - b.period;
        });
      }

      // For core+morning prioritize, put them in early periods
      if (prioritize === 'morning' && lesson.priority === 'core') {
        triedSlots.sort((a, b) => a.period !== b.period ? a.period - b.period : a.day - b.day);
      }

      for (const slot of triedSlots) {
        const {day, period} = slot;
        const existing = es_state.timetable[classId][day]?.[period];
        if (existing && existing.subjectId) continue; // slot taken

        // Avoid putting same subject twice on same day unless needed
        if (evenDist && (subDayCount[sid][day] || 0) > 0) {
          // Only allow if no other day available
          const daysWithoutThisSubject = Array.from({length: days}, (_,d) => d)
            .filter(d => !(subDayCount[sid][d] > 0));
          if (daysWithoutThisSubject.length > 0 && daysWithoutThisSubject.includes(day) === false) continue;
        }

        // Find available teacher
        let teacherId = null;
        const shuffledTeachers = [...lesson.teachers].sort(() => Math.random() - .5);
        for (const tid of shuffledTeachers) {
          const t = es_state.teachers.find(x => x.id === tid);
          if (!t) continue;
          if (t.availability?.[day]?.[String(period+1)] === false) continue;
          if (teacherUsage[tid]?.[day]?.[period]) continue;
          const dayLoad  = Object.values(teacherUsage[tid]?.[day] || {}).filter(Boolean).length;
          if (dayLoad >= t.maxPerDay) continue;
          const weekLoad = Object.values(teacherUsage[tid]||{})
            .reduce((s, dObj) => s + Object.values(dObj).filter(Boolean).length, 0);
          if (weekLoad >= t.maxPerWeek) continue;
          teacherId = tid; break;
        }

        // Find room
        let roomId = null;
        const compatRooms = es_state.rooms.filter(r => (r.subjects||[]).includes(sid));
        for (const r of compatRooms) {
          if (!roomUsage[r.id]?.[day]?.[period]) { roomId = r.id; break; }
        }

        // Place lesson
        es_state.timetable[classId][day][period] = {
          subjectId: sid, teacherId, roomId, locked: false
        };

        // Mark teacher usage
        if (teacherId) {
          if (!teacherUsage[teacherId]) teacherUsage[teacherId] = {};
          if (!teacherUsage[teacherId][day]) teacherUsage[teacherId][day] = {};
          teacherUsage[teacherId][day][period] = classId;
        }
        if (roomId) {
          if (!roomUsage[roomId][day]) roomUsage[roomId][day] = {};
          roomUsage[roomId][day][period] = true;
        }

        subDayCount[sid][day] = (subDayCount[sid][day] || 0) + 1;
        placed++; scheduled = true;
        break;
      }

      if (!scheduled) {
        const sub = es_state.subjects.find(s => s.id === sid);
        es_genLog(`⚠️ Could not place: ${sub?.name||'Unknown'} for ${cls.grade}${cls.stream?' '+cls.stream:''}`);
      }
    }

    const totalLessons = lessons.length;
    es_genLog(`✅ ${cls.grade}${cls.stream?' '+cls.stream:''}: ${placed}/${totalLessons} lessons placed`);
    await es_sleep(20);
  }

  es_setProgress(100);
  es_genLog('🔍 Running collision resolution pass…');

  // ── Post-generation collision resolver ──────────────────────────────────
  // Scan every (day, period) across all selected classes. If more than one
  // class has the SAME teacher assigned at that slot, keep the first one and
  // remove the teacher assignment from the rest (they'll show as "no teacher").
  {
    const resolvedCount = { conflicts: 0 };
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const seen = {}; // teacherId → first classId that owns it
        for (const classId of selectedClassIds) {
          const slot = es_state.timetable[classId]?.[d]?.[p];
          if (!slot?.teacherId) continue;
          if (seen[slot.teacherId]) {
            // Collision: clear the teacher from this later-processed class slot
            const teacher = es_state.teachers.find(t => t.id === slot.teacherId);
            const cls2    = es_state.classes.find(c => c.id === classId);
            es_genLog(`🔧 Fixed collision: ${teacher?.name||slot.teacherId} was in 2 classes on ${ES_DAY_NAMES[d]} P${p+1}. Cleared from ${cls2?.grade||classId}.`);
            slot.teacherId = null;
            resolvedCount.conflicts++;
          } else {
            seen[slot.teacherId] = classId;
          }
        }
      }
    }
    if (resolvedCount.conflicts === 0) {
      es_genLog('✅ No teacher collisions found.');
    } else {
      es_genLog(`⚠️ Resolved ${resolvedCount.conflicts} teacher collision(s). Consider adding more teachers.`);
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  es_genLog('🎉 Generation complete! Check "View Timetable" to review.');
  es_saveData(); es_updateDashboard(); es_updateBadges();
  es_runConflictCheck();
  btn.disabled = false; btn.textContent = '⚡ Generate Timetable';
  es_toast('🎉 Timetable generated!','success');
  es_populateViewSelects();
}

function es_clearTimetable() {
  if (!confirm('Clear all generated timetable data?')) return;
  es_state.timetable = {};
  es_saveData(); es_updateDashboard(); es_updateBadges();
  es_toast('🗑️ Timetable cleared','warning');
}
function es_genLog(msg) {
  const el = document.getElementById('es_genLog');
  el.innerHTML += `<div>${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}
function es_setProgress(pct) {
  const el = document.getElementById('es_genProgress');
  if (el) el.style.width = pct + '%';
}
function es_sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* =====================================================
   VIEW TIMETABLE
===================================================== */
function es_populateViewSelects() {
  const cs = document.getElementById('es_viewClassSelect');
  const ts = document.getElementById('es_viewTeacherSelect');
  cs.innerHTML = '<option value="">Select class…</option>' +
    es_state.classes.map(c => `<option value="${c.id}">${c.grade}${c.stream?' '+c.stream:''}</option>`).join('');
  ts.innerHTML = '<option value="">Teacher view…</option>' +
    es_state.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

// Helper: build ordered column list including break/lunch slots
function es_buildColList(periods) {
  const breaks = (es_state.school.breaks || []).slice().sort((a,b) => a.after - b.after);
  const cols = []; // {type:'day'|'period'|'break', periodIndex?, breakObj?}
  cols.push({type:'day'});
  for (let p = 0; p < periods; p++) {
    cols.push({type:'period', periodIndex:p});
    const brk = breaks.find(b => b.after === p + 1);
    if (brk) cols.push({type:'break', breakObj:brk});
  }
  return cols;
}

function es_renderTimetableView() {
  const classId = document.getElementById('es_viewClassSelect').value;
  if (!classId) { es_renderEmptyView(); return; }
  document.getElementById('es_viewTeacherSelect').value = '';
  const cls = es_state.classes.find(c => c.id === classId);
  if (!cls) return;
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;
  const classTT = es_state.timetable[classId] || {};
  const cols    = es_buildColList(periods);

  es_renderLegend();
  document.getElementById('es_viewLegendCard').style.display = '';

  // Inject print-only header (hidden on screen via display:none, revealed by @media print)
  const _legendForPrint = es_state.subjects.map(s =>
    `<span class="es-print-legend-item"><span class="es-print-legend-dot" style="background:${s.color||'#4f7cff'};"></span>${s.name}</span>`
  ).join('');
  const _printHdr = document.getElementById('es_printHeader');
  if (_printHdr) {
    _printHdr.innerHTML = `
      <div class="es-print-title">${es_state.school.name||'School'} \u2014 ${cls.grade}${cls.stream?' '+cls.stream:''} \u2014 Weekly Teaching Timetable</div>
      <div class="es-print-meta">Printed: ${new Date().toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} &nbsp;|\u00a0 ${parseInt(es_state.school.lessonsPerDay)||9} periods/day \u00a0|\u00a0 Lesson duration: ${es_state.school.lessonDuration||40}min</div>
      <div class="es-print-legend">${_legendForPrint}</div>`;
  }

  // Build grid-template-columns: day col | period cols | break cols (narrow)
  const colTemplate = cols.map(c => c.type==='day' ? 'auto' : c.type==='break' ? '52px' : '1fr').join(' ');
  const container = document.getElementById('es_timetableViewContainer');
  let html = `<div style="font-size:17px;font-weight:800;margin-bottom:4px;">${cls.grade}${cls.stream?' '+cls.stream:''} \u2014 Weekly Timetable</div>`;
  html += `<div style="font-size:11px;color:var(--text2);margin-bottom:12px;">${es_state.school.name||''} &nbsp;|\u00a0 ${parseInt(es_state.school.lessonsPerDay)||9} periods/day &nbsp;|\u00a0 ${es_state.school.lessonDuration||40}min lessons</div>`;
  html += `<div class="timetable-container"><div class="tt-grid" style="display:grid;grid-template-columns:${colTemplate};">`;

  // Header row
  for (const col of cols) {
    if (col.type === 'day') {
      html += `<div class="tt-cell tt-cell-header" style="min-width:72px;">Day</div>`;
    } else if (col.type === 'break') {
      const isLunch = /lunch/i.test(col.breakObj.label);
      html += `<div class="tt-cell tt-break-col-hdr ${isLunch?'tt-lunch-hdr':'tt-break-hdr'}">${isLunch?'🍽':'☕'}<br><span>${col.breakObj.label}</span><br><span style="font-size:9px;opacity:.7">${col.breakObj.duration}min</span></div>`;
    } else {
      html += `<div class="tt-cell tt-cell-header">${col.periodIndex+1}<br><span style="font-size:9px;font-weight:400;color:var(--text3);">${es_getPeriodTime(col.periodIndex)}</span></div>`;
    }
  }

  // Data rows
  for (let d = 0; d < days; d++) {
    for (const col of cols) {
      if (col.type === 'day') {
        html += `<div class="tt-cell tt-day-label">${ES_DAY_FULL[d].substring(0,3)}<br><span style="font-size:9px;font-weight:400;">${ES_DAY_FULL[d].substring(3)}</span></div>`;
      } else if (col.type === 'break') {
        const isLunch = /lunch/i.test(col.breakObj.label);
        html += `<div class="tt-cell tt-break-col ${isLunch?'tt-lunch-col':''}"><div class="tt-break-inner">${isLunch?'🍽':'☕'}</div></div>`;
      } else {
        const p    = col.periodIndex;
        const slot = classTT[d]?.[p];
        if (slot?.subjectId) {
          const sub     = es_state.subjects.find(s => s.id === slot.subjectId);
          const teacher = slot.teacherId ? es_state.teachers.find(t => t.id === slot.teacherId) : null;
          const room    = slot.roomId    ? es_state.rooms.find(r => r.id === slot.roomId)       : null;
          const color   = sub?.color || '#4f7cff';
          html += `<div class="tt-cell" style="padding:0;">
            <div class="tt-lesson ${slot.locked?'tt-locked':''}"
                 style="--lesson-color:${color};"
                 draggable="true"
                 ondragstart="es_dragStart(event,'${classId}',${d},${p})"
                 ondragover="event.preventDefault();this.closest('.tt-cell').classList.add('drag-over')"
                 ondragleave="this.closest('.tt-cell').classList.remove('drag-over')"
                 ondrop="es_dragDrop(event,'${classId}',${d},${p})">
              <div class="lesson-subject">${sub?.name||'?'}</div>
              <div class="lesson-teacher">${teacher?teacher.name:'⚠ No teacher'}</div>
              ${room?`<div class="lesson-room">📍${room.name}</div>`:''}
              <div class="lesson-actions">
                <button class="lesson-action-btn" onclick="es_openLessonEdit('${classId}',${d},${p})" title="Edit">✏️</button>
                <button class="lesson-action-btn" onclick="es_toggleLock('${classId}',${d},${p})" title="${slot.locked?'Unlock':'Lock'}">${slot.locked?'🔓':'🔒'}</button>
              </div>
            </div>
          </div>`;
        } else {
          html += `<div class="tt-cell tt-empty"
                        ondragover="event.preventDefault();this.classList.add('drag-over')"
                        ondragleave="this.classList.remove('drag-over')"
                        ondrop="es_dragDrop(event,'${classId}',${d},${p})"
                        onclick="es_openLessonEdit('${classId}',${d},${p})">
                     <div class="tt-empty-inner">+ Add</div>
                   </div>`;
        }
      }
    }
  }
  html += '</div></div>';
  container.innerHTML = html;
}

function es_renderTeacherView() {
  const teacherId = document.getElementById('es_viewTeacherSelect').value;
  if (!teacherId) return;
  document.getElementById('es_viewClassSelect').value = '';
  const teacher = es_state.teachers.find(t => t.id === teacherId);
  if (!teacher) return;
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;

  const teacherGrid = {};
  for (let d = 0; d < days; d++) teacherGrid[d] = {};
  es_state.classes.forEach(cls => {
    const ct = es_state.timetable[cls.id] || {};
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const slot = ct[d]?.[p];
        if (slot?.teacherId === teacherId) {
          teacherGrid[d][p] = {...slot, className: `${cls.grade}${cls.stream?' '+cls.stream:''}`};
        }
      }
    }
  });

  es_renderLegend();
  document.getElementById('es_viewLegendCard').style.display = '';
  const container   = document.getElementById('es_timetableViewContainer');
  const cols        = es_buildColList(periods);
  const colTemplate = cols.map(c => c.type==='day' ? 'auto' : c.type==='break' ? '52px' : '1fr').join(' ');
  let html = `<div style="font-size:17px;font-weight:800;margin-bottom:14px;">👨‍🏫 ${teacher.name} — Teaching Schedule</div>`;
  html += `<div class="timetable-container"><div class="tt-grid" style="display:grid;grid-template-columns:${colTemplate};">`;
  // Header
  for (const col of cols) {
    if (col.type === 'day') {
      html += `<div class="tt-cell tt-cell-header">Day</div>`;
    } else if (col.type === 'break') {
      const isLunch = /lunch/i.test(col.breakObj.label);
      html += `<div class="tt-cell tt-break-col-hdr ${isLunch?'tt-lunch-hdr':'tt-break-hdr'}">${isLunch?'🍽':'☕'}<br><span>${col.breakObj.label}</span><br><span style="font-size:9px;opacity:.7">${col.breakObj.duration}min</span></div>`;
    } else {
      html += `<div class="tt-cell tt-cell-header">${col.periodIndex+1}<br><span style="font-size:9px;font-weight:400;color:var(--text3);">${es_getPeriodTime(col.periodIndex)}</span></div>`;
    }
  }
  // Rows
  for (let d = 0; d < days; d++) {
    for (const col of cols) {
      if (col.type === 'day') {
        html += `<div class="tt-cell tt-day-label">${ES_DAY_FULL[d].substring(0,3)}</div>`;
      } else if (col.type === 'break') {
        const isLunch = /lunch/i.test(col.breakObj.label);
        html += `<div class="tt-cell tt-break-col ${isLunch?'tt-lunch-col':''}"><div class="tt-break-inner">${isLunch?'🍽':'☕'}</div></div>`;
      } else {
        const p    = col.periodIndex;
        const slot = teacherGrid[d]?.[p];
        if (slot?.subjectId) {
          const sub = es_state.subjects.find(s => s.id === slot.subjectId);
          html += `<div class="tt-cell" style="padding:0;">
            <div class="tt-lesson" style="--lesson-color:${sub?.color||'#4f7cff'};">
              <div class="lesson-subject">${sub?.name||'?'}</div>
              <div class="lesson-teacher">${slot.className}</div>
            </div>
          </div>`;
        } else {
          html += `<div class="tt-cell" style="background:rgba(30,34,48,.6);"></div>`;
        }
      }
    }
  }
  html += '</div></div>';
  container.innerHTML = html;
}

function es_renderEmptyView() {
  document.getElementById('es_viewLegendCard').style.display = 'none';
  document.getElementById('es_timetableViewContainer').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📅</div>
      <h3>Select a class or teacher to view their timetable</h3>
      <p>Use the dropdowns above</p>
    </div>`;
}

function es_renderLegend() {
  const el = document.getElementById('es_subjectLegend');
  if (!el) return;
  el.innerHTML = es_state.subjects.map(s => `
    <div class="legend-item">
      <div class="legend-color" style="background:${s.color}"></div>
      <span>${s.name}</span>
    </div>
  `).join('');
}

/* =====================================================
   ALL CLASSES VIEW
===================================================== */
function es_renderAllClassView() {
  const container = document.getElementById('es_allClassContainer');
  const generated = es_state.classes.filter(c => es_state.timetable[c.id]);
  if (generated.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🗓️</div><h3>No timetables generated yet</h3><p>Go to Generate page first</p></div>';
    return;
  }
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;
  container.innerHTML = '';
  generated.forEach(cls => {
    const classTT   = es_state.timetable[cls.id] || {};
    const cols      = es_buildColList(periods);
    const colTpl    = cols.map(c => c.type==='day' ? 'auto' : c.type==='break' ? '36px' : '1fr').join(' ');
    let html = `<div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <div class="card-title">📚 ${cls.grade}${cls.stream?' '+cls.stream:''}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" onclick="viewClassDirect('${cls.id}')">📅 Full View</button>
          <button class="btn btn-sm btn-secondary" onclick="exportPDFClass('${cls.id}')">📄 PDF</button>
        </div>
      </div>
      <div class="timetable-container">
        <div class="tt-grid" style="display:grid;grid-template-columns:${colTpl};min-width:500px;">`;
    // Header
    for (const col of cols) {
      if (col.type === 'day') {
        html += `<div class="tt-cell tt-cell-header" style="font-size:10px;">Day</div>`;
      } else if (col.type === 'break') {
        const isLunch = /lunch/i.test(col.breakObj.label);
        html += `<div class="tt-cell tt-break-col-hdr ${isLunch?'tt-lunch-hdr':'tt-break-hdr'}" style="font-size:9px;">${isLunch?'🍽':'☕'}</div>`;
      } else {
        html += `<div class="tt-cell tt-cell-header" style="font-size:10px;">${col.periodIndex+1}</div>`;
      }
    }
    // Rows
    for (let d = 0; d < days; d++) {
      for (const col of cols) {
        if (col.type === 'day') {
          html += `<div class="tt-cell tt-day-label" style="font-size:10px;min-width:40px;">${ES_DAY_NAMES[d]}</div>`;
        } else if (col.type === 'break') {
          const isLunch = /lunch/i.test(col.breakObj.label);
          html += `<div class="tt-cell tt-break-col ${isLunch?'tt-lunch-col':''}" style="min-height:44px;"><div class="tt-break-inner" style="font-size:11px;">${isLunch?'🍽':'☕'}</div></div>`;
        } else {
          const p    = col.periodIndex;
          const slot = classTT[d]?.[p];
          if (slot?.subjectId) {
            const sub = es_state.subjects.find(s => s.id === slot.subjectId);
            html += `<div class="tt-cell" style="padding:0;"><div class="tt-lesson" style="--lesson-color:${sub?.color||'#4f7cff'};min-height:44px;">
              <div class="lesson-subject" style="font-size:10px;">${sub?.name?.substring(0,10)||'?'}</div>
            </div></div>`;
          } else {
            html += `<div class="tt-cell" style="min-height:44px;"></div>`;
          }
        }
      }
    }
    html += '</div></div></div>';
    container.innerHTML += html;
  });
}

/* =====================================================
   PERIOD TIME HELPER
===================================================== */
function es_getPeriodTime(periodIndex) {
  const start  = es_state.school.schoolStart || '07:30';
  const dur    = parseInt(es_state.school.lessonDuration) || 40;
  const breaks = es_state.school.breaks || [];
  let [h, m] = start.split(':').map(Number);
  let totalMin = h * 60 + m;
  for (let i = 0; i < periodIndex; i++) {
    totalMin += dur;
    const brk = breaks.find(b => b.after === i + 1);
    if (brk) totalMin += brk.duration;
  }
  return `${es_pad(Math.floor(totalMin/60)%24)}:${es_pad(totalMin%60)}`;
}

/* =====================================================
   DRAG & DROP
===================================================== */
let es_dragData = null;
function es_dragStart(e, classId, day, period) {
  es_dragData = {classId, day, period};
  e.dataTransfer.effectAllowed = 'move';
}
function es_dragDrop(e, classId, day, period) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!es_dragData) return;
  const {classId: srcClass, day: srcDay, period: srcPeriod} = es_dragData;
  const src = es_state.timetable[srcClass]?.[srcDay]?.[srcPeriod];
  const dst = es_state.timetable[classId]?.[day]?.[period];
  if (src?.locked) { es_toast('🔒 Locked lessons cannot be moved','warning'); es_dragData=null; return; }
  if (!es_state.timetable[classId])          es_state.timetable[classId] = {};
  if (!es_state.timetable[classId][day])     es_state.timetable[classId][day] = {};
  if (!es_state.timetable[srcClass])         es_state.timetable[srcClass] = {};
  if (!es_state.timetable[srcClass][srcDay]) es_state.timetable[srcClass][srcDay] = {};
  es_state.timetable[classId][day][period]       = src || null;
  es_state.timetable[srcClass][srcDay][srcPeriod] = dst || null;
  es_dragData = null;
  es_saveData(); es_runConflictCheck(); es_renderTimetableView();
}

/* =====================================================
   LESSON EDIT MODAL
===================================================== */
function es_openLessonEdit(classId, day, period) {
  const cls = es_state.classes.find(c => c.id === classId);
  document.getElementById('es_lessonEditClass').value  = classId;
  document.getElementById('es_lessonEditDay').value    = day;
  document.getElementById('es_lessonEditPeriod').value = period;
  document.getElementById('es_lessonEditMeta').textContent =
    `${cls?.grade||''}${cls?.stream?' '+cls.stream:''} — ${ES_DAY_FULL[day]}, Period ${parseInt(period)+1} (${es_getPeriodTime(parseInt(period))})`;

  document.getElementById('es_lessonEditSubject').innerHTML =
    '<option value="">— Empty —</option>' + es_state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('es_lessonEditTeacher').innerHTML =
    '<option value="">— No Teacher —</option>' + es_state.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  document.getElementById('es_lessonEditRoom').innerHTML =
    '<option value="">— No Room —</option>' + es_state.rooms.map(r => `<option value="${r.id}">${r.name} (${r.type})</option>`).join('');

  const slot = es_state.timetable[classId]?.[day]?.[period];
  if (slot) {
    document.getElementById('es_lessonEditSubject').value = slot.subjectId || '';
    document.getElementById('es_lessonEditTeacher').value = slot.teacherId || '';
    document.getElementById('es_lessonEditRoom').value    = slot.roomId    || '';
    document.getElementById('es_lessonEditLocked').checked = !!slot.locked;
  } else {
    document.getElementById('es_lessonEditSubject').value = '';
    document.getElementById('es_lessonEditTeacher').value = '';
    document.getElementById('es_lessonEditRoom').value    = '';
    document.getElementById('es_lessonEditLocked').checked = false;
  }
  es_openModal('lessonEditModal');
}
function es_saveLessonEdit() {
  const classId   = document.getElementById('es_lessonEditClass').value;
  const day       = document.getElementById('es_lessonEditDay').value;
  const period    = document.getElementById('es_lessonEditPeriod').value;
  const subjectId = document.getElementById('es_lessonEditSubject').value;
  const teacherId = document.getElementById('es_lessonEditTeacher').value;
  const roomId    = document.getElementById('es_lessonEditRoom').value;
  const locked    = document.getElementById('es_lessonEditLocked').checked;

  if (!es_state.timetable[classId]) es_state.timetable[classId] = {};
  if (!es_state.timetable[classId][day]) es_state.timetable[classId][day] = {};
  es_state.timetable[classId][day][period] = subjectId
    ? {subjectId, teacherId: teacherId||null, roomId: roomId||null, locked}
    : null;
  es_closeModal('lessonEditModal');
  es_saveData(); es_runConflictCheck(); es_renderTimetableView();
  es_toast('✅ Lesson updated','success');
}
function es_clearLesson() {
  const classId = document.getElementById('es_lessonEditClass').value;
  const day     = document.getElementById('es_lessonEditDay').value;
  const period  = document.getElementById('es_lessonEditPeriod').value;
  if (es_state.timetable[classId]?.[day]) {
    es_state.timetable[classId][day][period] = null;
  }
  es_closeModal('lessonEditModal');
  es_saveData(); es_runConflictCheck(); es_renderTimetableView();
  es_toast('🗑️ Lesson cleared','warning');
}
function es_toggleLock(classId, day, period) {
  const slot = es_state.timetable[classId]?.[day]?.[period];
  if (!slot) return;
  slot.locked = !slot.locked;
  es_saveData(); es_renderTimetableView();
  es_toast(slot.locked ? '🔒 Lesson locked' : '🔓 Lesson unlocked','info');
}

/* =====================================================
   CONFLICT DETECTION — Enhanced
===================================================== */
function es_runConflictCheck() {
  const conflicts = [];
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;

  // 1. Teacher clash
  for (let d = 0; d < days; d++) {
    for (let p = 0; p < periods; p++) {
      const teacherMap = {};
      es_state.classes.forEach(cls => {
        const slot = es_state.timetable[cls.id]?.[d]?.[p];
        if (!slot?.teacherId) return;
        if (teacherMap[slot.teacherId]) {
          const t  = es_state.teachers.find(x => x.id === slot.teacherId);
          const c1 = es_state.classes.find(x => x.id === teacherMap[slot.teacherId]);
          conflicts.push({
            type:'danger',
            msg:`👨‍🏫 Teacher clash: ${t?.name||'Unknown'} in ${c1?.grade} ${c1?.stream||''} AND ${cls.grade} ${cls.stream||''} on ${ES_DAY_NAMES[d]} P${p+1}`
          });
        } else { teacherMap[slot.teacherId] = cls.id; }
      });
    }
  }

  // 2. Room clash
  for (let d = 0; d < days; d++) {
    for (let p = 0; p < periods; p++) {
      const roomMap = {};
      es_state.classes.forEach(cls => {
        const slot = es_state.timetable[cls.id]?.[d]?.[p];
        if (!slot?.roomId) return;
        if (roomMap[slot.roomId]) {
          const r = es_state.rooms.find(x => x.id === slot.roomId);
          conflicts.push({type:'danger', msg:`🚪 Room clash: ${r?.name||'Room'} double-booked on ${ES_DAY_NAMES[d]} P${p+1}`});
        } else { roomMap[slot.roomId] = cls.id; }
      });
    }
  }

  // 3. Teacher overloaded
  es_state.teachers.forEach(t => {
    let weekLoad = 0;
    const dayLoads = {};
    for (let d = 0; d < days; d++) {
      dayLoads[d] = 0;
      es_state.classes.forEach(cls => {
        for (let p = 0; p < periods; p++) {
          const slot = es_state.timetable[cls.id]?.[d]?.[p];
          if (slot?.teacherId === t.id) { weekLoad++; dayLoads[d]++; }
        }
      });
    }
    if (weekLoad > t.maxPerWeek) {
      conflicts.push({type:'warning', msg:`⚠️ Teacher overloaded: ${t.name} has ${weekLoad} lessons/week (max: ${t.maxPerWeek})`});
    }
    for (let d = 0; d < days; d++) {
      if (dayLoads[d] > t.maxPerDay) {
        conflicts.push({type:'warning', msg:`⚠️ Daily overload: ${t.name} has ${dayLoads[d]} lessons on ${ES_DAY_NAMES[d]} (max: ${t.maxPerDay})`});
      }
    }
  });

  // 4. Insufficient periods
  es_state.classes.forEach(cls => {
    if (!es_state.timetable[cls.id]) return;
    const count = {};
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const slot = es_state.timetable[cls.id]?.[d]?.[p];
        if (slot?.subjectId) count[slot.subjectId] = (count[slot.subjectId]||0)+1;
      }
    }
    es_state.subjects.forEach(sub => {
      if (sub.grades && !sub.grades.includes(cls.grade)) return;
      const placed = count[sub.id] || 0;
      if (placed < sub.lessonsPerWeek) {
        conflicts.push({type:'warning',
          msg:`📚 Insufficient: ${sub.name} for ${cls.grade}${cls.stream?' '+cls.stream:''} needs ${sub.lessonsPerWeek} but ${placed} placed`
        });
      }
    });
  });

  // 5. No teacher assigned
  let noTeacherCount = 0;
  es_state.classes.forEach(cls => {
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        const slot = es_state.timetable[cls.id]?.[d]?.[p];
        if (slot?.subjectId && !slot.teacherId) noTeacherCount++;
      }
    }
  });
  if (noTeacherCount > 0) {
    conflicts.push({type:'warning', msg:`👤 ${noTeacherCount} lessons have no teacher assigned. Consider adding more teachers.`});
  }

  // Update UI
  const dangerCount = conflicts.filter(c => c.type === 'danger').length;
  document.getElementById('es_badge-conflicts').textContent = conflicts.length;
  document.getElementById('es_stat-conflicts').textContent  = conflicts.length;

  const el = document.getElementById('es_conflictList');
  if (el) {
    if (conflicts.length === 0) {
      el.innerHTML = `<div class="empty-state" style="padding:48px;">
        <div class="empty-icon">✅</div>
        <h3>No conflicts detected!</h3>
        <p>Your timetable looks clean.</p>
      </div>`;
    } else {
      const summary = `<div class="alert alert-info" style="margin-bottom:16px;">
        Found <strong>${conflicts.length}</strong> issue(s): 
        ${dangerCount} critical, ${conflicts.length - dangerCount} warnings.
      </div>`;
      el.innerHTML = summary + conflicts.map(c => `
        <div class="alert alert-${c.type==='danger'?'danger':'warning'}">
          <span>${c.msg}</span>
        </div>`).join('');
    }
  }

  // Dashboard warnings
  const dashWarn = document.getElementById('es_dash-warnings');
  if (dashWarn) {
    const top = conflicts.slice(0, 5);
    if (top.length === 0) {
      dashWarn.innerHTML = `<div class="empty-state" style="padding:16px;"><div class="empty-icon" style="font-size:24px;">✅</div><p>No warnings</p></div>`;
    } else {
      dashWarn.innerHTML = top.map(c => `
        <div class="alert alert-${c.type==='danger'?'danger':'warning'}" style="font-size:12px;padding:8px 12px;">
          ${c.msg}
        </div>`).join('');
    }
  }
  return conflicts;
}

/* =====================================================
   EXPORT — PDF
===================================================== */
function es_exportPDF() {
  const classId = document.getElementById('es_viewClassSelect').value;
  if (!classId) { es_toast('Select a class first','warning'); return; }
  es_exportPDFClass(classId);
}
function es_exportPDFClass(classId) {
  const cls = es_state.classes.find(c => c.id === classId);
  if (!cls) return;
  const schoolName = es_state.school.name || 'School';
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;
  if (!window.jspdf) { es_toast('PDF library not loaded','danger'); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  const pw  = doc.internal.pageSize.getWidth();   // 297mm
  const ph  = doc.internal.pageSize.getHeight();  // 210mm

  const cols       = es_buildColList(periods);
  const breakColW  = 12;
  const dayColW    = 20;
  const margin     = 8;
  const breakCount = cols.filter(c => c.type === 'break').length;
  const perCount   = cols.filter(c => c.type === 'period').length;
  const periodColW = (pw - margin*2 - dayColW - breakCount*breakColW) / perCount;
  const rowH       = 20;
  const headerRowH = 14;

  // White background
  doc.setFillColor(255,255,255); doc.rect(0,0,pw,ph,'F');

  // ── School header band ──
  doc.setFillColor(30,34,48); doc.rect(0,0,pw,22,'F');
  doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(232,234,240);
  const schoolStr = es_state.school.name || 'School';
  const classStr  = `${cls.grade}${cls.stream?' '+cls.stream:''}  \u2014  Weekly Teaching Timetable`;
  doc.text(schoolStr, margin, 9);
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(148,163,184);
  doc.text(classStr, margin, 16);
  doc.setFontSize(7); doc.setTextColor(100,116,139);
  const metaStr = `Printed: ${new Date().toLocaleDateString()}  \u2022  ${periods} periods/day  \u2022  ${es_state.school.lessonDuration||40}min lessons`;
  doc.text(metaStr, pw - margin, 9, {align:'right'});

  // ── Subject legend (small strip) ──
  let legendX = margin; const legendY = 25;
  doc.setFontSize(6);
  for (const sub of es_state.subjects) {
    const hex = (sub.color||'#4f7cff').replace('#','');
    const sr=parseInt(hex.substring(0,2),16),sg=parseInt(hex.substring(2,4),16),sb=parseInt(hex.substring(4,6),16);
    doc.setFillColor(sr,sg,sb); doc.roundedRect(legendX, legendY-2.5, 3, 3, 0.5, 0.5, 'F');
    doc.setTextColor(60,60,60);
    const label = sub.name.length > 14 ? sub.name.substring(0,13)+'\u2026' : sub.name;
    doc.text(label, legendX+4, legendY);
    legendX += doc.getTextWidth(label) + 8;
    if (legendX > pw - margin - 30) { legendX = margin; } // wrap if too long
  }

  // ── Build column x-positions ──
  const colXs = []; let cx = margin;
  for (const col of cols) {
    colXs.push(cx);
    cx += (col.type==='day' ? dayColW : col.type==='break' ? breakColW : periodColW);
  }

  let y = 30;

  // ── Header row ──
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]; const x0 = colXs[i];
    const cw  = col.type==='day' ? dayColW : col.type==='break' ? breakColW : periodColW;
    if (col.type==='day') {
      doc.setFillColor(30,34,48); doc.rect(x0, y, cw, headerRowH, 'F');
      doc.setDrawColor(50,58,80); doc.rect(x0, y, cw, headerRowH, 'S');
      doc.setTextColor(180,195,220); doc.setFontSize(7); doc.setFont(undefined,'bold');
      doc.text('Day', x0+2, y+9);
    } else if (col.type==='break') {
      const isL = /lunch/i.test(col.breakObj.label);
      doc.setFillColor(isL?209:254, isL?250:243, isL?229:199);
      doc.rect(x0, y, cw, headerRowH, 'F');
      doc.setDrawColor(isL?16:245, isL?185:158, isL?129:11);
      doc.rect(x0, y, cw, headerRowH, 'S');
      doc.setTextColor(isL?6:146, isL?95:64, isL?70:14);
      doc.setFontSize(5); doc.setFont(undefined,'normal');
      const lbl = col.breakObj.label.length > 8 ? col.breakObj.label.substring(0,7)+'.' : col.breakObj.label;
      doc.text(lbl, x0+1, y+5);
      doc.text(`${col.breakObj.duration}m`, x0+1, y+10);
    } else {
      doc.setFillColor(30,34,48); doc.rect(x0, y, cw, headerRowH, 'F');
      doc.setDrawColor(50,58,80); doc.rect(x0, y, cw, headerRowH, 'S');
      doc.setTextColor(180,195,220); doc.setFontSize(8); doc.setFont(undefined,'bold');
      doc.text(`P${col.periodIndex+1}`, x0+2, y+7);
      doc.setFontSize(5.5); doc.setFont(undefined,'normal'); doc.setTextColor(100,116,139);
      doc.text(es_getPeriodTime(col.periodIndex), x0+2, y+12);
    }
  }
  y += headerRowH;

  // ── Data rows ──
  const classTT = es_state.timetable[classId] || {};
  const dayShort = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayFull  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  for (let d = 0; d < days; d++) {
    const ry = y + d * rowH;
    // Alternating row bg
    doc.setFillColor(d%2===0 ? 248 : 255, d%2===0 ? 250 : 255, d%2===0 ? 252 : 255);
    doc.rect(margin, ry, pw - margin*2, rowH, 'F');

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]; const x0 = colXs[i];
      const cw  = col.type==='day' ? dayColW : col.type==='break' ? breakColW : periodColW;

      doc.setDrawColor(200,210,225); doc.rect(x0, ry, cw, rowH, 'S');

      if (col.type==='day') {
        doc.setFillColor(30,34,48); doc.rect(x0, ry, cw, rowH, 'F');
        doc.setDrawColor(50,58,80); doc.rect(x0, ry, cw, rowH, 'S');
        doc.setTextColor(200,215,235); doc.setFontSize(8); doc.setFont(undefined,'bold');
        doc.text(dayShort[d], x0+2, ry+8);
        doc.setFontSize(5.5); doc.setFont(undefined,'normal'); doc.setTextColor(130,145,170);
        doc.text(dayFull[d].substring(3), x0+2, ry+14);
      } else if (col.type==='break') {
        const isL = /lunch/i.test(col.breakObj.label);
        doc.setFillColor(isL?236:255, isL?253:251, isL?245:235);
        doc.rect(x0, ry, cw, rowH, 'F');
        doc.setDrawColor(isL?16:245, isL?185:158, isL?129:11);
        doc.rect(x0, ry, cw, rowH, 'S');
      } else {
        const p    = col.periodIndex;
        const slot = classTT[d]?.[p];
        const sub  = slot?.subjectId ? es_state.subjects.find(s => s.id === slot.subjectId) : null;
        if (sub) {
          const hex=(sub.color||'#4f7cff').replace('#','');
          const sr=parseInt(hex.substring(0,2),16),sg=parseInt(hex.substring(2,4),16),sb=parseInt(hex.substring(4,6),16);
          // Lighter tinted background for better ink saving
          doc.setFillColor(Math.min(sr+120,255), Math.min(sg+120,255), Math.min(sb+120,255));
          doc.rect(x0+0.5, ry+0.5, cw-1, rowH-1, 'F');
          // Color left accent bar
          doc.setFillColor(sr,sg,sb); doc.rect(x0+0.5, ry+0.5, 3, rowH-1, 'F');
          // Subject name
          doc.setTextColor(30,30,50); doc.setFontSize(7.5); doc.setFont(undefined,'bold');
          const sn = sub.name.length > 14 ? sub.name.substring(0,13)+'\u2026' : sub.name;
          doc.text(sn, x0+5, ry+8);
          // Teacher name
          const tch = slot.teacherId ? es_state.teachers.find(t => t.id === slot.teacherId) : null;
          if (tch) {
            doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(70,80,100);
            const tn = tch.name.length > 18 ? tch.name.substring(0,17)+'\u2026' : tch.name;
            doc.text(tn, x0+5, ry+14);
          } else {
            doc.setFontSize(5.5); doc.setFont(undefined,'italic'); doc.setTextColor(200,80,80);
            doc.text('No teacher', x0+5, ry+14);
          }
          // Room
          const room = slot.roomId ? es_state.rooms.find(r => r.id === slot.roomId) : null;
          if (room) {
            doc.setFontSize(5); doc.setFont(undefined,'normal'); doc.setTextColor(100,120,150);
            doc.text(room.name, x0+5, ry+19);
          }
        }
      }
    }
  }

  // ── Footer line ──
  const footerY = y + days*rowH + 4;
  doc.setDrawColor(200,210,225); doc.line(margin, footerY, pw-margin, footerY);
  doc.setFontSize(6); doc.setTextColor(148,163,184); doc.setFont(undefined,'normal');
  doc.text(`${schoolName}  \u2014  Confidential  \u2014  Academic Timetable ${new Date().getFullYear()}`, margin, footerY+4);
  doc.text(`Page 1 / 1`, pw-margin, footerY+4, {align:'right'});

  doc.save(`timetable_${cls.grade.replace(/\s+/g,'_')}_${cls.stream||'stream'}.pdf`);
  es_toast('📄 PDF exported!','success');
}


/* =====================================================
   EXPORT — All Streams PDF  (one page per stream)
===================================================== */
function es_exportAllStreamsPDF() {
  const generated = es_state.classes.filter(c => es_state.timetable[c.id]);
  if (generated.length === 0) { es_toast('No timetables generated yet','warning'); return; }
  if (!window.jspdf) { es_toast('PDF library not loaded','danger'); return; }
  const {jsPDF} = window.jspdf;
  const doc  = new jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const schoolName = es_state.school.name || 'School';
  const dayShort = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayFull  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  generated.forEach((cls, pageIdx) => {
    if (pageIdx > 0) doc.addPage('a4','landscape');

    const cols       = es_buildColList(periods);
    const breakColW  = 12;
    const dayColW    = 20;
    const margin     = 8;
    const breakCount = cols.filter(c => c.type === 'break').length;
    const perCount   = cols.filter(c => c.type === 'period').length;
    const periodColW = (pw - margin*2 - dayColW - breakCount*breakColW) / perCount;
    const rowH       = 20;
    const headerRowH = 14;
    const className  = `${cls.grade}${cls.stream?' '+cls.stream:''}`;

    // White page
    doc.setFillColor(255,255,255); doc.rect(0,0,pw,ph,'F');

    // Header band
    doc.setFillColor(30,34,48); doc.rect(0,0,pw,22,'F');
    doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(232,234,240);
    doc.text(schoolName, margin, 9);
    doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(148,163,184);
    doc.text(`${className}  \u2014  Weekly Teaching Timetable`, margin, 16);
    doc.setFontSize(7); doc.setTextColor(100,116,139);
    doc.text(`Printed: ${new Date().toLocaleDateString()}  \u2022  Page ${pageIdx+1}/${generated.length}  \u2022  ${es_state.school.lessonDuration||40}min lessons`, pw-margin, 9, {align:'right'});

    // Legend strip
    let legendX = margin;
    doc.setFontSize(6); doc.setFont(undefined,'normal');
    for (const sub of es_state.subjects) {
      const hex=(sub.color||'#4f7cff').replace('#','');
      const sr=parseInt(hex.substring(0,2),16),sg=parseInt(hex.substring(2,4),16),sb=parseInt(hex.substring(4,6),16);
      doc.setFillColor(sr,sg,sb); doc.roundedRect(legendX, 24-2.5, 3, 3, 0.5, 0.5, 'F');
      doc.setTextColor(60,60,60);
      const label = sub.name.length > 14 ? sub.name.substring(0,13)+'\u2026' : sub.name;
      doc.text(label, legendX+4, 24);
      legendX += doc.getTextWidth(label) + 8;
      if (legendX > pw - margin - 20) legendX = margin;
    }

    // Column x-positions
    const colXs = []; let cx = margin;
    for (const col of cols) {
      colXs.push(cx);
      cx += (col.type==='day' ? dayColW : col.type==='break' ? breakColW : periodColW);
    }

    let y = 30;

    // Header row
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]; const x0 = colXs[i];
      const cw  = col.type==='day' ? dayColW : col.type==='break' ? breakColW : periodColW;
      if (col.type==='day') {
        doc.setFillColor(30,34,48); doc.rect(x0,y,cw,headerRowH,'F');
        doc.setDrawColor(50,58,80); doc.rect(x0,y,cw,headerRowH,'S');
        doc.setTextColor(180,195,220); doc.setFontSize(7); doc.setFont(undefined,'bold');
        doc.text('Day', x0+2, y+9);
      } else if (col.type==='break') {
        const isL=/lunch/i.test(col.breakObj.label);
        doc.setFillColor(isL?209:254,isL?250:243,isL?229:199); doc.rect(x0,y,cw,headerRowH,'F');
        doc.setDrawColor(isL?16:245,isL?185:158,isL?129:11); doc.rect(x0,y,cw,headerRowH,'S');
        doc.setTextColor(isL?6:146,isL?95:64,isL?70:14); doc.setFontSize(5); doc.setFont(undefined,'normal');
        const lbl=col.breakObj.label.length>8?col.breakObj.label.substring(0,7)+'.':col.breakObj.label;
        doc.text(lbl,x0+1,y+5); doc.text(`${col.breakObj.duration}m`,x0+1,y+10);
      } else {
        doc.setFillColor(30,34,48); doc.rect(x0,y,cw,headerRowH,'F');
        doc.setDrawColor(50,58,80); doc.rect(x0,y,cw,headerRowH,'S');
        doc.setTextColor(180,195,220); doc.setFontSize(8); doc.setFont(undefined,'bold');
        doc.text(`P${col.periodIndex+1}`, x0+2, y+7);
        doc.setFontSize(5.5); doc.setFont(undefined,'normal'); doc.setTextColor(100,116,139);
        doc.text(es_getPeriodTime(col.periodIndex), x0+2, y+12);
      }
    }
    y += headerRowH;

    // Data rows
    const classTT = es_state.timetable[cls.id] || {};
    for (let d = 0; d < days; d++) {
      const ry = y + d * rowH;
      doc.setFillColor(d%2===0?248:255, d%2===0?250:255, d%2===0?252:255);
      doc.rect(margin, ry, pw-margin*2, rowH, 'F');
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]; const x0 = colXs[i];
        const cw  = col.type==='day'?dayColW:col.type==='break'?breakColW:periodColW;
        doc.setDrawColor(200,210,225); doc.rect(x0,ry,cw,rowH,'S');
        if (col.type==='day') {
          doc.setFillColor(30,34,48); doc.rect(x0,ry,cw,rowH,'F');
          doc.setDrawColor(50,58,80); doc.rect(x0,ry,cw,rowH,'S');
          doc.setTextColor(200,215,235); doc.setFontSize(8); doc.setFont(undefined,'bold');
          doc.text(dayShort[d],x0+2,ry+8);
          doc.setFontSize(5.5); doc.setFont(undefined,'normal'); doc.setTextColor(130,145,170);
          doc.text(dayFull[d].substring(3),x0+2,ry+14);
        } else if (col.type==='break') {
          const isL=/lunch/i.test(col.breakObj.label);
          doc.setFillColor(isL?236:255,isL?253:251,isL?245:235); doc.rect(x0,ry,cw,rowH,'F');
          doc.setDrawColor(isL?16:245,isL?185:158,isL?129:11); doc.rect(x0,ry,cw,rowH,'S');
        } else {
          const p=col.periodIndex; const slot=classTT[d]?.[p];
          const sub=slot?.subjectId?es_state.subjects.find(s=>s.id===slot.subjectId):null;
          if (sub) {
            const hex=(sub.color||'#4f7cff').replace('#','');
            const sr=parseInt(hex.substring(0,2),16),sg=parseInt(hex.substring(2,4),16),sb=parseInt(hex.substring(4,6),16);
            doc.setFillColor(Math.min(sr+120,255),Math.min(sg+120,255),Math.min(sb+120,255));
            doc.rect(x0+0.5,ry+0.5,cw-1,rowH-1,'F');
            doc.setFillColor(sr,sg,sb); doc.rect(x0+0.5,ry+0.5,3,rowH-1,'F');
            doc.setTextColor(30,30,50); doc.setFontSize(7.5); doc.setFont(undefined,'bold');
            const sn=sub.name.length>14?sub.name.substring(0,13)+'\u2026':sub.name;
            doc.text(sn,x0+5,ry+8);
            const tch=slot.teacherId?es_state.teachers.find(t=>t.id===slot.teacherId):null;
            if (tch) {
              doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(70,80,100);
              const tn=tch.name.length>18?tch.name.substring(0,17)+'\u2026':tch.name;
              doc.text(tn,x0+5,ry+14);
            } else {
              doc.setFontSize(5.5); doc.setFont(undefined,'italic'); doc.setTextColor(200,80,80);
              doc.text('No teacher',x0+5,ry+14);
            }
            const room=slot.roomId?es_state.rooms.find(r=>r.id===slot.roomId):null;
            if (room) {
              doc.setFontSize(5); doc.setFont(undefined,'normal'); doc.setTextColor(100,120,150);
              doc.text(room.name,x0+5,ry+19);
            }
          }
        }
      }
    }

    // Footer
    const footerY = y + days*rowH + 4;
    doc.setDrawColor(200,210,225); doc.line(margin, footerY, pw-margin, footerY);
    doc.setFontSize(6); doc.setTextColor(148,163,184); doc.setFont(undefined,'normal');
    doc.text(`${schoolName}  \u2014  Confidential  \u2014  Academic Timetable ${new Date().getFullYear()}`, margin, footerY+4);
    doc.text(`Page ${pageIdx+1} / ${generated.length}`, pw-margin, footerY+4, {align:'right'});
  });

  const slug = schoolName.replace(/\s+/g,'_');
  doc.save(`all_timetables_${slug}.pdf`);
  es_toast(`\uD83D\uDCC4 PDF exported \u2014 ${generated.length} class(es)!`,'success');
}


/* =====================================================
   PRINT — All Streams (browser print dialog) — ENHANCED
===================================================== */
function es_printAllStreams() {
  const generated = es_state.classes.filter(c => es_state.timetable[c.id]);
  if (generated.length === 0) { es_toast('No timetables generated yet','warning'); return; }
  const days     = parseInt(es_state.school.daysPerWeek) || 5;
  const periods  = parseInt(es_state.school.lessonsPerDay) || 9;
  const schoolName = es_state.school.name || 'School';
  const printDate  = new Date().toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const shortDay   = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const fullDay    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const blocks = generated.map((cls, idx) => {
    const tt   = es_state.timetable[cls.id] || {};
    const cols = es_buildColList(periods);
    const className = `${cls.grade}${cls.stream?' '+cls.stream:''}`;

    const hdrCells = cols.map(col => {
      if (col.type==='day') return `<th class="dc">Day</th>`;
      if (col.type==='break') {
        const isL=/lunch/i.test(col.breakObj.label);
        return `<th class="bc ${isL?'lc':''}">&#9749;<br><span class="blab">${col.breakObj.label}</span><br><span class="bdur">${col.breakObj.duration}m</span></th>`;
      }
      return `<th class="pc">P${col.periodIndex+1}<br><span class="ptime">${es_getPeriodTime(col.periodIndex)}</span></th>`;
    }).join('');

    const rows = Array.from({length:days},(_,d)=>{
      const cells = cols.map(col => {
        if (col.type==='day') return `<td class="dn">${shortDay[d]}<span class="dfull">${fullDay[d].substring(3)}</span></td>`;
        if (col.type==='break') {
          const isL=/lunch/i.test(col.breakObj.label);
          return `<td class="bk ${isL?'lk':''}">&#9749;</td>`;
        }
        const p=col.periodIndex; const slot=tt[d]?.[p];
        const sub=slot?.subjectId?es_state.subjects.find(s=>s.id===slot.subjectId):null;
        if (!sub) return `<td class="em"></td>`;
        const tch=slot.teacherId?es_state.teachers.find(t=>t.id===slot.teacherId):null;
        const c=sub.color||'#4f7cff';
        return `<td class="ls" style="background:${c}"><span class="sn">${sub.name}</span><span class="tn">${tch?tch.name:'&#9888; No teacher'}</span></td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const legendHtml = es_state.subjects.map(s=>`<span class="leg"><span class="lsq" style="background:${s.color||'#4f7cff'}"></span>${s.name}</span>`).join('');

    return `<div class="pg">
      <div class="pg-header">
        <div class="pg-left">
          <div class="hd">${schoolName}</div>
          <div class="cls">${className} &mdash; Weekly Teaching Timetable</div>
          <div class="dt">Printed: ${printDate} &bull; ${periods} Periods/Day &bull; ${es_state.school.lessonDuration||40}min Lessons</div>
        </div>
        <div class="pg-right"><div class="pgnum">Page ${idx+1} / ${generated.length}</div></div>
      </div>
      <div class="legend">${legendHtml}</div>
      <table><thead><tr>${hdrCells}</tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">&copy; ${schoolName} &mdash; Confidential &mdash; Academic Timetable ${new Date().getFullYear()}</div>
    </div>`;
  }).join('');

  const win = window.open('','_blank','width=1200,height=900');
  win.document.write(`<!DOCTYPE html><html><head><title>All Timetables - ${schoolName}</title>
  <meta charset="utf-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    @page{size:A4 landscape;margin:10mm 8mm}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:9pt;background:#fff;color:#1e2230;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .pg{page-break-after:always;padding:0 0 4mm;min-height:185mm;display:flex;flex-direction:column;gap:0}
    .pg:last-child{page-break-after:avoid}
    .pg-header{display:flex;align-items:flex-start;justify-content:space-between;padding:0 0 3mm;border-bottom:2pt solid #1e2230;margin-bottom:2.5mm}
    .pg-left{flex:1}
    .pg-right{text-align:right;padding-left:8mm}
    .hd{font-size:13pt;font-weight:800;color:#0f172a;letter-spacing:-.3px}
    .cls{font-size:10.5pt;font-weight:700;color:#1a6fb5;margin-top:1mm}
    .dt{font-size:6.5pt;color:#64748b;margin-top:1mm}
    .pgnum{font-size:7pt;color:#64748b;font-weight:600;white-space:nowrap;margin-top:1.5mm}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1pt solid #94a3b8;text-align:center;vertical-align:middle;padding:1.5pt 1pt;font-size:7pt}
    th{background:#1e2230;color:#e8eaf0;font-weight:700;font-size:7pt;padding:3pt 2pt}
    .ptime{display:block;font-size:5.5pt;font-weight:400;opacity:.75;margin-top:1pt}
    .dc{width:22pt}
    .dn{background:#1e223099;color:#b4c3dc;font-weight:700;font-size:7pt}
    .dfull{display:block;font-size:5pt;font-weight:400;opacity:.65}
    .bc{width:14pt;background:#fef3c7!important;color:#92400e;font-size:5.5pt;padding:2pt 1pt}
    .lc{background:#d1fae5!important;color:#065f46}
    .blab{display:block;font-size:5pt}
    .bdur{display:block;font-size:4.5pt;opacity:.7}
    .bk{background:#fef3c7!important;color:#92400e}
    .lk{background:#d1fae5!important;color:#065f46}
    .em{background:#f8fafc}
    .ls{color:#fff;padding:2pt;vertical-align:top}
    .sn{display:block;font-weight:700;font-size:7.5pt;line-height:1.25}
    .tn{display:block;font-size:5.5pt;opacity:.88;line-height:1.3;margin-top:1pt}
    .legend{display:flex;flex-wrap:wrap;gap:3pt;margin-bottom:2.5mm;align-items:center}
    .leg{display:inline-flex;align-items:center;gap:2pt;font-size:6pt;color:#334155;white-space:nowrap}
    .lsq{width:7pt;height:7pt;border-radius:1pt;display:inline-block;flex-shrink:0}
    .footer{font-size:5.5pt;color:#94a3b8;text-align:center;border-top:1pt solid #e2e8f0;padding-top:1.5mm;margin-top:auto}
  </style></head><body>
  ${blocks}
  <script>window.onload=()=>{ setTimeout(()=>window.print(),300); }<\/script>
  </body></html>`);
  win.document.close();
}


/* ── Global aliases used in inline onclick handlers ── */
window.viewClassDirect  = function(id) { es_viewClassDirect(id); };
window.exportPDFClass   = function(id) { es_exportPDFClass(id); };

/* =====================================================
   EXPORT — Excel
===================================================== */
function es_exportExcel() {
  const classId = document.getElementById('es_viewClassSelect').value;
  if (!classId) { es_toast('Select a class first','warning'); return; }
  const cls     = es_state.classes.find(c => c.id === classId);
  const days    = parseInt(es_state.school.daysPerWeek) || 5;
  const periods = parseInt(es_state.school.lessonsPerDay) || 9;

  const rows = [['Day', ...Array.from({length:periods}, (_,i) => `Period ${i+1} (${es_getPeriodTime(i)})`)]];
  for (let d = 0; d < days; d++) {
    const row = [ES_DAY_FULL[d]];
    for (let p = 0; p < periods; p++) {
      const slot = es_state.timetable[classId]?.[d]?.[p];
      if (slot?.subjectId) {
        const sub     = es_state.subjects.find(s => s.id === slot.subjectId);
        const teacher = slot.teacherId ? es_state.teachers.find(t => t.id === slot.teacherId) : null;
        const room    = slot.roomId    ? es_state.rooms.find(r => r.id === slot.roomId)       : null;
        row.push(`${sub?.name||'?'}${teacher?' – '+teacher.name:''}${room?' ['+room.name+']':''}`);
      } else { row.push(''); }
      const brk = breaks.find(b => b.after === p+1);
      if (brk) row.push(`☕ ${brk.label}`);
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${cls.grade} ${cls.stream||''}`);
  XLSX.writeFile(wb, `timetable_${cls.grade}_${cls.stream||''}.xlsx`);
  es_toast('📊 Excel exported!','success');
}

/* =====================================================
   RENDER ALL + BADGES
===================================================== */
function es_renderAll() {
  es_renderClasses(); es_renderSubjects(); es_renderTeachers(); es_renderRooms();
  es_renderBreakList(); es_updateSetupUI(); es_updateBadges();
}
function es_updateBadges() {
  document.getElementById('es_badge-classes').textContent  = es_state.classes.length;
  document.getElementById('es_badge-subjects').textContent = es_state.subjects.length;
  document.getElementById('es_badge-teachers').textContent = es_state.teachers.length;
  document.getElementById('es_badge-rooms').textContent    = es_state.rooms.length;
}
function es_updateDashboard() {
  document.getElementById('es_stat-classes').textContent  = es_state.classes.length;
  document.getElementById('es_stat-subjects').textContent = es_state.subjects.length;
  document.getElementById('es_stat-teachers').textContent = es_state.teachers.length;
  document.getElementById('es_stat-rooms').textContent    = es_state.rooms.length;
  document.getElementById('es_stat-generated').textContent = Object.keys(es_state.timetable).length > 0 ? 'Yes' : 'No';

  const sn = document.getElementById('es_sidebarSchoolName');
  if (sn) sn.textContent = es_state.school.name || 'No school configured';

  const info = document.getElementById('es_dash-school-info');
  if (info) {
    if (es_state.school.name) {
      info.innerHTML = `
        <div><strong>School:</strong> ${es_state.school.name}</div>
        <div><strong>Days/Week:</strong> ${es_state.school.daysPerWeek || 5}</div>
        <div><strong>Periods/Day:</strong> ${es_state.school.lessonsPerDay || 9}</div>
        <div><strong>Lesson Duration:</strong> ${es_state.school.lessonDuration || 40} min</div>
        <div><strong>Breaks:</strong> ${(es_state.school.breaks||[]).length} configured</div>
        <div><strong>Start Time:</strong> ${es_state.school.schoolStart || '07:30'}</div>
      `;
    } else {
      info.innerHTML = '<em style="color:var(--text3)">No school configured. Go to School Setup.</em>';
    }
  }
  es_runConflictCheck();
}

/* =====================================================
   UTILITIES
===================================================== */
function es_uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }

/* =====================================================
   SAMPLE DATA — CBC Kenya
===================================================== */
function es_loadSampleData() {
  if (es_state.classes.length > 0 && !confirm('Replace current data with CBC sample data?')) return;

  es_state.school = {
    name: 'Uasin Gishu Junior High School',
    daysPerWeek: 5, lessonsPerDay: 9, lessonDuration: 40,
    schoolStart: '07:30',
    breaks: []   // No default breaks — configure your own in School Setup
  };

  es_state.classes = [
    {id:'c1', grade:'Grade 7', stream:'East',  students:42},
    {id:'c2', grade:'Grade 7', stream:'West',  students:40},
    {id:'c3', grade:'Grade 8', stream:'North', students:38},
    {id:'c4', grade:'Grade 8', stream:'South', students:36},
    {id:'c5', grade:'Grade 9', stream:'A',     students:35},
    {id:'c6', grade:'Grade 9', stream:'B',     students:33},
  ];

  es_state.subjects = [
    // Core — all grades
    {id:'s1',  name:'Mathematics',          lessonsPerWeek:6, priority:'core',     double:true,  color:'#4f7cff', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s2',  name:'English',              lessonsPerWeek:5, priority:'core',     double:false, color:'#10b981', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s3',  name:'Kiswahili',            lessonsPerWeek:5, priority:'core',     double:false, color:'#f59e0b', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s4',  name:'Science & Technology', lessonsPerWeek:5, priority:'core',     double:true,  color:'#06b6d4', grades:['Grade 7','Grade 8']},
    {id:'s5',  name:'Social Studies',       lessonsPerWeek:4, priority:'core',     double:false, color:'#7c3aed', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s6',  name:'Integrated Science',   lessonsPerWeek:5, priority:'core',     double:true,  color:'#0ea5e9', grades:['Grade 9']},
    // Optional / practical
    {id:'s7',  name:'CRE / IRE',            lessonsPerWeek:3, priority:'optional', double:false, color:'#ec4899', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s8',  name:'Agriculture',          lessonsPerWeek:3, priority:'optional', double:true,  color:'#84cc16', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s9',  name:'Art & Craft',          lessonsPerWeek:2, priority:'optional', double:false, color:'#f97316', grades:['Grade 7','Grade 8']},
    {id:'s10', name:'Music',                lessonsPerWeek:2, priority:'optional', double:false, color:'#a855f7', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s11', name:'Physical Education',   lessonsPerWeek:3, priority:'optional', double:false, color:'#14b8a6', grades:['Grade 7','Grade 8','Grade 9']},
    {id:'s12', name:'Home Science',         lessonsPerWeek:2, priority:'optional', double:false, color:'#fb7185', grades:['Grade 7','Grade 8']},
    {id:'s13', name:'Business Studies',     lessonsPerWeek:3, priority:'optional', double:false, color:'#f59e0b', grades:['Grade 9']},
    {id:'s14', name:'Computer Science',     lessonsPerWeek:2, priority:'optional', double:false, color:'#22d3ee', grades:['Grade 7','Grade 8','Grade 9']},
  ];

  const mkAvail = () => {
    const a = {};
    for (let d = 0; d < 5; d++) { a[d] = {}; for (let p = 1; p <= 9; p++) a[d][p] = true; }
    return a;
  };

  // 14 teachers — each assigned to specific subjects, no dangerous overlaps
  es_state.teachers = [
    // Maths specialists
    {id:'t1',  name:'Mr. James Kiprono',    subjects:['s1'],       maxPerDay:6, maxPerWeek:30, availability:mkAvail()},
    {id:'t2',  name:'Ms. Ann Mutai',        subjects:['s1'],       maxPerDay:6, maxPerWeek:28, availability:mkAvail()},
    // English specialists
    {id:'t3',  name:'Ms. Grace Wanjiku',    subjects:['s2'],       maxPerDay:5, maxPerWeek:25, availability:mkAvail()},
    {id:'t4',  name:'Ms. Esther Otieno',    subjects:['s2'],       maxPerDay:5, maxPerWeek:22, availability:mkAvail()},
    // Kiswahili
    {id:'t5',  name:'Mr. David Mwangi',     subjects:['s3'],       maxPerDay:5, maxPerWeek:25, availability:mkAvail()},
    {id:'t6',  name:'Ms. Beatrice Njeri',   subjects:['s3'],       maxPerDay:5, maxPerWeek:22, availability:mkAvail()},
    // Science
    {id:'t7',  name:'Ms. Faith Chebet',     subjects:['s4','s6'],  maxPerDay:6, maxPerWeek:28, availability:mkAvail()},
    {id:'t8',  name:'Mr. Collins Rotich',   subjects:['s4','s6'],  maxPerDay:6, maxPerWeek:28, availability:mkAvail()},
    // Social Studies + CRE
    {id:'t9',  name:'Mr. Peter Omondi',     subjects:['s5','s7'],  maxPerDay:6, maxPerWeek:28, availability:mkAvail()},
    {id:'t10', name:'Ms. Rose Kemunto',     subjects:['s5','s7'],  maxPerDay:5, maxPerWeek:24, availability:mkAvail()},
    // Agriculture + Home Science
    {id:'t11', name:'Ms. Ruth Achieng',     subjects:['s8','s12'], maxPerDay:5, maxPerWeek:22, availability:mkAvail()},
    {id:'t12', name:'Mr. Brian Koech',      subjects:['s8','s9'],  maxPerDay:5, maxPerWeek:20, availability:mkAvail()},
    // PE + Music + Art
    {id:'t13', name:'Mr. Samuel Njoroge',   subjects:['s10','s11'],maxPerDay:5, maxPerWeek:22, availability:mkAvail()},
    {id:'t14', name:'Ms. Lydia Chepkurui',  subjects:['s9','s14','s13'], maxPerDay:5, maxPerWeek:20, availability:mkAvail()},
  ];

  es_state.rooms = [
    {id:'r1', name:'Science Lab A',  type:'Science Lab',     capacity:40, subjects:['s4','s6']},
    {id:'r2', name:'Science Lab B',  type:'Science Lab',     capacity:38, subjects:['s4','s6']},
    {id:'r3', name:'Computer Lab',   type:'Computer Lab',    capacity:35, subjects:['s14']},
    {id:'r4', name:'Agri Plot',      type:'Agriculture',     capacity:45, subjects:['s8']},
    {id:'r5', name:'Art & Craft Room',type:'Other',          capacity:35, subjects:['s9']},
    {id:'r6', name:'Music Room',     type:'Other',           capacity:35, subjects:['s10']},
  ];

  es_state.timetable = {};
  es_saveData(); es_syncSetupForm(); es_renderAll(); es_updateDashboard();
  es_toast('📦 Sample CBC data loaded! Go to School Setup to add your breaks, then click ⚡ Generate.','success');
}





// ── Patch go() to handle timetable section ───────────────

function go(sec, el) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sn').forEach(n => n.classList.remove('active'));
  const s = document.getElementById('s-'+sec);
  if (s) s.classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('tbTitle').textContent = el ? el.querySelector('span').textContent : sec;
  // Scroll main content area back to top on every navigation
  const mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  if (window.innerWidth < 960) closeSidebar(); // auto-close on mobile only
  if (sec === 'dashboard')  renderDashboard();
  if (sec === 'exams')      { populateExamDropdowns(); renderPlatformExamMarkEntry(); renderSchoolPlatformResults(); }
  if (sec === 'reports')    { populateReportDropdowns(); }
  if (sec === 'messaging')  { loadMsgRecipients(); }
  if (sec === 'fees')       { initFeesSection(); }
  if (sec === 'papers')     { initPapersSection(); }
  if (sec === 'settings')   { renderTeacherPreferences(); }
  if (sec === 'platform')   { renderPlatformDashboard(); _navCfgMode='global'; navCfgSwitchMode('global'); platRenderNavConfig(); }
  if (sec === 'exambuilder') { /* handled by EB module DOMContentLoaded wrapper */ }
  if (sec === 'timetable')  {
    // Initialize EduSchedule timetable sub-app
    if (typeof es_initApp === 'function') es_initApp();
  }
}

// ═══════════════════════════════════════════════
//  LANGUAGE / TRANSLATION SYSTEM
// ═══════════════════════════════════════════════

const TRANSLATIONS = {
  en: {
    // Sidebar nav
    nav_dashboard:  'Dashboard',
    nav_exams:      'Exams',
    nav_students:   'Students',
    nav_teachers:   'Teachers',
    nav_subjects:   'Subjects',
    nav_classes:    'Classes & Streams',
    nav_timetable:  'Timetables',
    nav_reports:    'Report Forms',
    nav_messaging:  'Messaging',
    nav_settings:   'Settings',
    nav_darkmode:   'Dark Mode',
    nav_logout:     'Logout',
    // Dashboard
    ph_dashboard:   "Good morning! 👋",
    ph_dashboard_sub: "Here's your school's academic overview.",
    // Exams
    ph_exams:       '📝 Exams',
    ph_exams_sub:   'Create, manage, upload marks, and analyse examinations.',
    tab_create:        'Create Exam',
    tab_examlist:      'Exam List',
    tab_examtimetable: '📅 Exam Timetable',
    tab_upload:        'Upload Marks',
    tab_analyse:       'Analyse',
    tab_merit:         'Merit List',
    tab_subanalysis:   'Subject Analysis',
    // Students
    ph_students:    '🎓 Students',
    ph_students_sub:'Manage student records and enrolments.',
    // Teachers
    ph_teachers:    '👨‍🏫 Teachers',
    ph_teachers_sub:'Manage teachers, subjects, and system access.',
    // Subjects
    ph_subjects:    '📚 Subjects',
    ph_subjects_sub:'Manage subjects, assign teachers and enrol students.',
    // Classes
    ph_classes:     '🏫 Classes & Streams',
    ph_classes_sub: 'Manage class and stream assignments.',
    // Timetable
    ph_timetable:   '🕐 Timetables',
    ph_timetable_sub:'Generate, view and print class, teacher and block timetables.',
    // Reports
    ph_reports:     '📄 Report Forms',
    ph_reports_sub: 'Generate downloadable PDF report forms for students.',
    // Messaging
    ph_messaging:   '💬 Messaging (SMS)',
    ph_messaging_sub:'Send messages to parents and teachers.',
    // Settings
    ph_settings:    '⚙ Settings',
    ph_settings_sub:'Configure your school system.',
    // Buttons
    btn_save:       '💾 Save',
    btn_cancel:     '✕ Cancel',
    btn_generate:   '📄 Generate',
    btn_preview:    '👁 Preview',
    btn_print:      '🖨 Print',
    btn_excel:      '⬇ Excel',
    btn_pdf:        '⬇ PDF',
    btn_run:        '▶ Run',
  },
  sw: {
    // Sidebar nav
    nav_dashboard:  'Dashibodi',
    nav_exams:      'Mitihani',
    nav_students:   'Wanafunzi',
    nav_teachers:   'Walimu',
    nav_subjects:   'Masomo',
    nav_classes:    'Madarasa & Vikundi',
    nav_timetable:  'Ratiba za Masomo',
    nav_reports:    'Fomu za Ripoti',
    nav_messaging:  'Ujumbe',
    nav_settings:   'Mipangilio',
    nav_darkmode:   'Hali ya Giza',
    nav_logout:     'Toka',
    // Dashboard
    ph_dashboard:   "Habari za asubuhi! 👋",
    ph_dashboard_sub: "Hapa kuna muhtasari wa kitaaluma wa shule yako.",
    // Exams
    ph_exams:       '📝 Mitihani',
    ph_exams_sub:   'Unda, simamia, pakia alama na uchanganue mitihani.',
    tab_create:        'Unda Mtihani',
    tab_examlist:      'Orodha ya Mitihani',
    tab_examtimetable: '📅 Ratiba ya Mtihani',
    tab_upload:        'Pakia Alama',
    tab_analyse:       'Uchanganuzi',
    tab_merit:         'Orodha ya Sifa',
    tab_subanalysis:   'Uchanganuzi wa Somo',
    // Students
    ph_students:    '🎓 Wanafunzi',
    ph_students_sub:'Simamia rekodi na usajili wa wanafunzi.',
    // Teachers
    ph_teachers:    '👨‍🏫 Walimu',
    ph_teachers_sub:'Simamia walimu, masomo, na ufikiaji wa mfumo.',
    // Subjects
    ph_subjects:    '📚 Masomo',
    ph_subjects_sub:'Simamia masomo, weka walimu na usajili wanafunzi.',
    // Classes
    ph_classes:     '🏫 Madarasa & Vikundi',
    ph_classes_sub: 'Simamia mgawanyo wa madarasa na vikundi.',
    // Timetable
    ph_timetable:   '🕐 Ratiba za Masomo',
    ph_timetable_sub:'Tengeneza, angalia na chapisha ratiba za masomo.',
    // Reports
    ph_reports:     '📄 Fomu za Ripoti',
    ph_reports_sub: 'Tengeneza fomu za ripoti za PDF zinazoweza kupakuliwa.',
    // Messaging
    ph_messaging:   '💬 Ujumbe (SMS)',
    ph_messaging_sub:'Tuma ujumbe kwa wazazi na walimu.',
    // Settings
    ph_settings:    '⚙ Mipangilio',
    ph_settings_sub:'Sanidi mfumo wa shule yako.',
    // Buttons
    btn_save:       '💾 Hifadhi',
    btn_cancel:     '✕ Ghairi',
    btn_generate:   '📄 Tengeneza',
    btn_preview:    '👁 Hakiki',
    btn_print:      '🖨 Chapisha',
    btn_excel:      '⬇ Excel',
    btn_pdf:        '⬇ PDF',
    btn_run:        '▶ Endesha',
  }
};

// Map of data-i18n keys to DOM selectors
const I18N_MAP = [
  // Sidebar nav spans
  { key:'nav_dashboard',  sel:'[data-s=dashboard] span' },
  { key:'nav_exams',      sel:'[data-s=exams] span' },
  { key:'nav_students',   sel:'[data-s=students] span' },
  { key:'nav_teachers',   sel:'[data-s=teachers] span' },
  { key:'nav_subjects',   sel:'[data-s=subjects] span' },
  { key:'nav_classes',    sel:'[data-s=classes] span' },
  { key:'nav_timetable',  sel:'[data-s=timetable] span' },
  { key:'nav_reports',    sel:'[data-s=reports] span' },
  { key:'nav_messaging',  sel:'[data-s=messaging] span' },
  { key:'nav_settings',   sel:'[data-s=settings] span' },
  // Page headers
  { key:'ph_dashboard',     sel:'#s-dashboard .ph h2' },
  { key:'ph_dashboard_sub', sel:'#s-dashboard .ph p' },
  { key:'ph_exams',         sel:'#s-exams .ph h2' },
  { key:'ph_exams_sub',     sel:'#s-exams .ph p' },
  { key:'ph_students',      sel:'#s-students .ph h2' },
  { key:'ph_students_sub',  sel:'#s-students .ph p' },
  { key:'ph_teachers',      sel:'#s-teachers .ph h2' },
  { key:'ph_teachers_sub',  sel:'#s-teachers .ph p' },
  { key:'ph_subjects',      sel:'#s-subjects .ph h2' },
  { key:'ph_subjects_sub',  sel:'#s-subjects .ph p' },
  { key:'ph_classes',       sel:'#s-classes .ph h2' },
  { key:'ph_classes_sub',   sel:'#s-classes .ph p' },
  { key:'ph_timetable',     sel:'#s-timetable .ph h2' },
  { key:'ph_timetable_sub', sel:'#s-timetable .ph p' },
  { key:'ph_reports',       sel:'#s-reports .ph h2' },
  { key:'ph_reports_sub',   sel:'#s-reports .ph p' },
  { key:'ph_messaging',     sel:'#s-messaging .ph h2' },
  { key:'ph_messaging_sub', sel:'#s-messaging .ph p' },
  { key:'ph_settings',      sel:'#s-settings .ph h2' },
  { key:'ph_settings_sub',  sel:'#s-settings .ph p' },
  // Exam tabs — use onclick attribute selectors so positions don't matter
  { key:'tab_create',         sel:'#examTabBar .tb[onclick*="tabCreateExam"]' },
  { key:'tab_examlist',       sel:'#examTabBar .tb[onclick*="tabExamList"]' },
  { key:'tab_examtimetable',  sel:'#tbExamTimetable' },
  { key:'tab_upload',         sel:'#examTabBar .tb[onclick*="tabUploadMarks"]' },
  { key:'tab_analyse',        sel:'#tbAnalyse' },
  { key:'tab_merit',          sel:'#examTabBar .tb[onclick*="tabMeritList"]' },
  { key:'tab_subanalysis',    sel:'#tbSubjectAnalysis' },
];

let currentLang = localStorage.getItem('ei_lang') || 'en';

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('ei_lang', lang);
  // Toggle active button
  document.getElementById('langEN').classList.toggle('active', lang === 'en');
  document.getElementById('langSW').classList.toggle('active', lang === 'sw');
  applyTranslations();
}

function applyTranslations() {
  const T = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  I18N_MAP.forEach(({ key, sel }) => {
    const el = document.querySelector(sel);
    if (el && T[key] !== undefined) el.textContent = T[key];
  });
  // Also update topbar title to current section
  const activeNav = document.querySelector('.sn.active span');
  if (activeNav) document.getElementById('tbTitle').textContent = activeNav.textContent;
}

// Init language on load (called from initApp)
function initLang() {
  currentLang = localStorage.getItem('ei_lang') || 'en';
  document.getElementById('langEN').classList.toggle('active', currentLang === 'en');
  document.getElementById('langSW').classList.toggle('active', currentLang === 'sw');
  applyTranslations();
}

// ══════════════════════════════════════════════════════════
//  FEES MANAGEMENT MODULE — Charanas Analyzer
// ══════════════════════════════════════════════════════════

const K_FEES_STRUCT = 'ei_fee_structures';
const K_FEES_RECORDS = 'ei_fee_records';

let feeStructures = [];   // [{id,classId,term,year,totalFee,breakdown:[{item,amount}]}]
let feeRecords = [];      // [{id,studentId,classId,term,year,totalFee,payments:[{id,receiptNo,date,amount,mode,notes,balanceBefore,balanceAfter}]}]
let lastReceiptHtml = '';

function loadFees() {
  try { feeStructures = JSON.parse(localStorage.getItem(K_FEES_STRUCT)) || []; } catch { feeStructures = []; }
  try { feeRecords    = JSON.parse(localStorage.getItem(K_FEES_RECORDS)) || []; } catch { feeRecords = []; }
}
function saveFees() {
  localStorage.setItem(K_FEES_STRUCT,  JSON.stringify(feeStructures));
  localStorage.setItem(K_FEES_RECORDS, JSON.stringify(feeRecords));
}

// ── Generate a unique receipt number ──
function genReceiptNo() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth()+1).padStart(2,'0');
  const dd  = String(now.getDate()).padStart(2,'0');
  const rnd = Math.floor(Math.random()*9000)+1000;
  return `RCP${yy}${mm}${dd}-${rnd}`;
}

// ── Get or create a student fee record ──
function getOrCreateFeeRecord(studentId, classId, term, year) {
  let rec = feeRecords.find(r => r.studentId===studentId && r.term===term && String(r.year)===String(year));
  if (!rec) {
    const struct = getFeeStructure(classId, term, year);
    rec = { id: uid(), studentId, classId, term, year: String(year), totalFee: struct ? struct.totalFee : 0, payments: [] };
    feeRecords.push(rec);
    saveFees();
  }
  return rec;
}

function getFeeStructure(classId, term, year) {
  return feeStructures.find(f => f.classId===classId && f.term===term && String(f.year)===String(year));
}

function getRecordTotalPaid(rec) {
  return rec.payments.reduce((a, p) => a + parseFloat(p.amount||0), 0);
}
function getRecordBalance(rec) {
  return parseFloat(rec.totalFee||0) - getRecordTotalPaid(rec);
}

// ── Get fee data for a student (for a given term/year) ──
function getStudentFeeData(studentId, term, year) {
  const stu = students.find(s => s.id === studentId);
  if (!stu) return null;
  const rec = feeRecords.find(r => r.studentId===studentId && r.term===term && String(r.year)===String(year));
  if (!rec) return null;
  const paid = getRecordTotalPaid(rec);
  const bal  = getRecordBalance(rec);
  return { rec, paid, bal, totalFee: rec.totalFee, cleared: bal <= 0 };
}

// ── Open Fees Tab ──
function openFeesTab(tabId, btn) {
  document.querySelectorAll('#s-fees .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#feesTabBar .tb').forEach(b => b.classList.remove('active'));
  const p = document.getElementById(tabId); if (p) p.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'tabFeeOverview')   renderFeeOverview();
  if (tabId === 'tabFeeStructure')  renderFeeStructureList();
  if (tabId === 'tabFeePayments')   initFeePaymentForm();
  if (tabId === 'tabFeeStudents')   renderStudentBalances();
  if (tabId === 'tabFeeReminders')  renderFeeReminders();
  if (tabId === 'tabFeeReceipts')   renderReceiptsLog();
  // tabFeeImport is static HTML — no render call needed
}

// ── Populate Fees Filter Dropdowns ──
function populateFeesDropdowns() {
  const isTeacher = currentUser && currentUser.role === 'teacher';
  const teacherStreamIds = isTeacher ? getClassTeacherStreamIds(currentUser.teacherId) : [];
  const teacherClassIds  = isTeacher ? [...new Set(teacherStreamIds.map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))] : null;

  // Determine visible classes
  const visibleClasses = teacherClassIds
    ? classes.filter(c => teacherClassIds.includes(c.id))
    : classes;

  // Collect all years from structures + records
  const years = [...new Set([
    ...feeStructures.map(f => f.year),
    ...feeRecords.map(r => r.year),
    String(new Date().getFullYear())
  ])].sort((a,b)=>b-a);

  const classOptions = '<option value="">All Classes</option>' + visibleClasses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  const yearOptions  = '<option value="">All Years</option>'  + years.map(y=>`<option value="${y}">${y}</option>`).join('');

  ['fovClass','fsbClass','fremClass','frctClass'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = classOptions;
  });
  ['fovYear','fsbYear','fremYear'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = yearOptions;
  });

  // Fee structure & payment form class dropdowns
  const strictClassOptions = '<option value="">— Select Class —</option>' + visibleClasses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  ['fstrClass','fpClass'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = strictClassOptions;
  });

  // Year dropdowns for payment form
  const yearSelectOptions = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  const fpYear = document.getElementById('fpYear'); if (fpYear) fpYear.innerHTML = yearSelectOptions;

  // Default current term in filters
  const curTerm = settings.currentTerm || 'Term 1';
  ['fovTerm','fsbTerm','fremTerm','fpTerm','frctTerm'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value === '') {
      for (const opt of el.options) { if (opt.value === curTerm) { opt.selected = true; break; } }
    }
  });
  const curYear = String(settings.currentYear || new Date().getFullYear());
  ['fovYear','fsbYear','fremYear','fpYear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { for (const opt of el.options) { if (opt.value === curYear) { opt.selected = true; break; } } }
  });
}

// ── Init Fees Section ──
function initFeesSection() {
  loadFees();
  populateFeesDropdowns();

  const role      = currentUser && currentUser.role;
  const isFullFees = role === 'superadmin' || role === 'admin' || role === 'principal' || role === 'bursar';
  const isTeacher  = role === 'teacher';
  const isClassTch = isTeacher && currentUserIsClassTeacher();

  // Full-fees users: all tabs visible
  // Class teacher: Overview + Student Balances only (read their classes)
  // Regular teacher: should never reach here (no fees link), but guard anyway
  const tabs = {
    tbFeeStructure : isFullFees,
    tbFeePayments  : isFullFees,
    tbFeeReminders : isFullFees,
    tbFeeReceipts  : isFullFees,
    tbFeeImport    : isFullFees,
    tbFeeStudents  : isFullFees || isClassTch,
    tbFeeOverview  : true, // always
  };
  Object.entries(tabs).forEach(([id, show]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });

  // Admin stats bar: full-fees roles only
  const statsBar = document.getElementById('feesAdminStats');
  if (statsBar) statsBar.style.display = isFullFees ? '' : 'none';

  // If current active tab is now hidden, fall back to Overview
  const activeTab = document.querySelector('#feesTabBar .tb.active');
  if (activeTab && activeTab.style.display === 'none') {
    openFeesTab('tabFeeOverview', document.getElementById('tbFeeOverview'));
  }

  renderFeeOverview();
}

// ═══════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════
function renderFeeOverview() {
  loadFees();
  const filterClass = document.getElementById('fovClass')?.value || '';
  const filterTerm  = document.getElementById('fovTerm')?.value  || '';
  const filterYear  = document.getElementById('fovYear')?.value  || '';

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  let visibleClasses = teacherClassIds ? classes.filter(c => teacherClassIds.includes(c.id)) : classes;
  if (filterClass) visibleClasses = visibleClasses.filter(c => c.id === filterClass);

  // Build summary per class
  let totalExpected=0, totalCollected=0, totalOutstanding=0, totalStudents=0;
  const rows = visibleClasses.map(cls => {
    const classStudents = students.filter(s => s.classId === cls.id);
    let expected=0, collected=0;

    classStudents.forEach(stu => {
      const recs = feeRecords.filter(r => r.studentId===stu.id
        && (!filterTerm || r.term===filterTerm)
        && (!filterYear || String(r.year)===filterYear));
      recs.forEach(r => {
        expected   += parseFloat(r.totalFee||0);
        collected  += getRecordTotalPaid(r);
      });
      // If no record but structure exists, count as expected
      if (!recs.length) {
        const structs = feeStructures.filter(f => f.classId===cls.id
          && (!filterTerm || f.term===filterTerm)
          && (!filterYear || String(f.year)===filterYear));
        structs.forEach(s => { expected += parseFloat(s.totalFee||0); });
      }
    });

    const outstanding = expected - collected;
    const pct = expected > 0 ? Math.round(collected/expected*100) : 0;
    totalExpected    += expected;
    totalCollected   += collected;
    totalOutstanding += outstanding;
    totalStudents    += classStudents.length;

    return { cls, students: classStudents.length, expected, collected, outstanding, pct };
  });

  // Stats cards
  const statsEl = document.getElementById('feeOverviewStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="fee-ov-stat-row">
        <div class="fee-stat-card fsc-blue"><div class="fsc-ico">👥</div><div class="fsc-val">${totalStudents}</div><div class="fsc-lbl">Total Students</div></div>
        <div class="fee-stat-card fsc-teal"><div class="fsc-ico">💰</div><div class="fsc-val">KES ${totalExpected.toLocaleString()}</div><div class="fsc-lbl">Total Expected</div></div>
        <div class="fee-stat-card fsc-green"><div class="fsc-ico">✅</div><div class="fsc-val">KES ${totalCollected.toLocaleString()}</div><div class="fsc-lbl">Total Collected</div></div>
        <div class="fee-stat-card fsc-red"><div class="fsc-ico">⚠️</div><div class="fsc-val">KES ${totalOutstanding.toLocaleString()}</div><div class="fsc-lbl">Outstanding</div></div>
        <div class="fee-stat-card fsc-amber"><div class="fsc-ico">📊</div><div class="fsc-val">${totalExpected>0?Math.round(totalCollected/totalExpected*100):0}%</div><div class="fsc-lbl">Collection Rate</div></div>
      </div>`;
  }

  // Admin global stats bar
  const adminBar = document.getElementById('feesAdminStats');
  if (adminBar && (currentUser.role==='superadmin'||currentUser.role==='admin')) {
    adminBar.innerHTML = `
      <div class="stat-card sc-blue"><div class="sc-num">KES ${totalExpected.toLocaleString()}</div><div class="sc-lbl">Expected</div><div class="sc-ico">💰</div></div>
      <div class="stat-card sc-green"><div class="sc-num">KES ${totalCollected.toLocaleString()}</div><div class="sc-lbl">Collected</div><div class="sc-ico">✅</div></div>
      <div class="stat-card sc-amber"><div class="sc-num">KES ${totalOutstanding.toLocaleString()}</div><div class="sc-lbl">Outstanding</div><div class="sc-ico">⚠️</div></div>
      <div class="stat-card sc-teal"><div class="sc-num">${totalExpected>0?Math.round(totalCollected/totalExpected*100):0}%</div><div class="sc-lbl">Collection Rate</div><div class="sc-ico">📊</div></div>`;
  }

  // Table
  const tbody = document.getElementById('feeOverviewBody');
  if (tbody) {
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td><strong>${r.cls.name}</strong></td>
        <td>${r.students}</td>
        <td>KES ${r.expected.toLocaleString()}</td>
        <td>KES ${r.collected.toLocaleString()}</td>
        <td style="color:${r.outstanding>0?'var(--danger)':'var(--success)'}"><strong>KES ${r.outstanding.toLocaleString()}</strong></td>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem">
            <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${r.pct}%;background:${r.pct>=80?'var(--success)':r.pct>=50?'#f59e0b':'var(--danger)'};border-radius:4px"></div>
            </div>
            <span style="font-size:.8rem;font-weight:600;min-width:2.5rem">${r.pct}%</span>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="filterToClass('${r.cls.id}')">View Students</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:2rem">No fee data found. Set up fee structures first.</td></tr>';
  }
}

function filterToClass(classId) {
  openFeesTab('tabFeeStudents', document.getElementById('tbFeeStudents'));
  setTimeout(() => {
    const el = document.getElementById('fsbClass');
    if (el) { el.value = classId; renderStudentBalances(); }
  }, 100);
}

// ═══════════════════════════════════════════
// FEE STRUCTURE
// ═══════════════════════════════════════════
function addFstrBreakdownRow() {
  const container = document.getElementById('fstrBreakdownRows');
  const div = document.createElement('div');
  div.className = 'frow c2 fstr-row';
  div.style.cssText = 'margin-bottom:.5rem;gap:.5rem';
  div.innerHTML = `
    <div class="fg"><input type="text" placeholder="Item (e.g. Tuition)" style="padding:.4rem .6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%;font-size:.85rem" class="fstr-item"/></div>
    <div class="fg" style="display:flex;gap:.5rem">
      <input type="number" placeholder="Amount (KES)" min="0" style="padding:.4rem .6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%;font-size:.85rem" class="fstr-amt"/>
      <button class="btn btn-sm btn-danger-sm" onclick="this.closest('.fstr-row').remove()">✕</button>
    </div>`;
  container.appendChild(div);
}

function clearFstrForm() {
  document.getElementById('fstrEditId').value = '';
  document.getElementById('fstrClass').value = '';
  document.getElementById('fstrTotal').value = '';
  document.getElementById('fstrBreakdownRows').innerHTML = '';
}

function saveFeeStructure() {
  const r = currentUser && currentUser.role;
  if (!(r==='superadmin'||r==='admin'||r==='principal'||r==='bursar')) { showToast('Only administrators can edit fee structures','error'); return; }
  loadFees();
  const editId  = document.getElementById('fstrEditId').value;
  const classId = document.getElementById('fstrClass').value;
  const term    = document.getElementById('fstrTerm').value;
  const year    = document.getElementById('fstrYear').value;
  const total   = parseFloat(document.getElementById('fstrTotal').value);

  if (!classId || !term || !year || isNaN(total) || total <= 0) {
    showToast('Please fill Class, Term, Year and a valid Total Fee', 'error'); return;
  }

  // Collect breakdown rows
  const breakdown = [];
  document.querySelectorAll('.fstr-row').forEach(row => {
    const item = row.querySelector('.fstr-item')?.value.trim();
    const amt  = parseFloat(row.querySelector('.fstr-amt')?.value||0);
    if (item && amt > 0) breakdown.push({ item, amount: amt });
  });

  if (editId) {
    const i = feeStructures.findIndex(f => f.id === editId);
    if (i > -1) feeStructures[i] = { ...feeStructures[i], classId, term, year, totalFee: total, breakdown };
  } else {
    // Check for duplicate
    const dup = feeStructures.find(f => f.classId===classId && f.term===term && String(f.year)===String(year));
    if (dup) { showToast('A structure already exists for this class/term/year. Edit it instead.', 'error'); return; }
    feeStructures.push({ id: uid(), classId, term, year: String(year), totalFee: total, breakdown });
  }

  saveFees();
  clearFstrForm();
  renderFeeStructureList();
  populateFeesDropdowns();
  showToast('Fee structure saved ✓', 'success');
}

function renderFeeStructureList() {
  loadFees();
  const el = document.getElementById('feeStructureList');
  if (!el) return;
  if (!feeStructures.length) { el.innerHTML = '<p style="color:var(--muted)">No fee structures yet.</p>'; return; }

  el.innerHTML = feeStructures.map(f => {
    const cls = classes.find(c => c.id === f.classId);
    return `
      <div class="fee-struct-item">
        <div class="fsi-head">
          <div>
            <strong>${cls?.name || 'Unknown Class'}</strong>
            <span class="badge b-blue" style="font-size:.65rem;margin-left:.4rem">${f.term} ${f.year}</span>
          </div>
          <strong style="color:var(--primary)">KES ${parseFloat(f.totalFee).toLocaleString()}</strong>
        </div>
        ${f.breakdown && f.breakdown.length ? `
          <div class="fsi-breakdown">
            ${f.breakdown.map(b=>`<span>${b.item}: <strong>KES ${parseFloat(b.amount).toLocaleString()}</strong></span>`).join('')}
          </div>` : ''}
        <div class="fsi-actions">
          <button class="btn btn-sm btn-outline" onclick="editFeeStructure('${f.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger-sm" onclick="deleteFeeStructure('${f.id}')">🗑 Delete</button>
        </div>
      </div>`;
  }).join('');
}

function editFeeStructure(id) {
  loadFees();
  const f = feeStructures.find(x => x.id === id); if (!f) return;
  document.getElementById('fstrEditId').value = id;
  document.getElementById('fstrClass').value  = f.classId;
  document.getElementById('fstrTerm').value   = f.term;
  document.getElementById('fstrYear').value   = f.year;
  document.getElementById('fstrTotal').value  = f.totalFee;
  const container = document.getElementById('fstrBreakdownRows');
  container.innerHTML = '';
  (f.breakdown||[]).forEach(b => {
    addFstrBreakdownRow();
    const rows = container.querySelectorAll('.fstr-row');
    const last = rows[rows.length-1];
    last.querySelector('.fstr-item').value = b.item;
    last.querySelector('.fstr-amt').value  = b.amount;
  });
  document.querySelector('#tabFeeStructure').scrollIntoView({ behavior: 'smooth' });
}

function deleteFeeStructure(id) {
  if (!confirm('Delete this fee structure?')) return;
  loadFees();
  feeStructures = feeStructures.filter(f => f.id !== id);
  saveFees();
  renderFeeStructureList();
  showToast('Fee structure deleted', 'info');
}

// ═══════════════════════════════════════════
// PAYMENT RECORDING
// ═══════════════════════════════════════════
function initFeePaymentForm() {
  const today = new Date().toISOString().split('T')[0];
  const fpDate = document.getElementById('fpDate');
  if (fpDate && !fpDate.value) fpDate.value = today;
  populateFeesDropdowns();
  onFpClassChange();
}

function onFpClassChange() {
  loadFees();
  const classId = document.getElementById('fpClass')?.value;
  const fpStudent = document.getElementById('fpStudent');
  if (!fpStudent) return;

  if (!classId) {
    fpStudent.innerHTML = '<option value="">— Select Student —</option>';
    document.getElementById('fpBalanceCard').style.display = 'none';
    return;
  }

  const classStudents = students.filter(s => s.classId === classId).sort((a,b) => a.name.localeCompare(b.name));
  fpStudent.innerHTML = '<option value="">— Select Student —</option>' + classStudents.map(s => `<option value="${s.id}">${s.name} (${s.adm})</option>`).join('');
  onFpStudentChange();
}

function onFpTermChange() {
  onFpStudentChange();
}

function onFpStudentChange() {
  loadFees();
  const stuId   = document.getElementById('fpStudent')?.value;
  const classId = document.getElementById('fpClass')?.value;
  const term    = document.getElementById('fpTerm')?.value;
  const year    = document.getElementById('fpYear')?.value;
  const card    = document.getElementById('fpBalanceCard');

  if (!stuId || !classId || !term || !year) {
    if (card) card.style.display = 'none'; return;
  }

  const struct = getFeeStructure(classId, term, year);
  const rec    = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  const totalFee = rec ? parseFloat(rec.totalFee||0) : (struct ? parseFloat(struct.totalFee||0) : 0);
  const paid     = rec ? getRecordTotalPaid(rec) : 0;
  const bal      = totalFee - paid;

  document.getElementById('fpTotalFee').textContent  = `KES ${totalFee.toLocaleString()}`;
  document.getElementById('fpAmountPaid').textContent = `KES ${paid.toLocaleString()}`;
  document.getElementById('fpBalance').textContent    = `KES ${bal.toLocaleString()}`;
  document.getElementById('fpBalance').style.color    = bal > 0 ? 'var(--danger)' : 'var(--success)';
  if (card) card.style.display = 'block';
}

function recordFeePayment() {
  const r = currentUser && currentUser.role;
  if (!(r==='superadmin'||r==='admin'||r==='principal'||r==='bursar')) { showToast('Only administrators and the bursar can record payments','error'); return; }
  loadFees();
  const stuId   = document.getElementById('fpStudent')?.value;
  const classId = document.getElementById('fpClass')?.value;
  const term    = document.getElementById('fpTerm')?.value;
  const year    = document.getElementById('fpYear')?.value;
  const amount  = parseFloat(document.getElementById('fpAmount')?.value||0);
  const mode    = document.getElementById('fpMode')?.value || 'Cash';
  const date    = document.getElementById('fpDate')?.value || new Date().toISOString().split('T')[0];
  const notes   = document.getElementById('fpNotes')?.value || '';

  if (!stuId)   { showToast('Please select a student', 'error'); return; }
  if (!classId) { showToast('Please select a class', 'error'); return; }
  if (amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }

  const struct   = getFeeStructure(classId, term, year);
  const totalFee = struct ? parseFloat(struct.totalFee||0) : 0;

  if (!totalFee) {
    showToast('No fee structure set for this class/term/year. Create one first.', 'error'); return;
  }

  // Get or create record
  let rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  if (!rec) {
    rec = { id: uid(), studentId: stuId, classId, term, year: String(year), totalFee, payments: [] };
    feeRecords.push(rec);
  }
  // Update totalFee from structure in case it changed
  rec.totalFee = totalFee;

  const balBefore = getRecordBalance(rec);
  const receiptNo = genReceiptNo();
  const payment = { id: uid(), receiptNo, date, amount, mode, notes, balanceBefore: balBefore, balanceAfter: balBefore - amount };
  rec.payments.push(payment);
  saveFees();

  // Build and show receipt
  const stu = students.find(s => s.id === stuId);
  const cls = classes.find(c => c.id === classId);
  lastReceiptHtml = buildReceiptHTML({ stu, cls, term, year, totalFee, payment, balBefore, balAfter: balBefore - amount, receiptNo, date, mode, notes, amount, schoolName: settings.schoolName || 'School' });

  const previewEl = document.getElementById('receiptPreview');
  if (previewEl) previewEl.innerHTML = lastReceiptHtml;
  const actEl = document.getElementById('receiptActions');
  if (actEl) actEl.style.display = 'flex';

  // Reset amount
  const amtEl = document.getElementById('fpAmount'); if (amtEl) amtEl.value = '';
  const notesEl = document.getElementById('fpNotes'); if (notesEl) notesEl.value = '';
  onFpStudentChange();
  showToast(`Payment of KES ${amount.toLocaleString()} recorded ✓ — Receipt ${receiptNo}`, 'success');

  // Auto-print receipt
  setTimeout(() => printLastReceipt(), 400);
}

function buildReceiptHTML({ stu, cls, term, year, totalFee, payment, balBefore, balAfter, receiptNo, date, mode, notes, amount, schoolName }) {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString('en-KE', { day:'2-digit', month:'long', year:'numeric' });
  const status = balAfter <= 0 ? '<span style="color:#16a34a;font-weight:700">✅ FEES CLEARED</span>' : `<span style="color:#dc2626;font-weight:700">⚠️ BALANCE: KES ${balAfter.toLocaleString()}</span>`;
  return `
    <div class="fee-receipt" id="feeReceiptPrint">
      <div class="rcpt-header">
        <div class="rcpt-logo">CA</div>
        <div class="rcpt-school">
          <strong>${schoolName}</strong>
          <div style="font-size:.75rem;color:#64748b">${settings.address || ''} ${settings.phone ? '| Tel: '+settings.phone : ''}</div>
          <div style="font-weight:700;color:#1a6fb5;font-size:.85rem;margin-top:.15rem">OFFICIAL FEE RECEIPT</div>
        </div>
        <div class="rcpt-no">
          <div style="font-size:.65rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Receipt No.</div>
          <div style="font-size:1rem;font-weight:800;color:#1a6fb5">${receiptNo}</div>
          <div style="font-size:.72rem;color:#64748b">${dateStr}</div>
        </div>
      </div>
      <div class="rcpt-divider"></div>
      <div class="rcpt-body">
        <div class="rcpt-row"><span class="rcpt-lbl">Student Name</span><span class="rcpt-val">${stu?.name || '—'}</span></div>
        <div class="rcpt-row"><span class="rcpt-lbl">Admission No.</span><span class="rcpt-val">${stu?.adm || '—'}</span></div>
        <div class="rcpt-row"><span class="rcpt-lbl">Class</span><span class="rcpt-val">${cls?.name || '—'}</span></div>
        <div class="rcpt-row"><span class="rcpt-lbl">Term / Year</span><span class="rcpt-val">${term} — ${year}</span></div>
        <div class="rcpt-row"><span class="rcpt-lbl">Total Fee</span><span class="rcpt-val">KES ${parseFloat(totalFee).toLocaleString()}</span></div>
        <div class="rcpt-row"><span class="rcpt-lbl">Previous Balance</span><span class="rcpt-val" style="color:#dc2626">KES ${parseFloat(balBefore).toLocaleString()}</span></div>
        <div class="rcpt-divider-sm"></div>
        <div class="rcpt-row rcpt-paid-row">
          <span class="rcpt-lbl">Amount Paid</span>
          <span class="rcpt-val" style="color:#16a34a;font-size:1.1rem;font-weight:800">KES ${parseFloat(amount).toLocaleString()}</span>
        </div>
        <div class="rcpt-row"><span class="rcpt-lbl">Payment Mode</span><span class="rcpt-val">${mode}</span></div>
        ${notes ? `<div class="rcpt-row"><span class="rcpt-lbl">Reference</span><span class="rcpt-val">${notes}</span></div>` : ''}
        <div class="rcpt-divider-sm"></div>
        <div class="rcpt-row rcpt-bal-row">
          <span class="rcpt-lbl">Updated Balance</span>
          <span class="rcpt-val">${status}</span>
        </div>
      </div>
      <div class="rcpt-footer">
        <div class="rcpt-sig">Received by: ……………………………………</div>
        <div class="rcpt-sig">Cashier Stamp: ……………………………………</div>
      </div>
      <div style="text-align:center;font-size:.65rem;color:#94a3b8;margin-top:.5rem">This is a computer-generated receipt. No signature required. — ${schoolName}</div>
    </div>`;
}

function printLastReceipt() {
  if (!lastReceiptHtml) { showToast('No receipt to print','error'); return; }
  const win = window.open('', '_blank', 'width=520,height=750');
  win.document.write(`<!DOCTYPE html><html><head><title>Fee Receipt</title><style>
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
    @page{size:A5 portrait;margin:10mm}
    body{font-family:'Segoe UI',Arial,sans-serif;padding:1.5rem;color:#1e293b;background:#fff;margin:0}
    .fee-receipt{max-width:420px;margin:0 auto;border:2px solid #1a6fb5;border-radius:10px;padding:1.2rem;background:#fff}
    .rcpt-header{display:flex;gap:.75rem;align-items:flex-start;margin-bottom:.75rem}
    .rcpt-logo{width:40px;height:40px;background:linear-gradient(135deg,#1a6fb5,#0ea5e9);border-radius:8px;color:#fff;font-weight:800;font-size:.9rem;display:flex;align-items:center;justify-content:center}
    .rcpt-school{flex:1}.rcpt-school strong{font-size:.95rem;color:#1e293b}
    .rcpt-no{text-align:right;min-width:7rem}
    .rcpt-divider{border-top:2px dashed #1a6fb5;margin:.6rem 0}
    .rcpt-divider-sm{border-top:1px solid #e2e8f0;margin:.4rem 0}
    .rcpt-body{display:flex;flex-direction:column;gap:.3rem}
    .rcpt-row{display:flex;justify-content:space-between;align-items:center;font-size:.82rem;padding:.15rem 0}
    .rcpt-lbl{color:#64748b;font-size:.78rem}.rcpt-val{font-weight:600;color:#1e293b}
    .rcpt-paid-row{background:#f0fdf4!important;border-radius:6px;padding:.3rem .5rem;margin:.25rem 0}
    .rcpt-bal-row{background:#fef3c7!important;border-radius:6px;padding:.3rem .5rem}
    .rcpt-footer{display:flex;justify-content:space-between;margin-top:.75rem;padding-top:.5rem;border-top:1px solid #e2e8f0;font-size:.72rem;color:#94a3b8}
    @media print{
      body{padding:0}
      .fee-receipt{border:2px solid #1a6fb5!important;max-width:100%;border-radius:10px!important}
      .rcpt-logo{background:linear-gradient(135deg,#1a6fb5,#0ea5e9)!important}
      .rcpt-paid-row{background:#f0fdf4!important}
      .rcpt-bal-row{background:#fef3c7!important}
    }
  </style></head><body>${lastReceiptHtml}</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ═══════════════════════════════════════════
// STUDENT BALANCES
// ═══════════════════════════════════════════
function renderStudentBalances() {
  loadFees();
  const filterClass  = document.getElementById('fsbClass')?.value  || '';
  const filterTerm   = document.getElementById('fsbTerm')?.value   || '';
  const filterYear   = document.getElementById('fsbYear')?.value   || '';
  const filterStatus = document.getElementById('fsbStatus')?.value || '';
  const search       = (document.getElementById('fsbSearch')?.value || '').toLowerCase();

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  const tbody = document.getElementById('feeStudentsBody');
  if (!tbody) return;

  // Build rows: one row per student per record
  let rows = [];
  feeRecords.forEach(rec => {
    if (filterTerm   && rec.term !== filterTerm)              return;
    if (filterYear   && String(rec.year) !== filterYear)      return;
    if (filterClass  && rec.classId !== filterClass)          return;
    if (teacherClassIds && !teacherClassIds.includes(rec.classId)) return;

    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    const cls = classes.find(c => c.id === rec.classId);
    const paid = getRecordTotalPaid(rec);
    const bal  = getRecordBalance(rec);
    const pct  = rec.totalFee > 0 ? Math.round(paid/rec.totalFee*100) : 0;
    let statusKey = bal <= 0 ? 'cleared' : paid > 0 ? 'partial' : 'unpaid';

    if (filterStatus && statusKey !== filterStatus) return;
    if (search && !stu.name.toLowerCase().includes(search) && !stu.adm.toLowerCase().includes(search)) return;

    rows.push({ rec, stu, cls, paid, bal, pct, statusKey });
  });

  // Also add students with NO record if a structure exists for them
  students.forEach(stu => {
    const clsId = stu.classId;
    if (teacherClassIds && !teacherClassIds.includes(clsId)) return;
    if (filterClass && clsId !== filterClass) return;

    const structs = feeStructures.filter(f => f.classId===clsId
      && (!filterTerm || f.term===filterTerm)
      && (!filterYear || String(f.year)===filterYear));

    structs.forEach(struct => {
      const exists = feeRecords.some(r => r.studentId===stu.id && r.term===struct.term && String(r.year)===struct.year);
      if (exists) return;

      if (filterStatus && filterStatus !== 'unpaid') return;
      if (search && !stu.name.toLowerCase().includes(search) && !stu.adm.toLowerCase().includes(search)) return;

      const cls = classes.find(c => c.id === clsId);
      rows.push({ rec: { id: null, studentId: stu.id, classId: clsId, term: struct.term, year: struct.year, totalFee: struct.totalFee, payments: [] }, stu, cls, paid: 0, bal: struct.totalFee, pct: 0, statusKey: 'unpaid' });
    });
  });

  rows.sort((a,b) => a.stu.name.localeCompare(b.stu.name));

  tbody.innerHTML = rows.length ? rows.map((r, i) => {
    const statusBadge = r.statusKey === 'cleared'
      ? '<span class="badge b-green">✅ Cleared</span>'
      : r.statusKey === 'partial'
        ? '<span class="badge b-amber">⚡ Partial</span>'
        : '<span class="badge b-red">❌ Unpaid</span>';
    return `
      <tr class="${r.statusKey==='unpaid'?'fee-defaulter':r.statusKey==='partial'?'fee-partial':''}">
        <td>${i+1}</td>
        <td>${r.stu.adm}</td>
        <td><strong>${r.stu.name}</strong></td>
        <td>${r.cls?.name || '—'}</td>
        <td>${r.rec.term} ${r.rec.year}</td>
        <td>KES ${parseFloat(r.rec.totalFee||0).toLocaleString()}</td>
        <td style="color:var(--success)">KES ${r.paid.toLocaleString()}</td>
        <td style="color:${r.bal>0?'var(--danger)':'var(--success)'}"><strong>KES ${r.bal.toLocaleString()}</strong></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="viewStudentPaymentHistory('${r.stu.id}','${r.rec.term}','${r.rec.year}')">📋 History</button>
          <button class="btn btn-sm btn-outline" onclick="quickPayStudent('${r.stu.id}','${r.rec.classId}','${r.rec.term}','${r.rec.year}')">💳 Pay</button>
        </td>
      </tr>`;
  }).join('') : '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:2rem">No fee records found.</td></tr>';
}

function viewStudentPaymentHistory(stuId, term, year) {
  loadFees();
  const stu = students.find(s => s.id === stuId);
  const rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  if (!stu) return;

  const payments = rec ? rec.payments : [];
  const paid = rec ? getRecordTotalPaid(rec) : 0;
  const bal  = rec ? getRecordBalance(rec) : 0;

  showModal(`💳 ${stu.name} — Payment History (${term} ${year})`, `
    <div style="margin-bottom:1rem">
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <div class="fbc-row"><span class="fbc-label">Total Fee</span><span class="fbc-val">KES ${parseFloat(rec?.totalFee||0).toLocaleString()}</span></div>
        <div class="fbc-row"><span class="fbc-label">Paid</span><span class="fbc-val fbc-green">KES ${paid.toLocaleString()}</span></div>
        <div class="fbc-row"><span class="fbc-label">Balance</span><span class="fbc-val fbc-red">KES ${bal.toLocaleString()}</span></div>
      </div>
    </div>
    ${payments.length ? `
      <table style="width:100%;font-size:.82rem;border-collapse:collapse">
        <thead><tr style="background:var(--surface)"><th style="padding:.4rem;text-align:left">Receipt No</th><th>Date</th><th>Amount</th><th>Mode</th><th>Balance After</th><th></th></tr></thead>
        <tbody>${payments.map(p => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:.35rem;font-family:monospace;color:var(--primary)">${p.receiptNo}</td>
            <td style="padding:.35rem">${p.date}</td>
            <td style="padding:.35rem;color:var(--success);font-weight:700">KES ${parseFloat(p.amount).toLocaleString()}</td>
            <td style="padding:.35rem">${p.mode}</td>
            <td style="padding:.35rem;color:${p.balanceAfter>0?'var(--danger)':'var(--success)'}">KES ${parseFloat(p.balanceAfter||0).toLocaleString()}</td>
            <td style="padding:.35rem"><button class="btn btn-sm btn-outline" onclick="reprintReceipt('${stuId}','${term}','${year}','${p.id}')">🖨</button></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p style="color:var(--muted);text-align:center;padding:1rem">No payments recorded yet.</p>'}
  `, [{label:'✕ Close', cls:'btn-outline', action:'closeModal()'}]);
}

function quickPayStudent(stuId, classId, term, year) {
  closeModal();
  openFeesTab('tabFeePayments', document.getElementById('tbFeePayments'));
  setTimeout(() => {
    const cls = document.getElementById('fpClass');
    if (cls) { cls.value = classId; onFpClassChange(); }
    const yr  = document.getElementById('fpYear');
    if (yr)  yr.value  = year;
    const trm = document.getElementById('fpTerm');
    if (trm) trm.value = term;
    setTimeout(() => {
      const stu = document.getElementById('fpStudent');
      if (stu) { stu.value = stuId; onFpStudentChange(); }
    }, 100);
  }, 150);
}

function reprintReceipt(stuId, term, year, payId) {
  loadFees();
  const rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  if (!rec) return;
  const payment = rec.payments.find(p => p.id === payId);
  if (!payment) return;
  const stu = students.find(s => s.id === stuId);
  const cls = classes.find(c => c.id === rec.classId);
  lastReceiptHtml = buildReceiptHTML({ stu, cls, term, year, totalFee: rec.totalFee, payment, balBefore: payment.balanceBefore, balAfter: payment.balanceAfter, receiptNo: payment.receiptNo, date: payment.date, mode: payment.mode, notes: payment.notes, amount: payment.amount, schoolName: settings.schoolName || 'School' });
  printLastReceipt();
}

// ═══════════════════════════════════════════
// FEE REMINDERS
// ═══════════════════════════════════════════
function renderFeeReminders() {
  loadFees();
  const filterClass = document.getElementById('fremClass')?.value || '';
  const filterTerm  = document.getElementById('fremTerm')?.value  || '';
  const filterYear  = document.getElementById('fremYear')?.value  || '';

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  // Find defaulters: students with outstanding balance > 0
  const defaulters = [];
  feeRecords.forEach(rec => {
    if (filterClass && rec.classId !== filterClass) return;
    if (filterTerm  && rec.term !== filterTerm)     return;
    if (filterYear  && String(rec.year) !== filterYear) return;
    if (teacherClassIds && !teacherClassIds.includes(rec.classId)) return;
    const bal = getRecordBalance(rec);
    if (bal <= 0) return;
    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    const cls = classes.find(c => c.id === rec.classId);
    defaulters.push({ rec, stu, cls, bal, paid: getRecordTotalPaid(rec) });
  });

  // Also unpaid students with structure
  students.forEach(stu => {
    if (teacherClassIds && !teacherClassIds.includes(stu.classId)) return;
    if (filterClass && stu.classId !== filterClass) return;
    const structs = feeStructures.filter(f => f.classId===stu.classId
      && (!filterTerm || f.term===filterTerm)
      && (!filterYear || String(f.year)===filterYear));
    structs.forEach(struct => {
      const exists = feeRecords.some(r => r.studentId===stu.id && r.term===struct.term && String(r.year)===struct.year);
      if (exists) return;
      const cls = classes.find(c => c.id === stu.classId);
      defaulters.push({ rec: { term: struct.term, year: struct.year, totalFee: struct.totalFee, payments: [] }, stu, cls, bal: struct.totalFee, paid: 0 });
    });
  });

  defaulters.sort((a,b) => b.bal - a.bal);

  const el = document.getElementById('feeRemindersList');
  if (!el) return;

  if (!defaulters.length) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:2.5rem;color:var(--muted)">🎉 No outstanding fee balances found! All students have cleared their fees.</div>';
    return;
  }

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <p style="color:var(--muted);font-size:.85rem">Showing <strong>${defaulters.length}</strong> student(s) with outstanding balances. Click any reminder to print individually.</p>
    </div>
    <div class="fee-reminders-grid">
      ${defaulters.map(d => buildReminderCardHTML(d)).join('')}
    </div>`;
}

function buildReminderCardHTML({ stu, cls, rec, bal, paid }) {
  const schoolName = settings.schoolName || 'The School';
  const term = rec.term, year = rec.year;
  const today = new Date().toLocaleDateString('en-KE', { day:'2-digit', month:'long', year:'numeric' });
  return `
    <div class="reminder-card" onclick="printSingleReminder('${stu.id}','${term}','${year}')">
      <div class="rm-header">
        <div class="rm-badge">⚠️ FEE REMINDER</div>
        <div class="rm-date">${today}</div>
      </div>
      <div class="rm-school">${schoolName}</div>
      <div class="rm-body">
        <p>Dear Parent/Guardian of <strong>${stu.name}</strong>,</p>
        <p>This is a kind reminder that your child's school fees for <strong>${term} ${year}</strong> are outstanding.</p>
        <div class="rm-amounts">
          <div class="rm-amount-row"><span>Class:</span><strong>${cls?.name || '—'}</strong></div>
          <div class="rm-amount-row"><span>Total Fee:</span><strong>KES ${parseFloat(rec.totalFee||0).toLocaleString()}</strong></div>
          <div class="rm-amount-row"><span>Amount Paid:</span><strong style="color:var(--success)">KES ${parseFloat(paid).toLocaleString()}</strong></div>
          <div class="rm-amount-row rm-outstanding"><span>Outstanding Balance:</span><strong style="color:var(--danger)">KES ${parseFloat(bal).toLocaleString()}</strong></div>
        </div>
        <p style="font-size:.78rem;color:var(--muted)">Kindly settle the outstanding amount at your earliest convenience to avoid inconveniences to your child's education. Contact the school for payment arrangements.</p>
      </div>
      <div class="rm-footer">
        <span>Adm: ${stu.adm}</span>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();printSingleReminder('${stu.id}','${term}','${year}')">🖨 Print</button>
      </div>
    </div>`;
}

function printSingleReminder(stuId, term, year) {
  loadFees();
  const stu = students.find(s => s.id === stuId); if (!stu) return;
  const rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  const struct = rec ? null : feeStructures.find(f => f.classId===stu.classId && f.term===term && String(f.year)===String(year));
  const totalFee = rec ? rec.totalFee : (struct ? struct.totalFee : 0);
  const paid     = rec ? getRecordTotalPaid(rec) : 0;
  const bal      = totalFee - paid;
  const cls      = classes.find(c => c.id === stu.classId);
  const d = { stu, cls, rec: rec||{ term, year, totalFee, payments: [] }, bal, paid };

  const win = window.open('', '_blank', 'width=550,height=700');
  win.document.write(`<!DOCTYPE html><html><head><title>Fee Reminder — ${stu.name}</title><style>
    body{font-family:'Segoe UI',sans-serif;padding:2rem;color:#1e293b;background:#fff;max-width:480px;margin:0 auto}
    .rm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
    .rm-badge{background:#dc2626;color:#fff;padding:.25rem .75rem;border-radius:20px;font-size:.75rem;font-weight:700}
    .rm-school{font-weight:800;font-size:1.1rem;color:#1a6fb5;margin-bottom:.75rem}
    .rm-amounts{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;margin:.75rem 0}
    .rm-amount-row{display:flex;justify-content:space-between;padding:.2rem 0;font-size:.85rem;border-bottom:1px solid #e2e8f0}
    .rm-amount-row:last-child{border:none} .rm-outstanding{background:#fff1f2;border-radius:4px;padding:.3rem .5rem}
    p{font-size:.85rem;line-height:1.5;margin:.5rem 0}
    .rm-footer{display:flex;justify-content:space-between;margin-top:1rem;padding-top:.75rem;border-top:2px dashed #e2e8f0;font-size:.75rem;color:#94a3b8}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A5 portrait;margin:12mm}
    @media print{button{display:none!important}.rm-badge{background:#dc2626!important;color:#fff!important}.rm-outstanding{background:#fff1f2!important}}
  </style></head><body>
    <div class="rm-header"><div class="rm-badge">⚠️ FEE REMINDER</div><div>${new Date().toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'})}</div></div>
    <div class="rm-school">${settings.schoolName || 'School'}</div>
    <p>Dear Parent/Guardian of <strong>${stu.name}</strong>,</p>
    <p>This is a kind reminder that your child's school fees for <strong>${term} ${year}</strong> are outstanding.</p>
    <div class="rm-amounts">
      <div class="rm-amount-row"><span>Class</span><strong>${cls?.name||'—'}</strong></div>
      <div class="rm-amount-row"><span>Admission No.</span><strong>${stu.adm}</strong></div>
      <div class="rm-amount-row"><span>Total Fee</span><strong>KES ${parseFloat(totalFee).toLocaleString()}</strong></div>
      <div class="rm-amount-row"><span>Amount Paid</span><strong style="color:green">KES ${parseFloat(paid).toLocaleString()}</strong></div>
      <div class="rm-amount-row rm-outstanding"><span>Outstanding Balance</span><strong style="color:#dc2626">KES ${parseFloat(bal).toLocaleString()}</strong></div>
    </div>
    <p>Kindly settle the outstanding balance at your earliest convenience. Please visit the school bursar's office or contact us for payment arrangements.</p>
    <p style="font-size:.78rem;color:#64748b">We value your child's education and look forward to your prompt response.</p>
    <div class="rm-footer"><span>Generated: ${new Date().toLocaleString()}</span><span>${settings.schoolName||''}</span></div>
    <button onclick="window.print()" style="margin-top:1rem;padding:.5rem 1.5rem;background:#1a6fb5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85rem">🖨 Print Reminder</button>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

function printAllReminders() {
  loadFees();
  const filterClass = document.getElementById('fremClass')?.value || '';
  const filterTerm  = document.getElementById('fremTerm')?.value  || '';
  const filterYear  = document.getElementById('fremYear')?.value  || '';
  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  const defaulters = [];
  feeRecords.forEach(rec => {
    if (filterClass && rec.classId !== filterClass) return;
    if (filterTerm  && rec.term !== filterTerm)     return;
    if (filterYear  && String(rec.year) !== filterYear) return;
    if (teacherClassIds && !teacherClassIds.includes(rec.classId)) return;
    const bal = getRecordBalance(rec);
    if (bal <= 0) return;
    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    const cls = classes.find(c => c.id === rec.classId);
    defaulters.push({ rec, stu, cls, bal, paid: getRecordTotalPaid(rec) });
  });

  if (!defaulters.length) { showToast('No defaulters to print reminders for', 'info'); return; }

  const reminderBlocks = defaulters.map(d => {
    const { stu, cls, rec, bal, paid } = d;
    return `
      <div style="page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:8px;padding:1.2rem;margin-bottom:1.5rem">
        <div style="display:flex;justify-content:space-between"><span style="background:#dc2626;color:#fff;padding:.2rem .6rem;border-radius:20px;font-size:.72rem;font-weight:700">⚠️ FEE REMINDER</span><span style="font-size:.8rem;color:#64748b">${new Date().toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'})}</span></div>
        <div style="font-weight:800;font-size:1rem;color:#1a6fb5;margin:.5rem 0">${settings.schoolName||'School'}</div>
        <p style="font-size:.82rem;margin:.35rem 0">Dear Parent/Guardian of <strong>${stu.name}</strong> (Adm: ${stu.adm}, ${cls?.name||''}),</p>
        <p style="font-size:.82rem;margin:.35rem 0">Your child's fees for <strong>${rec.term} ${rec.year}</strong> are outstanding:</p>
        <div style="background:#f8fafc;border-radius:6px;padding:.5rem .75rem;margin:.5rem 0;font-size:.8rem">
          <div style="display:flex;justify-content:space-between;padding:.15rem 0"><span>Total Fee:</span><strong>KES ${parseFloat(rec.totalFee||0).toLocaleString()}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:.15rem 0"><span>Paid:</span><strong style="color:green">KES ${parseFloat(paid).toLocaleString()}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:.15rem 0;background:#fff1f2;border-radius:4px;padding:.2rem .4rem"><span>Outstanding:</span><strong style="color:#dc2626">KES ${parseFloat(bal).toLocaleString()}</strong></div>
        </div>
        <p style="font-size:.75rem;color:#64748b;margin:.35rem 0">Kindly settle this balance promptly. Contact school administration for assistance.</p>
      </div>`;
  }).join('');

  const win = window.open('', '_blank', 'width=700,height=800');
  win.document.write(`<!DOCTYPE html><html><head><title>Fee Reminders</title><style>body{font-family:'Segoe UI',sans-serif;padding:2rem;color:#1e293b;max-width:600px;margin:0 auto}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4 portrait;margin:12mm}@media print{button{display:none!important}}</style></head><body>
    <div style="text-align:center;margin-bottom:2rem">
      <h2 style="color:#1a6fb5">${settings.schoolName||'School'} — Fee Reminders</h2>
      <p style="color:#64748b;font-size:.85rem">Generated: ${new Date().toLocaleString()} | ${filterTerm||'All Terms'} ${filterYear||''} | ${defaulters.length} students</p>
    </div>
    ${reminderBlocks}
    <button onclick="window.print()" style="padding:.6rem 1.5rem;background:#1a6fb5;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print All Reminders</button>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ═══════════════════════════════════════════
// RECEIPTS LOG
// ═══════════════════════════════════════════
function renderReceiptsLog() {
  loadFees();
  const filterClass = document.getElementById('frctClass')?.value || '';
  const filterTerm  = document.getElementById('frctTerm')?.value  || '';
  const search      = (document.getElementById('frctSearch')?.value || '').toLowerCase();
  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  let allPayments = [];
  feeRecords.forEach(rec => {
    if (filterClass && rec.classId !== filterClass) return;
    if (filterTerm  && rec.term !== filterTerm)     return;
    if (teacherClassIds && !teacherClassIds.includes(rec.classId)) return;
    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    const cls = classes.find(c => c.id === rec.classId);
    rec.payments.forEach(p => {
      if (search && !stu.name.toLowerCase().includes(search) && !p.receiptNo.toLowerCase().includes(search) && !stu.adm.toLowerCase().includes(search)) return;
      allPayments.push({ p, rec, stu, cls });
    });
  });

  allPayments.sort((a,b) => new Date(b.p.date) - new Date(a.p.date));

  const tbody = document.getElementById('receiptsLogBody');
  if (!tbody) return;
  tbody.innerHTML = allPayments.length ? allPayments.map(({ p, rec, stu, cls }) => `
    <tr>
      <td style="font-family:monospace;color:var(--primary);font-size:.8rem">${p.receiptNo}</td>
      <td>${p.date}</td>
      <td><strong>${stu.name}</strong><br><span style="font-size:.75rem;color:var(--muted)">${stu.adm}</span></td>
      <td>${cls?.name||'—'}</td>
      <td>${rec.term} ${rec.year}</td>
      <td style="color:var(--success);font-weight:700">KES ${parseFloat(p.amount).toLocaleString()}</td>
      <td>${p.mode}</td>
      <td style="color:${p.balanceAfter>0?'var(--danger)':'var(--success)'}">KES ${parseFloat(p.balanceAfter||0).toLocaleString()}</td>
      <td><button class="btn btn-sm btn-outline" onclick="reprintReceipt('${stu.id}','${rec.term}','${rec.year}','${p.id}')">🖨 Reprint</button></td>
    </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">No payment receipts found.</td></tr>';
}

// ═══════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════
function exportFeesSummary() {
  loadFees();
  const filterClass = document.getElementById('fovClass')?.value || '';
  const filterTerm  = document.getElementById('fovTerm')?.value  || '';
  const filterYear  = document.getElementById('fovYear')?.value  || '';

  let rows = [['Student Name','Adm No','Class','Term','Year','Total Fee','Amount Paid','Balance','Status']];
  feeRecords.forEach(rec => {
    if (filterClass && rec.classId !== filterClass) return;
    if (filterTerm  && rec.term !== filterTerm)     return;
    if (filterYear  && String(rec.year) !== filterYear) return;
    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    const cls = classes.find(c => c.id === rec.classId);
    const paid = getRecordTotalPaid(rec);
    const bal  = getRecordBalance(rec);
    const status = bal <= 0 ? 'Cleared' : paid > 0 ? 'Partial' : 'Unpaid';
    rows.push([stu.name, stu.adm, cls?.name||'', rec.term, rec.year, rec.totalFee, paid, bal, status]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `fees_summary_${filterTerm||'all'}_${filterYear||'all'}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Fee summary exported ✓', 'success');
}

function exportStudentBalances() {
  exportFeesSummary();
}

// ── Fee PDF Statement ──
function downloadFeeStatementPDF() {
  loadFees();
  const filterClass  = document.getElementById('fsbClass')?.value  || '';
  const filterTerm   = document.getElementById('fsbTerm')?.value   || '';
  const filterYear   = document.getElementById('fsbYear')?.value   || '';
  const filterStatus = document.getElementById('fsbStatus')?.value || '';
  const search       = (document.getElementById('fsbSearch')?.value || '').toLowerCase();
  const schoolName   = (settings && settings.schoolName) ? settings.schoolName : 'School';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(schoolName, 14, 11);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('FEE STATEMENT', 14, 18);
  const today = new Date().toLocaleDateString('en-KE', { day:'2-digit', month:'long', year:'numeric' });
  doc.text(`Generated: ${today}`, 14, 24);

  // Filter info
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8.5);
  let filterText = [];
  if (filterClass) { const cls = classes.find(c=>c.id===filterClass); if(cls) filterText.push(`Class: ${cls.name}`); }
  if (filterTerm)  filterText.push(`Term: ${filterTerm}`);
  if (filterYear)  filterText.push(`Year: ${filterYear}`);
  if (filterStatus) filterText.push(`Status: ${filterStatus.charAt(0).toUpperCase()+filterStatus.slice(1)}`);
  if (filterText.length) doc.text('Filters: ' + filterText.join('  |  '), 14, 34);

  // Build rows
  let rows = [];
  let totalExpected = 0, totalPaid = 0, totalBal = 0;

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const isFullFeesRole = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal'||currentUser.role==='bursar');
  const teacherClassIds = (isTeacher && !isFullFeesRole)
    ? [...new Set(getClassTeacherStreamIds(currentUser.teacherId).map(sid => { const s=streams.find(x=>x.id===sid); return s?s.classId:null; }).filter(Boolean))]
    : null;

  feeRecords.forEach(rec => {
    if (filterTerm   && rec.term !== filterTerm)              return;
    if (filterYear   && String(rec.year) !== filterYear)      return;
    if (filterClass  && rec.classId !== filterClass)          return;
    if (teacherClassIds && !teacherClassIds.includes(rec.classId)) return;
    const stu = students.find(s => s.id === rec.studentId); if (!stu) return;
    if (search && !stu.name.toLowerCase().includes(search) && !stu.adm.toLowerCase().includes(search)) return;
    const cls   = classes.find(c => c.id === rec.classId);
    const paid  = getRecordTotalPaid(rec);
    const bal   = getRecordBalance(rec);
    const status = bal <= 0 ? 'Cleared' : paid > 0 ? 'Partial' : 'Unpaid';
    if (filterStatus && status.toLowerCase() !== filterStatus) return;
    totalExpected += parseFloat(rec.totalFee||0);
    totalPaid     += paid;
    totalBal      += bal;
    rows.push([stu.adm, stu.name, cls?.name||'—', `${rec.term} ${rec.year}`, `KES ${parseFloat(rec.totalFee||0).toLocaleString()}`, `KES ${paid.toLocaleString()}`, `KES ${bal.toLocaleString()}`, status]);
  });

  // Also unpaid rows
  students.forEach(stu => {
    const clsId = stu.classId;
    if (teacherClassIds && !teacherClassIds.includes(clsId)) return;
    if (filterClass && clsId !== filterClass) return;
    if (search && !stu.name.toLowerCase().includes(search) && !stu.adm.toLowerCase().includes(search)) return;
    const structs = feeStructures.filter(f => f.classId===clsId && (!filterTerm||f.term===filterTerm) && (!filterYear||String(f.year)===filterYear));
    structs.forEach(struct => {
      if (feeRecords.some(r => r.studentId===stu.id && r.term===struct.term && String(r.year)===struct.year)) return;
      if (filterStatus && filterStatus !== 'unpaid') return;
      const cls = classes.find(c=>c.id===clsId);
      totalExpected += parseFloat(struct.totalFee||0);
      totalBal      += parseFloat(struct.totalFee||0);
      rows.push([stu.adm, stu.name, cls?.name||'—', `${struct.term} ${struct.year}`, `KES ${parseFloat(struct.totalFee||0).toLocaleString()}`, 'KES 0', `KES ${parseFloat(struct.totalFee||0).toLocaleString()}`, 'Unpaid']);
    });
  });

  rows.sort((a,b) => a[1].localeCompare(b[1]));

  const startY = filterText.length ? 38 : 32;

  doc.autoTable({
    startY,
    head: [['Adm No', 'Student Name', 'Class', 'Term/Year', 'Total Fee', 'Paid', 'Balance', 'Status']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: { 1: { cellWidth: 38 }, 7: { fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const val = data.cell.raw;
        if (val === 'Cleared') data.cell.styles.textColor = [22, 163, 74];
        else if (val === 'Partial') data.cell.styles.textColor = [202, 138, 4];
        else data.cell.styles.textColor = [220, 38, 38];
      }
    },
    margin: { left: 14, right: 14 }
  });

  // Summary footer
  const finalY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(245, 247, 250);
  doc.rect(14, finalY, 182, 18, 'F');
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(`Total Students: ${rows.length}`, 18, finalY + 5.5);
  doc.setTextColor(37, 99, 235);
  doc.text(`Expected: KES ${totalExpected.toLocaleString()}`, 18, finalY + 12);
  doc.setTextColor(22, 163, 74);
  doc.text(`Collected: KES ${totalPaid.toLocaleString()}`, 75, finalY + 12);
  doc.setTextColor(220, 38, 38);
  doc.text(`Outstanding: KES ${totalBal.toLocaleString()}`, 135, finalY + 12);

  const label = [filterClass&&classes.find(c=>c.id===filterClass)?.name, filterTerm, filterYear].filter(Boolean).join('_') || 'all';
  doc.save(`fee_statement_${label}.pdf`);
  showToast('Fee statement PDF downloaded ✓', 'success');
}

// ── Fee Excel Import ──
function handleFeeImport(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      loadFees();
      let added = 0, updated = 0, skipped = 0;
      data.forEach(row => {
        const admNo  = String(row['AdmNo']  || row['admno']  || row['Adm No'] || '').trim();
        const term   = String(row['Term']   || row['term']   || '').trim();
        const year   = String(row['Year']   || row['year']   || '').trim();
        const total  = parseFloat(row['TotalFee']    || row['total_fee']    || 0);
        const amount = parseFloat(row['AmountPaid']  || row['amount_paid']  || 0);
        const mode   = String(row['PaymentMode'] || row['payment_mode'] || 'Cash').trim();
        const notes  = String(row['Notes']  || row['notes']  || '').trim();
        const rno    = String(row['ReceiptNo'] || row['receipt_no'] || genReceiptNo()).trim();
        let   pdate  = String(row['PaymentDate'] || row['payment_date'] || '').trim();
        if (!pdate) pdate = new Date().toISOString().slice(0,10);

        if (!admNo || !term || !year || !total) { skipped++; return; }
        const stu = students.find(s => s.adm === admNo);
        if (!stu) { skipped++; return; }

        let rec = feeRecords.find(r => r.studentId===stu.id && r.term===term && String(r.year)===year);
        if (!rec) {
          rec = { id: uid(), studentId: stu.id, classId: stu.classId, term, year, totalFee: total, payments: [] };
          feeRecords.push(rec);
          added++;
        } else {
          if (total) rec.totalFee = total;
          updated++;
        }

        if (amount > 0) {
          const balBefore = getRecordBalance(rec);
          const balAfter  = Math.max(0, balBefore - amount);
          rec.payments.push({ id: uid(), receiptNo: rno, date: pdate, amount, mode, notes, balanceBefore: balBefore, balanceAfter: balAfter });
        }
      });
      saveFees();
      renderStudentBalances && renderStudentBalances();
      renderFeeOverview    && renderFeeOverview();
      showToast(`${added} new records, ${updated} updated, ${skipped} skipped ✓`, 'success');
    } catch(err) { showToast('Error reading file', 'error'); console.error(err); }
  };
  reader.readAsArrayBuffer(file); input.value = '';
}

function downloadFeeImportTemplate() {
  const data = [{
    AdmNo: 'ADM001', Term: 'Term 1', Year: '2025', TotalFee: 12000,
    AmountPaid: 6000, PaymentDate: '2025-01-15', PaymentMode: 'Mpesa',
    ReceiptNo: 'RCP001', Notes: 'First instalment'
  }];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'FeePayments');
  XLSX.writeFile(wb, 'fee_payments_template.xlsx');
}


  loadFees();
  const filterClass = document.getElementById('fovClass')?.value || '';
  const filterTerm  = document.getElementById('fovTerm')?.value  || '';
  const filterYear  = document.getElementById('fovYear')?.value  || '';
  const visibleClasses = filterClass ? classes.filter(c=>c.id===filterClass) : classes;

  let totalExp=0, totalCol=0, totalOut=0;
  const tableRows = visibleClasses.map(cls => {
    const classStudents = students.filter(s => s.classId === cls.id);
    let expected=0, collected=0;
    classStudents.forEach(stu => {
      const recs = feeRecords.filter(r => r.studentId===stu.id && (!filterTerm||r.term===filterTerm) && (!filterYear||String(r.year)===filterYear));
      recs.forEach(r => { expected += parseFloat(r.totalFee||0); collected += getRecordTotalPaid(r); });
    });
    const out = expected - collected;
    const pct = expected > 0 ? Math.round(collected/expected*100) : 0;
    totalExp += expected; totalCol += collected; totalOut += out;
    return `<tr><td>${cls.name}</td><td>${classStudents.length}</td><td>KES ${expected.toLocaleString()}</td><td>KES ${collected.toLocaleString()}</td><td style="color:${out>0?'#dc2626':'#16a34a'}">KES ${out.toLocaleString()}</td><td>${pct}%</td></tr>`;
  }).join('');

  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(`<!DOCTYPE html><html><head><title>Fee Report</title><style>
    body{font-family:'Segoe UI',sans-serif;padding:2rem;color:#1e293b}
    h2{color:#1a6fb5} table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.88rem}
    th{background:#1a6fb5;color:#fff;padding:.5rem;text-align:left}
    td{padding:.45rem;border-bottom:1px solid #e2e8f0}
    tfoot td{font-weight:700;background:#f8fafc;border-top:2px solid #1a6fb5}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A5 portrait;margin:12mm}
    @media print{button{display:none!important}.rm-badge{background:#dc2626!important;color:#fff!important}.rm-outstanding{background:#fff1f2!important}}
  </style></head><body>
    <h2>${settings.schoolName||'School'} — Fee Collection Report</h2>
    <p style="color:#64748b;font-size:.85rem">${filterTerm||'All Terms'} ${filterYear||''} | Generated: ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>Class</th><th>Students</th><th>Expected</th><th>Collected</th><th>Outstanding</th><th>Rate</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr><td>TOTALS</td><td>${students.length}</td><td>KES ${totalExp.toLocaleString()}</td><td>KES ${totalCol.toLocaleString()}</td><td style="color:${totalOut>0?'#dc2626':'#16a34a'}">KES ${totalOut.toLocaleString()}</td><td>${totalExp>0?Math.round(totalCol/totalExp*100):0}%</td></tr></tfoot>
    </table>
    <button onclick="window.print()" style="margin-top:1rem;padding:.5rem 1.2rem;background:#1a6fb5;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Print</button>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); }, 300);

// ═══════════════════════════════════════════
// REPORT FORM INTEGRATION
// ═══════════════════════════════════════════
// Auto-populate fee balance on report form when student is selected
function autoPopulateReportFees(stuId, term, year) {
  if (!stuId || !term || !year) return;
  loadFees();
  const rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  if (!rec) return;
  const bal  = getRecordBalance(rec);
  const balEl = document.getElementById('rpFeeBalance');
  if (balEl && !balEl.value) balEl.value = bal;
}

// Hook into report selectors — delegates to refreshRpFeeAutoLink()
function hookReportFeeAutoFill() {
  const rpStudent = document.getElementById('rpStudent');
  const rpExam    = document.getElementById('rpExam');
  const balEl     = document.getElementById('rpFeeBalance');
  const nextTermEl= document.getElementById('rpFeeNextTerm');
  if (!rpStudent || !rpExam) return;
  // Track manual edits so auto-fill doesn't overwrite user input
  if (balEl)      balEl.addEventListener('input',  () => { balEl.dataset.manuallySet      = balEl.value      ? '1' : ''; });
  if (nextTermEl) nextTermEl.addEventListener('input', () => { nextTermEl.dataset.manuallySet = nextTermEl.value ? '1' : ''; });
  // All change events delegate to the central handler
  rpStudent.addEventListener('change', refreshRpFeeAutoLink);
  rpExam.addEventListener('change', refreshRpFeeAutoLink);
}

// Get fee status for report card badge
function getStudentFeeStatus(stuId, term, year) {
  loadFees();
  const rec = feeRecords.find(r => r.studentId===stuId && r.term===term && String(r.year)===String(year));
  if (!rec) return { status: 'No Record', cleared: false, balance: null };
  const bal = getRecordBalance(rec);
  return { status: bal <= 0 ? 'FEES CLEARED ✅' : `BALANCE: KES ${bal.toLocaleString()}`, cleared: bal <= 0, balance: bal };
}

// Modal helpers reuse existing showModal() and closeModal() defined earlier in the file.


// ══════════════════════════════════════════════════════════
//  UNIVERSAL TABLE SORT — Charanas Analyzer
// ══════════════════════════════════════════════════════════

const _sortState = {}; // { tbodyId: { col, dir } }

function sortTable(tbodyId, colIndex, type) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (!rows.length) return;

  // Toggle direction
  const prev = _sortState[tbodyId] || {};
  const dir  = (prev.col === colIndex && prev.dir === 'asc') ? 'desc' : 'asc';
  _sortState[tbodyId] = { col: colIndex, dir };

  // Update sort icons in the parent thead
  const thead = tbody.closest('table')?.querySelector('thead');
  if (thead) {
    thead.querySelectorAll('.sort-ico').forEach(ico => ico.textContent = '⇅');
    thead.querySelectorAll('.sortable-th').forEach(th => th.classList.remove('sort-asc','sort-desc'));
    const ths = thead.querySelectorAll('th');
    if (ths[colIndex]) {
      ths[colIndex].classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
      const ico = ths[colIndex].querySelector('.sort-ico');
      if (ico) ico.textContent = dir === 'asc' ? '▲' : '▼';
    }
  }

  function getCellValue(row, idx) {
    const cell = row.cells[idx];
    if (!cell) return '';
    return (cell.dataset.sortVal || cell.innerText || cell.textContent || '').trim();
  }

  function parseVal(raw, t) {
    switch (t) {
      case 'num':  return parseFloat(raw.replace(/[^0-9.\-]/g,'')) || 0;
      case 'kes':  return parseFloat(raw.replace(/[^0-9.\-]/g,'')) || 0;
      case 'pct':  return parseFloat(raw.replace(/[^0-9.\-]/g,'')) || 0;
      case 'date': return new Date(raw).getTime() || 0;
      default:     return raw.toLowerCase();
    }
  }

  rows.sort((a, b) => {
    const va = parseVal(getCellValue(a, colIndex), type);
    const vb = parseVal(getCellValue(b, colIndex), type);
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  rows.forEach(r => tbody.appendChild(r));
}


// ══════════════════════════════════════════════════════════
//  TEACHER PREFERENCES & ROLE-BASED ACCESS — Charanas Analyzer
// ══════════════════════════════════════════════════════════

// ── Resolve current teacher object ──
function getCurrentTeacher() {
  if (!currentUser || currentUser.role !== 'teacher') return null;
  return teachers.find(t => t.id === currentUser.teacherId) || null;
}

// ── Teacher self-service: download class list for all their assigned subjects ──
function downloadMyTeacherClassList() {
  const t = getCurrentTeacher();
  if (!t) { showToast('Not logged in as a teacher','error'); return; }
  downloadTeacherSubjectList(t.id);
}

// ── Get subjects this teacher teaches (union of stream assignments + default) ──
function getMySubjectIds() {
  const t = getCurrentTeacher();
  if (!t) return [];
  return getTeacherSubjectIds(t.id);
}

// ── Get streams this teacher is class teacher of ──
function getMyClassTeacherStreams() {
  const t = getCurrentTeacher();
  if (!t) return [];
  return streams.filter(s => s.streamTeacherId === t.id);
}

// ── Apply all role-based UI changes after login ──
function applyRoleBasedUI() {
  const role      = currentUser.role;
  const isAdmin   = role === 'superadmin' || role === 'admin';
  const isPrincipal = role === 'principal';
  const isBursar  = role === 'bursar';
  const isTeacher = role === 'teacher';
  const isFullFees = isAdmin || isPrincipal || isBursar; // full fees access
  const isClassTch = isTeacher && currentUserIsClassTeacher();

  // Global restrictions from settings
  const globalRestrictAnalytics = isTeacher && !!settings.restrictTeacherAnalytics;

  // ── Sidebar: sections hidden for teachers ──
  ['students','subjects','classes'].forEach(sec => {
    const link = document.querySelector(`[data-s="${sec}"]`);
    if (link) link.style.display = isTeacher ? 'none' : '';
  });

  // Teachers section: always hidden from teacher-role users
  const teachersLink = document.querySelector('[data-s="teachers"]');
  if (teachersLink) teachersLink.style.display = isTeacher ? 'none' : '';

  // ── Fees sidebar link ──
  // Regular teacher (not class teacher) → no fees at all
  // Class teacher → show fees (restricted to own classes inside fees module)
  // principal / bursar / admin → always show
  const feesLink = document.querySelector('[data-s="fees"]');
  if (feesLink) {
    if (isTeacher && !isClassTch) feesLink.style.display = 'none';
    else feesLink.style.display = '';
  }

  // ── Exams: hide Create Exam tab for teachers ──
  const createExamBtn = document.querySelector('[onclick*="tabCreateExam"]');
  if (createExamBtn) createExamBtn.style.display = isTeacher ? 'none' : '';

  // If teacher lands on exams, redirect to Upload Marks tab
  if (isTeacher) {
    const createPanel = document.getElementById('tabCreateExam');
    if (createPanel && createPanel.classList.contains('active')) {
      openExamTab('tabUploadMarks', document.querySelector('[onclick*="tabUploadMarks"]'));
    }
  }

  // ── Students: hide add/edit form and action buttons for teachers ──
  const stuAddCard = document.getElementById('stuAddCard');
  if (stuAddCard) stuAddCard.style.display = isTeacher ? 'none' : '';
  const stuUploadCard = document.getElementById('stuUploadCard');
  if (stuUploadCard && isTeacher) stuUploadCard.style.display = 'none';

  // ── Analyse tab ──
  const anBtn = document.getElementById('tbAnalyse');
  if (anBtn) {
    const show = !isTeacher || (!globalRestrictAnalytics && (currentUser.canAnalyse || isClassTch));
    anBtn.style.display = show ? '' : 'none';
  }

  // ── Merit list tab ──
  const mlBtn = document.getElementById('tbMeritList') || document.querySelector('[onclick*="tabMeritList"]');
  if (mlBtn) mlBtn.style.display = (!isTeacher || (!globalRestrictAnalytics && (currentUser.canMerit || isClassTch))) ? '' : 'none';

  // ── Teacher self-service: show My Class Lists card only for teachers ──
  const tchMyCard = document.getElementById('tchMyClassListCard');
  if (tchMyCard) tchMyCard.style.display = isTeacher ? '' : 'none';

  // ── Archived students card: only for admins ──
  const archCard = document.getElementById('archivedStudentsCard');
  if (archCard && !isAdmin) archCard.style.display = 'none';

  // ── Subject Analysis tab ──
  const saBtn = document.getElementById('tbSubjectAnalysis') || document.querySelector('[onclick*="tabSubjectAnalysis"]');
  if (saBtn) saBtn.style.display = (!isTeacher || (!globalRestrictAnalytics && (currentUser.canAnalyse || isClassTch))) ? '' : 'none';
}

// ── Hook Upload Marks: filter classes/streams/subjects for teacher ──
// Overrides loadUmClasses to restrict to teacher's assigned streams
function loadUmClasses() {
  const clsSel = document.getElementById('umClass');
  const strSel = document.getElementById('umStream');
  const subSel = document.getElementById('umSubject');
  if (clsSel) clsSel.innerHTML = '<option value="">— Choose Class —</option>';
  if (strSel) strSel.innerHTML = '<option value="">— Choose Stream —</option>';
  if (subSel) subSel.innerHTML = '<option value="">— Choose Subject —</option>';
  const body = document.getElementById('umBody');
  const empty = document.getElementById('umEmpty');
  if (body) body.innerHTML = '';
  if (empty) empty.style.display = '';

  const examId = document.getElementById('umExam')?.value;
  if (!examId) return;
  const exam = exams.find(e => e.id === examId);
  if (!exam) return;

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const t = getCurrentTeacher();

  let relevantClasses = classes;
  if (exam.classId) relevantClasses = classes.filter(c => c.id === exam.classId);

  if (isTeacher && t) {
    // Class teacher: restrict to their class(es)
    const myStreamIds  = getMyClassTeacherStreams().map(s => s.id);
    const myClassIds   = [...new Set(getMyClassTeacherStreams().map(s => s.classId))];
    // Subject teacher: show all classes where they have subjects in the exam
    const mySubIds     = getMySubjectIds();
    const hasSubs      = exam.subjectIds.some(sid => mySubIds.includes(sid));

    if (myClassIds.length) {
      // Class teacher restricts to their class
      relevantClasses = relevantClasses.filter(c => myClassIds.includes(c.id));
    } else if (!hasSubs) {
      if (clsSel) clsSel.innerHTML = '<option value="">— No subjects assigned for this exam —</option>';
      showToast('You have no subjects assigned in this exam', 'error');
      return;
    }
    // If regular subject teacher (no class teacher role), show all classes but only their subjects
  }

  if (clsSel) {
    clsSel.innerHTML = '<option value="">— Choose Class —</option>' +
      relevantClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (relevantClasses.length === 1) { clsSel.value = relevantClasses[0].id; loadUmStreams(); }
  }
}

// Override loadUmStreams to restrict class teachers to their stream(s)
function loadUmStreams() {
  const strSel = document.getElementById('umStream');
  const subSel = document.getElementById('umSubject');
  if (strSel) strSel.innerHTML = '<option value="">— Choose Stream —</option>';
  if (subSel) subSel.innerHTML = '<option value="">— Choose Subject —</option>';
  const body  = document.getElementById('umBody');
  const empty = document.getElementById('umEmpty');
  if (body) body.innerHTML = '';
  if (empty) empty.style.display = '';

  const classId = document.getElementById('umClass')?.value;
  if (!classId) return;

  const isTeacher = currentUser && currentUser.role === 'teacher';
  const t = getCurrentTeacher();
  let classStreams = streams.filter(s => s.classId === classId);

  if (isTeacher && t) {
    const myStreamIds = getMyClassTeacherStreams().map(s => s.id);
    if (myStreamIds.length) {
      // Class teacher: only their stream(s)
      classStreams = classStreams.filter(s => myStreamIds.includes(s.id));
    }
    // Regular subject teacher: all streams in the class
  }

  if (strSel) {
    strSel.innerHTML = '<option value="">— Choose Stream —</option>' +
      classStreams.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (classStreams.length === 1) { strSel.value = classStreams[0].id; loadUmSubjects(); }
  }
}

// Override loadUmSubjects to restrict to teacher's subjects
function loadUmSubjects() {
  const examId   = document.getElementById('umExam')?.value;
  const streamId = document.getElementById('umStream')?.value;
  const subSel   = document.getElementById('umSubject');
  if (subSel) subSel.innerHTML = '<option value="">— Choose Subject —</option>';
  const body  = document.getElementById('umBody');
  const empty = document.getElementById('umEmpty');
  if (body) body.innerHTML = '';
  if (empty) empty.style.display = '';
  if (!examId || !streamId) return;

  const exam = exams.find(e => e.id === examId);
  if (!exam) return;

  let allowedSubIds = exam.subjectIds;
  const isTeacher = currentUser && currentUser.role === 'teacher';
  if (isTeacher) {
    const mySubIds = getMySubjectIds();
    allowedSubIds = exam.subjectIds.filter(sid => mySubIds.includes(sid));
    if (!allowedSubIds.length) {
      if (subSel) subSel.innerHTML = '<option value="">— No subjects assigned to you —</option>';
      showToast('No subjects assigned to you for this exam', 'error');
      return;
    }
  }

  if (subSel) {
    subSel.innerHTML = '<option value="">— Choose Subject —</option>' +
      allowedSubIds.map(sid => {
        const s = subjects.find(x => x.id === sid);
        return s ? `<option value="${s.id}">${s.name}</option>` : '';
      }).join('');
    // Auto-select if only one subject
    if (allowedSubIds.length === 1) { subSel.value = allowedSubIds[0]; loadUmStudents(); }
  }
}

// ── Analysis: restrict class teachers to their class ──
// Patch checkAnalyseAccess to inject class-filter UI
function checkAnalyseAccess() {
  const isSuperAdmin = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin');
  const isTeacher    = currentUser && currentUser.role === 'teacher';
  const globalBlock  = isTeacher && !!settings.restrictTeacherAnalytics;
  const canAnalyse   = currentUser && currentUser.canAnalyse;
  const isClassTch   = currentUserIsClassTeacher();
  const allowed      = isSuperAdmin || (!globalBlock && (canAnalyse || isClassTch));

  const deniedEl  = document.getElementById('analyseAccessDenied');
  const contentEl = document.getElementById('analyseContent');
  if (deniedEl)  deniedEl.style.display  = allowed ? 'none' : '';
  if (contentEl) contentEl.style.display = allowed ? '' : 'none';

  const runBtn = document.getElementById('anRunBtn');
  if (runBtn) runBtn.style.display = (isSuperAdmin || canAnalyse || isClassTch) ? '' : 'none';

  const classTchNote = document.getElementById('anClassTchNote');
  if (classTchNote) classTchNote.style.display = (isClassTch && !canAnalyse && !isSuperAdmin) ? '' : 'none';

  if (allowed) {
    populateExamDropdowns();
    // Inject class-teacher scope indicator if applicable
    injectAnalysisScopeNote();
  }
}

function injectAnalysisScopeNote() {
  const isClassTch   = currentUserIsClassTeacher();
  const isSuperAdmin = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin');
  const noteId = 'anTeacherScopeNote';
  let note = document.getElementById(noteId);

  const anContent = document.getElementById('analyseContent');
  if (!anContent) return;

  if (isClassTch && !isSuperAdmin) {
    const myStreams  = getMyClassTeacherStreams();
    const myClasses  = [...new Set(myStreams.map(s => classes.find(c=>c.id===s.classId)?.name).filter(Boolean))];
    const mySubs     = getMySubjectIds().map(sid => subjects.find(s=>s.id===sid)?.name).filter(Boolean);

    if (!note) {
      note = document.createElement('div');
      note.id = noteId;
      note.style.cssText = 'margin-bottom:.75rem;padding:.6rem .9rem;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:.82rem;display:flex;align-items:flex-start;gap:.6rem';
      anContent.insertBefore(note, anContent.firstChild);
    }
    note.innerHTML = `
      <span style="font-size:1.1rem">🎯</span>
      <div>
        <strong style="color:var(--primary)">Analysis scoped to your class</strong><br>
        <span style="color:var(--muted)">
          Class: <strong>${myClasses.join(', ') || '—'}</strong> &nbsp;|&nbsp;
          Stream(s): <strong>${myStreams.map(s=>s.name).join(', ') || '—'}</strong> &nbsp;|&nbsp;
          Your subjects: <strong>${mySubs.slice(0,4).join(', ')+(mySubs.length>4?'…':'') || 'All'}</strong>
        </span>
      </div>`;
  } else if (note) {
    note.remove();
  }
}

// Patch runAnalysis to enforce class teacher scope
function runAnalysis() {
  const examId = document.getElementById('anExam')?.value;
  const res    = document.getElementById('analyseResults');
  const selGs  = document.getElementById('anGradingSystem')?.value;
  if (selGs) setActiveGradingSystem(selGs);
  if (!examId) { if(res) res.innerHTML='<p style="color:var(--muted)">Select an exam to begin.</p>'; return; }

  const exam = exams.find(e=>e.id===examId);
  const isConsolidated  = exam?.category === 'consolidated';
  const sourceExamObjs  = isConsolidated ? (exam.sourceExamIds||[]).map(id=>exams.find(e=>e.id===id)).filter(Boolean) : [];

  // For a regular exam use its own marks; for consolidated we derive scores on the fly
  const examMarks = isConsolidated ? [] : marks.filter(m=>m.examId===examId);

  // Helper: get a student's averaged score for a subject on a consolidated exam
  function getConsolidatedScore(studentId, subjectId) {
    const vals = sourceExamObjs.map(src => {
      const mk = marks.find(m=>m.examId===src.id&&m.studentId===studentId&&m.subjectId===subjectId);
      return mk ? mk.score : null;
    }).filter(v=>v!==null);
    return vals.length ? parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)) : null;
  }

  // Check there is data
  if (!isConsolidated && !examMarks.length) {
    if(res) res.innerHTML='<p style="color:var(--muted)">No marks entered for this exam yet.</p>'; return;
  }
  if (isConsolidated && !sourceExamObjs.length) {
    if(res) res.innerHTML='<p style="color:var(--muted)">This consolidated exam has no source exams linked.</p>'; return;
  }

  const isTeacher    = currentUser && currentUser.role === 'teacher';
  const isSuperAdmin = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin');
  const isClassTch   = currentUserIsClassTeacher();

  // Determine which students to include
  let allowedStudents = students;
  if (exam.classId) allowedStudents = allowedStudents.filter(s=>s.classId===exam.classId);
  if (isTeacher && isClassTch) {
    const myStreamIds = getMyClassTeacherStreams().map(s=>s.id);
    allowedStudents   = allowedStudents.filter(s=>myStreamIds.includes(s.streamId));
  }

  // Determine which subjects to show
  let allowedSubjectIds = exam.subjectIds;
  if (isTeacher && !isSuperAdmin) {
    const mySubIds = getMySubjectIds();
    if (mySubIds.length) allowedSubjectIds = exam.subjectIds.filter(sid=>mySubIds.includes(sid));
    if (!allowedSubjectIds.length) {
      if(res) res.innerHTML='<p style="color:var(--muted)">You have no subjects assigned for this exam.</p>'; return;
    }
  }

  const totalSubjects = exam.subjectIds.length || 1;

  // Build per-student totals using averaged scores for consolidated exams
  let studentsWithData;
  if (isConsolidated) {
    // Include any student that has at least one score in any source exam
    studentsWithData = allowedStudents.filter(stu =>
      sourceExamObjs.some(src => marks.some(m=>m.examId===src.id&&m.studentId===stu.id))
    );
  } else {
    const markedIds = new Set(examMarks.map(m=>m.studentId));
    studentsWithData = allowedStudents.filter(s=>markedIds.has(s.id));
  }

  const studentTotals = studentsWithData.map(stu => {
    let total = 0, pts = 0;
    exam.subjectIds.forEach(sid => {
      let score;
      if (isConsolidated) {
        score = getConsolidatedScore(stu.id, sid);
      } else {
        const mk = examMarks.find(m=>m.studentId===stu.id&&m.subjectId===sid);
        score = mk ? mk.score : null;
      }
      if (score !== null && score !== undefined) {
        total += score;
        const sub = subjects.find(s=>s.id===sid);
        pts += getGrade(score, sub?.max||100).points;
      }
    });
    const mean = parseFloat((total / totalSubjects).toFixed(2));
    const maxAvg = (exam.subjectIds.map(sid=>subjects.find(s=>s.id===sid)?.max||100).reduce((a,b)=>a+b,0)/totalSubjects)||100;
    const grade = getMeanGrade(mean / maxAvg * 8);
    return { ...stu, total: parseFloat(total.toFixed(1)), mean, grade, points:pts };
  });

  if (!studentTotals.length) {
    if(res) res.innerHTML='<p style="color:var(--muted)">No student data found for this exam.</p>'; return;
  }

  const classMean = studentTotals.reduce((a,s)=>a+s.mean,0)/studentTotals.length;

  // Subject means — using averaged scores for consolidated
  const subjectStats = allowedSubjectIds.map(sid => {
    const sub = subjects.find(s=>s.id===sid); if (!sub) return null;
    const vals = studentsWithData.map(stu => {
      return isConsolidated ? getConsolidatedScore(stu.id, sid) : (examMarks.find(m=>m.studentId===stu.id&&m.subjectId===sid)?.score ?? null);
    }).filter(v=>v!==null);
    if (!vals.length) return null;
    const mn = parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2));
    const mx = Math.max(...vals);
    const lo = Math.min(...vals);
    // Grade distribution
    const gs = getActiveGradingSystem();
    const dist = {};
    gs.bands.forEach(b=>dist[b.grade]=0);
    vals.forEach(v=>{ const g=getGrade(v,sub.max||100); if(dist[g.grade]!==undefined) dist[g.grade]++; });
    return { sub, mn, mx, lo, count:vals.length, dist };
  }).filter(Boolean);

  const male   = studentTotals.filter(s=>s.gender==='M');
  const female = studentTotals.filter(s=>s.gender==='F');
  const mMean  = male.length   ? male.reduce((a,s)=>a+s.mean,0)/male.length   : 0;
  const fMean  = female.length ? female.reduce((a,s)=>a+s.mean,0)/female.length : 0;

  // Grade distribution of overall student grades
  const gs = getActiveGradingSystem();
  const gradeDist = {};
  gs.bands.forEach(b=>gradeDist[b.grade]=0);
  studentTotals.forEach(s=>{ if(gradeDist[s.grade?.grade]!==undefined) gradeDist[s.grade.grade]++; });

  const relevantStreams = (isTeacher && isClassTch && !isSuperAdmin)
    ? getMyClassTeacherStreams()
    : streams.filter(str => exam.classId ? str.classId===exam.classId : true);

  const streamPerf = relevantStreams.map(str => {
    const grp = studentTotals.filter(s=>s.streamId===str.id);
    const mn  = grp.length ? grp.reduce((a,s)=>a+s.mean,0)/grp.length : 0;
    return { str, mn, count:grp.length };
  }).filter(x=>x.count>0);

  const scopeLabel = (isTeacher && isClassTch && !isSuperAdmin)
    ? `<span class="badge b-teal" style="margin-left:.5rem;font-size:.72rem">📌 Scoped: ${getMyClassTeacherStreams().map(s=>s.name).join(', ')}</span>` : '';

  const consolidatedBadge = isConsolidated
    ? `<span class="badge b-purple" style="margin-left:.5rem;font-size:.68rem">📊 Consolidated (${sourceExamObjs.length} exams averaged)</span>` : '';

  // Grade distribution bar
  const gradeDistHTML = `
    <div class="card" style="margin-top:1rem">
      <h3>📊 Overall Grade Distribution</h3>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:flex-end;padding:.5rem 0">
        ${gs.bands.map(b=>{
          const cnt = gradeDist[b.grade]||0;
          const pct = studentTotals.length ? Math.round(cnt/studentTotals.length*100) : 0;
          return `<div style="flex:1;min-width:48px;text-align:center">
            <div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:.2rem">${cnt}</div>
            <div style="height:${Math.max(pct*1.4,4)}px;background:${b.cls==='b-green'?'#16a34a':b.cls==='b-teal'?'#0d9488':b.cls==='b-blue'?'#1a6fb5':b.cls==='b-lblue'?'#0891b2':b.cls==='b-amber'?'#d97706':b.cls==='b-orange'?'#ea580c':b.cls==='b-red'?'#dc2626':'#991b1b'};border-radius:4px 4px 0 0;transition:height .3s"></div>
            <div style="font-size:.72rem;font-weight:700;margin-top:.2rem"><span class="badge ${b.cls}" style="font-size:.65rem">${b.grade}</span></div>
            <div style="font-size:.65rem;color:var(--muted)">${pct}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  if (res) res.innerHTML = `
    <div class="an-grid">
      <div class="an-card"><div class="an-num">${classMean.toFixed(2)}</div><div class="an-lbl">Mean Score${scopeLabel}${consolidatedBadge}</div></div>
      <div class="an-card"><div class="an-num" style="color:var(--secondary)">${studentTotals.length}</div><div class="an-lbl">Students Analysed</div></div>
      <div class="an-card"><div class="an-num" style="color:var(--success)">${subjectStats.length}</div><div class="an-lbl">Subjects</div></div>
      <div class="an-card">
        <div class="an-num" style="color:${mMean>=fMean?'#1a6fb5':'#e91e8c'}">${mMean.toFixed(1)} / ${fMean.toFixed(1)}</div>
        <div class="an-lbl">M / F Mean</div>
      </div>
    </div>
    ${gradeDistHTML}
    <div class="dash-charts dash-charts-3" style="margin-top:1rem">
      <div class="chart-box chart-span2">
        <h3>📊 Subject Performance${isConsolidated?' <span style="font-size:.7rem;color:var(--muted);font-weight:400">(averaged across source exams)</span>':''}</h3>
        <canvas id="anSubChart" style="max-height:220px"></canvas>
      </div>
      <div class="chart-box">
        <h3>⚧ Gender Comparison</h3>
        <canvas id="anGenderChart" style="max-height:220px"></canvas>
      </div>
      ${streamPerf.length>1?`<div class="chart-box"><h3>🏫 Stream Comparison</h3><canvas id="anStreamChart" style="max-height:220px"></canvas></div>`:''}
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>📋 Subject Breakdown${isConsolidated?' <span style="font-size:.78rem;font-weight:400;color:var(--muted)">&mdash; averages across ' + sourceExamObjs.map(e=>e.name).join(', ') + '</span>':''}</h3>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Subject</th><th>Students</th><th>Mean</th><th>Highest</th><th>Lowest</th><th>Grade</th></tr></thead>
          <tbody>${subjectStats.map(sm=>{
            const g=getGrade(sm.mn, sm.sub.max||100);
            return `<tr>
              <td><strong>${sm.sub.name}</strong> <span class="badge b-blue" style="font-size:.65rem">${sm.sub.code}</span></td>
              <td>${sm.count}</td>
              <td style="font-weight:700;color:var(--primary)">${sm.mn.toFixed(1)}</td>
              <td style="color:var(--success)">${sm.mx}</td>
              <td style="color:var(--danger)">${sm.lo.toFixed ? sm.lo.toFixed(1) : sm.lo}</td>
              <td>${gradeTag(g)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>🏆 Student Rankings <span style="font-size:.78rem;font-weight:400;color:var(--muted)">(top 50)</span></h3>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Rank</th><th>Student</th><th>Stream</th><th>Total${isConsolidated?' (avg)':''}</th><th>Mean</th><th>Grade</th><th>Points</th></tr></thead>
          <tbody>${[...studentTotals].sort((a,b)=>b.total-a.total).slice(0,50).map((s,i)=>{
            const str=streams.find(x=>x.id===s.streamId);
            return `<tr>
              <td style="font-weight:700;color:${i<3?'#d97706':'var(--text)'}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
              <td><strong>${s.name}</strong><br><span style="font-size:.72rem;color:var(--muted)">${s.adm}</span></td>
              <td>${str?.name||'—'}</td>
              <td style="font-weight:700">${s.total}</td>
              <td>${s.mean.toFixed(2)}</td>
              <td>${gradeTag(s.grade||getGrade(s.mean,100))}</td>
              <td>${s.points||'—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;

  // Draw charts
  setTimeout(() => {
    try {
      const subCtx = document.getElementById('anSubChart');
      if (subCtx) {
        if (anCharts['sub']) anCharts['sub'].destroy();
        anCharts['sub'] = new Chart(subCtx, {
          type:'bar',
          data:{
            labels: subjectStats.map(s=>s.sub.code),
            datasets:[{
              label:'Mean Score',
              data: subjectStats.map(s=>parseFloat(s.mn.toFixed(1))),
              backgroundColor: subjectStats.map((s,i)=>`hsla(${i*37+200},70%,55%,0.8)`),
              borderRadius:6
            }]
          },
          options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true, max: subjectStats[0]?.sub?.max||100, title:{display:true,text:'Mean Score'}} } }
        });
      }
    } catch(e) {}
    try {
      const genCtx = document.getElementById('anGenderChart');
      if (genCtx) {
        if (anCharts['gen']) anCharts['gen'].destroy();
        anCharts['gen'] = new Chart(genCtx, {
          type:'doughnut',
          data:{ labels:['Male','Female'], datasets:[{ data:[parseFloat(mMean.toFixed(1)),parseFloat(fMean.toFixed(1))], backgroundColor:['#1a6fb5','#e91e8c'] }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}} }
        });
      }
    } catch(e) {}
    try {
      const strCtx = document.getElementById('anStreamChart');
      if (strCtx && streamPerf.length>1) {
        if (anCharts['str']) anCharts['str'].destroy();
        anCharts['str'] = new Chart(strCtx, {
          type:'bar',
          data:{ labels: streamPerf.map(s=>s.str.name), datasets:[{ label:'Stream Mean', data: streamPerf.map(s=>parseFloat(s.mn.toFixed(1))), backgroundColor:'rgba(26,111,181,0.7)', borderRadius:6 }] },
          options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true, title:{display:true,text:'Mean Score'}} } }
        });
      }
    } catch(e) {}
  }, 200);
}

// ══════════════════════════════════════════════════════════
//  SETTINGS → TEACHER PREFERENCES
// ══════════════════════════════════════════════════════════

function renderTeacherPreferences() {
  const isTeacher   = currentUser && currentUser.role === 'teacher';
  const isAdmin     = currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'admin');
  const isSuperAdmin= currentUser && currentUser.role === 'superadmin';
  const prefCard    = document.getElementById('teacherPrefsCard');
  const adminCard   = document.getElementById('adminTeacherAccessCard');
  const restrictCard= document.getElementById('globalTeacherRestrictCard');
  const schoolCard  = document.querySelector('#s-settings .card');   // first card = school info

  // Show/hide panels by role
  if (prefCard)     prefCard.style.display     = isTeacher   ? '' : 'none';
  if (adminCard)    adminCard.style.display    = isAdmin     ? '' : 'none';
  if (restrictCard) restrictCard.style.display = isSuperAdmin? '' : 'none';

  // Teachers: hide admin-only cards (School Info, Admin Accounts, Data Management)
  const allCards = document.querySelectorAll('#s-settings .card');
  allCards.forEach(card => {
    const h3 = card.querySelector('h3');
    if (!h3) return;
    const adminOnlyTitles = ['🏫 School Information','🔐 Admin Accounts','💾 Data Management','📊 Grading Systems'];
    if (isTeacher && adminOnlyTitles.some(t => h3.textContent.includes(t.replace(/[🏫🔐💾📊]/g,'').trim()))) {
      card.style.display = 'none';
    } else if (!isTeacher) {
      card.style.display = '';
    }
  });

  if (isTeacher) renderMyPreferences();
  if (isAdmin)   renderAdminTeacherAccessPanel();
}

function renderMyPreferences() {
  const t = getCurrentTeacher();
  if (!t) return;

  // My Subjects
  const mySubIds = getMySubjectIds();
  const mySubsEl = document.getElementById('prefMySubjects');
  if (mySubsEl) {
    mySubsEl.innerHTML = mySubIds.length
      ? mySubIds.map(sid => {
          const s = subjects.find(x => x.id === sid);
          return s ? `<span class="badge b-blue" style="font-size:.78rem;padding:.25rem .6rem">${s.name} <span style="opacity:.7;font-size:.7rem">${s.code}</span></span>` : '';
        }).join('')
      : '<span style="color:var(--muted);font-size:.82rem">No subjects assigned yet. Contact your admin.</span>';
  }

  // My Class
  const myStreams  = getMyClassTeacherStreams();
  const myClassEl  = document.getElementById('prefMyClass');
  if (myClassEl) {
    if (myStreams.length) {
      myClassEl.innerHTML = myStreams.map(str => {
        const cls = classes.find(c => c.id === str.classId);
        return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
          <span class="badge b-green" style="font-size:.78rem">🏫 ${cls?.name||'—'} — ${str.name}</span>
          <span style="font-size:.75rem;color:var(--muted)">Class Teacher</span>
        </div>`;
      }).join('');
    } else {
      myClassEl.innerHTML = '<span style="color:var(--muted);font-size:.82rem">You are not a class teacher for any stream.</span>';
    }
  }

  // My Rights
  const rightsEl = document.getElementById('prefMyRights');
  if (rightsEl) {
    const rights = [
      { key: 'canAnalyse', label: 'Run Exam Analysis', icon: '📊', desc: 'View and run detailed exam analysis reports' },
      { key: 'canReport',  label: 'Generate Report Forms', icon: '📄', desc: 'Generate and print student report cards' },
      { key: 'canMerit',   label: 'View Merit List', icon: '🏆', desc: 'Access the class merit/ranking list' },
    ];
    rightsEl.innerHTML = rights.map(r => `
      <div style="display:flex;align-items:center;gap:.6rem;padding:.4rem .6rem;border-radius:6px;background:var(--surface);border:1px solid var(--border)">
        <span style="font-size:1rem">${r.icon}</span>
        <div style="flex:1">
          <div style="font-size:.82rem;font-weight:600">${r.label}</div>
          <div style="font-size:.72rem;color:var(--muted)">${r.desc}</div>
        </div>
        <span class="${t[r.key] ? 'badge b-green' : 'badge b-red'}" style="font-size:.7rem">${t[r.key] ? '✅ Granted' : '✗ Restricted'}</span>
      </div>`).join('');
  }
}

function saveTeacherPassword() {
  const t   = getCurrentTeacher(); if (!t) return;
  const cur = document.getElementById('prefCurPass')?.value;
  const nw  = document.getElementById('prefNewPass')?.value;
  const cf  = document.getElementById('prefConfPass')?.value;
  if (!cur || !nw || !cf) { showToast('All password fields are required', 'error'); return; }
  if (t.password !== cur)  { showToast('Current password is incorrect', 'error'); return; }
  if (nw !== cf)           { showToast('New passwords do not match', 'error'); return; }
  if (nw.length < 4)       { showToast('Password must be at least 4 characters', 'error'); return; }
  const i = teachers.findIndex(x => x.id === t.id);
  if (i > -1) { teachers[i].password = nw; save(K.teachers, teachers); }
  ['prefCurPass','prefNewPass','prefConfPass'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  showToast('Password updated ✓', 'success');
}

// ── Admin: Teacher Access Manager in Settings ──
function renderAdminTeacherAccessPanel() {
  const tamTeacher = document.getElementById('tamTeacher');
  if (!tamTeacher) return;
  tamTeacher.innerHTML = '<option value="">— Choose a teacher —</option>' +
    teachers.map(t => `<option value="${t.id}">${t.name} (${t.username||'no login'})</option>`).join('');
}

function renderTeacherAccessManager() {
  const teacherId = document.getElementById('tamTeacher')?.value;
  const content   = document.getElementById('tamContent');
  if (!teacherId) { if (content) content.style.display='none'; return; }
  if (content) content.style.display = '';
  const t = teachers.find(x => x.id === teacherId); if (!t) return;

  // Subjects: show read-only from Stream Management (not editable here)
  const subsEl = document.getElementById('tamSubjects');
  if (subsEl) {
    const mySubIds = getTeacherSubjectIds(teacherId);
    if (mySubIds.length) {
      subsEl.innerHTML = mySubIds.map(sid => {
        const s = subjects.find(x => x.id === sid);
        if (!s) return '';
        return `<div style="display:flex;align-items:center;gap:.5rem;padding:.3rem .5rem;border-radius:5px;border:1px solid var(--border);background:var(--surface)">
          <span class="badge b-blue" style="font-size:.72rem">${s.code}</span>
          <span style="font-size:.82rem;font-weight:600">${s.name}</span>
        </div>`;
      }).join('');
    } else {
      subsEl.innerHTML = '<p style="font-size:.8rem;color:var(--muted)">No subjects assigned yet. Use <strong>Stream Management</strong> to assign subjects to this teacher.</p>';
    }
  }

  // Rights
  const rightsEl = document.getElementById('tamRights');
  if (rightsEl) {
    rightsEl.innerHTML = [
      { id:'tam-canAnalyse', key:'canAnalyse', label:'Can run exam analysis' },
      { id:'tam-canReport',  key:'canReport',  label:'Can generate report forms' },
      { id:'tam-canMerit',   key:'canMerit',   label:'Can view merit list' },
    ].map(r => `
      <label class="check-label" style="font-size:.84rem">
        <input type="checkbox" id="${r.id}" ${t[r.key]?'checked':''}/> ${r.label}
      </label>`).join('');
  }

  // Scope: class teacher assignment
  const scopeEl = document.getElementById('tamScope');
  if (scopeEl) {
    const myStreams = streams.filter(s => s.streamTeacherId === teacherId);
    scopeEl.innerHTML = streams.map(str => {
      const cls = classes.find(c => c.id === str.classId);
      return `
        <label class="check-label" style="font-size:.82rem">
          <input type="checkbox" class="tam-stream-chk" data-streamid="${str.id}" ${myStreams.some(s=>s.id===str.id)?'checked':''}/>
          Class Teacher of <strong>${cls?.name||'?'} — ${str.name}</strong>
        </label>`;
    }).join('') || '<span style="color:var(--muted);font-size:.82rem">No streams defined.</span>';
  }
}

function saveTeacherAccessSettings() {
  const teacherId = document.getElementById('tamTeacher')?.value;
  if (!teacherId) { showToast('Select a teacher first', 'error'); return; }
  const t = teachers.find(x => x.id === teacherId); if (!t) return;

  // Save rights
  t.canAnalyse = !!document.getElementById('tam-canAnalyse')?.checked;
  t.canReport  = !!document.getElementById('tam-canReport')?.checked;
  t.canMerit   = !!document.getElementById('tam-canMerit')?.checked;

  // Note: Subject assignments are managed via Stream Management — not here

  // Save stream (class teacher) assignments
  const checkedStreamIds = [...document.querySelectorAll('.tam-stream-chk:checked')].map(el => el.dataset.streamid);
  streams.forEach(str => {
    if (checkedStreamIds.includes(str.id)) {
      str.streamTeacherId = teacherId;
    } else if (str.streamTeacherId === teacherId) {
      str.streamTeacherId = '';
    }
  });

  save(K.teachers, teachers);
  save(K.subjects, subjects);
  save(K.streams, streams);
  saveStreamAssignments();
  renderTeachers(); renderSubjects(); renderStreams();
  showToast(`Access settings saved for ${t.name} ✓`, 'success');
}

// Hook: call renderTeacherPreferences when navigating to Settings

// ═══════════════ SCHOOL MANAGEMENT (from Settings) ═══════════════
function renderSettingsSchoolList() {
  const el = document.getElementById('settingsSchoolList');
  if (!el) return;
  loadPlatform();
  if (!platformSchools.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:.5rem 0">No school accounts yet.</p>'; return;
  }
  el.innerHTML = platformSchools.map(s => `
    <div class="admin-item">
      <div>
        <div class="ai-name">${s.name}</div>
        <div class="ai-role">${s.username}${s.email?' · '+s.email:''} · <span class="badge b-blue" style="font-size:.65rem">School</span></div>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center">
        <button class="btn btn-outline btn-sm" style="font-size:.72rem;padding:.2rem .55rem" onclick="resetSchoolPwd('${s.id}')">🔑 Reset Pwd</button>
        <button class="icb dl" onclick="deleteSchoolFromSettings('${s.id}')" title="Delete">🗑️</button>
      </div>
    </div>`).join('');
}

function addSchoolFromSettings() {
  const name  = document.getElementById('spsName').value.trim();
  const user  = document.getElementById('spsUser').value.trim();
  const pass  = document.getElementById('spsPass').value;
  const email = document.getElementById('spsEmail').value.trim();
  if (!name||!user||!pass) { showToast('Name, username and password required','error'); return; }
  loadPlatform();
  if (platformSchools.find(s=>s.username===user)) { showToast('Username already taken','error'); return; }
  platformSchools.push({ id:'sch_'+uid(), name, username:user, password:pass, email, createdAt:new Date().toISOString() });
  savePlatform();
  ['spsName','spsUser','spsPass','spsEmail'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  renderSettingsSchoolList();
  showToast('School account created ✓','success');
}

function deleteSchoolFromSettings(id) {
  if (!confirm('Delete this school? All its data will be permanently removed.')) return;
  loadPlatform();
  Object.keys(localStorage).filter(k=>k.startsWith(id+'_')).forEach(k=>localStorage.removeItem(k));
  platformSchools = platformSchools.filter(s=>s.id!==id);
  savePlatform(); renderSettingsSchoolList();
  showToast('School deleted','info');
}

function resetSchoolPwd(id) {
  const np = prompt('Enter new password for this school account (min 4 chars):');
  if (!np||np.trim().length<4) { if(np!==null) showToast('Password too short','error'); return; }
  loadPlatform();
  const s = platformSchools.find(x=>x.id===id);
  if (s) { s.password = np.trim(); savePlatform(); showToast('Password updated ✓','success'); }
}

function changePlatformPassword() {
  const cur  = document.getElementById('curPlatformPwd').value;
  const nw   = document.getElementById('newPlatformPwd').value;
  const conf = document.getElementById('confPlatformPwd').value;
  const creds = getPlatformCreds();
  if (!creds || cur !== creds.password) { showToast('Current password is incorrect','error'); return; }
  if (!nw || nw.length < 6) { showToast('New password must be at least 6 characters','error'); return; }
  if (nw !== conf) { showToast('Passwords do not match','error'); return; }
  setPlatformCreds(creds.username, nw);
  ['curPlatformPwd','newPlatformPwd','confPlatformPwd'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  showToast('Platform password changed ✓','success');
}


// ═══════════════════════════════════════════════════════════════════
//  PAPERS & RESOURCES  –  Termly Exams + Revision
// ═══════════════════════════════════════════════════════════════════

// ── Storage key ──
const K_PAPERS = { get termly() { return schoolPrefix() + 'ei_termly_papers'; } };

let termlyPapers = [];

function loadTermlyPapers()  { try { termlyPapers = JSON.parse(localStorage.getItem(K_PAPERS.termly)) || []; } catch { termlyPapers = []; } }
function saveTermlyPapers()  { localStorage.setItem(K_PAPERS.termly, JSON.stringify(termlyPapers)); }

// ── Tab switcher ──
function openPapersTab(tabId, btn) {
  document.querySelectorAll('#s-papers .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#papersTabBar .tb').forEach(b => b.classList.remove('active'));
  const p = document.getElementById(tabId); if (p) p.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'tabTermlyExams') initTermlyExamsTab();
}

// ── Init when section is entered ──
function initPapersSection() {
  loadTermlyPapers();
  initTermlyExamsTab();
  // Init revision tab if it's currently active
  const revPanel = document.getElementById('tabRevision');
  if (revPanel && revPanel.classList.contains('active')) initRevisionTab();
}

function initTermlyExamsTab() {
  populateTermlySubjectDropdowns();
  populateTermlyYearFilter();
  renderTermlyPapers();
  // Only platform admin (superadmin) can upload papers; school staff only browse & download
  const isPlatformAdmin = currentUser && currentUser.role === 'superadmin';
  const uploadCard = document.getElementById('termlyUploadCard');
  if (uploadCard) uploadCard.style.display = isPlatformAdmin ? '' : 'none';

  // Update page header description based on role
  const phDesc = document.querySelector('#s-papers .ph p');
  if (phDesc) {
    phDesc.textContent = isPlatformAdmin
      ? 'Upload and manage termly exam papers and revision materials for schools.'
      : 'Browse and download exam papers. Free papers download instantly. Paid papers require payment to unlock.';
  }
}

// ── Populate subject dropdowns ──
function populateTermlySubjectDropdowns() {
  const sel   = document.getElementById('tpSubject');
  const fSel  = document.getElementById('tpFilterSubject');
  if (!sel || !fSel) return;
  const opts = subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  sel.innerHTML  = '<option value="">— Select Subject —</option>' + opts;
  fSel.innerHTML = '<option value="">All Subjects</option>' + opts;
}

// ── Populate year filter from existing papers ──
function populateTermlyYearFilter() {
  const sel = document.getElementById('tpFilterYear');
  if (!sel) return;
  const years = [...new Set(termlyPapers.map(p => p.year))].sort((a,b) => b-a);
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Years</option>' + years.map(y => `<option ${y==cur?'selected':''}>${y}</option>`).join('');
}

// ── Upload a paper ──
function uploadTermlyPaper() {
  const subjectId = document.getElementById('tpSubject').value.trim();
  const term      = document.getElementById('tpTerm').value;
  const year      = parseInt(document.getElementById('tpYear').value);
  const title     = document.getElementById('tpTitle').value.trim();
  const classLvl  = document.getElementById('tpClass').value.trim();
  const price     = parseFloat(document.getElementById('tpPrice').value);
  const desc      = document.getElementById('tpDesc').value.trim();
  const fileInput = document.getElementById('tpFile');
  const file      = fileInput.files[0];

  if (!subjectId) { showToast('Please select a subject','error'); return; }
  if (!title)     { showToast('Please enter a paper title','error'); return; }
  if (isNaN(year) || year < 2000) { showToast('Enter a valid year','error'); return; }
  if (isNaN(price) || price < 0) { showToast('Enter a valid price (0 for free)','error'); return; }
  if (!file)      { showToast('Please select a file to upload','error'); return; }

  const MAX_FILE_MB = 5;
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showToast(`File too large. Maximum size is ${MAX_FILE_MB}MB`, 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const paper = {
      id:        uid(),
      subjectId,
      term,
      year,
      title,
      classLvl,
      price,
      desc,
      fileName:  file.name,
      fileType:  file.type,
      fileData:  e.target.result,   // base64 data URL
      uploadedBy: currentUser ? currentUser.name : 'Admin',
      uploadedAt: new Date().toISOString(),
      downloads:  0,
    };
    loadTermlyPapers();
    termlyPapers.push(paper);
    saveTermlyPapers();

    // Reset form
    ['tpSubject','tpTerm','tpTitle','tpClass','tpPrice','tpDesc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; }
    });
    document.getElementById('tpYear').value = new Date().getFullYear();
    fileInput.value = '';

    populateTermlyYearFilter();
    renderTermlyPapers();
    showToast('Paper uploaded successfully ✓', 'success');
  };
  reader.onerror = () => showToast('Failed to read file. Please try again.', 'error');
  reader.readAsDataURL(file);
}

// ── Render papers grouped by subject ──
function renderTermlyPapers() {
  loadTermlyPapers();
  const grid  = document.getElementById('termlyPapersGrid');
  const empty = document.getElementById('termlyPapersEmpty');
  if (!grid) return;

  const filterSubject = document.getElementById('tpFilterSubject')?.value || '';
  const filterTerm    = document.getElementById('tpFilterTerm')?.value || '';
  const filterYear    = document.getElementById('tpFilterYear')?.value || '';
  const search        = (document.getElementById('tpSearch')?.value || '').toLowerCase();

  // Merge school termly papers + platform-distributed termly papers
  const platTermlyPapers = loadPlatformPapers()
    .filter(p => (p.section || '') === 'termlyExam')
    .map(p => ({
      id: p.id,
      subjectId: '__plat_' + p.subject,
      _platSubjectName: p.subject,
      _isPlatform: true,
      title: p.title,
      term: p.term,
      year: p.year,
      classLvl: p.classLvl,
      price: p.price || 0,
      desc: p.desc,
      fileName: p.fileName,
      fileType: p.fileType,
      fileData: p.fileData,
      downloads: p.downloads || 0,
      uploadedAt: p.uploadedAt,
    }));

  let list = [...termlyPapers, ...platTermlyPapers];
  if (filterSubject) list = list.filter(p => p.subjectId === filterSubject);
  if (filterTerm)    list = list.filter(p => p.term === filterTerm);
  if (filterYear)    list = list.filter(p => String(p.year) === String(filterYear));
  if (search)        list = list.filter(p => {
    const subj = subjects.find(s => s.id === p.subjectId);
    return (subj?.name||'').toLowerCase().includes(search) ||
           p.title.toLowerCase().includes(search) ||
           (p.classLvl||'').toLowerCase().includes(search) ||
           (p.desc||'').toLowerCase().includes(search);
  });

  // Sort papers newest first
  list.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  const isPlatformAdmin = currentUser && currentUser.role === 'superadmin';

  if (!list.length) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.style.display = '';
    // Update empty message based on role
    const emptyP = empty.querySelector('p:last-child');
    if (emptyP) {
      emptyP.textContent = isPlatformAdmin
        ? 'Upload your first exam paper using the form above.'
        : 'No papers are available yet. Check back soon.';
    }
    return;
  }
  grid.style.display = 'block';
  empty.style.display = 'none';

  // ── Group by subject ──
  const grouped = {};
  list.forEach(p => {
    const subj = p._isPlatform ? { name: p._platSubjectName } : subjects.find(s => s.id === p.subjectId);
    const key  = p.subjectId || '__unknown__';
    if (!grouped[key]) grouped[key] = { subj, papers: [] };
    grouped[key].papers.push(p);
  });

  // Sort groups by subject name
  const sortedGroups = Object.values(grouped).sort((a,b) => {
    const na = a.subj ? a.subj.name.toLowerCase() : 'zzz';
    const nb = b.subj ? b.subj.name.toLowerCase() : 'zzz';
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  grid.innerHTML = sortedGroups.map(group => {
    const subjName = group.subj ? group.subj.name : 'Unknown Subject';
    const count    = group.papers.length;

    const paperRows = group.papers.map(p => {
      const isFree     = p.price === 0;
      const fileIcon   = getFileIcon(p.fileType, p.fileName);
      const uploadDate = new Date(p.uploadedAt).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'});

      // Badge
      const priceBadge = isFree
        ? '<span style="display:inline-flex;align-items:center;gap:.25rem;background:#dcfce7;color:#16a34a;font-weight:700;font-size:.78rem;padding:.15rem .55rem;border-radius:999px">&#10003; FREE</span>'
        : `<span style="display:inline-flex;align-items:center;gap:.25rem;background:#eff6ff;color:var(--primary,#1a6fb5);font-weight:700;font-size:.78rem;padding:.15rem .55rem;border-radius:999px">&#128274; KES ${p.price.toLocaleString()}</span>`;

      // Platform badge
      const platBadge = p._isPlatform
        ? '<span style="background:#f5f3ff;color:#7c3aed;font-size:.7rem;font-weight:700;padding:.1rem .45rem;border-radius:999px;margin-left:.4rem">📡 Platform</span>'
        : '';

      // Action button(s)
      const dlFn = p._isPlatform ? `downloadPlatformPaper('${p.id}')` : `downloadTermlyPaper('${p.id}')`;
      const delFn = p._isPlatform ? `platDeletePaper('${p.id}')` : `deleteTermlyPaper('${p.id}')`;
      let actionBtns;
      if (isPlatformAdmin) {
        actionBtns = `<button class="btn btn-sm btn-primary" onclick="${dlFn}">&#11015;&#65039; Download</button>` +
          `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none" onclick="${delFn}">&#128465;</button>`;
      } else if (isFree) {
        actionBtns = `<button class="btn btn-sm btn-primary" onclick="${dlFn}">&#11015;&#65039; Download Free</button>`;
      } else {
        actionBtns = `<button class="btn btn-sm" style="background:linear-gradient(135deg,#1a6fb5,#7c3aed);color:#fff;border:none;font-weight:700;padding:.4rem .85rem" onclick="${dlFn}">&#128179; Buy &amp; Download &mdash; KES ${p.price.toLocaleString()}</button>`;
      }

      return `
      <div style="display:flex;align-items:flex-start;gap:1rem;padding:.9rem 1rem;border-bottom:1px solid var(--border-lt);flex-wrap:wrap${!isFree && !isPlatformAdmin ? ';background:rgba(26,111,181,.025)' : ''}">
        <div style="font-size:1.6rem;flex-shrink:0;line-height:1.2;padding-top:.1rem">${fileIcon}${!isFree && !isPlatformAdmin ? '<sup style="font-size:.6rem">&#128274;</sup>' : ''}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.92rem;margin-bottom:.15rem;word-break:break-word">${p.title}${platBadge}</div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem;color:var(--muted);margin-bottom:.35rem">
            <span>&#128197; ${uploadDate}</span><span>&#183;</span>
            <span>${p.term} ${p.year}</span>
            ${p.classLvl ? `<span>&#183;</span><span>&#128218; ${p.classLvl}</span>` : ''}
            ${isPlatformAdmin ? `<span>&#183;</span><span>&#11015;&#65039; ${p.downloads} download${p.downloads !== 1 ? 's' : ''}</span>` : ''}
          </div>
          <div style="margin-bottom:.25rem">${priceBadge}</div>
          ${p.desc ? `<div style="font-size:.78rem;color:var(--muted);line-height:1.4;margin-top:.25rem">${p.desc}</div>` : ''}
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end;align-items:flex-start;padding-top:.15rem">${actionBtns}</div>
      </div>`;
    }).join('');
    return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:1rem">
      <!-- Subject header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:var(--primary-lt,#eff6ff);border-bottom:2px solid var(--primary,#1a6fb5)">
        <div style="display:flex;align-items:center;gap:.6rem">
          <span style="font-size:1.1rem">📘</span>
          <span style="font-weight:800;font-size:1rem;color:var(--primary,#1a6fb5)">${subjName}</span>
        </div>
        <span style="background:var(--primary,#1a6fb5);color:#fff;font-size:.72rem;font-weight:700;padding:.2rem .6rem;border-radius:999px">${count} paper${count !== 1 ? 's' : ''}</span>
      </div>
      <!-- Paper rows -->
      ${paperRows}
    </div>`;
  }).join('');
}

// ── Get file icon by type ──
function getFileIcon(fileType, fileName) {
  if (!fileType && fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️';
    if (['doc','docx'].includes(ext)) return '📝';
    return '📄';
  }
  if (fileType.includes('pdf'))   return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('image')) return '🖼️';
  return '📁';
}

// ── Download / buy a paper ──
function downloadTermlyPaper(paperId) {
  loadTermlyPapers();
  const paper = termlyPapers.find(p => p.id === paperId);
  if (!paper) { showToast('Paper not found', 'error'); return; }

  if (paper.price > 0) {
    // Show payment confirmation modal
    const subj = subjects.find(s => s.id === paper.subjectId);
    showModal(
      '💳 Purchase Paper',
      `
      <div style="text-align:center;padding:1rem 0">
        <div style="font-size:2.5rem;margin-bottom:.75rem">${getFileIcon(paper.fileType, paper.fileName)}</div>
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:.25rem">${paper.title}</div>
        <div style="color:var(--muted);font-size:.85rem;margin-bottom:1.25rem">${subj ? subj.name : ''} · ${paper.term} ${paper.year}</div>
        <div style="background:var(--primary-lt);border-radius:12px;padding:1rem;margin-bottom:1.25rem">
          <div style="font-size:.8rem;color:var(--muted);margin-bottom:.2rem">Amount to Pay</div>
          <div style="font-size:2rem;font-weight:800;color:var(--primary)">KES ${paper.price.toLocaleString()}</div>
        </div>
        <p style="font-size:.82rem;color:var(--muted);margin-bottom:1rem">
          Pay via M-Pesa or school cashier, then click <strong>Confirm &amp; Download</strong>.
        </p>
        <button class="btn btn-primary" style="width:100%;margin-bottom:.5rem" onclick="confirmPaperDownload('${paperId}');closeModal()">
          ✅ Confirm &amp; Download
        </button>
        <button class="btn" style="width:100%" onclick="closeModal()">Cancel</button>
      </div>`,
      []
    );
  } else {
    confirmPaperDownload(paperId);
  }
}

// ── Actually trigger the download ──
function confirmPaperDownload(paperId) {
  loadTermlyPapers();
  const idx = termlyPapers.findIndex(p => p.id === paperId);
  if (idx === -1) { showToast('Paper not found', 'error'); return; }
  const paper = termlyPapers[idx];

  // Increment download count
  termlyPapers[idx].downloads = (paper.downloads || 0) + 1;
  saveTermlyPapers();
  renderTermlyPapers();

  // Trigger file download
  try {
    const link = document.createElement('a');
    link.href = paper.fileData;
    link.download = paper.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading: ${paper.fileName} ✓`, 'success');
  } catch(e) {
    showToast('Download failed. Please try again.', 'error');
  }
}

// ── Delete a paper (admin only) ──
function deleteTermlyPaper(paperId) {
  if (!confirm('Delete this paper? This action cannot be undone.')) return;
  loadTermlyPapers();
  termlyPapers = termlyPapers.filter(p => p.id !== paperId);
  saveTermlyPapers();
  populateTermlyYearFilter();
  renderTermlyPapers();
  showToast('Paper deleted', 'success');
}


/* ═══════════════════════════════════════════════════════════════════════════════
   PLATFORM PAPERS PORTAL — Upload revision papers visible to all schools
   ═══════════════════════════════════════════════════════════════════════════════ */

const K_PLATFORM_PAPERS = 'ei_platform_papers';

function loadPlatformPapers()  { try { return JSON.parse(localStorage.getItem(K_PLATFORM_PAPERS)) || []; } catch { return []; } }
function savePlatformPapers(arr) { localStorage.setItem(K_PLATFORM_PAPERS, JSON.stringify(arr)); }

// Called when the Revision tab is opened
function initRevisionTab() {
  const isPlatformAdmin = currentUser && currentUser.role === 'superadmin';
  const uploadCard = document.getElementById('platformPapersUploadCard');
  if (uploadCard) uploadCard.style.display = isPlatformAdmin ? '' : 'none';

  const emptySubText = document.getElementById('ppEmptySubText');
  if (emptySubText) {
    emptySubText.textContent = isPlatformAdmin
      ? 'Upload your first revision paper using the form above — it will appear in all school student portals.'
      : 'No revision papers are available yet. Check back soon.';
  }

  // File input preview
  const fileInput = document.getElementById('ppFile');
  if (fileInput && !fileInput._hasListener) {
    fileInput._hasListener = true;
    fileInput.addEventListener('change', function() {
      const preview = document.getElementById('ppFilePreview');
      if (!preview) return;
      if (this.files && this.files[0]) {
        const f = this.files[0];
        const sizeMB = (f.size / 1048576).toFixed(2);
        preview.textContent = `✅ ${f.name} (${sizeMB} MB)`;
        preview.style.display = 'block';
        preview.style.color = sizeMB > 5 ? '#ef4444' : 'var(--accent-g)';
        if (sizeMB > 5) preview.textContent += ' — ⚠️ File is large, may be slow to upload';
      } else {
        preview.style.display = 'none';
      }
    });
  }

  populatePlatformPaperFilters();
  renderPlatformPapers();
}

// Update openPapersTab to also call initRevisionTab
const _origOpenPapersTab = window.openPapersTab;
function openPapersTab(tabId, btn) {
  document.querySelectorAll('#s-papers .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#papersTabBar .tb').forEach(b => b.classList.remove('active'));
  const p = document.getElementById(tabId); if (p) p.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'tabTermlyExams') initTermlyExamsTab();
  if (tabId === 'tabRevision') initRevisionTab();
}

function populatePlatformPaperFilters() {
  const papers = loadPlatformPapers().filter(p => !p.section || p.section === 'revision');
  const subjects = [...new Set(papers.map(p => p.subject).filter(Boolean))].sort();
  const years    = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a,b)=>b-a);

  const subjSel = document.getElementById('ppFilterSubject');
  if (subjSel) {
    const cur = subjSel.value;
    subjSel.innerHTML = '<option value="">All Subjects</option>' +
      subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    subjSel.value = cur;
  }
  const yearSel = document.getElementById('ppFilterYear');
  if (yearSel) {
    const cur = yearSel.value;
    yearSel.innerHTML = '<option value="">All Years</option>' +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = cur;
  }
}

function renderPlatformPapers() {
  const papers  = loadPlatformPapers();
  const grid    = document.getElementById('platformPapersGrid');
  const empty   = document.getElementById('platformPapersEmpty');
  if (!grid || !empty) return;

  const isPlatformAdmin = currentUser && currentUser.role === 'superadmin';
  const filterSubj  = (document.getElementById('ppFilterSubject')?.value || '').toLowerCase();
  const filterTerm  = document.getElementById('ppFilterTerm')?.value || '';
  const filterYear  = document.getElementById('ppFilterYear')?.value || '';
  const search      = (document.getElementById('ppSearch')?.value || '').toLowerCase();

  // Only show revision papers (exclude termlyExam papers — they show in Termly Exams tab)
  let list = [...papers]
    .filter(p => !p.section || p.section === 'revision')
    .sort((a,b) => (b.uploadedAt||0) - (a.uploadedAt||0));
  if (filterSubj) list = list.filter(p => (p.subject||'').toLowerCase() === filterSubj);
  if (filterTerm) list = list.filter(p => p.term === filterTerm);
  if (filterYear) list = list.filter(p => String(p.year) === String(filterYear));
  if (search)     list = list.filter(p =>
    (p.title||'').toLowerCase().includes(search) ||
    (p.subject||'').toLowerCase().includes(search) ||
    (p.desc||'').toLowerCase().includes(search)
  );

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Group by subject
  const grouped = {};
  list.forEach(p => {
    const key = p.subject || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });

  const fileIcon = name => {
    const ext = (name||'').split('.').pop().toLowerCase();
    if (ext === 'pdf')               return '📄';
    if (['doc','docx'].includes(ext)) return '📝';
    if (['jpg','jpeg','png'].includes(ext)) return '🖼️';
    return '📂';
  };

  grid.innerHTML = Object.entries(grouped).map(([subj, papers]) => `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:1.25rem">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.1rem;background:linear-gradient(135deg,rgba(26,111,181,.08),rgba(124,58,237,.06));border-bottom:1px solid var(--border-lt)">
        <div style="display:flex;align-items:center;gap:.6rem">
          <span style="font-size:1.1rem">📚</span>
          <span style="font-size:.9rem;font-weight:700;color:var(--text)">${subj}</span>
          <span style="font-size:.72rem;background:var(--bg);border:1px solid var(--border-lt);color:var(--muted);padding:.15rem .55rem;border-radius:99px">${papers.length} paper${papers.length!==1?'s':''}</span>
        </div>
      </div>
      ${papers.map(p => {
        const icon = fileIcon(p.fileName);
        const isFree = !p.price || parseFloat(p.price) <= 0;
        const date = p.uploadedAt ? new Date(p.uploadedAt).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '';
        return `
        <div style="display:flex;align-items:flex-start;gap:1rem;padding:.9rem 1.1rem;border-bottom:1px solid var(--border-lt);flex-wrap:wrap">
          <div style="font-size:1.8rem;flex-shrink:0;line-height:1.1;padding-top:.1rem">${icon}${!isFree?'<sup style="font-size:.55rem">🔒</sup>':''}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:.2rem">${p.title}</div>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;font-size:.73rem;color:var(--muted)">
              ${p.examType ? `<span style="background:rgba(59,130,246,.1);color:#93c5fd;padding:.1rem .5rem;border-radius:99px;font-weight:600">${p.examType}</span>` : ''}
              ${p.term    ? `<span>📅 ${p.term}${p.year?' '+p.year:''}</span>` : (p.year?`<span>📅 ${p.year}</span>`:'')}
              ${p.classLevel ? `<span>🎓 ${p.classLevel}</span>` : ''}
              <span>${isFree ? '<span style="color:#10b981;font-weight:600">✅ Free</span>' : `<span style="color:#f59e0b;font-weight:600">KES ${parseFloat(p.price).toLocaleString()}</span>`}</span>
              ${isPlatformAdmin ? `<span>⬇ ${p.downloads||0} download${(p.downloads||0)!==1?'s':''}</span>` : ''}
              ${date ? `<span>📤 ${date}</span>` : ''}
            </div>
            ${p.desc ? `<div style="font-size:.76rem;color:var(--muted);margin-top:.3rem;line-height:1.5">${p.desc}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end;flex-shrink:0">
            ${isFree && p.fileData ? `<button class="btn btn-primary btn-sm" onclick="downloadPlatformPaper('${p.id}')">⬇ Download</button>` : (!isFree ? `<button class="btn btn-outline btn-sm" style="opacity:.6;cursor:not-allowed" disabled>🔒 Paid</button>` : '')}
            ${isPlatformAdmin ? `<button class="btn btn-outline btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="deletePlatformPaper('${p.id}')">🗑 Delete</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

function uploadPlatformPaper() {
  const subject    = document.getElementById('ppSubject')?.value.trim();
  const classLevel = document.getElementById('ppClass')?.value.trim();
  const examType   = document.getElementById('ppExamType')?.value;
  const title      = document.getElementById('ppTitle')?.value.trim();
  const term       = document.getElementById('ppTerm')?.value;
  const year       = parseInt(document.getElementById('ppYear')?.value) || new Date().getFullYear();
  const price      = parseFloat(document.getElementById('ppPrice')?.value) || 0;
  const desc       = document.getElementById('ppDesc')?.value.trim();
  const fileInput  = document.getElementById('ppFile');
  const statusEl   = document.getElementById('ppUploadStatus');

  if (!subject) { showToast('Please enter a subject / topic.', 'error'); return; }
  if (!title)   { showToast('Please enter a paper title.', 'error'); return; }
  if (!fileInput?.files?.length) { showToast('Please select a file to upload.', 'error'); return; }

  const file = fileInput.files[0];
  if (file.size > 6 * 1024 * 1024) { showToast('File too large. Maximum size is 6 MB.', 'error'); return; }

  if (statusEl) { statusEl.textContent = '⏳ Reading file…'; statusEl.style.color = 'var(--muted)'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const paper = {
      id: 'pp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      subject, classLevel, examType, title, term, year, price, desc,
      fileName: file.name,
      fileData: e.target.result,
      downloads: 0,
      uploadedBy: currentUser?.username || 'platform',
      uploadedAt: Date.now(),
    };
    const papers = loadPlatformPapers();
    papers.push(paper);
    savePlatformPapers(papers);
    if (statusEl) { statusEl.textContent = '✅ Uploaded successfully!'; statusEl.style.color = '#10b981'; }
    clearPlatformPaperForm();
    populatePlatformPaperFilters();
    renderPlatformPapers();
    showToast(`"${title}" uploaded — visible to all schools!`, 'success');
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  };
  reader.onerror = function() {
    showToast('Failed to read file. Please try again.', 'error');
    if (statusEl) { statusEl.textContent = ''; }
  };
  reader.readAsDataURL(file);
}

function clearPlatformPaperForm() {
  ['ppSubject','ppClass','ppTitle','ppDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['ppExamType','ppTerm'].forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
  const yearEl = document.getElementById('ppYear'); if (yearEl) yearEl.value = new Date().getFullYear();
  const priceEl = document.getElementById('ppPrice'); if (priceEl) priceEl.value = '0';
  const fileEl = document.getElementById('ppFile'); if (fileEl) fileEl.value = '';
  const preview = document.getElementById('ppFilePreview'); if (preview) preview.style.display = 'none';
}

function downloadPlatformPaper(paperId) {
  const papers = loadPlatformPapers();
  const paper = papers.find(p => p.id === paperId);
  if (!paper || !paper.fileData) { showToast('File not available for download.', 'error'); return; }
  try {
    const a = document.createElement('a');
    a.href = paper.fileData;
    a.download = paper.fileName || (paper.title + '.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Track download
    const idx = papers.findIndex(p => p.id === paperId);
    if (idx >= 0) { papers[idx].downloads = (papers[idx].downloads || 0) + 1; savePlatformPapers(papers); }
    renderPlatformPapers();
    showToast('Download started!', 'success');
  } catch(e) {
    showToast('Download failed. Please try again.', 'error');
  }
}

function deletePlatformPaper(paperId) {
  if (!confirm('Delete this revision paper? This cannot be undone.')) return;
  const papers = loadPlatformPapers().filter(p => p.id !== paperId);
  savePlatformPapers(papers);
  populatePlatformPaperFilters();
  renderPlatformPapers();
  showToast('Paper deleted.', 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PLATFORM: UPLOAD PAPERS TO SCHOOLS (Termly Exams OR Revision)
   ═══════════════════════════════════════════════════════════════════════════════ */

function platPaperDestChange() {
  // Highlight selected destination label
  const termlyLbl   = document.getElementById('platPapDest_termly_lbl');
  const revisionLbl = document.getElementById('platPapDest_revision_lbl');
  const dest = document.querySelector('input[name="platPaperDest"]:checked')?.value;
  if (termlyLbl)   termlyLbl.style.borderColor   = dest === 'termlyExam' ? 'var(--primary)' : 'var(--border)';
  if (revisionLbl) revisionLbl.style.borderColor = dest === 'revision'   ? 'var(--primary)' : 'var(--border)';
}

function platUploadPaper() {
  const dest      = document.querySelector('input[name="platPaperDest"]:checked')?.value || 'termlyExam';
  const subject   = (document.getElementById('platPapSubject')?.value || '').trim();
  const classLvl  = (document.getElementById('platPapClass')?.value   || '').trim();
  const term      = document.getElementById('platPapTerm')?.value      || '';
  const title     = (document.getElementById('platPapTitle')?.value    || '').trim();
  const year      = parseInt(document.getElementById('platPapYear')?.value) || new Date().getFullYear();
  const price     = parseFloat(document.getElementById('platPapPrice')?.value) || 0;
  const desc      = (document.getElementById('platPapDesc')?.value     || '').trim();
  const fileInput = document.getElementById('platPapFile');
  const statusEl  = document.getElementById('platPapStatus');

  if (!subject) { showToast('Please enter a subject / topic.', 'error'); return; }
  if (!title)   { showToast('Please enter a paper title.', 'error'); return; }
  if (!fileInput?.files?.length) { showToast('Please select a file to upload.', 'error'); return; }
  const file = fileInput.files[0];
  if (file.size > 6 * 1024 * 1024) { showToast('File too large. Maximum 6 MB.', 'error'); return; }

  if (statusEl) { statusEl.textContent = '⏳ Reading file…'; statusEl.style.color = 'var(--muted)'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const paper = {
      id: 'pp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      section: dest,          // 'termlyExam' or 'revision'
      subject, classLvl, title, term, year, price, desc,
      fileName: file.name,
      fileType: file.type,
      fileData: e.target.result,
      downloads: 0,
      uploadedBy: currentUser?.username || 'platform',
      uploadedAt: Date.now(),
    };
    const papers = loadPlatformPapers();
    papers.push(paper);
    savePlatformPapers(papers);
    if (statusEl) { statusEl.textContent = '✅ Uploaded successfully!'; statusEl.style.color = '#10b981'; }
    platClearPaperForm();
    renderPlatPapList();
    // Also refresh papers section if open
    renderTermlyPapers();
    populatePlatformPaperFilters();
    renderPlatformPapers();
    const destLabel = dest === 'termlyExam' ? 'Termly Exams' : 'Revision';
    showToast(`"${title}" uploaded — visible to all schools under ${destLabel}!`, 'success');
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
  };
  reader.onerror = function() {
    showToast('Failed to read file. Please try again.', 'error');
    if (statusEl) statusEl.textContent = '';
  };
  reader.readAsDataURL(file);
}

function platClearPaperForm() {
  ['platPapSubject','platPapClass','platPapTitle','platPapDesc'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['platPapTerm'].forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
  const yearEl = document.getElementById('platPapYear'); if (yearEl) yearEl.value = new Date().getFullYear();
  const priceEl = document.getElementById('platPapPrice'); if (priceEl) priceEl.value = '0';
  const fileEl = document.getElementById('platPapFile'); if (fileEl) fileEl.value = '';
  const preview = document.getElementById('platPapFilePreview'); if (preview) preview.style.display = 'none';
  // Reset destination to termlyExam
  const termlyRadio = document.getElementById('platPapDest_termly'); if (termlyRadio) termlyRadio.checked = true;
  platPaperDestChange();
}

function renderPlatPapList() {
  const listEl = document.getElementById('platPapList');
  if (!listEl) return;
  const papers = loadPlatformPapers();
  const filterDest = document.getElementById('platPapFilterDest')?.value || '';
  let list = [...papers].sort((a,b) => (b.uploadedAt||0) - (a.uploadedAt||0));
  if (filterDest) list = list.filter(p => (p.section || 'revision') === filterDest);

  if (!list.length) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:1.5rem">No papers uploaded yet.</p>';
    return;
  }

  listEl.innerHTML = list.map(p => {
    const destBadge = (p.section === 'termlyExam')
      ? '<span style="background:#eff6ff;color:var(--primary);font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:999px">📝 Termly Exams</span>'
      : '<span style="background:#f5f3ff;color:#7c3aed;font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:999px">📖 Revision</span>';
    const fileIcon = getFileIcon(p.fileType, p.fileName);
    const uploadDate = new Date(p.uploadedAt).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'});
    return `<div style="display:flex;align-items:center;gap:.75rem;padding:.7rem .85rem;border-bottom:1px solid var(--border-lt);flex-wrap:wrap">
      <span style="font-size:1.4rem;flex-shrink:0">${fileIcon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.88rem;word-break:break-word">${p.title}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${p.subject}${p.classLvl ? ' · ' + p.classLvl : ''}${p.term ? ' · ' + p.term : ''} ${p.year} · ${uploadDate}</div>
        <div style="margin-top:.25rem">${destBadge}</div>
      </div>
      <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;flex-shrink:0" onclick="platDeletePaper('${p.id}')">🗑</button>
    </div>`;
  }).join('');
}

function platDeletePaper(paperId) {
  if (!confirm('Delete this paper from all schools? This cannot be undone.')) return;
  const papers = loadPlatformPapers().filter(p => p.id !== paperId);
  savePlatformPapers(papers);
  renderPlatPapList();
  populatePlatformPaperFilters();
  renderPlatformPapers();
  renderTermlyPapers();
  showToast('Paper deleted from all schools.', 'success');
}




/* ═══════════════════════════════════════════════════════════════════════════════
   EXAM BUILDER MODULE — Integrated into Charanas Analyser
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Storage key ────────────────────────────────────────────────────────────────
const EB_KEY = () => schoolPrefix() + 'eb_exams';

function ebLoad() { try { return JSON.parse(localStorage.getItem(EB_KEY())) || []; } catch { return []; } }
function ebSave(arr) { localStorage.setItem(EB_KEY(), JSON.stringify(arr)); }
function ebGenId() { return 'eb_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function ebEscape(s) { if(!s)return''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── State ───────────────────────────────────────────────────────────────────
const EB = {
  currentStep: 1,
  sections: [],
  editingId: null,
  aiDiff: 'easy',
  modalDiff: 'medium',
  gaDiff: 'medium',
  aiSectionIdx: null,
  mathTarget: null,
  subPartsSec: null,
  subPartsQ: null,
  genAiResults: [],
  spColors: ['#1a6fb5','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']
};

// ─── Tab Navigation ──────────────────────────────────────────────────────────
function openEBTab(id, btn) {
  document.querySelectorAll('#s-exambuilder .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#ebTabBar .tb').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'tabEBSaved') { ebRenderSavedExams(); ebPopulateMsSelect(); }
  if (id === 'tabEBMarking') ebPopulateMsSelect();
}

// ─── Wizard Navigation ───────────────────────────────────────────────────────
function ebGoToStep(step) {
  if (step > EB.currentStep) {
    if (EB.currentStep === 1 && !ebValidateStep1()) return;
    if (EB.currentStep === 2 && !ebValidateStep2()) return;
  }
  EB.currentStep = step;
  document.querySelectorAll('.eb-wizard-content').forEach(c => c.classList.remove('active'));
  document.getElementById('eb-step-' + step)?.classList.add('active');
  document.querySelectorAll('.eb-step').forEach(s => {
    const n = parseInt(s.dataset.step);
    s.classList.remove('active','completed');
    if (n === step) s.classList.add('active');
    else if (n < step) s.classList.add('completed');
  });
  if (step === 3) ebRenderQuestionBuilder();
  if (step === 4) { ebSyncDOM(); ebRenderPreview(); }
  // Setup header preview listeners on first visit to step 1
  if (step === 1) ebSetupHeaderPreview();
}

function ebValidateStep1() {
  const s = document.getElementById('eb-schoolName')?.value?.trim();
  const sub = document.getElementById('eb-subject')?.value?.trim();
  const cls = document.getElementById('eb-classLevel')?.value?.trim();
  if (!s) { showToast('Please enter school name', 'error'); return false; }
  if (!sub) { showToast('Please enter subject', 'error'); return false; }
  if (!cls) { showToast('Please enter class', 'error'); return false; }
  return true;
}
function ebValidateStep2() {
  if (!EB.sections.length) { showToast('Add at least one section', 'error'); return false; }
  return true;
}

// ─── Header Preview ──────────────────────────────────────────────────────────
function ebSetupHeaderPreview() {
  ['eb-schoolName','eb-subject','eb-classLevel','eb-examType','eb-duration','eb-examDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._ebPreviewBound) {
      el.addEventListener('input', ebUpdatePreview);
      el.addEventListener('change', ebUpdatePreview);
      el._ebPreviewBound = true;
    }
  });
}
function ebUpdatePreview() {
  const get = id => document.getElementById(id)?.value || '';
  document.getElementById('eb-prev-school').textContent = (get('eb-schoolName') || 'SCHOOL NAME').toUpperCase();
  document.getElementById('eb-prev-subject').textContent = `${(get('eb-subject') || 'SUBJECT').toUpperCase()} – ${(get('eb-classLevel') || 'CLASS').toUpperCase()}`;
  document.getElementById('eb-prev-type').textContent = (get('eb-examType') || 'EXAM TYPE').toUpperCase();
  document.getElementById('eb-prev-meta').textContent = `TIME: ${get('eb-duration') || '—'} | DATE: ${get('eb-examDate') || '—'}`;
}

// ─── Instructions ────────────────────────────────────────────────────────────
function ebAddInstruction(text = '') {
  const list = document.getElementById('ebInstructionsList');
  const div = document.createElement('div');
  div.className = 'eb-inst-item';
  div.innerHTML = `<input type="text" value="${ebEscape(text)}" placeholder="Add instruction..." class="eb-inst-input"/>
    <button class="btn btn-sm" style="padding:3px 8px;color:var(--danger)" onclick="this.closest('.eb-inst-item').remove()">✕</button>`;
  list.appendChild(div);
}
function ebAutoInstructions() {
  const list = document.getElementById('ebInstructionsList');
  list.innerHTML = '';
  const insts = ['Write your name and admission number on the answer sheet.',
    'This paper consists of multiple sections. Read instructions for each section carefully.',
    'All working must be shown where applicable.',
    'Mobile phones and any unauthorized materials are not allowed in the examination room.',
    'Cheating will result in immediate disqualification.'];
  if (EB.sections.some(s => s.type === 'mcq')) insts.splice(1,0,'For multiple choice, shade or circle the correct answer.');
  if (EB.sections.some(s => s.type === 'structured')) insts.splice(2,0,'Answer all structured questions in the spaces provided.');
  if (EB.sections.some(s => s.type === 'essay')) insts.splice(3,0,'For essay questions, write in complete sentences and paragraphs.');
  insts.forEach(t => ebAddInstruction(t));
}
function ebGetInstructions() {
  return Array.from(document.querySelectorAll('#ebInstructionsList .eb-inst-input'))
    .map(i => i.value.trim()).filter(Boolean);
}

// ─── Sections ────────────────────────────────────────────────────────────────
function ebInitSections() {
  EB.sections = [
    { id:'sec_a', name:'A', type:'mcq', questionCount:10, marksPerQuestion:2, totalMarks:20, instruction:'Choose the best answer for each question.', questions:[] },
    { id:'sec_b', name:'B', type:'structured', questionCount:5, marksPerQuestion:6, totalMarks:30, instruction:'Answer all questions in the spaces provided.', questions:[] },
    { id:'sec_c', name:'C', type:'essay', questionCount:2, marksPerQuestion:25, totalMarks:50, instruction:'Answer any two questions from this section.', questions:[] }
  ];
}
function ebAddSection() {
  const names = ['A','B','C','D','E','F'];
  const used = EB.sections.map(s => s.name);
  const next = names.find(n => !used.includes(n)) || String(EB.sections.length + 1);
  EB.sections.push({ id:'sec_'+ebGenId(), name:next, type:'mcq', questionCount:5, marksPerQuestion:2, totalMarks:10, instruction:'', questions:[] });
  ebRenderSections();
}
function ebRemoveSection(idx) {
  if (EB.sections.length <= 1) { showToast('Need at least one section', 'error'); return; }
  EB.sections.splice(idx,1); ebRenderSections();
}
function ebUpdateSection(idx, key, value) {
  EB.sections[idx][key] = value;
  if (key === 'questionCount' || key === 'marksPerQuestion') {
    EB.sections[idx].totalMarks = (EB.sections[idx].questionCount || 0) * (EB.sections[idx].marksPerQuestion || 0);
  }
  ebRenderSections();
}
function ebUpdateSectionName(idx, value) {
  EB.sections[idx].name = value.replace('Section ','').trim() || String.fromCharCode(65 + idx);
}
function ebRenderSections() {
  const c = document.getElementById('ebSectionsList');
  if (!c) return;
  if (!EB.sections.length) { c.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1.5rem">No sections. Click Add Section.</p>'; ebUpdateTotalMarks(); return; }
  c.innerHTML = EB.sections.map((sec, idx) => `
    <div class="eb-section-card" id="ebsc-${idx}">
      <div class="eb-section-hd">
        <div class="eb-section-color" style="background:${EB.spColors[idx % EB.spColors.length]}"></div>
        <input class="eb-section-title-inp" value="Section ${ebEscape(sec.name)}" onchange="ebUpdateSectionName(${idx},this.value)" placeholder="Section name..."/>
        <span style="margin-left:auto;font-size:.76rem;background:var(--primary-lt);color:var(--primary);padding:2px 8px;border-radius:20px;font-weight:700">${sec.questions.length} Qs</span>
        <button onclick="ebRemoveSection(${idx})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:1rem;margin-left:.25rem" title="Remove">✕</button>
      </div>
      <div class="eb-section-body">
        <div class="eb-section-field"><label>Type</label>
          <select onchange="ebUpdateSection(${idx},'type',this.value)">
            <option value="mcq" ${sec.type==='mcq'?'selected':''}>Multiple Choice</option>
            <option value="structured" ${sec.type==='structured'?'selected':''}>Structured</option>
            <option value="essay" ${sec.type==='essay'?'selected':''}>Essay</option>
          </select>
        </div>
        <div class="eb-section-field"><label>Questions</label><input type="number" value="${sec.questionCount}" min="1" max="50" onchange="ebUpdateSection(${idx},'questionCount',parseInt(this.value))"/></div>
        <div class="eb-section-field"><label>Marks Each</label><input type="number" value="${sec.marksPerQuestion}" min="1" max="100" onchange="ebUpdateSection(${idx},'marksPerQuestion',parseInt(this.value))"/></div>
        <div class="eb-section-field"><label>Section Total</label><input type="number" value="${sec.totalMarks}" min="1" max="200" style="background:var(--primary-lt);font-weight:700" onchange="ebUpdateSection(${idx},'totalMarks',parseInt(this.value))"/></div>
      </div>
      <div style="padding:.5rem 1rem .75rem">
        <input type="text" value="${ebEscape(sec.instruction||'')}" placeholder="Section instruction..." onchange="ebUpdateSection(${idx},'instruction',this.value)"
          style="width:100%;padding:6px 10px;border:1.5px solid var(--border-lt);border-radius:6px;font-size:.82rem;outline:none"/>
      </div>
    </div>`).join('');
  ebUpdateTotalMarks();
}
function ebUpdateTotalMarks() {
  const t = EB.sections.reduce((s,sec) => s + (sec.totalMarks||0), 0);
  const el = document.getElementById('ebTotalMarks');
  if (el) el.textContent = t;
}

// ─── Question Builder ─────────────────────────────────────────────────────────
function ebRenderQuestionBuilder() {
  const area = document.getElementById('ebQuestionBuilderArea');
  if (!area) return;
  const banner = document.getElementById('ebGenerateAllBanner');
  if (banner) banner.style.display = EB.sections.length > 0 ? 'flex' : 'none';
  if (!EB.sections.length) {
    area.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem">📂</div><p>No sections defined.</p></div>';
    return;
  }
  const letters = ['A','B','C','D'];
  area.innerHTML = EB.sections.map((sec, sIdx) => `
    <div class="card" style="margin-bottom:1.25rem">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.25rem;border-bottom:1px solid var(--border-lt);background:${EB.spColors[sIdx%EB.spColors.length]}12;border-left:4px solid ${EB.spColors[sIdx%EB.spColors.length]}">
        <h3 style="font-size:.95rem;color:${EB.spColors[sIdx%EB.spColors.length]}">Section ${ebEscape(sec.name)}: ${ebTypeLabel(sec.type)} <span style="font-size:.76rem;background:${EB.spColors[sIdx%EB.spColors.length]}22;padding:1px 8px;border-radius:20px;margin-left:.35rem">${sec.questions.length}/${sec.questionCount}</span></h3>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-outline btn-sm" onclick="ebOpenAIModal(${sIdx})">🤖 AI</button>
          <button class="btn btn-outline btn-sm" onclick="ebAddQuestion(${sIdx})">➕ Manual</button>
        </div>
      </div>
      <div style="padding:.75rem 1rem" id="ebqs-${sIdx}">
        ${!sec.questions.length ? `<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:1rem">No questions yet — click AI or Manual to add</p>` :
          sec.type === 'mcq'
            ? `<div class="eb-mcq-grid">${sec.questions.map((q,qIdx) => ebRenderQCard(sIdx,qIdx,q,sec)).join('')}</div>`
            : sec.questions.map((q,qIdx) => ebRenderQCard(sIdx,qIdx,q,sec)).join('')
        }
      </div>
    </div>`).join('');
}

function ebTypeLabel(t) { return {mcq:'Multiple Choice',structured:'Structured',essay:'Essay'}[t] || t; }

function ebRenderQCard(sIdx, qIdx, q, sec) {
  const letters = ['A','B','C','D'];
  const badge = q.aiGenerated ? '<span style="font-size:.68rem;background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:12px;font-weight:700">AI</span>' : '';
  const typeLabel = {mcq:'MCQ',structured:'STR',essay:'ESS'}[sec.type] || sec.type;

  // Image preview for this question
  const imgSection = `
    <div style="margin-top:.5rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
      <button type="button" onclick="ebOpenImgUpload(${sIdx},${qIdx})" class="btn btn-outline btn-sm" style="font-size:.75rem">🖼️ ${q.imageData?'Change':'Add'} Image</button>
      ${q.imageData ? `
        <button type="button" onclick="ebRemoveImg(${sIdx},${qIdx})" class="btn btn-sm" style="color:var(--danger);font-size:.75rem;background:none;border:none">✕ Remove</button>
        <div style="margin-top:.35rem;position:relative;display:inline-block">
          <img src="${q.imageData}" style="max-height:${q.imageHeight||100}px;max-width:100%;border:1.5px solid var(--border-lt);border-radius:5px;display:block"/>
          <div style="font-size:.7rem;color:var(--muted);margin-top:.2rem">
            Height: <input type="range" min="60" max="300" value="${q.imageHeight||100}" style="width:80px;vertical-align:middle" oninput="ebSetImgHeight(${sIdx},${qIdx},this.value);this.nextElementSibling.textContent=this.value+'px'"/> <span>${q.imageHeight||100}px</span>
            &nbsp; Pos: <select style="font-size:.7rem;padding:2px" onchange="ebUpdateQ(${sIdx},${qIdx},'imagePos',this.value)">
              <option value="below" ${(q.imagePos||'below')==='below'?'selected':''}>Below Q</option>
              <option value="above" ${q.imagePos==='above'?'selected':''}>Above Q</option>
              <option value="right" ${q.imagePos==='right'?'selected':''}>Right of Q</option>
            </select>
          </div>
        </div>` : ''}
    </div>`;

  let body = '';
  if (sec.type === 'mcq') {
    body = `
      <textarea class="eb-qtextarea" id="ebqt-${sIdx}-${qIdx}" placeholder="Question text..." onchange="ebUpdateQ(${sIdx},${qIdx},'question',this.value)">${ebEscape(q.question||'')}</textarea>
      <div class="eb-qmeta">
        <label>Marks:</label><input type="number" value="${q.marks||2}" min="1" max="50" onchange="ebUpdateQ(${sIdx},${qIdx},'marks',parseInt(this.value))"/>
        <label>Correct:</label>
        <select onchange="ebUpdateQ(${sIdx},${qIdx},'answer',this.value)">
          ${letters.map(l => `<option value="${l}" ${q.answer===l?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:.5rem">
        ${(q.options&&q.options.length?q.options:['','','','']).map((opt,oi) => `
          <div class="eb-mcq-option">
            <div class="eb-opt-lbl" style="${q.answer===letters[oi]?'background:var(--primary);color:#fff':''}">${letters[oi]}</div>
            <input type="text" value="${ebEscape(opt)}" placeholder="Option ${letters[oi]}..." onchange="ebUpdateOpt(${sIdx},${qIdx},${oi},this.value)"/>
            <input type="radio" name="ebcorr-${sIdx}-${qIdx}" ${q.answer===letters[oi]?'checked':''} onchange="ebUpdateQ(${sIdx},${qIdx},'answer','${letters[oi]}')" style="cursor:pointer;accent-color:var(--primary)"/>
          </div>`).join('')}
      </div>
      ${imgSection}`;
  } else if (sec.type === 'structured') {
    body = `
      <textarea class="eb-qtextarea" id="ebqt-${sIdx}-${qIdx}" placeholder="Question text..." onchange="ebUpdateQ(${sIdx},${qIdx},'question',this.value)">${ebEscape(q.question||'')}</textarea>
      <div class="eb-qmeta">
        <label>Marks:</label><input type="number" value="${q.marks||6}" min="1" max="100" onchange="ebUpdateQ(${sIdx},${qIdx},'marks',parseInt(this.value))"/>
        <button class="btn btn-outline btn-sm" onclick="ebOpenSubParts(${sIdx},${qIdx})" style="font-size:.76rem">≡ Sub-parts ${q.subParts?.length?`(${q.subParts.length})`:''}</button>
      </div>
      ${q.subParts?.length ? `<div style="margin-top:.4rem;font-size:.76rem;color:var(--muted);padding:4px 8px;background:var(--bg);border-radius:5px">Sub-parts: ${q.subParts.map((p,i) => `(${String.fromCharCode(97+i)}) ${p.text.substring(0,25)}…`).join(' | ')}</div>` : ''}
      ${imgSection}`;
  } else {
    body = `
      <textarea class="eb-qtextarea" id="ebqt-${sIdx}-${qIdx}" placeholder="Essay question..." onchange="ebUpdateQ(${sIdx},${qIdx},'question',this.value)">${ebEscape(q.question||'')}</textarea>
      <div class="eb-qmeta">
        <label>Marks:</label><input type="number" value="${q.marks||25}" min="1" max="100" onchange="ebUpdateQ(${sIdx},${qIdx},'marks',parseInt(this.value))"/>
      </div>
      ${imgSection}`;
  }
  return `
    <div class="eb-question-card" id="ebqc-${sIdx}-${qIdx}">
      <div class="eb-qcard-hd">
        <div class="eb-qnum">${qIdx+1}</div>
        <span style="font-size:.72rem;color:var(--muted);font-weight:600">${typeLabel}</span>
        ${badge}
        <div style="margin-left:auto;display:flex;gap:.3rem">
          <button onclick="ebOpenMathModal('ebqt-${sIdx}-${qIdx}')" style="background:none;border:none;cursor:pointer;font-size:.82rem;color:var(--muted)" title="Insert equation">√</button>
          <button onclick="ebRemoveQ(${sIdx},${qIdx})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:.9rem" title="Delete">✕</button>
        </div>
      </div>
      <div class="eb-qcard-body">${body}</div>
    </div>`;
}

function ebAddQuestion(sIdx) {
  const sec = EB.sections[sIdx]; if (!sec) return;
  sec.questions.push({ id:ebGenId(), question:'', marks:sec.marksPerQuestion||2, options:sec.type==='mcq'?['','','','']:[], answer:sec.type==='mcq'?'A':'', subParts:[], aiGenerated:false });
  ebRenderQuestionBuilder();
  setTimeout(() => { const ta = document.getElementById(`ebqt-${sIdx}-${sec.questions.length-1}`); if(ta) ta.focus(); }, 80);
}
function ebRemoveQ(sIdx, qIdx) { EB.sections[sIdx].questions.splice(qIdx,1); ebRenderQuestionBuilder(); }
function ebUpdateQ(sIdx, qIdx, key, value) { if (EB.sections[sIdx]?.questions[qIdx]) EB.sections[sIdx].questions[qIdx][key] = value; }
function ebUpdateOpt(sIdx, qIdx, oi, value) {
  const q = EB.sections[sIdx]?.questions[qIdx]; if (!q) return;
  if (!q.options) q.options = ['','','',''];
  q.options[oi] = value;
}

// ─── Image Upload for Questions ───────────────────────────────────────────────
function ebOpenImgUpload(sIdx, qIdx) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const q = EB.sections[sIdx]?.questions[qIdx]; if (!q) return;
      q.imageData = ev.target.result;
      q.imageHeight = 120;
      q.imagePos = 'below';
      ebRenderQuestionBuilder();
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}
function ebRemoveImg(sIdx, qIdx) {
  const q = EB.sections[sIdx]?.questions[qIdx]; if (!q) return;
  delete q.imageData; delete q.imageHeight; delete q.imagePos;
  ebRenderQuestionBuilder();
}
function ebSetImgHeight(sIdx, qIdx, val) {
  const q = EB.sections[sIdx]?.questions[qIdx]; if (!q) return;
  q.imageHeight = parseInt(val);
  const card = document.getElementById(`ebqc-${sIdx}-${qIdx}`);
  if (card) { const img = card.querySelector('img'); if (img) img.style.maxHeight = val + 'px'; }
}

// ─── Sync DOM to state ────────────────────────────────────────────────────────
function ebSyncDOM() {
  EB.sections.forEach((sec, sIdx) => {
    sec.questions.forEach((q, qIdx) => {
      const ta = document.getElementById(`ebqt-${sIdx}-${qIdx}`);
      if (ta) q.question = ta.value;
    });
  });
}

// ─── Exam Preview ─────────────────────────────────────────────────────────────
function ebRenderPreview() {
  const h = ebGetHeader();
  const instructions = ebGetInstructions();
  const totalMarks = EB.sections.reduce((s,sec) => s+(sec.totalMarks||0), 0);
  const el = document.getElementById('ebExamPreview');
  if (!el) return;
  const subLetters = ['a','b','c','d','e','f'];
  const subjectFooter = h.subject ? h.subject.toUpperCase() : '';
  const schoolName = (h.schoolName || 'SCHOOL NAME').toUpperCase();
  const dateFormatted = h.date ? new Date(h.date).toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'}) : '_______________';

  // ── Small examiner box (used on structured/essay questions only) ──
  const examBox = (marks) => `
    <div style="border:1px solid #999;padding:.15rem .35rem;text-align:center;min-width:52px;font-size:.6rem;flex-shrink:0;margin-left:.4rem">
      <div style="font-size:.52rem;color:#666;border-bottom:1px solid #bbb;padding-bottom:.1rem;margin-bottom:.1rem">Examr.</div>
      <div style="border-bottom:1px dotted #999;min-height:13px;width:100%">&nbsp;</div>
      <div style="font-size:.58rem;color:#666">/${marks}</div>
    </div>`;

  // ── Per-section renderer ──
  const renderSection = (sec, sIdx) => {
    const isMcq = sec.type === 'mcq';
    const isEssay = sec.type === 'essay';
    const isStructured = sec.type === 'structured';
    const isShortAnswer = isStructured && sec.questions.length >= 2 && sec.questions.every(q => (q.marks||0) <= 4 && !q.subParts?.length);

    let questionsHtml = '';

    if (isMcq) {
      // ── Two-column MCQ — NO examiner boxes ──
      questionsHtml = `<div class="ebep-mcq-grid">` +
        sec.questions.map((q, qIdx) => `
          <div class="ebep-q" style="break-inside:avoid;padding:.25rem 0">
            <strong>${qIdx+1}. ${ebEscape(q.question||'[Question text]')}</strong>
            <em style="font-size:.68rem;color:#666"> (${q.marks}mk)</em>
            ${q.imageData ? `<img src="${q.imageData}" class="ebep-q-img" style="max-height:${q.imageHeight||120}px"/>` : ''}
            ${q.options?.filter(Boolean).length
              ? `<div style="margin-top:.25rem">${q.options.map((o,oi) => o ? `<div class="ebep-opt">${['A','B','C','D'][oi]}) ${ebEscape(o)}</div>` : '').join('')}</div>`
              : ''}
          </div>`).join('') +
        `</div>`;

    } else if (isShortAnswer) {
      // ── 2×2 matrix for short structured ──
      const pairs = [];
      for (let i = 0; i < sec.questions.length; i += 2) pairs.push([sec.questions[i], sec.questions[i+1]]);
      questionsHtml = pairs.map((pair, pi) => `
        <div class="ebep-sa-matrix">
          ${pair.map((q, qi) => q ? `
            <div class="ebep-sa-cell">
              <div class="ebep-sa-qnum">${pi*2+qi+1}. ${ebEscape(q.question||'[Question]')} <em style="font-size:.68rem;color:#555">(${q.marks}mk)</em></div>
              ${q.imageData ? `<img src="${q.imageData}" class="ebep-q-img" style="max-height:${q.imageHeight||80}px"/>` : ''}
            </div>` : '<div class="ebep-sa-cell"></div>').join('')}
        </div>`).join('');

    } else {
      // ── Structured / Essay — question → sub-parts (1a, 1b…) → response lines ──
      questionsHtml = sec.questions.map((q, qIdx) => {
        // Count lines: if sub-parts exist, each sub-part gets its own lines
        const hasSubParts = q.subParts && q.subParts.length > 0;

        const subPartsHtml = hasSubParts
          ? q.subParts.map((p, pi) => {
              const spLines = p.marks <= 2 ? 2 : p.marks <= 4 ? 3 : p.marks <= 6 ? 5 : 7;
              return `
                <div style="margin-top:.4rem;break-inside:avoid">
                  <div style="display:flex;align-items:flex-start">
                    <span style="font-weight:700;min-width:1.8rem;font-size:.85rem">${qIdx+1}${subLetters[pi]}.</span>
                    <span style="flex:1;font-size:.85rem">${ebEscape(p.text)}</span>
                    ${examBox(p.marks)}
                  </div>
                  <div class="ebep-response" style="margin-left:1.8rem">${Array.from({length:spLines}).map(()=>'<div class="ebep-line"></div>').join('')}</div>
                </div>`;
            }).join('')
          : (() => {
              const lineCount = isEssay ? 14 : (q.marks <= 3 ? 3 : q.marks <= 6 ? 5 : q.marks <= 10 ? 8 : 12);
              return `<div class="ebep-response">${Array.from({length:lineCount}).map(()=>'<div class="ebep-line"></div>').join('')}</div>`;
            })();

        return `
          <div class="ebep-q" style="break-inside:avoid;margin-bottom:.75rem">
            <div style="display:flex;align-items:flex-start">
              <strong style="flex:1;font-size:.88rem">${qIdx+1}. ${ebEscape(q.question||'[Question text]')}
                ${!hasSubParts ? `<em style="font-weight:400;font-size:.72rem;color:#555"> (${q.marks} mark${q.marks!==1?'s':''})</em>` : ''}
              </strong>
              ${!hasSubParts ? examBox(q.marks) : ''}
            </div>
            ${q.imageData ? `<img src="${q.imageData}" class="ebep-q-img" style="max-height:${q.imageHeight||150}px;margin-top:.3rem"/>` : ''}
            ${subPartsHtml}
          </div>`;
      }).join('');
    }

    const totalSectionMarks = sec.questions.reduce((s,q) => s + (q.marks||0), 0) || sec.totalMarks;
    return `
      <div style="break-before:${sIdx===0?'avoid':'page'}">
        <div class="ebep-sectitle">SECTION ${ebEscape(sec.name)}: ${ebTypeLabel(sec.type).toUpperCase()} (${totalSectionMarks} MARKS)</div>
        ${sec.instruction ? `<div style="font-style:italic;font-size:.82rem;margin-bottom:.5rem;text-align:center">${ebEscape(sec.instruction)}</div>` : ''}
        ${questionsHtml}
        ${!sec.questions.length ? `<div style="color:#aaa;font-size:.78rem;text-align:center">[No questions added yet]</div>` : ''}
      </div>`;
  };

  // ── Cover page scoring table ──
  // Columns: Section | Q1 | Q2 | Q3 … | Section Total | (last col = grand total + grade)
  const buildScoringTable = () => {
    const maxQs = Math.max(...EB.sections.map(s => s.questions.length), 0);
    const secRows = EB.sections.map(sec => {
      const qCells = sec.questions.map((q, qi) => {
        // For sub-parts show marks per sub-part
        if (q.subParts && q.subParts.length) {
          const subLabels = q.subParts.map((p,pi) => `${qi+1}${subLetters[pi]}`).join('/');
          const subMarks = q.subParts.map(p => p.marks).join('/');
          return `<td style="border:1px solid #000;padding:.2rem .3rem;text-align:center;font-size:.65rem">
            <div style="color:#555;font-size:.58rem">${subLabels}</div>
            <div style="border-bottom:1px dotted #999;min-height:11px"></div>
            <div style="font-size:.58rem;color:#777">/${subMarks}</div>
          </td>`;
        }
        return `<td style="border:1px solid #000;padding:.2rem .3rem;text-align:center;font-size:.65rem">
          <div style="color:#555;font-size:.58rem">Q${qi+1}</div>
          <div style="border-bottom:1px dotted #999;min-height:11px"></div>
          <div style="font-size:.58rem;color:#777">/${q.marks}</div>
        </td>`;
      });
      // Pad empty cells
      while (qCells.length < maxQs) qCells.push(`<td style="border:1px solid #000;background:#f9f9f9"></td>`);
      const secTotal = sec.questions.reduce((s,q)=>s+(q.marks||0),0)||sec.totalMarks;
      return `<tr>
        <td style="border:1px solid #000;padding:.25rem .4rem;font-weight:700;font-size:.72rem;white-space:nowrap">Section ${ebEscape(sec.name)}</td>
        ${qCells.join('')}
        <td style="border:1px solid #000;padding:.25rem .3rem;text-align:center;font-weight:700;font-size:.72rem">
          <div style="border-bottom:1px dotted #999;min-height:12px"></div>
          <div style="font-size:.6rem;color:#555">/${secTotal}</div>
        </td>
      </tr>`;
    });

    const qHeaders = Array.from({length:maxQs}, (_,i) => `<th style="border:1px solid #000;padding:.2rem .3rem;background:#f0f0f0;font-size:.65rem;text-align:center">Q${i+1}</th>`).join('');

    return `
      <div style="margin-top:.75rem">
        <div style="font-weight:900;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.3rem;text-align:center">FOR EXAMINER'S USE ONLY</div>
        <table style="width:100%;border-collapse:collapse;font-size:.72rem">
          <thead>
            <tr>
              <th style="border:1px solid #000;padding:.25rem .4rem;background:#f0f0f0;font-size:.65rem;text-align:left">Section</th>
              ${qHeaders}
              <th style="border:1px solid #000;padding:.25rem .3rem;background:#f0f0f0;font-size:.65rem;text-align:center">Sec. Total</th>
            </tr>
          </thead>
          <tbody>
            ${secRows.join('')}
            <tr>
              <td colspan="${maxQs+1}" style="border:1px solid #000;padding:.25rem .4rem;font-weight:900;font-size:.75rem;text-align:right">GRAND TOTAL</td>
              <td style="border:2px solid #000;padding:.25rem .3rem;text-align:center;font-weight:900;font-size:.78rem">
                <div style="border-bottom:1px solid #000;min-height:14px"></div>
                <div style="font-size:.62rem;color:#555">/${totalMarks}</div>
              </td>
            </tr>
            <tr>
              <td colspan="${maxQs+1}" style="border:1px solid #000;padding:.25rem .4rem;font-weight:900;font-size:.75rem;text-align:right">GRADE</td>
              <td style="border:2px solid #000;padding:.3rem;text-align:center;font-size:1rem;font-weight:900;min-height:20px">&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  };

  el.innerHTML = `
    <!-- PAGE 1: Cover / Details -->
    <div style="text-align:center;padding-bottom:.75rem;border-bottom:3px double #000;margin-bottom:1rem">
      <h2 style="font-size:1.6rem;letter-spacing:.05em;margin-bottom:.25rem">${schoolName}</h2>
      <div class="ebep-subject" style="font-size:1.2rem">${ebEscape(h.subject.toUpperCase())} &ndash; ${ebEscape(h.class.toUpperCase())}</div>
      <div class="ebep-type" style="font-size:1rem;font-weight:700">${ebEscape(h.examType.toUpperCase())} &bull; ${ebEscape(h.term||'')} ${ebEscape(String(h.year||''))}</div>
      <div class="ebep-meta">TIME ALLOWED: <strong>${ebEscape(h.duration||'_____ Hours')}</strong> &nbsp;|&nbsp; DATE: <strong>${dateFormatted}</strong> &nbsp;|&nbsp; TOTAL MARKS: <strong>${totalMarks}</strong></div>
    </div>
    <!-- Candidate Details Box -->
    <div class="ebep-coverbox">
      <table>
        <tr><td class="ebep-cb-label">Candidate's Name:</td><td style="width:62%">&nbsp;</td></tr>
        <tr><td class="ebep-cb-label">Admission No.:</td><td>&nbsp;</td></tr>
        <tr><td class="ebep-cb-label">Class / Stream:</td><td>&nbsp;</td></tr>
        <tr><td class="ebep-cb-label">Signature:</td><td>&nbsp;</td></tr>
      </table>
    </div>
    <!-- Scoring table (examiner use) -->
    ${buildScoringTable()}
    <div style="clear:both"></div>
    ${instructions.length ? `<div style="margin-top:.75rem;margin-bottom:.5rem"><div style="font-weight:900;font-size:.85rem;text-decoration:underline;margin-bottom:.35rem">INSTRUCTIONS TO CANDIDATES:</div>${instructions.map((t,i) => `<div style="font-size:.82rem;margin-bottom:2px">${i+1}. ${ebEscape(t)}</div>`).join('')}</div>` : ''}
    <hr style="border:1.5px solid #000;margin:.75rem 0"/>

    <!-- PAGE 2 onwards: Sections -->
    ${EB.sections.map((sec, sIdx) => renderSection(sec, sIdx)).join('')}

    <div style="text-align:center;margin-top:2rem;font-weight:900;font-size:.95rem">*** END OF EXAM ***</div>
    <div class="ebep-footer">${subjectFooter} &nbsp;&bull;&nbsp; ${schoolName} &nbsp;&bull;&nbsp; ${dateFormatted}</div>`;
  if (window.MathJax) MathJax.typesetPromise([el]).catch(()=>{});
}

// ─── Collect Header ───────────────────────────────────────────────────────────
function ebGetHeader() {
  return {
    schoolName: document.getElementById('eb-schoolName')?.value || settings.schoolName || '',
    subject: document.getElementById('eb-subject')?.value || '',
    class: document.getElementById('eb-classLevel')?.value || '',
    examType: document.getElementById('eb-examType')?.value || 'Midterm',
    duration: document.getElementById('eb-duration')?.value || '',
    date: document.getElementById('eb-examDate')?.value || '',
    term: document.getElementById('eb-term')?.value || '',
    year: document.getElementById('eb-year')?.value || new Date().getFullYear()
  };
}

// ─── New / Reset exam ─────────────────────────────────────────────────────────
function ebNewExam() {
  EB.editingId = null;
  EB.currentStep = 1;
  EB.sections = [];
  ebInitSections();
  // Clear form fields
  ['eb-schoolName','eb-subject','eb-classLevel','eb-duration','eb-examDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sn = document.getElementById('eb-schoolName'); if (sn) sn.value = settings.schoolName || '';
  const yr = document.getElementById('eb-year'); if (yr) yr.value = settings.currentYear || new Date().getFullYear();
  const dt = document.getElementById('eb-examDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  document.getElementById('ebInstructionsList').innerHTML = '';
  ebAddInstruction('Write your name and admission number on the answer sheet.');
  ebGoToStep(1);
}

// ─── Save Exam ────────────────────────────────────────────────────────────────
function ebSaveExam() {
  ebSyncDOM();
  const header = ebGetHeader();
  if (!header.subject) { showToast('Please fill in exam details first (Step 1)', 'error'); return; }
  const instructions = ebGetInstructions();
  const totalMarks = EB.sections.reduce((s,sec) => s+(sec.totalMarks||0), 0);
  const examData = { header, instructions, sections: JSON.parse(JSON.stringify(EB.sections)), totalMarks, createdAt: new Date().toISOString() };

  const exams = ebLoad();
  if (EB.editingId) {
    const idx = exams.findIndex(e => e.id === EB.editingId);
    if (idx > -1) { examData.id = EB.editingId; exams[idx] = examData; }
    else { examData.id = ebGenId(); exams.push(examData); EB.editingId = examData.id; }
  } else {
    examData.id = ebGenId();
    EB.editingId = examData.id;
    exams.push(examData);
  }
  ebSave(exams);
  showToast('Exam saved successfully! 💾', 'success');
}

// ─── Render Saved Exams ───────────────────────────────────────────────────────
function ebRenderSavedExams() {
  const exams = ebLoad();
  const search = (document.getElementById('ebSavedSearch')?.value || '').toLowerCase();
  const filtered = exams.filter(e => {
    const txt = `${e.header?.subject||''} ${e.header?.schoolName||''} ${e.header?.examType||''} ${e.header?.class||''}`.toLowerCase();
    return !search || txt.includes(search);
  });
  const c = document.getElementById('ebSavedList');
  if (!c) return;
  if (!filtered.length) {
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem">📁</div><p style="margin-top:.5rem">No saved exams yet</p></div>';
    return;
  }
  c.innerHTML = filtered.slice().reverse().map(e => `
    <div class="eb-exam-item">
      <div class="eb-exam-icon">📄</div>
      <div class="eb-exam-info">
        <div class="eb-exam-title">${ebEscape(e.header?.subject||'Untitled')} — ${ebEscape(e.header?.examType||'')}</div>
        <div class="eb-exam-meta">${ebEscape(e.header?.schoolName||'')} · ${ebEscape(e.header?.class||'')} · ${e.totalMarks} marks · ${e.sections?.length||0} sections</div>
      </div>
      <div class="eb-exam-actions">
        <button class="btn btn-outline btn-sm" onclick="ebLoadExamForEdit('${e.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="ebExportExamPDF('${e.id}')">⬇ PDF</button>
        <button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="ebDeleteExam('${e.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function ebDeleteExam(id) {
  if (!confirm('Delete this exam?')) return;
  const exams = ebLoad().filter(e => e.id !== id);
  ebSave(exams);
  ebRenderSavedExams();
  showToast('Exam deleted', 'success');
}

function ebLoadExamForEdit(id) {
  const exams = ebLoad();
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  EB.editingId = id;
  EB.sections = JSON.parse(JSON.stringify(exam.sections || []));
  const h = exam.header || {};
  // Switch to Create tab
  openEBTab('tabEBCreate', document.querySelector('#ebTabBar .tb'));
  setTimeout(() => {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('eb-schoolName', h.schoolName);
    setVal('eb-subject', h.subject);
    setVal('eb-classLevel', h.class);
    setVal('eb-examType', h.examType);
    setVal('eb-duration', h.duration);
    setVal('eb-examDate', h.date);
    setVal('eb-term', h.term);
    setVal('eb-year', h.year);
    // Restore instructions
    const list = document.getElementById('ebInstructionsList');
    if (list) {
      list.innerHTML = '';
      (exam.instructions || []).forEach(t => ebAddInstruction(t));
    }
    ebGoToStep(1);
    showToast('Exam loaded for editing', 'success');
  }, 100);
}

// ─── Export PDF ───────────────────────────────────────────────────────────────
function ebExportPDF() {
  ebSyncDOM();
  const header = ebGetHeader();
  const instructions = ebGetInstructions();
  const totalMarks = EB.sections.reduce((s,sec) => s+(sec.totalMarks||0), 0);
  ebClientSidePDF({ header, instructions, sections: EB.sections, totalMarks });
}
function ebExportExamPDF(id) {
  const exam = ebLoad().find(e => e.id === id);
  if (exam) ebClientSidePDF(exam);
}
function ebClientSidePDF(exam) {
  if (!window.jspdf) { showToast('PDF library not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const { header, sections, instructions, totalMarks } = exam;
  let y = 15; const lm = 15, pw = 180, maxY = 278;
  const subLetters = ['a','b','c','d','e','f'];
  const schoolName = (header.schoolName||'SCHOOL').toUpperCase();
  const subjectFooter = (header.subject||'').toUpperCase();
  const dateStr = header.date ? new Date(header.date).toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'}) : '_______________';

  const addPage = (need=10) => { if (y+need > maxY) { doc.addPage(); y=15; addFooter(); } };
  const addFooter = () => {
    doc.setFont('Helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(100);
    doc.text(`${subjectFooter}  \u2022  ${schoolName}  \u2022  ${dateStr}`, 105, 291, {align:'center'});
    doc.setLineWidth(.2); doc.setDrawColor(180); doc.line(lm, 288, lm+pw, 288);
    doc.setTextColor(0); doc.setDrawColor(0);
  };

  // ── PAGE 1: HEADER ──
  doc.setFont('Helvetica','bold'); doc.setFontSize(18);
  doc.text(schoolName, 105, y, {align:'center'}); y+=9;
  doc.setFontSize(13);
  doc.text(`${(header.subject||'').toUpperCase()} \u2013 ${(header.class||'').toUpperCase()}`, 105, y, {align:'center'}); y+=7;
  doc.setFontSize(11);
  doc.text(`${(header.examType||'').toUpperCase()}  \u2022  ${header.term||''}  ${header.year||''}`, 105, y, {align:'center'}); y+=6;
  doc.setFont('Helvetica','normal'); doc.setFontSize(10);
  doc.text(`TIME ALLOWED: ${header.duration||'___ Hours'}     DATE: ${dateStr}     TOTAL MARKS: ${totalMarks}`, 105, y, {align:'center'}); y+=4;
  doc.setLineWidth(1); doc.line(lm, y, lm+pw, y); y+=6;

  // Candidate details box
  doc.setLineWidth(.5); doc.rect(lm, y, pw, 26);
  const rowH=6.5; const col1=55;
  [['Candidate\'s Name:',''],['Admission No.:',''],['Class / Stream:',''],['Signature:','']].forEach((row,i) => {
    const ry = y+i*rowH+1.5;
    doc.setFont('Helvetica','bold'); doc.setFontSize(9); doc.text(row[0], lm+2, ry+4);
    doc.setLineWidth(.2); doc.line(lm+col1, ry+4.5, lm+pw-2, ry+4.5);
    if (i<3) { doc.setLineWidth(.2); doc.line(lm, y+(i+1)*rowH, lm+pw, y+(i+1)*rowH); }
  });
  y+=30;

  // ── Scoring table on cover ──
  const maxQs = Math.max(...sections.map(s => s.questions.length), 0);
  const colW = Math.min(12, Math.floor((pw - 22 - 16) / Math.max(maxQs, 1)));
  const secColW = 22; const totalColW = 16;

  // Header row
  doc.setFont('Helvetica','bold'); doc.setFontSize(8);
  doc.text("FOR EXAMINER'S USE ONLY", 105, y, {align:'center'}); y+=4;
  doc.setFontSize(6.5); doc.setLineWidth(.3);
  let tx = lm;
  doc.rect(tx, y, secColW, 7); doc.text('Section', tx+2, y+4.5); tx+=secColW;
  for (let i=0; i<maxQs; i++) {
    doc.rect(tx, y, colW, 7); doc.text(`Q${i+1}`, tx+colW/2, y+4.5, {align:'center'}); tx+=colW;
  }
  doc.rect(tx, y, totalColW, 7); doc.text('Sec.Total', tx+totalColW/2, y+4.5, {align:'center'}); y+=7;

  // Section rows
  sections.forEach(sec => {
    let rx = lm;
    doc.setFont('Helvetica','bold'); doc.setFontSize(7);
    doc.rect(rx, y, secColW, 10); doc.text(`Sec. ${sec.name}`, rx+2, y+6); rx+=secColW;
    doc.setFont('Helvetica','normal'); doc.setFontSize(6);
    sec.questions.forEach((q, qi) => {
      doc.rect(rx, y, colW, 10);
      // Sub-part label
      const lbl = q.subParts?.length ? q.subParts.map((_,pi)=>`${qi+1}${subLetters[pi]}`).join('/') : `Q${qi+1}`;
      const mks = q.subParts?.length ? q.subParts.map(p=>p.marks).join('/') : `/${q.marks}`;
      doc.text(lbl, rx+colW/2, y+3.5, {align:'center'});
      doc.setDrawColor(150); doc.line(rx+1, y+6, rx+colW-1, y+6); doc.setDrawColor(0);
      doc.text(mks, rx+colW/2, y+9, {align:'center'});
      rx+=colW;
    });
    // Pad empty cells
    for (let i=sec.questions.length; i<maxQs; i++) { doc.rect(rx, y, colW, 10); rx+=colW; }
    // Section total
    const secTotal = sec.questions.reduce((s,q)=>s+(q.marks||0),0)||sec.totalMarks;
    doc.rect(rx, y, totalColW, 10);
    doc.setDrawColor(150); doc.line(rx+1, y+6, rx+totalColW-1, y+6); doc.setDrawColor(0);
    doc.setFont('Helvetica','normal'); doc.setFontSize(6);
    doc.text(`/${secTotal}`, rx+totalColW/2, y+9, {align:'center'});
    y+=10;
  });

  // Grand total + grade rows
  doc.setFont('Helvetica','bold'); doc.setFontSize(7);
  const totRowX = lm+secColW+maxQs*colW;
  doc.rect(lm, y, secColW+maxQs*colW, 8); doc.text('GRAND TOTAL', lm+2, y+5.5);
  doc.rect(totRowX, y, totalColW, 8);
  doc.setDrawColor(0); doc.setLineWidth(.4); doc.line(totRowX+1, y+5, totRowX+totalColW-1, y+5);
  doc.setFontSize(6); doc.text(`/${totalMarks}`, totRowX+totalColW/2, y+7.5, {align:'center'});
  y+=8;
  doc.rect(lm, y, secColW+maxQs*colW, 8); doc.text('GRADE', lm+2, y+5.5);
  doc.rect(totRowX, y, totalColW, 8);
  y+=12;

  addFooter();

  // Instructions on cover
  if (instructions?.length) {
    doc.setFont('Helvetica','bold'); doc.setFontSize(10); doc.text('INSTRUCTIONS TO CANDIDATES:', lm, y); y+=5;
    doc.setFont('Helvetica','normal'); doc.setFontSize(9);
    instructions.forEach((t,i) => { addPage(5); const ls=doc.splitTextToSize(`${i+1}. ${t}`, pw-60); doc.text(ls, lm, y); y+=ls.length*4.5; });
    y+=2;
  }
  doc.setLineWidth(.8); doc.line(lm, y, lm+pw, y); y+=8;

  // ── SECTIONS (page 2 onwards) ──
  sections.forEach((sec, sIdx) => {
    doc.addPage(); y=15; addFooter();
    doc.setFont('Helvetica','bold'); doc.setFontSize(11);
    const secTitle = `SECTION ${sec.name}: ${ebTypeLabel(sec.type).toUpperCase()} (${sec.questions.reduce((s,q)=>s+(q.marks||0),0)||sec.totalMarks} MARKS)`;
    doc.text(secTitle, 105, y, {align:'center'}); y+=6;
    if (sec.instruction) {
      doc.setFont('Helvetica','italic'); doc.setFontSize(9);
      const ils = doc.splitTextToSize(sec.instruction, pw); doc.text(ils, 105, y, {align:'center'}); y+=ils.length*4.5;
    }
    y+=2;

    const isMcq = sec.type === 'mcq';
    const isShortAnswer = sec.type === 'structured' && sec.questions.length >= 2 && sec.questions.every(q=>(q.marks||0)<=4 && !q.subParts?.length);

    if (isMcq) {
      // ── Two-column MCQ — NO examiner boxes ──
      const half = Math.ceil(sec.questions.length/2);
      const colW2 = (pw-6)/2; const col2X = lm+colW2+6;
      const renderMcqCol = (qs, startIdx, x) => {
        let cy = y;
        qs.forEach((q, qi) => {
          const qNum = startIdx+qi+1;
          const qLines = doc.splitTextToSize(`${qNum}. ${q.question||'[Question]'}  (${q.marks}mk)`, colW2-4);
          if (cy+14 > maxY) { doc.addPage(); cy=15; addFooter(); }
          doc.setFont('Helvetica','bold'); doc.setFontSize(9.5); doc.text(qLines, x, cy); cy+=qLines.length*5;
          const labs=['A)','B)','C)','D)']; doc.setFont('Helvetica','normal'); doc.setFontSize(9);
          (q.options||[]).forEach((o,oi) => { if(o){ doc.text(`  ${labs[oi]} ${o}`, x, cy); cy+=4.5; } });
          cy+=4;
        });
        return cy;
      };
      const lyEnd = renderMcqCol(sec.questions.slice(0,half), 0, lm);
      const ryEnd = renderMcqCol(sec.questions.slice(half), half, col2X);
      y = Math.max(lyEnd, ryEnd)+4;

    } else if (isShortAnswer) {
      // 2×2 matrix
      for (let i=0; i<sec.questions.length; i+=2) {
        addPage(32);
        const boxH=30; const colW2=(pw-4)/2;
        [0,1].forEach(ci => {
          const q = sec.questions[i+ci]; if(!q) return;
          const bx = lm+ci*(colW2+4);
          doc.setLineWidth(.4); doc.rect(bx, y, colW2, boxH);
          doc.setFont('Helvetica','bold'); doc.setFontSize(9);
          const qls = doc.splitTextToSize(`${i+ci+1}. ${q.question||'[Question]'}  (${q.marks}mk)`, colW2-4);
          doc.text(qls, bx+2, y+5);
        });
        y+=boxH+3;
      }

    } else {
      // ── Structured / Essay with 1a, 1b sub-parts + small examiner box ──
      sec.questions.forEach((q, qIdx) => {
        const hasSubParts = q.subParts && q.subParts.length > 0;
        const needH = hasSubParts ? 10 + q.subParts.reduce((s,p)=>{const l=p.marks<=2?2:p.marks<=4?3:p.marks<=6?5:7;return s+l*5.5+8;},0) : 12+(q.marks<=3?3:q.marks<=6?5:q.marks<=10?8:12)*5.5;
        addPage(Math.min(needH, 40));

        // Question stem
        doc.setFont('Helvetica','bold'); doc.setFontSize(10);
        const qText = hasSubParts ? `${qIdx+1}. ${q.question||'[Question]'}` : `${qIdx+1}. ${q.question||'[Question]'}  (${q.marks} marks)`;
        const qls = doc.splitTextToSize(qText, pw-36); doc.text(qls, lm, y);

        if (!hasSubParts) {
          // Small examiner box right-side
          doc.setLineWidth(.3); doc.rect(lm+pw-32, y-5, 30, 10);
          doc.setFont('Helvetica','normal'); doc.setFontSize(6); doc.text("Examr. Use Only", lm+pw-17, y-3, {align:'center'});
          doc.setLineWidth(.2); doc.line(lm+pw-32, y+1, lm+pw-2, y+1);
          doc.setFontSize(7.5); doc.text(`/${q.marks}`, lm+pw-17, y+4, {align:'center'});
        }
        y+=qls.length*5;

        if (hasSubParts) {
          // Each sub-part: "1a. text (marks)" then lines
          q.subParts.forEach((p, pi) => {
            addPage(20);
            doc.setFont('Helvetica','bold'); doc.setFontSize(9.5);
            const spLabel = `${qIdx+1}${subLetters[pi]}. `;
            const spText = doc.splitTextToSize(`${spLabel}${p.text}`, pw-36);
            doc.text(spText, lm, y);
            // Small examiner box
            doc.setLineWidth(.3); doc.rect(lm+pw-32, y-4, 30, 9);
            doc.setFont('Helvetica','normal'); doc.setFontSize(6); doc.text("Examr.", lm+pw-17, y-2, {align:'center'});
            doc.setLineWidth(.2); doc.line(lm+pw-32, y+1, lm+pw-2, y+1);
            doc.setFontSize(7.5); doc.text(`/${p.marks}`, lm+pw-17, y+3.5, {align:'center'});
            y+=spText.length*4.5;
            const spLines = p.marks<=2?2:p.marks<=4?3:p.marks<=6?5:7;
            doc.setDrawColor(180); doc.setLineWidth(.2);
            for (let l=0;l<spLines;l++){addPage(6);y+=5.5;doc.line(lm+8,y,lm+pw,y);}
            doc.setDrawColor(0); y+=4;
          });
        } else {
          // Plain response lines
          const lineCount = sec.type==='essay'?14:(q.marks<=3?3:q.marks<=6?5:q.marks<=10?8:12);
          doc.setDrawColor(180); doc.setLineWidth(.2);
          for (let l=0;l<lineCount;l++){addPage(6);y+=5.5;doc.line(lm,y,lm+pw,y);}
          doc.setDrawColor(0); y+=6;
        }
      });
    }
    y+=5;
  });

  addPage(10); doc.setFont('Helvetica','bold'); doc.setFontSize(11);
  doc.text('*** END OF EXAM ***', 105, y, {align:'center'});
  const fn = `${header.schoolName||'Exam'}_${header.subject}_${header.examType}.pdf`.replace(/[^a-z0-9_\-\.]/gi,'_');
  doc.save(fn);
  showToast('PDF downloaded! 📄', 'success');
}

// ─── AI Calls (direct browser → Anthropic API) ───────────────────────────────
function ebGetApiKey() {
  return load(K.settings)[0]?.ebApiKey || settings?.ebApiKey || '';
}

async function ebCallClaude(prompt, systemPrompt) {
  // Try built-in proxy first (works inside claude.ai — no API key needed)
  const proxyRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
  }).catch(() => null);

  if (proxyRes && proxyRes.ok) {
    const data = await proxyRes.json();
    return data.content.map(b => b.text || '').join('');
  }

  // Fallback: user-saved API key
  const key = ebGetApiKey();
  if (!key) throw new Error('AI requires an Anthropic API key. Go to Settings and paste your sk-ant-... key.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key': key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API error ${res.status}`); }
  const data = await res.json();
  return data.content.map(b => b.text || '').join('');
}

async function ebGenerateQuestionsAPI(params) {
  const { subject, topic, questionType, difficulty, count, notes } = params;
  const diffGuide = { easy:'Simple, direct recall questions.', medium:'Mix of recall and application.', hard:'Analysis, synthesis and evaluation.' };
  const system = `You are an expert exam paper creator for Kenyan/East African secondary school curriculum. ALWAYS respond with ONLY valid JSON (no markdown):
{"questions":[{"id":"q1","question":"...","type":"mcq|structured|essay","marks":2,"options":["A) ...","B) ...","C) ...","D) ..."],"answer":"B) ...","explanation":"...","difficulty":"easy|medium|hard","subParts":[]}]}
For MCQ: 4 options, correct answer. For structured/essay: options=[], answer="".`;
  const userPrompt = `Generate ${count||5} ${questionType||'mcq'} questions.
Subject: ${subject||'General'} | Topic: ${topic||'General'} | Difficulty: ${difficulty||'medium'} — ${diffGuide[difficulty]||diffGuide.medium}
${notes?`Based on: ${notes.substring(0,2500)}`:''}
Ensure questions test different skills: recall, comprehension, application, analysis.`;
  const text = await ebCallClaude(userPrompt, system);
  const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  const parsed = JSON.parse(clean);
  return parsed.questions || [];
}

async function ebGenerateMarkingSchemeAPI(exam) {
  const system = 'You are an expert marking scheme creator. Respond ONLY with valid JSON (no markdown): {"scheme":[{"questionRef":"Q1","marks":2,"expectedAnswer":"...","markingPoints":["point1","point2"]}]}';
  const questionsText = exam.sections.map((sec,si) => `Section ${sec.name} (${sec.type}):\n${sec.questions.map((q,qi) => `Q${qi+1}: ${q.question} (${q.marks} marks)${q.answer?` Answer: ${q.answer}`:''}`).join('\n')}`).join('\n\n');
  const userPrompt = `Create a marking scheme for:\nSubject: ${exam.header?.subject||''} | Class: ${exam.header?.class||''}\n\n${questionsText}`;
  const text = await ebCallClaude(userPrompt, system);
  const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(clean).scheme || [];
}

// ─── AI Generator Tab ────────────────────────────────────────────────────────
let _ebAiDiff = 'easy';
function ebSetDiff(btn, diff) {
  _ebAiDiff = diff;
  document.querySelectorAll('.ebai-diff').forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
}

async function ebAIGenerate() {
  const subject = document.getElementById('ebai-subject')?.value?.trim();
  const topic = document.getElementById('ebai-topic')?.value?.trim();
  const type = document.getElementById('ebai-type')?.value || 'mcq';
  const count = parseInt(document.getElementById('ebai-count')?.value) || 5;
  const notes = document.getElementById('ebai-notes')?.value?.trim() || '';
  if (!subject && !topic) { showToast('Please enter subject or topic', 'error'); return; }
  const btn = document.getElementById('ebaiGenBtn');
  btn.disabled = true; btn.textContent = '⏳ Generating...';
  const resultsEl = document.getElementById('ebaiResults');
  resultsEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem;animation:spin 1s linear infinite;display:inline-block">⏳</div><p style="margin-top:.5rem">AI is generating questions...</p></div>';
  try {
    const qs = await ebGenerateQuestionsAPI({ subject, topic, questionType:type, difficulty:_ebAiDiff, count, notes });
    EB.genAiResults = qs;
    if (!qs.length) { resultsEl.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem">No questions generated.</p>'; return; }
    document.getElementById('ebaiAddAllBtn').style.display = 'inline-flex';
    resultsEl.innerHTML = qs.map((q,i) => `
      <div class="eb-gen-q">
        <div class="eb-gen-q-text">${i+1}. ${ebEscape(q.question)}</div>
        ${q.options?.length ? `<div>${q.options.map(o=>`<div style="font-size:.78rem;color:var(--muted);margin-bottom:2px">${ebEscape(o)}</div>`).join('')}</div>` : ''}
        ${q.answer ? `<div class="eb-gen-q-ans">✓ ${ebEscape(q.answer)}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border-lt)">
          <span style="font-size:.72rem;background:var(--primary-lt);color:var(--primary);padding:1px 8px;border-radius:12px">${q.type||type} · ${q.marks||2} marks</span>
          <button class="btn btn-outline btn-sm" onclick="ebaiAddSingle(${i})" style="font-size:.76rem">➕ Add to Exam</button>
        </div>
      </div>`).join('');
    showToast(`Generated ${qs.length} questions! 🤖`, 'success');
  } catch (err) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--danger)"><div>❌</div><p style="margin-top:.5rem">${ebEscape(err.message)}</p></div>`;
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🤖 Generate Questions';
  }
}
function ebaiAddAllToExam() {
  EB.genAiResults.forEach(q => ebStagePendingQ(q));
  showToast(`${EB.genAiResults.length} questions staged for exam`, 'success');
  openEBTab('tabEBCreate', document.querySelector('#ebTabBar .tb'));
  ebGoToStep(3);
}
function ebaiAddSingle(idx) {
  ebStagePendingQ(EB.genAiResults[idx]);
  showToast('Question staged for exam', 'success');
}
function ebStagePendingQ(q) {
  const sec = EB.sections.find(s => s.type === q.type) || EB.sections[0];
  if (!sec) return;
  sec.questions.push({ id:ebGenId(), question:q.question, marks:q.marks||sec.marksPerQuestion||2, options:q.options||[], answer:q.answer||'', subParts:q.subParts||[], aiGenerated:true });
}

// ─── AI per-section modal ─────────────────────────────────────────────────────
let _ebModalDiff = 'medium';
function ebSetModalDiff(btn, diff) {
  _ebModalDiff = diff;
  document.querySelectorAll('.eb-mdiff').forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
}
function ebOpenAIModal(sIdx) {
  EB.aiSectionIdx = sIdx;
  const sec = EB.sections[sIdx];
  document.getElementById('ebAIModalSecName').textContent = sec?.name || sIdx+1;
  document.getElementById('ebModal-topic').value = document.getElementById('eb-subject')?.value || '';
  document.getElementById('ebModal-notes').value = '';
  document.getElementById('ebAISectionModal').style.display = 'flex';
}
async function ebGenForSection() {
  const sec = EB.sections[EB.aiSectionIdx]; if (!sec) return;
  const topic = document.getElementById('ebModal-topic')?.value?.trim();
  const notes = document.getElementById('ebModal-notes')?.value?.trim() || '';
  const subject = document.getElementById('eb-subject')?.value?.trim() || '';
  document.getElementById('ebAISectionModal').style.display = 'none';
  ebShowLoading('AI generating questions...');
  try {
    const qs = await ebGenerateQuestionsAPI({ subject, topic:topic||subject, questionType:sec.type, difficulty:_ebModalDiff, count:sec.questionCount||5, notes });
    qs.forEach(q => sec.questions.push({ id:ebGenId(), question:q.question, marks:q.marks||sec.marksPerQuestion||2, options:q.options||[], answer:q.answer||'', subParts:q.subParts||[], aiGenerated:true }));
    ebRenderQuestionBuilder();
    showToast(`Generated ${qs.length} questions for Section ${sec.name}!`, 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
  finally { ebHideLoading(); }
}

// ─── Generate All Sections ────────────────────────────────────────────────────
let _ebGaDiff = 'medium';
function ebSetGaDiff(btn, diff) {
  _ebGaDiff = diff;
  document.querySelectorAll('.eb-gadiff').forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
}
function ebOpenGenAllModal() {
  const previewEl = document.getElementById('ebGenAllPreview');
  if (previewEl) previewEl.innerHTML = `<strong style="color:var(--primary)">Will generate for ${EB.sections.length} section(s):</strong><br>` +
    EB.sections.map((s,i) => `<span style="font-size:.78rem;margin-right:.5rem">${EB.spColors[i%EB.spColors.length]?`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${EB.spColors[i%EB.spColors.length]};margin-right:3px"></span>`:''}Section ${s.name} — ${ebTypeLabel(s.type)} (${s.questionCount} Qs)</span>`).join('');
  document.getElementById('ebGenAllModal').style.display = 'flex';
}
async function ebDoGenAll() {
  document.getElementById('ebGenAllModal').style.display = 'none';
  const notes = document.getElementById('ebGenAll-notes')?.value?.trim() || '';
  const topics = document.getElementById('ebGenAll-topics')?.value?.trim() || '';
  const subject = document.getElementById('eb-subject')?.value || '';
  ebShowLoading(`Generating for ${EB.sections.length} sections...`);
  let total = 0;
  try {
    await Promise.all(EB.sections.map((sec, sIdx) =>
      ebGenerateQuestionsAPI({ subject, topic:topics||subject, questionType:sec.type, difficulty:_ebGaDiff, count:sec.questionCount||5, notes })
        .then(qs => { qs.forEach(q => { EB.sections[sIdx].questions.push({ id:ebGenId(), question:q.question, marks:q.marks||sec.marksPerQuestion||2, options:q.options||[], answer:q.answer||'', subParts:q.subParts||[], aiGenerated:true }); }); total+=qs.length; })
        .catch(err => console.warn('Section', sec.name, err))
    ));
    ebRenderQuestionBuilder();
    showToast(`✅ Generated ${total} questions across all sections!`, 'success');
  } catch(err) { showToast('Generation failed: ' + err.message, 'error'); }
  finally { ebHideLoading(); }
}

// ─── Marking Scheme ───────────────────────────────────────────────────────────
function ebPopulateMsSelect() {
  const sel = document.getElementById('ebMsSelect');
  if (!sel) return;
  const exams = ebLoad();
  sel.innerHTML = '<option value="">— Select an exam —</option>' +
    exams.map(e => `<option value="${e.id}">${ebEscape(e.header?.subject||'Untitled')} — ${ebEscape(e.header?.examType||'')} (${ebEscape(e.header?.class||'')})</option>`).join('');
}
async function ebGenerateMarkingScheme() {
  const id = document.getElementById('ebMsSelect')?.value;
  if (!id) { showToast('Select an exam first', 'error'); return; }
  const exam = ebLoad().find(e => e.id === id);
  if (!exam) return;
  ebShowLoading('Generating marking scheme...');
  try {
    const scheme = await ebGenerateMarkingSchemeAPI(exam);
    const resultEl = document.getElementById('ebMsResult');
    const contentEl = document.getElementById('ebMsContent');
    if (resultEl) resultEl.style.display = 'block';
    if (contentEl) contentEl.innerHTML = scheme.map((item,i) => `
      <div style="margin-bottom:1rem;padding:.75rem;border:1px solid var(--border-lt);border-radius:8px">
        <div style="font-weight:700;margin-bottom:.3rem">${item.questionRef||`Q${i+1}`} — ${item.marks} marks</div>
        <div style="font-size:.85rem;color:var(--muted);margin-bottom:.4rem">${ebEscape(item.expectedAnswer||'')}</div>
        ${item.markingPoints?.length ? `<ul style="padding-left:1.25rem;font-size:.82rem">${item.markingPoints.map(p => `<li>${ebEscape(p)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') || '<p style="color:var(--muted)">No scheme generated.</p>';
    showToast('Marking scheme generated! ✅', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
  finally { ebHideLoading(); }
}
function ebExportMsPDF() {
  const content = document.getElementById('ebMsContent')?.innerHTML || '';
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(13); doc.setFont('Helvetica','bold');
  doc.text('MARKING SCHEME', 105, 20, {align:'center'});
  doc.setFontSize(9); doc.setFont('Helvetica','normal');
  const tmp = document.createElement('div'); tmp.innerHTML = content;
  const lines = doc.splitTextToSize(tmp.innerText || '', 180);
  doc.text(lines, 15, 32);
  doc.save('marking-scheme.pdf');
}

// ─── Math Modal ───────────────────────────────────────────────────────────────
function ebOpenMathModal(targetId) {
  EB.mathTarget = targetId;
  const inp = document.getElementById('ebMathInput'); if(inp) inp.value = '';
  const prev = document.getElementById('ebMathPreview'); if(prev) prev.innerHTML = 'Preview here';
  document.getElementById('ebMathModal').style.display = 'flex';
}
function ebPreviewMath(val) {
  const prev = document.getElementById('ebMathPreview'); if (!prev) return;
  prev.innerHTML = `\\(${val}\\)`;
  if (window.MathJax) MathJax.typesetPromise([prev]).catch(()=>{});
}
function ebInsertMathSnippet(snip) {
  const inp = document.getElementById('ebMathInput'); if (!inp) return;
  inp.value += snip; ebPreviewMath(inp.value);
}
function ebInsertMathToQuestion() {
  const eq = document.getElementById('ebMathInput')?.value?.trim();
  if (!eq || !EB.mathTarget) { document.getElementById('ebMathModal').style.display='none'; return; }
  const target = document.getElementById(EB.mathTarget);
  if (target) { const p = target.selectionStart; target.value = target.value.slice(0,p) + ` \\(${eq}\\) ` + target.value.slice(p); }
  document.getElementById('ebMathModal').style.display = 'none';
}

// ─── Sub-Parts Modal ──────────────────────────────────────────────────────────
function ebOpenSubParts(sIdx, qIdx) {
  EB.subPartsSec = sIdx; EB.subPartsQ = qIdx;
  const q = EB.sections[sIdx]?.questions[qIdx];
  const list = document.getElementById('ebSubPartsList'); if (!list) return;
  list.innerHTML = (q?.subParts||[]).map((p,i) => `
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
      <input type="text" value="${ebEscape(p.text||'')}" placeholder="Sub-part text..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border-lt);border-radius:6px;font-size:.82rem;outline:none" class="eb-sp-text"/>
      <input type="number" value="${p.marks||2}" min="1" max="20" style="width:58px;padding:6px 8px;border:1.5px solid var(--border-lt);border-radius:6px;font-size:.82rem;outline:none" class="eb-sp-marks"/>
      <button onclick="this.closest('div').remove()" style="background:none;border:none;cursor:pointer;color:var(--danger)">✕</button>
    </div>`).join('');
  document.getElementById('ebSubPartsModal').style.display = 'flex';
}
function ebAddSubPart() {
  const list = document.getElementById('ebSubPartsList');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem';
  div.innerHTML = `<input type="text" placeholder="Sub-part text..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border-lt);border-radius:6px;font-size:.82rem;outline:none" class="eb-sp-text"/>
    <input type="number" value="2" min="1" max="20" style="width:58px;padding:6px 8px;border:1.5px solid var(--border-lt);border-radius:6px;font-size:.82rem;outline:none" class="eb-sp-marks"/>
    <button onclick="this.closest('div').remove()" style="background:none;border:none;cursor:pointer;color:var(--danger)">✕</button>`;
  list.appendChild(div);
}
function ebSaveSubParts() {
  const items = document.querySelectorAll('#ebSubPartsList > div');
  const parts = Array.from(items).map(d => ({ text: d.querySelector('.eb-sp-text')?.value||'', marks: parseInt(d.querySelector('.eb-sp-marks')?.value)||2 })).filter(p => p.text.trim());
  if (EB.sections[EB.subPartsSec]?.questions[EB.subPartsQ]) {
    EB.sections[EB.subPartsSec].questions[EB.subPartsQ].subParts = parts;
    ebRenderQuestionBuilder();
  }
  document.getElementById('ebSubPartsModal').style.display = 'none';
  showToast('Sub-parts saved', 'success');
}

// ─── Loading helpers ──────────────────────────────────────────────────────────
function ebShowLoading(text = 'Processing...') {
  const el = document.getElementById('ebLoadingOverlay'); if (el) { el.style.display = 'flex'; document.getElementById('ebLoadingText').textContent = text; }
}
function ebHideLoading() {
  const el = document.getElementById('ebLoadingOverlay'); if (el) el.style.display = 'none';
}

// ─── Integrate into main go() ─────────────────────────────────────────────────
// Patch the go() function to initialise Exam Builder when navigating to it
const _origGo_forEB = typeof go === 'function' ? go : null;

// Intercept section change to init EB on first visit
document.addEventListener('DOMContentLoaded', function() {
  const origGo = window.go;
  window.go = function(section, el) {
    if (section === 'exambuilder') {
      // Restrict to admins only
      const isAdmin = currentUser && (currentUser.role==='superadmin'||currentUser.role==='admin'||currentUser.role==='principal');
      const isTeacher = currentUser && currentUser.role==='teacher';
      if (!isAdmin && !isTeacher) { showToast('Exam Builder is not available for your role', 'error'); return; }
      // Init if first time
      if (!EB.sections.length) {
        ebInitSections();
        const sn = document.getElementById('eb-schoolName');
        if (sn && !sn.value && settings.schoolName) sn.value = settings.schoolName;
        const yr = document.getElementById('eb-year');
        if (yr) yr.value = settings.currentYear || new Date().getFullYear();
        const dt = document.getElementById('eb-examDate');
        if (dt && !dt.value) dt.value = new Date().toISOString().split('T')[0];
        const list = document.getElementById('ebInstructionsList');
        if (list && !list.children.length) ebAddInstruction('Write your name and admission number on the answer sheet.');
        ebSetupHeaderPreview();
        ebRenderSections();
      }
    }
    if (section === 'settings') {
      // API key moved to Platform Admin section
    }
    if (origGo) origGo(section, el);
  };
});

// ─── API Key card now lives in Platform Admin section ─────────────────────────
// (No longer injected into school settings)

function ebSaveApiKey() {
  const key = document.getElementById('ebApiKeyInput')?.value?.trim();
  if (!key) { showToast('Please enter an API key', 'error'); return; }
  settings.ebApiKey = key;
  save(K.settings, [settings]);
  showToast('API key saved! ✅', 'success');
  document.getElementById('ebApiKeyStatus').textContent = '';
}

async function ebTestApiKey() {
  const statusEl = document.getElementById('ebApiKeyStatus');
  statusEl.textContent = '⏳ Testing...';
  // Test proxy first
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] })
    });
    if (res.ok) {
      statusEl.innerHTML = '<span style="color:#10b981;font-weight:700">✅ AI Connected (built-in)!</span>';
      showToast('AI is ready — no API key needed here!', 'success');
      return;
    }
  } catch(e) {}
  // Try user key
  const key = document.getElementById('ebApiKeyInput')?.value?.trim();
  if (!key) { statusEl.innerHTML = '<span style="color:var(--danger)">❌ No key & proxy unavailable</span>'; return; }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'Hello' }] })
    });
    if (res.ok) { statusEl.innerHTML = '<span style="color:#10b981;font-weight:700">✅ API Key Connected!</span>'; showToast('API key works! AI ready.', 'success'); }
    else { const e = await res.json().catch(() => ({})); statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${e.error?.message || 'Invalid key'}</span>`; }
  } catch(err) { statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`; }
}


/* ═══════════════════════════════════════════════════════════════════════
   TIMETABLE ← CHARANAS SYNC
   Reads classes, streams, teachers, subjects & stream-assignments from
   the main Charanas school data and imports them into EduSchedule so
   that the timetable always reflects who teaches what in each stream.
═══════════════════════════════════════════════════════════════════════ */
function es_syncFromCharanas() {
  if (!currentSchoolId) {
    es_toast('No school logged in — please log in first.', 'danger');
    return;
  }

  /* ── 1. Read Charanas data arrays ── */
  const chClasses   = load(K.classes);    // [{id, name, …}]
  const chStreams    = load(K.streams);    // [{id, name, classId, streamTeacherId}]
  const chTeachers  = load(K.teachers);   // [{id, name, subjects[], …}]
  const chSubjects  = load(K.subjects);   // [{id, name, teacherId, …}]

  /* Read stream-subject-teacher assignments from the dedicated key */
  const kSA = schoolPrefix() + 'ei_streamassign';
  let chSA  = [];
  try { chSA = JSON.parse(localStorage.getItem(kSA)) || []; } catch {}

  if (chClasses.length === 0 && chStreams.length === 0 && chTeachers.length === 0) {
    es_toast('No school data found. Add classes, teachers & subjects first.', 'warning');
    return;
  }

  /* ── 2. Build a map of subjects that teachers actually teach per stream ── */
  // chSA: [{ streamId, subjectId, teacherId }]
  // We build a per-teacher subject list union across all streams
  const teacherSubjectMap = {};  // teacherId → Set<subjectId>
  chSA.forEach(a => {
    if (!a.teacherId) return;
    if (!teacherSubjectMap[a.teacherId]) teacherSubjectMap[a.teacherId] = new Set();
    teacherSubjectMap[a.teacherId].add(a.subjectId);
  });
  // Also honour subject.teacherId direct assignment
  chSubjects.forEach(sub => {
    if (!sub.teacherId) return;
    if (!teacherSubjectMap[sub.teacherId]) teacherSubjectMap[sub.teacherId] = new Set();
    teacherSubjectMap[sub.teacherId].add(sub.id);
  });

  /* ── 3. Build colour map — reuse existing colours, assign new ones ── */
  const palette = ['#4f7cff','#7c3aed','#06b6d4','#10b981','#f59e0b',
                   '#ef4444','#ec4899','#8b5cf6','#f97316','#14b8a6',
                   '#64748b','#84cc16','#a855f7','#0ea5e9','#fb7185'];
  let colIdx = 0;
  const existingSubColors = {};
  es_state.subjects.forEach(s => { if (s.color) existingSubColors[s.id] = s.color; });

  /* ── 4. Map subjects ── */
  const newSubjects = chSubjects.map(sub => {
    const existing = es_state.subjects.find(s => s.id === sub.id);
    return {
      id:            sub.id,
      name:          sub.name,
      lessonsPerWeek: existing?.lessonsPerWeek || sub.lessonsPerWeek || 4,
      priority:      existing?.priority || sub.priority || 'core',
      double:        existing?.double   || false,
      color:         existingSubColors[sub.id] || palette[(colIdx++) % palette.length],
      grades:        [], // empty = applies to all grades (filter is skipped when empty)
    };
  });

  /* ── 5. Map teachers — carry over existing timetable settings ── */
  const newTeachers = chTeachers.map(t => {
    const existing = es_state.teachers.find(x => x.id === t.id);
    const subIds   = Array.from(teacherSubjectMap[t.id] || new Set());
    return {
      id:           t.id,
      name:         t.name,
      subjects:     subIds,
      maxPerDay:    existing?.maxPerDay   || 6,
      maxPerWeek:   existing?.maxPerWeek  || 25,
      availability: existing?.availability || {},
    };
  });

  /* ── 6. Map classes — each stream becomes one class row ──
     Priority: use streams (each stream = separate class/section).
     If no streams exist, fall back to chClasses.                       */
  let newClasses = [];
  if (chStreams.length > 0) {
    chStreams.forEach(str => {
      const parent = chClasses.find(c => c.id === str.classId);
      const grade  = parent ? parent.name : 'Class';
      const existing = es_state.classes.find(c => c.id === str.id);
      newClasses.push({
        id:       str.id,
        grade:    grade,
        stream:   str.name,
        students: existing?.students || 40,
        /* Store stream metadata for later use in exam timetable */
        _streamId: str.id,
        _classId:  str.classId,
      });
    });
  } else {
    chClasses.forEach(cls => {
      const existing = es_state.classes.find(c => c.id === cls.id);
      newClasses.push({
        id:       cls.id,
        grade:    cls.name,
        stream:   '',
        students: existing?.students || 40,
        _classId: cls.id,
      });
    });
  }

  /* ── 7. Store stream-assignments in es_state for use during timetable generation ── */
  es_state._streamAssignments = chSA;   // [{ streamId, subjectId, teacherId }]
  es_state._streamTeachers    = {};     // streamId → streamTeacherId
  chStreams.forEach(s => {
    if (s.streamTeacherId) es_state._streamTeachers[s.id] = s.streamTeacherId;
  });

  /* ── 8. Commit & refresh ── */
  const hadTimetable = Object.keys(es_state.timetable).length > 0;
  es_state.subjects = newSubjects;
  es_state.teachers = newTeachers;
  es_state.classes  = newClasses;

  /* Update school name from settings */
  if (settings.schoolName) es_state.school.name = settings.schoolName;

  es_saveData();
  es_renderAll();
  es_updateDashboard();
  es_syncSetupForm();

  const msg = `✅ Synced: ${newClasses.length} classes, ${newTeachers.length} teachers, ${newSubjects.length} subjects${hadTimetable ? ' (timetable preserved)' : ''}.`;
  es_toast(msg, 'success');
  showToast(msg, 'success');
}

/* Patch es_generateTimetable to prefer stream-assigned teachers */
const _es_origGenerate = es_generateTimetable;

/* Override teacher selection in generate to respect stream assignments */
const _es_origPickTeacher = window.es_pickTeacherForSlot;

/* ── Hook: when assigning a slot, prefer the stream's assigned teacher ── */
function es_getStreamAssignedTeacher(classObj, subjectId) {
  if (!es_state._streamAssignments) return null;
  const streamId = classObj._streamId || classObj.id;
  const sa = es_state._streamAssignments.find(
    a => a.streamId === streamId && a.subjectId === subjectId && a.teacherId
  );
  if (!sa) return null;
  return es_state.teachers.find(t => t.id === sa.teacherId) || null;
}


/* ═══════════════════════════════════════════════════════════════════════
   EXAM TIMETABLE ENGINE
   — Picks subjects from a chosen exam
   — Lays them out across dates, N slots/day
   — Assigns stream teachers as invigilators; falls back to free teachers
═══════════════════════════════════════════════════════════════════════ */

/* State */
let et_schedule   = [];
let et_overrides  = {};

/* Fixed daily slot definitions — Morning / Mid-Morning / Afternoon */
const ET_SLOTS = [
  { index:0, name:'Morning',     icon:'🌅', startTime:'08:00', endTime:'10:00',
    breakLabel:'Morning Break',  breakDuration:'30 min', breakEnd:'10:30' },
  { index:1, name:'Mid-Morning', icon:'☀️',  startTime:'10:30', endTime:'12:30',
    breakLabel:'Lunch Break',    breakDuration:'1 hour',  breakEnd:'13:30' },
  { index:2, name:'Afternoon',   icon:'🌤️',  startTime:'13:30', endTime:'15:30',
    breakLabel:'',               breakDuration:'',        breakEnd:''      },
];

/* ── Populate exam select when the tab opens ── */
function et_populateExamSelect() {
  const sel = document.getElementById('etExamSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Choose Exam —</option>' +
    exams.filter(e => e.category !== 'consolidated')
         .sort((a,b) => (b.year||0)-(a.year||0) || a.name.localeCompare(b.name))
         .map(e => `<option value="${e.id}" ${e.id===cur?'selected':''}>
           ${e.name} (${e.type||''} ${e.term||''} ${e.year||''})
         </option>`).join('');
  const cf = document.getElementById('etClassFilter');
  if (cf) {
    cf.innerHTML = '<option value="">— All Classes —</option>' +
      classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
      streams.map(s => {
        const cls = classes.find(c => c.id === s.classId);
        return `<option value="${s.id}">${cls?cls.name:''} ${s.name}</option>`;
      }).join('');
  }
}

function etOnExamChange() { et_schedule = []; et_overrides = {}; etRender(); }

/* ── Generate exam timetable ── */
function etGenerate() {
  const examId     = document.getElementById('etExamSelect').value;
  const slotsPerDay= parseInt(document.getElementById('etSlotsPerDay').value) || 2;
  const startDateV = document.getElementById('etStartDate').value;

  if (!examId) { showToast('Please select an exam first.', 'warning'); return; }
  const exam = exams.find(e => e.id === examId);
  if (!exam)  { showToast('Exam not found.', 'danger'); return; }

  const subjectIds = exam.subjectIds || [];
  if (!subjectIds.length) { showToast('This exam has no subjects assigned.', 'warning'); return; }

  /* Starting date — skip weekends */
  let cursor = startDateV ? new Date(startDateV) : new Date();
  while (cursor.getDay()===0||cursor.getDay()===6) cursor.setDate(cursor.getDate()+1);

  /* ── Group streams by parent class ── */
  const filterClassId = document.getElementById('etClassFilter').value;
  let relevantStreams = streams.filter(s => classes.find(c => c.id===s.classId));
  if (filterClassId) relevantStreams = relevantStreams.filter(s => s.id===filterClassId||s.classId===filterClassId);

  let classGroups;
  if (relevantStreams.length > 0) {
    const gm = {};
    relevantStreams.forEach(s => {
      const p = classes.find(c=>c.id===s.classId);
      if (!gm[s.classId]) gm[s.classId]={ classId:s.classId, classLabel:p?p.name:'Class', streams:[] };
      gm[s.classId].streams.push({ id:s.id, label:`${p?p.name:'Class'} ${s.name}`, streamTeacherId:s.streamTeacherId||null });
    });
    classGroups = Object.values(gm);
  } else {
    const src = filterClassId ? classes.filter(c=>c.id===filterClassId) : classes;
    classGroups = src.map(c=>({ classId:c.id, classLabel:c.name, streams:[{id:c.id,label:c.name,streamTeacherId:null}] }));
  }

  /* ── Teacher busy tracking ── */
  const teacherBusy = {};
  const markBusy  = (dt,tid) => { if(!tid)return; if(!teacherBusy[dt])teacherBusy[dt]=new Set(); teacherBusy[dt].add(tid); };
  const isBusy    = (dt,tid) => teacherBusy[dt]?.has(tid);
  const freeT     = (dt,excl) => teachers.find(t=>!isBusy(dt,t.id)&&!excl.has(t.id))||null;

  const resolveTeacher = (su, subId, dt) => {
    const sa = streamAssignments.find(a=>a.streamId===su.id&&a.subjectId===subId&&a.teacherId);
    let tid=sa?.teacherId||null, role=tid?'stream':null;
    if (!tid){ const d=subjects.find(s=>s.id===subId)?.teacherId; if(d){tid=d;role='default';} }
    if (tid&&isBusy(dt,tid)){ const f=freeT(dt,new Set([tid])); tid=f?f.id:tid; role=f?'free':'overflow'; }
    if (!tid){ const f=freeT(dt,new Set()); if(f){tid=f.id;role='free';} }
    markBusy(dt,tid);
    const tObj=teachers.find(t=>t.id===tid);
    return { teacherId:tid||'', teacherName:tObj?.name||'— Unassigned —', role:role||'free' };
  };

  et_schedule=[]; et_overrides={};
  let subQueue=[...subjectIds];
  /* activeSlots = which ET_SLOTS indices to use per day */
  const activeSlots = ET_SLOTS.slice(0, slotsPerDay).map(s=>s.index);

  while (subQueue.length > 0) {
    while (cursor.getDay()===0||cursor.getDay()===6) cursor.setDate(cursor.getDate()+1);
    const dateStr = cursor.toISOString().split('T')[0];

    for (const slotIdx of activeSlots) {
      if (!subQueue.length) break;
      const subId = subQueue.shift();
      const sub   = subjects.find(s=>s.id===subId)||{ id:subId, name:subId };
      const slotDef = ET_SLOTS[slotIdx];

      const groupEntries = classGroups.map(grp => {
        const streamSlots = grp.streams.map(su => {
          const { teacherId, teacherName, role } = resolveTeacher(su, subId, dateStr);
          return { streamId:su.id, classLabel:su.label, teacherId, teacherName, role };
        });
        return { date:dateStr, slotIndex:slotIdx, slotName:slotDef.name, slotStart:slotDef.startTime,
                 slotEnd:slotDef.endTime, subjectId:subId, subjectName:sub.name,
                 classGroupId:grp.classId, classGroupLabel:grp.classLabel, streamSlots };
      });
      groupEntries.forEach(e => et_schedule.push(e));
    }
    cursor.setDate(cursor.getDate()+1);
  }

  etRender();
  const days = [...new Set(et_schedule.map(s=>s.date))].length;
  showToast(`✅ Exam timetable generated — ${subjectIds.length} subject(s) × ${classGroups.length} class group(s) across ${days} day(s).`, 'success');
}

/* ── Helper: unique class groups from schedule ── */
function etGetClassGroups() {
  const seen={}, groups=[];
  et_schedule.forEach(s => {
    if (!seen[s.classGroupId]) {
      seen[s.classGroupId]=true;
      groups.push({ classGroupId:s.classGroupId, classGroupLabel:s.classGroupLabel, streamSlots:s.streamSlots });
    }
  });
  return groups;
}

/* ── Slot colour palette ── */
const ET_SLOT_COLORS = {
  0: { bg:'#1e3a5f', hdr:'#2563eb', light:'#dbeafe', text:'#1e3a5f', badge:'#3b82f6' }, // Morning  – blue
  1: { bg:'#3b1f5f', hdr:'#7c3aed', light:'#ede9fe', text:'#3b1f5f', badge:'#8b5cf6' }, // Mid-Morning – purple
  2: { bg:'#1f3a2f', hdr:'#059669', light:'#d1fae5', text:'#1f3a2f', badge:'#10b981' }, // Afternoon – green
};

/* ── Render ── */
function etRender() {
  const output = document.getElementById('etOutput');
  const legend = document.getElementById('etLegend');
  if (!output) return;

  if (!et_schedule.length) {
    output.innerHTML = `<div class="empty-state" style="padding:2.5rem 1rem;text-align:center;color:var(--muted)">
      <div style="font-size:2.5rem;margin-bottom:.5rem">📅</div>
      <p>Select an exam and click <strong>Generate Exam Timetable</strong></p></div>`;
    if (legend) legend.style.display='none'; return;
  }
  if (legend) legend.style.display='flex';

  const classGroups = etGetClassGroups();
  const dayNames    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate     = ds => { const d=new Date(ds+'T00:00:00'); return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`; };
  const roleColors  = { stream:'#10b981', default:'#10b981', free:'#2563eb', overflow:'#f59e0b' };
  const roleLabels  = { stream:'Stream Teacher', default:'Default Teacher', free:'Free Teacher', overflow:'Overflow' };

  /* Group schedule entries by classGroupId → date → slotIndex */
  classGroups.forEach(grp => {
    const grpRows = et_schedule.filter(s=>s.classGroupId===grp.classGroupId);
    const byDate  = {};
    grpRows.forEach(r => { if(!byDate[r.date])byDate[r.date]=[]; byDate[r.date].push(r); });

    const streamHdrs = grp.streamSlots.map(ss =>
      `<th style="padding:.5rem .75rem;border:1px solid #cbd5e1;min-width:160px;background:#1e2230;color:#e8eaf0">${ss.classLabel}</th>`
    ).join('');

    let html = `<div style="margin-bottom:2.5rem;border-radius:10px;overflow:hidden;border:1px solid var(--border,#e2e8f0);">
      <div style="padding:.65rem 1rem;background:#0f172a;color:#f8fafc;font-size:1rem;font-weight:800;display:flex;align-items:center;gap:.5rem;">
        🏫 ${grp.classGroupLabel}
        <span style="font-size:.72rem;font-weight:400;color:#94a3b8;margin-left:.25rem">${grp.streamSlots.length} stream(s) — all sit at the same time</span>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
        <thead>
          <tr>
            <th style="padding:.5rem .75rem;border:1px solid #cbd5e1;min-width:130px;background:#1e2230;color:#e8eaf0">Date</th>
            <th style="padding:.5rem .75rem;border:1px solid #cbd5e1;min-width:150px;background:#1e2230;color:#e8eaf0">Session</th>
            <th style="padding:.5rem .75rem;border:1px solid #cbd5e1;min-width:150px;background:#1e2230;color:#e8eaf0">Subject</th>
            ${streamHdrs}
          </tr>
        </thead><tbody>`;

    Object.entries(byDate).forEach(([dateStr, slots]) => {
      /* Sort slots by slotIndex */
      slots.sort((a,b)=>a.slotIndex-b.slotIndex);
      slots.forEach((slot, si) => {
        const sc = ET_SLOT_COLORS[slot.slotIndex] || ET_SLOT_COLORS[0];
        const slotDef = ET_SLOTS[slot.slotIndex];
        html += `<tr>
          <td style="padding:.5rem .75rem;border:1px solid #e2e8f0;white-space:nowrap;font-weight:600;background:var(--bg2,#f8fafc)">${si===0?fmtDate(dateStr):''}</td>
          <td style="padding:.5rem .75rem;border:1px solid #e2e8f0;background:${sc.light};color:${sc.text};">
            <div style="font-weight:800">${slotDef.icon} ${slot.slotName}</div>
            <div style="font-size:.7rem;opacity:.8">${slotDef.startTime} – ${slotDef.endTime}</div>
          </td>
          <td style="padding:.5rem .75rem;border:1px solid #e2e8f0;font-weight:700;color:${sc.text};background:${sc.light}">${slot.subjectName}</td>`;
        slot.streamSlots.forEach(ss => {
          const key = `${dateStr}_${slot.slotIndex}_${slot.subjectId}_${ss.streamId}`;
          const ovTid = et_overrides[key];
          const tName = ovTid?(teachers.find(t=>t.id===ovTid)?.name||ss.teacherName):ss.teacherName;
          const role  = ovTid?'free':ss.role;
          const dot   = roleColors[role]||'#94a3b8';
          html += `<td style="padding:.5rem .75rem;border:1px solid #e2e8f0">
            <div style="display:flex;align-items:center;gap:.35rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block"></span>
              <span style="flex:1;font-weight:600">${tName}</span>
              <button onclick="etEditSlot('${key}','${slot.subjectName.replace(/'/g,"\\'")}','${ss.teacherId||''}')"
                style="background:none;border:none;cursor:pointer;font-size:.7rem;color:var(--muted);padding:0 2px" title="Change invigilator">✏️</button>
            </div>
            <div style="font-size:.65rem;color:${dot};margin-left:1.15rem">${roleLabels[role]||''}</div>
          </td>`;
        });
        html += `</tr>`;

        /* Break row after each session except the last of the day */
        const nextSlot = slots[si+1];
        if (slotDef.breakLabel && nextSlot) {
          const bc = ET_SLOT_COLORS[slot.slotIndex];
          html += `<tr style="background:#f8fafc">
            <td style="border:1px solid #e2e8f0"></td>
            <td colspan="${2+grp.streamSlots.length}" style="padding:.35rem .75rem;border:1px solid #e2e8f0;color:#64748b;font-size:.75rem;font-style:italic">
              ☕ <strong>${slotDef.breakLabel}</strong> &nbsp;(${slotDef.breakDuration}) &nbsp;•&nbsp; ${slotDef.breakEnd} – ${nextSlot.slotStart}
            </td></tr>`;
        }
      });

      /* Day-end separator */
      html += `<tr><td colspan="${3+grp.streamSlots.length}" style="height:6px;background:#e2e8f0;border:none"></td></tr>`;
    });

    html += `</tbody></table></div></div>`;

    const container = document.getElementById('etOutput');
    if (grp === classGroups[0]) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', html);
  });
}

/* ── Edit invigilator modal ── */
function etEditSlot(key, subjectName, currentTeacherId) {
  document.getElementById('etSlotSubject').value = subjectName;
  document.getElementById('etSlotKey').value     = key;
  const sel = document.getElementById('etSlotTeacher');
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    teachers.map(t => `<option value="${t.id}" ${t.id===currentTeacherId?'selected':''}>${t.name}</option>`).join('');
  document.getElementById('etSlotModal').style.display = 'flex';
}
function etSaveSlotEdit() {
  const key=document.getElementById('etSlotKey').value;
  const tid=document.getElementById('etSlotTeacher').value;
  if (key) et_overrides[key]=tid||null;
  document.getElementById('etSlotModal').style.display='none';
  etRender();
}
function etClear() { et_schedule=[]; et_overrides={}; etRender(); }

/* ════════════════════════════════════════════════════════════════════
   PDF EXPORT — beautiful landscape A4, one section per class group
════════════════════════════════════════════════════════════════════ */
function etExportPDF() {
  if (!et_schedule.length) { showToast('Generate a timetable first.','warning'); return; }
  const {jsPDF} = window.jspdf||{};
  if (!jsPDF) { showToast('PDF library not loaded.','warning'); return; }

  const exam = exams.find(e=>e.id===document.getElementById('etExamSelect').value);
  const doc  = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const pw   = doc.internal.pageSize.getWidth();
  const ph   = doc.internal.pageSize.getHeight();
  const classGroups = etGetClassGroups();
  const dayNames    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate     = ds => { const d=new Date(ds+'T00:00:00'); return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`; };

  /* PDF slot colours: [r,g,b] triplets */
  const PDF_SLOT_BG  = [[219,234,254],[237,233,254],[209,250,229]];   // light bg
  const PDF_SLOT_HDR = [[37,99,235],  [124,58,237],[5,150,105]];      // dark header
  const PDF_SLOT_TXT = [[30,58,95],   [59,28,95], [31,58,47]];        // text

  classGroups.forEach((grp, gi) => {
    if (gi > 0) { doc.addPage('a4','landscape'); }

    /* ── Page header ── */
    doc.setFillColor(15,23,42); doc.rect(0,0,pw,22,'F');
    doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(248,250,252);
    doc.text(`📅 Exam Timetable — ${exam?.name||''}`, 12, 11);
    doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(148,163,184);
    doc.text(`Generated: ${new Date().toLocaleDateString()}   •   ${grp.classGroupLabel} (${grp.streamSlots.length} stream(s))`, 12, 18);
    doc.setFontSize(7); doc.text(`All streams sit for the same subject at the same time.`, pw-12, 18, {align:'right'});

    /* ── Column layout ── */
    const margin    = 10;
    const dateColW  = 30;
    const sessColW  = 38;
    const subjColW  = 40;
    const nStreams  = grp.streamSlots.length;
    const streamColW= (pw - margin*2 - dateColW - sessColW - subjColW) / Math.max(nStreams,1);
    const rowH      = 14;
    const breakRowH = 8;

    /* Column x-positions */
    const col0 = margin;
    const col1 = col0 + dateColW;
    const col2 = col1 + sessColW;
    const col3 = col2 + subjColW;
    const streamCols = grp.streamSlots.map((_,i) => col3 + i*streamColW);

    let y = 26;

    /* ── Table header ── */
    const allCols = [col0, col1, col2, col3, ...streamCols];
    const allWidths= [dateColW, sessColW, subjColW, ...grp.streamSlots.map(()=>streamColW)];
    /* Drop col3 (subject) from allCols since it's already accounted — fix: rebuild properly */
    const colDefs = [
      {x:col0, w:dateColW,  label:'Date'},
      {x:col1, w:sessColW,  label:'Session'},
      {x:col2, w:subjColW,  label:'Subject'},
      ...grp.streamSlots.map((ss,i) => ({x:col3+i*streamColW, w:streamColW, label:ss.classLabel})),
    ];

    doc.setFillColor(30,34,48);
    colDefs.forEach(c => { doc.rect(c.x, y, c.w, rowH, 'F'); });
    doc.setTextColor(232,234,240); doc.setFontSize(7); doc.setFont(undefined,'bold');
    colDefs.forEach(c => {
      const txt = c.label.length>20?c.label.substring(0,19)+'…':c.label;
      doc.text(txt, c.x+2, y+rowH/2+2);
    });
    y += rowH;

    /* ── Data rows ── */
    const grpRows = et_schedule.filter(s=>s.classGroupId===grp.classGroupId);
    const byDate  = {};
    grpRows.forEach(r=>{ if(!byDate[r.date])byDate[r.date]=[]; byDate[r.date].push(r); });

    Object.entries(byDate).forEach(([dateStr, slots]) => {
      slots.sort((a,b)=>a.slotIndex-b.slotIndex);
      slots.forEach((slot, si) => {
        if (y + rowH > ph - 10) { doc.addPage('a4','landscape'); y=10; }
        const sc    = PDF_SLOT_BG[slot.slotIndex]  || PDF_SLOT_BG[0];
        const scHdr = PDF_SLOT_HDR[slot.slotIndex] || PDF_SLOT_HDR[0];
        const scTxt = PDF_SLOT_TXT[slot.slotIndex] || PDF_SLOT_TXT[0];
        const slotDef = ET_SLOTS[slot.slotIndex];

        /* Date cell */
        doc.setFillColor(245,248,255); doc.rect(col0,y,dateColW,rowH,'F');
        doc.setTextColor(30,41,59); doc.setFontSize(6.5); doc.setFont(undefined,si===0?'bold':'normal');
        if (si===0) doc.text(fmtDate(dateStr), col0+2, y+rowH/2+2);

        /* Session cell */
        doc.setFillColor(sc[0],sc[1],sc[2]); doc.rect(col1,y,sessColW,rowH,'F');
        doc.setTextColor(scTxt[0],scTxt[1],scTxt[2]);
        doc.setFontSize(7); doc.setFont(undefined,'bold');
        doc.text(`${slotDef.name}`, col1+2, y+5.5);
        doc.setFontSize(6); doc.setFont(undefined,'normal');
        doc.text(`${slotDef.startTime} – ${slotDef.endTime}`, col1+2, y+11);

        /* Subject cell */
        doc.setFillColor(sc[0],sc[1],sc[2]); doc.rect(col2,y,subjColW,rowH,'F');
        doc.setTextColor(scTxt[0],scTxt[1],scTxt[2]);
        doc.setFontSize(8); doc.setFont(undefined,'bold');
        const sn=slot.subjectName.length>18?slot.subjectName.substring(0,17)+'…':slot.subjectName;
        doc.text(sn, col2+2, y+rowH/2+2);

        /* Stream cells */
        slot.streamSlots.forEach((ss,i) => {
          const key=`${dateStr}_${slot.slotIndex}_${slot.subjectId}_${ss.streamId}`;
          const ov=et_overrides[key];
          const tName=(ov?(teachers.find(t=>t.id===ov)?.name||ss.teacherName):ss.teacherName)||'—';
          doc.setFillColor(255,255,255); doc.rect(col3+i*streamColW,y,streamColW,rowH,'F');
          doc.setTextColor(30,41,59); doc.setFontSize(6.5); doc.setFont(undefined,'normal');
          const tn=tName.length>22?tName.substring(0,21)+'…':tName;
          doc.text(tn, col3+i*streamColW+2, y+rowH/2+2);
        });

        /* Row border */
        doc.setDrawColor(203,213,225);
        colDefs.forEach(c=>{ doc.rect(c.x,y,c.w,rowH); });
        y += rowH;

        /* Break row */
        const slotDef2 = ET_SLOTS[slot.slotIndex];
        const nextSlot = slots[si+1];
        if (slotDef2.breakLabel && nextSlot) {
          if (y + breakRowH > ph - 10) { doc.addPage('a4','landscape'); y=10; }
          doc.setFillColor(241,245,249); doc.rect(col0,y,pw-margin*2,breakRowH,'F');
          doc.setDrawColor(203,213,225); doc.rect(col0,y,pw-margin*2,breakRowH);
          doc.setTextColor(100,116,139); doc.setFontSize(6); doc.setFont(undefined,'italic');
          doc.text(`☕  ${slotDef2.breakLabel}  (${slotDef2.breakDuration})   ${slotDef2.breakEnd} – ${nextSlot.slotStart}`, col0+4, y+breakRowH/2+2);
          y += breakRowH;
        }
      });

      /* Day separator */
      if (y + 4 < ph - 10) {
        doc.setFillColor(226,232,240); doc.rect(col0,y,pw-margin*2,3,'F');
        y += 5;
      }
    });
  });

  doc.save(`exam_timetable_${exam?.name?.replace(/\s+/g,'_')||'export'}.pdf`);
  showToast('📄 Exam timetable PDF exported!','success');
}

/* ════════════════════════════════════════════════════════════════════
   EXCEL EXPORT — one sheet per class group
════════════════════════════════════════════════════════════════════ */
function etExportExcel() {
  if (!et_schedule.length) { showToast('Generate a timetable first.','warning'); return; }
  const XLSX=window.XLSX; if(!XLSX){showToast('Excel library not loaded.','warning');return;}
  const exam=exams.find(e=>e.id===document.getElementById('etExamSelect').value);
  const wb=XLSX.utils.book_new();
  const classGroups=etGetClassGroups();
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  classGroups.forEach(grp => {
    const grpRows=et_schedule.filter(s=>s.classGroupId===grp.classGroupId);
    const labels=grp.streamSlots.map(ss=>ss.classLabel);
    const rows=[['Date','Day','Session','Time','Subject',...labels]];
    const byDate={};
    grpRows.forEach(r=>{ if(!byDate[r.date])byDate[r.date]=[]; byDate[r.date].push(r); });
    Object.entries(byDate).forEach(([ds,slots])=>{
      slots.sort((a,b)=>a.slotIndex-b.slotIndex);
      slots.forEach((s,si) => {
        const d=new Date(ds+'T00:00:00');
        const slotDef=ET_SLOTS[s.slotIndex];
        rows.push([
          si===0?ds:'',
          si===0?dayNames[d.getDay()]:'',
          slotDef.name,
          `${slotDef.startTime}–${slotDef.endTime}`,
          s.subjectName,
          ...s.streamSlots.map(ss=>{
            const ov=et_overrides[`${ds}_${s.slotIndex}_${s.subjectId}_${ss.streamId}`];
            return ov?(teachers.find(t=>t.id===ov)?.name||ss.teacherName):ss.teacherName;
          })
        ]);
        if (slotDef.breakLabel && slots[si+1]) rows.push(['','',`☕ ${slotDef.breakLabel}`,'','','']);
      });
      rows.push(['','','— — —','','','']);
    });
    const sheet=grp.classGroupLabel.replace(/[^a-zA-Z0-9 ]/g,'').substring(0,31)||`Class`;
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),sheet);
  });
  XLSX.writeFile(wb,`exam_timetable_${exam?.name?.replace(/\s+/g,'_')||'export'}.xlsx`);
}

/* ════════════════════════════════════════════════════════════════════
   PRINT — opens a styled print window per class group
════════════════════════════════════════════════════════════════════ */
function etPrint() {
  if (!et_schedule.length) { showToast('Generate a timetable first.','warning'); return; }
  const exam=exams.find(e=>e.id===document.getElementById('etExamSelect').value);
  const classGroups=etGetClassGroups();
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate=ds=>{const d=new Date(ds+'T00:00:00');return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;};
  const SLOT_CSS=[
    {bg:'#dbeafe',text:'#1e3a5f',hdr:'#2563eb'},
    {bg:'#ede9fe',text:'#3b1f5f',hdr:'#7c3aed'},
    {bg:'#d1fae5',text:'#1f3a2f',hdr:'#059669'},
  ];

  const tablesHtml = classGroups.map(grp => {
    const grpRows=et_schedule.filter(s=>s.classGroupId===grp.classGroupId);
    const byDate={};
    grpRows.forEach(r=>{if(!byDate[r.date])byDate[r.date]=[];byDate[r.date].push(r);});
    const streamHdrs=grp.streamSlots.map(ss=>`<th class="sh">${ss.classLabel}</th>`).join('');

    const rowsHtml=Object.entries(byDate).map(([ds,slots])=>{
      slots.sort((a,b)=>a.slotIndex-b.slotIndex);
      return slots.map((slot,si)=>{
        const sc=SLOT_CSS[slot.slotIndex]||SLOT_CSS[0];
        const slotDef=ET_SLOTS[slot.slotIndex];
        const tds=slot.streamSlots.map(ss=>{
          const ov=et_overrides[`${ds}_${slot.slotIndex}_${slot.subjectId}_${ss.streamId}`];
          const n=ov?(teachers.find(t=>t.id===ov)?.name||ss.teacherName):ss.teacherName;
          return `<td class="tc">${n}</td>`;
        }).join('');
        const dateTd=`<td class="dc" rowspan="${slots.length}">${si===0?fmtDate(ds):''}</td>`;
        const breakRow= (slotDef.breakLabel&&slots[si+1])
          ?`<tr class="bkr"><td></td><td colspan="${2+grp.streamSlots.length}">☕ <strong>${slotDef.breakLabel}</strong> (${slotDef.breakDuration}) &nbsp;•&nbsp; ${slotDef.breakEnd} – ${ET_SLOTS[slot.slotIndex+1]?.startTime||''}</td></tr>`:'';
        return `<tr class="sr" style="--sc:${sc.bg};--st:${sc.text}">
          ${si===0?dateTd:''}
          <td class="sess" style="background:${sc.bg};color:${sc.text}"><strong>${slotDef.icon} ${slot.slotName}</strong><br><small>${slotDef.startTime}–${slotDef.endTime}</small></td>
          <td class="subj" style="background:${sc.bg};color:${sc.text}">${slot.subjectName}</td>
          ${tds}
        </tr>${breakRow}`;
      }).join('') + `<tr class="sep"><td colspan="${3+grp.streamSlots.length}"></td></tr>`;
    }).join('');

    return `<div class="grp">
      <div class="grp-hd">🏫 ${grp.classGroupLabel}
        <span class="sub-note">${grp.streamSlots.length} stream(s) — all sit at the same time</span>
      </div>
      <table>
        <thead><tr>
          <th class="dh">Date</th>
          <th class="sh">Session</th>
          <th class="sh">Subject</th>
          ${streamHdrs}
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  }).join('');

  const win=window.open('','_blank','width=1200,height=900');
  win.document.write(`<!DOCTYPE html><html><head>
  <title>Exam Timetable — ${exam?.name||'Exam'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Segoe UI",Arial,sans-serif;font-size:9pt;color:#0f172a;padding:12mm 14mm;background:#fff}
    h1{font-size:15pt;font-weight:800;color:#0f172a;margin-bottom:2mm}
    .meta{font-size:7.5pt;color:#64748b;margin-bottom:8mm;border-bottom:2px solid #e2e8f0;padding-bottom:3mm}
    .grp{margin-bottom:10mm;page-break-inside:avoid}
    .grp-hd{font-size:11pt;font-weight:800;background:#0f172a;color:#f8fafc;padding:5px 10px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:8px}
    .sub-note{font-size:7.5pt;font-weight:400;color:#94a3b8}
    table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1}
    th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;font-size:8pt;vertical-align:middle}
    thead th{background:#1e2230;color:#e8eaf0;font-weight:700;font-size:8pt}
    .dh{min-width:105px} .sh{min-width:120px}
    .dc{font-weight:700;font-size:8pt;vertical-align:top;padding-top:6px;background:#f8fafc}
    .sess{min-width:110px;line-height:1.4}
    .subj{font-weight:700;min-width:120px}
    .tc{min-width:130px;font-size:8pt}
    .bkr td{background:#f1f5f9;color:#64748b;font-style:italic;font-size:7.5pt;padding:3px 8px;border-color:#e2e8f0}
    .sep td{height:5px;background:#e2e8f0;border:none}
    tbody tr:hover{background:#f8fafc}
    @media print{
      body{padding:8mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .grp{page-break-inside:avoid}
      .grp+.grp{page-break-before:auto}
    }
  </style></head><body>
  <h1>📅 Exam Timetable — ${exam?.name||'Exam'}</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleDateString()} &nbsp;|&nbsp;
    Sessions: 🌅 Morning (08:00–10:00) &nbsp;•&nbsp; ☀️ Mid-Morning (10:30–12:30) &nbsp;•&nbsp; 🌤️ Afternoon (13:30–15:30)<br>
    All streams of the same class sit for the same subject at the same date and session.
  </div>
  ${tablesHtml}
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}


/* ── Hook into openExamTab to populate dropdowns ── */
const _origOpenExamTab = window.openExamTab;
window.openExamTab = function(id, el) {
  if (typeof _origOpenExamTab === 'function') _origOpenExamTab(id, el);
  if (id === 'tabExamTimetable') {
    et_populateExamSelect();
    /* default start date to today */
    const sd = document.getElementById('etStartDate');
    if (sd && !sd.value) sd.value = new Date().toISOString().split('T')[0];
  }
};


/* ═══════════════════════════════════════════════════════════════════════
   EXAM BUILDER — AI INTEGRATION HELPERS
═══════════════════════════════════════════════════════════════════════ */

/** Pre-fill the AI Generator tab from the current exam's details */
function ebAIPrefillFromExam() {
  const subject   = document.getElementById('eb-subject')?.value?.trim() || '';
  const classLevel= document.getElementById('eb-classLevel')?.value?.trim() || '';
  const examType  = document.getElementById('eb-examType')?.value?.trim() || '';

  const aiSubject = document.getElementById('ebai-subject');
  const aiTopic   = document.getElementById('ebai-topic');
  const aiNotes   = document.getElementById('ebai-notes');

  if (aiSubject && subject) aiSubject.value = subject;
  if (aiTopic)   aiTopic.value = classLevel ? `${subject} — ${classLevel}` : subject;
  if (aiNotes && examType) aiNotes.placeholder = `Paste syllabus notes for ${examType} exam...`;

  showToast('Fields pre-filled from your exam details ✓', 'success');
}

/** Quick-jump to AI tab from the exam builder wizard (called by inline button) */
function ebQuickAI() {
  ebAIPrefillFromExam();
  const aiTabBtn = document.querySelector('#ebTabBar .tb[onclick*="tabEBAIGen"]');
  if (aiTabBtn) openEBTab('tabEBAIGen', aiTabBtn);
}

/** Auto-generate instructions using AI */
const _origEbAutoInstructions = window.ebAutoInstructions;
window.ebAutoInstructions = async function() {
  const subject   = document.getElementById('eb-subject')?.value?.trim() || 'General';
  const examType  = document.getElementById('eb-examType')?.value?.trim() || 'Midterm';
  const classLevel= document.getElementById('eb-classLevel')?.value?.trim() || '';
  const duration  = document.getElementById('eb-duration')?.value?.trim() || '2 hours';

  const btn = document.querySelector('[onclick="ebAutoInstructions()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

  try {
    const system = 'You are an expert Kenyan curriculum exam paper writer. Respond ONLY with valid JSON: {"instructions":["instruction1","instruction2",...]}. Generate 5-7 clear, professional exam instructions.';
    const prompt = `Generate exam instructions for: Subject: ${subject}, Class: ${classLevel}, Type: ${examType}, Duration: ${duration}. Include instructions about: answering all questions, time management, writing clearly, no cheating, and any subject-specific guidance.`;
    const text = await ebCallClaude(prompt, system);
    const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const parsed = JSON.parse(clean);
    const list = document.getElementById('ebInstructionsList');
    if (list && parsed.instructions) {
      list.innerHTML = '';
      parsed.instructions.forEach(inst => {
        const div = document.createElement('div');
        div.className = 'eb-inst-item';
        div.innerHTML = `<input type="text" placeholder="Add instruction..." class="eb-inst-input" value="${inst.replace(/"/g,'&quot;')}"/><button class="btn btn-sm" style="padding:4px 8px;color:var(--danger)" onclick="this.closest('.eb-inst-item').remove()">✕</button>`;
        list.appendChild(div);
      });
      showToast(`Generated ${parsed.instructions.length} instructions ✓`, 'success');
    }
  } catch(err) {
    showToast('AI failed: ' + err.message, 'error');
    // Fall back to original
    if (typeof _origEbAutoInstructions === 'function') _origEbAutoInstructions();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Auto-Generate'; }
  }
};


/* ══════════════════════════════════════════════════════════════════
   미니TF 스튜디오 — app.js
   0. 유틸        1. 스토어(Firebase/로컬)   2. 렌더 루프
   3. 대시보드    4. 아이디어 보드           5. 조 편성
   6. 타임테이블  7. 예산·준비물             8. AI(Gemini)
   9. 설정·온보딩
   ══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ╔══════════════════════════════════════════════════════════════╗
   ║  ▼▼▼ 여기 한 곳만 채우면 4명 모두 붙여넣기 없이 바로 로그인 ▼▼▼  ║
   ╚══════════════════════════════════════════════════════════════╝
   Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성 → "구성"
   에서 복사한 값을 아래 null 자리에 그대로 붙여넣으세요.

   const BUILTIN_FB_CONFIG = {
     apiKey: "AIza...",
     authDomain: "minitf-xxxx.firebaseapp.com",
     databaseURL: "https://minitf-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "minitf-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };

   이 값들은 비밀이 아닙니다. 공개 저장소에 올라가도 안전합니다 —
   실제 접근 통제는 Realtime Database 보안 규칙(auth != null)과 로그인이 합니다.
   (※ Gemini API 키는 절대 여기 넣지 마세요. 그건 각자 브라우저에만 저장됩니다.) */

const BUILTIN_FB_CONFIG = {
  apiKey: "AIzaSyAM2B_-oG_n2RgQT1IGWlP9JPRYb_hN2GY",
  authDomain: "minitf.firebaseapp.com",
  databaseURL: "https://minitf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "minitf",
  storageBucket: "minitf.firebasestorage.app",
  messagingSenderId: "410248327358",
  appId: "1:410248327358:web:f2e618157215143fc5eeef"
};

/* ═══ 0. 유틸 ═══════════════════════════════════════════════════ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const won = n => (Math.round(n) || 0).toLocaleString('ko-KR') + '원';
const nowTs = () => Date.now();

const LS = {
  get(k, d) { try { const v = localStorage.getItem('minitf.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('minitf.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k)    { try { localStorage.removeItem('minitf.' + k); } catch (e) {} }
};

/** 쓸 Firebase config: 브라우저에 저장한 것 > 코드에 내장한 것. 연결 해제 시 null */
function fbConfig() {
  if (LS.get('fbOff', false)) return null;
  const saved = LS.get('fbconfig', null);
  if (saved && saved.databaseURL) return saved;
  if (BUILTIN_FB_CONFIG && BUILTIN_FB_CONFIG.databaseURL) return BUILTIN_FB_CONFIG;
  return null;
}
const fbIsBuiltin = () => !LS.get('fbOff', false) && !LS.get('fbconfig', null) &&
  !!(BUILTIN_FB_CONFIG && BUILTIN_FB_CONFIG.databaseURL);

function toast(msg, isErr) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, isErr ? 4200 : 2200);
  setTimeout(() => el.remove(), isErr ? 4600 : 2600);
}

/** 8슬롯 고정 순서. 9번째부터는 새 색을 만들지 않고 회색으로 접습니다. */
function slotColor(i) { return i < 8 ? 'var(--series-' + (i + 1) + ')' : 'var(--series-other)'; }

const TAGS = [
  { id: 'activity', label: '조별 활동', slot: 0 },
  { id: 'townhall', label: '타운홀',    slot: 1 },
  { id: 'food',     label: '먹거리',    slot: 2 },
  { id: 'gift',     label: '상품·굿즈', slot: 3 },
  { id: 'ops',      label: '운영·진행', slot: 4 },
  { id: 'etc',      label: '기타',      slot: 5 }
];
const tagOf = id => TAGS.find(t => t.id === id) || TAGS[TAGS.length - 1];

const AG_TYPES = {
  all:   { label: '전체 세션',  slot: 0 },
  group: { label: '조별 활동',  slot: 1 },
  meal:  { label: '식사',       slot: 2 },
  move:  { label: '이동·버퍼',  slot: 3 }
};

const DEF_SETTINGS = {
  title: '미니 워크숍', date: '', startTime: '13:30',
  hq: 25, field: 25, rate: 80, cap: 0, tf: ''
};

/* 시:분 헬퍼 */
function toMin(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : 13 * 60 + 30; }
function toHHMM(min) { min = ((min % 1440) + 1440) % 1440; return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function fmtDur(min) { const h = Math.floor(min / 60), m = min % 60; return (h ? h + '시간' : '') + (m ? (h ? ' ' : '') + m + '분' : (h ? '' : '0분')); }

/* 나 (이 브라우저의 신원) */
const ME = {
  id: LS.get('clientId') || (function () { const v = uid(); LS.set('clientId', v); return v; })(),
  nick: LS.get('nick', '')
};

/* ═══ 1. 스토어 ════════════════════════════════════════════════ */

const COLLS = ['ideas', 'teams', 'roster', 'agenda', 'budget', 'checklist'];
const emptyState = () => ({ settings: {}, ideas: {}, teams: {}, roster: {}, agenda: {}, budget: {}, checklist: {}, presence: {} });

const Store = {
  mode: 'local',        // 'local' | 'live'
  room: '',
  state: emptyState(),
  _ref: null,
  _subs: [],

  onChange(fn) { this._subs.push(fn); },
  _emit() { this._subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); },

  normalize(raw) {
    const s = emptyState();
    if (raw && typeof raw === 'object') {
      s.settings = Object.assign({}, raw.settings || {});
      COLLS.forEach(c => { s[c] = (raw[c] && typeof raw[c] === 'object') ? raw[c] : {}; });
      s.presence = raw.presence && typeof raw.presence === 'object' ? raw.presence : {};
    }
    return s;
  },

  /* --- 연결 --- */
  connect(room, live) {
    if (this._ref) { try { this._ref.off(); } catch (e) {} this._ref = null; }
    this.room = room;
    if (live) {
      try {
        this._ref = firebase.database().ref('rooms/' + room);
        this.mode = 'live';
        this._ref.on('value',
          snap => { this.state = this.normalize(snap.val()); this._emit(); },
          err => {
            setSync('error', '오류');
            toast(/permission/i.test(err.message)
              ? 'DB 접근 권한이 없습니다. Firebase 보안 규칙을 README대로 넣었는지 확인하세요.'
              : 'Firebase 읽기 실패: ' + err.message, true);
          }
        );
        this._presence();
        setSync('live', '실시간');
        return;
      } catch (e) {
        console.error(e);
        toast('Firebase 연결 실패 — 로컬 모드로 전환합니다. (' + e.message + ')', true);
      }
    }
    this.mode = 'local';
    this.state = this.normalize(LS.get('local.' + room, null));
    setSync('local', '로컬');
    this._emit();
  },

  _presence() {
    try {
      const meRef = this._ref.child('presence/' + ME.id);
      firebase.database().ref('.info/connected').on('value', s => {
        if (!s.val()) return;
        meRef.onDisconnect().remove();
        meRef.set({ nick: ME.nick || '익명', t: nowTs() });
      });
      window.addEventListener('beforeunload', () => { try { meRef.remove(); } catch (e) {} });
    } catch (e) { console.warn('presence', e); }
  },

  _persistLocal() { LS.set('local.' + this.room, this.state); },

  /* --- 쓰기 (경로는 방 노드 기준 상대경로) --- */
  set(path, value) {
    if (this.mode === 'live') { this._ref.child(path).set(value).catch(e => toast('저장 실패: ' + e.message, true)); return; }
    deepSet(this.state, path, value); this._persistLocal(); this._emit();
  },
  update(map) {
    if (this.mode === 'live') { this._ref.update(map).catch(e => toast('저장 실패: ' + e.message, true)); return; }
    Object.keys(map).forEach(p => { const v = map[p]; v === null ? deepDel(this.state, p) : deepSet(this.state, p, v); });
    this._persistLocal(); this._emit();
  },
  remove(path) { this.set(path, null); },
  replaceAll(obj) {
    const clean = this.normalize(obj); delete clean.presence;
    if (this.mode === 'live') {
      const map = { settings: clean.settings };
      COLLS.forEach(c => map[c] = Object.keys(clean[c]).length ? clean[c] : null);
      this._ref.update(map).catch(e => toast('저장 실패: ' + e.message, true));
      return;
    }
    const pres = this.state.presence;
    this.state = this.normalize(clean); this.state.presence = pres;
    this._persistLocal(); this._emit();
  }
};

function deepSet(obj, path, val) {
  const parts = path.split('/'); let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (val === null) delete cur[parts[parts.length - 1]];
  else cur[parts[parts.length - 1]] = val;
}
function deepDel(obj, path) { deepSet(obj, path, null); }

/* 컬렉션 → 정렬된 배열 */
function list(coll, sortKey) {
  const o = Store.state[coll] || {};
  return Object.keys(o)
    .filter(k => o[k] && typeof o[k] === 'object')
    .map(k => Object.assign({ id: k }, o[k]))
    .sort((a, b) => (a[sortKey || 'order'] || 0) - (b[sortKey || 'order'] || 0) || (a.createdAt || 0) - (b.createdAt || 0));
}
const S = () => Object.assign({}, DEF_SETTINGS, Store.state.settings || {});

/* 파생값 */
function derived() {
  const s = S();
  const total = (+s.hq || 0) + (+s.field || 0);
  const expected = Math.round(total * (clamp(+s.rate || 0, 0, 100) / 100));
  const teams = list('teams');
  const roster = list('roster', 'createdAt');
  const byTeam = {};
  teams.forEach(t => byTeam[t.id] = { hq: 0, field: 0, n: 0 });
  roster.forEach(r => { if (r.assigned && byTeam[r.assigned]) { byTeam[r.assigned].n++; byTeam[r.assigned][r.org === 'field' ? 'field' : 'hq']++; } });
  const capacity = teams.reduce((a, t) => a + (+t.capacity || 0), 0);
  const assigned = roster.filter(r => r.assigned && byTeam[r.assigned]).length;

  const teamCost = teams.reduce((a, t) => a + (+t.unitCost || 0) * (byTeam[t.id].n || +t.capacity || 0), 0);
  const items = list('budget', 'createdAt');
  const fixed = items.filter(i => i.type !== 'perPerson').reduce((a, i) => a + (+i.amount || 0), 0);
  const perHead = items.filter(i => i.type === 'perPerson').reduce((a, i) => a + (+i.amount || 0), 0);
  const budgetTotal = teamCost + fixed + perHead * expected;

  const agenda = list('agenda');
  const minutes = agenda.reduce((a, x) => a + (+x.minutes || 0), 0);

  const checks = list('checklist', 'createdAt');
  const done = checks.filter(c => c.done).length;

  return { s, total, expected, teams, roster, byTeam, capacity, assigned,
           teamCost, fixed, perHead, budgetTotal, agenda, minutes, checks, done };
}

/* ═══ 2. 렌더 루프 ═════════════════════════════════════════════ */

let activeView = 'dash';
let renderQueued = false;

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const a = document.activeElement;
    const fkey = a && a.dataset ? a.dataset.fkey : null;
    const pos = a && a.selectionStart;

    const d = derived();
    renderChrome(d);
    if (activeView === 'dash')     renderDash(d);
    if (activeView === 'ideas')    renderIdeas(d);
    if (activeView === 'teams')    renderTeams(d);
    if (activeView === 'agenda')   renderAgenda(d);
    if (activeView === 'budget')   renderBudget(d);
    if (activeView === 'ai')       renderAI(d);
    if (activeView === 'settings') renderSettings(d);

    if (fkey) {
      const el = document.querySelector('[data-fkey="' + fkey.replace(/"/g, '\\"') + '"]');
      if (el && el !== document.activeElement) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  });
}
Store.onChange(render);

function setSync(state, label) {
  const c = $('#sync-chip'); if (!c) return;
  c.dataset.state = state; c.textContent = label;
}

function renderChrome(d) {
  $('#btn-me').textContent = ME.nick || '닉네임 설정';
  $('#btn-me').title = USER ? '아이디 ' + idOf(USER.email) + ' · 클릭하면 닉네임 변경' : '닉네임 변경';
  $('#btn-logout').hidden = !USER;
  $('#room-label').textContent = '방 ' + (Store.room || '—');
  const pres = Store.state.presence || {};
  const people = Object.keys(pres).map(k => pres[k]).filter(Boolean);
  $('#presence').innerHTML = people.slice(0, 6).map((p, i) =>
    '<div class="avatar" style="background:' + slotColor(i) + '" title="' + esc(p.nick) + '">' + esc((p.nick || '?').slice(0, 1)) + '</div>'
  ).join('');
  const empty = COLLS.every(c => !Object.keys(Store.state[c] || {}).length);
  $('#empty-cta').hidden = !empty;
}

$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('is-active', x === t));
  activeView = t.dataset.view;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + activeView));
  render();
}));

/* ═══ 3. 대시보드 ══════════════════════════════════════════════ */

function renderDash(d) {
  /* 히어로: D-day 또는 예상 참석 인원 */
  const hero = $('#hero-value'), lab = $('#hero-label'), sub = $('#hero-sub');
  if (d.s.date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(d.s.date + 'T00:00:00');
    const days = Math.round((target - today) / 86400000);
    lab.textContent = d.s.title || '워크숍';
    hero.textContent = days > 0 ? 'D-' + days : days === 0 ? 'D-DAY' : 'D+' + (-days);
    sub.textContent = d.s.date + ' · ' + d.s.startTime + ' 시작';
  } else {
    lab.textContent = d.s.title || '워크숍';
    hero.textContent = d.expected + '명';
    sub.textContent = '설정에서 행사 날짜를 넣으면 D-day가 표시됩니다';
  }

  /* KPI */
  const rate = d.capacity ? Math.round(d.assigned / d.capacity * 100) : 0;
  const kpis = [
    { label: '예상 참석', value: d.expected + '명', delta: '전체 ' + d.total + '명 × ' + d.s.rate + '%' },
    { label: '조 정원 합계', value: d.capacity + '석',
      delta: d.capacity >= d.expected ? '예상 인원 수용 가능' : (d.expected - d.capacity) + '석 부족',
      cls: d.capacity >= d.expected ? 'good' : 'warn' },
    { label: '배정 완료', value: d.assigned + '명', delta: d.capacity ? rate + '% 채움' : '조를 먼저 만드세요' },
    { label: '예상 총예산', value: won(d.budgetTotal),
      delta: d.expected ? '1인당 약 ' + won(d.budgetTotal / d.expected) : '' },
    { label: '아이디어', value: list('ideas', 'createdAt').length + '개', delta: '투표로 순위를 정해보세요' }
  ];
  $('#kpi-row').innerHTML = kpis.map(k =>
    '<div class="kpi"><div class="kpi-label">' + esc(k.label) + '</div>' +
    '<div class="kpi-value">' + esc(k.value) + '</div>' +
    '<div class="kpi-delta ' + (k.cls || '') + '">' + esc(k.delta || '') + '</div></div>'
  ).join('');

  /* 조 편성 미터 (정원 대비 비율 = 미터 폼) */
  $('#dash-assign-sub').textContent = d.teams.length ? d.assigned + ' / ' + d.capacity + '석' : '';
  $('#dash-teams').innerHTML = d.teams.length ? d.teams.map((t, i) => {
    const c = d.byTeam[t.id], cap = +t.capacity || 0;
    const over = cap && c.n > cap;
    const w = x => cap ? Math.min(100, x / cap * 100) : 0;
    return '<div class="meter-row">' +
      '<div class="meter-name"><i class="dot" style="background:' + slotColor(i) + '"></i>' +
        esc((t.emoji || '') + ' ' + t.name) + '</div>' +
      '<div class="meter-val">' + c.n + ' / ' + cap + '명' +
        (c.n ? ' <span class="muted">(본사 ' + c.hq + ' · 파견 ' + c.field + ')</span>' : '') + '</div>' +
      '<div class="meter-track' + (over ? ' meter-over' : '') + '">' +
        (c.hq ? '<div class="meter-fill" style="width:' + w(c.hq) + '%;background:var(--org-hq)"></div>' : '') +
        (c.field ? '<div class="meter-fill" style="width:' + w(c.field) + '%;background:var(--org-field)"></div>' : '') +
      '</div></div>';
  }).join('') : '<div class="empty-state">아직 조가 없습니다. “조 편성” 탭에서 추가하세요.</div>';
  $('#dash-org-legend').style.display = d.teams.length ? '' : 'none';

  /* 타임라인 */
  const start = toMin(d.s.startTime);
  $('#dash-time-sub').textContent = d.agenda.length ? d.s.startTime + ' → ' + toHHMM(start + d.minutes) + ' (' + fmtDur(d.minutes) + ')' : '';
  if (!d.agenda.length) {
    $('#dash-timeline').innerHTML = '<div class="empty-state">타임테이블이 비어 있습니다.</div>';
    $('#dash-agenda-legend').innerHTML = '';
  } else {
    let acc = start;
    const rows = d.agenda.map(a => { const r = { a: a, from: acc }; acc += (+a.minutes || 0); return r; });
    const band = rows.map(r => {
      const pct = d.minutes ? (+r.a.minutes || 0) / d.minutes * 100 : 0;
      const col = slotColor(AG_TYPES[r.a.type] ? AG_TYPES[r.a.type].slot : 0);
      return '<div class="tl-seg" style="width:' + pct + '%;background:' + col + '" title="' + esc(r.a.label) + '">' +
             (pct > 11 ? esc(r.a.label) : '') + '</div>';
    }).join('');
    const lines = rows.map(r =>
      '<div class="tl-row"><span class="tl-time">' + toHHMM(r.from) + '–' + toHHMM(r.from + (+r.a.minutes || 0)) + '</span>' +
      '<i class="tl-dot" style="background:' + slotColor(AG_TYPES[r.a.type] ? AG_TYPES[r.a.type].slot : 0) + '"></i>' +
      '<span class="tl-label">' + esc(r.a.label) + '</span>' +
      '<span class="tl-min">' + (+r.a.minutes || 0) + '분</span></div>').join('');
    $('#dash-timeline').innerHTML = '<div class="tl-band">' + band + '</div><div class="tl-rows">' + lines + '</div>';
    const used = {}; d.agenda.forEach(a => used[a.type] = 1);
    $('#dash-agenda-legend').innerHTML = Object.keys(AG_TYPES).filter(k => used[k]).map(k =>
      '<span class="legend-item"><i class="swatch" style="background:' + slotColor(AG_TYPES[k].slot) + '"></i>' + AG_TYPES[k].label + '</span>').join('');
  }

  /* 예산 */
  const cap = +d.s.cap || 0;
  const pct = cap ? d.budgetTotal / cap * 100 : 0;
  const stat = !cap ? 'var(--seq-450)' : pct > 100 ? 'var(--critical)' : pct > 90 ? 'var(--warning)' : 'var(--good)';
  $('#dash-budget-sub').textContent = cap ? '상한 ' + won(cap) : '상한 미설정';
  $('#dash-budget').innerHTML =
    '<div class="meter-row"><div class="meter-name">예상 지출</div>' +
    '<div class="meter-val">' + won(d.budgetTotal) + (cap ? ' · ' + Math.round(pct) + '%' : '') + '</div>' +
    '<div class="meter-track"><div class="meter-fill" style="width:' + (cap ? Math.min(100, pct) : 100) + '%;background:' + stat + '"></div></div></div>' +
    '<div class="tl-rows" style="margin-top:10px">' +
      '<div class="tl-row" style="grid-template-columns:1fr auto"><span>조별 활동비</span><span class="tl-min">' + won(d.teamCost) + '</span></div>' +
      '<div class="tl-row" style="grid-template-columns:1fr auto"><span>공통 총액 항목</span><span class="tl-min">' + won(d.fixed) + '</span></div>' +
      '<div class="tl-row" style="grid-template-columns:1fr auto"><span>1인당 항목 × ' + d.expected + '명</span><span class="tl-min">' + won(d.perHead * d.expected) + '</span></div>' +
    '</div>' +
    (cap && pct > 100 ? '<p class="hint" style="color:var(--critical)">⚠ 상한을 ' + won(d.budgetTotal - cap) + ' 초과했습니다.</p>' : '');

  /* 준비물 */
  const cpct = d.checks.length ? d.done / d.checks.length * 100 : 0;
  $('#dash-check-sub').textContent = d.checks.length ? d.done + ' / ' + d.checks.length + '건' : '';
  const late = d.checks.filter(c => !c.done && c.due && c.due < new Date().toISOString().slice(0, 10));
  $('#dash-check').innerHTML = d.checks.length ?
    '<div class="meter-row"><div class="meter-name">완료율</div><div class="meter-val">' + Math.round(cpct) + '%</div>' +
    '<div class="meter-track"><div class="meter-fill" style="width:' + cpct + '%;background:var(--good)"></div></div></div>' +
    (late.length ? '<p class="hint" style="color:var(--critical)">⚠ 기한 지난 항목 ' + late.length + '건: ' + esc(late.slice(0, 3).map(c => c.task).join(', ')) + '</p>' : '') +
    '<div class="tl-rows" style="margin-top:10px">' + d.checks.filter(c => !c.done).slice(0, 4).map(c =>
      '<div class="tl-row" style="grid-template-columns:1fr auto"><span class="tl-label">' + esc(c.task) + '</span>' +
      '<span class="tl-min">' + esc(c.owner || '미정') + '</span></div>').join('') + '</div>'
    : '<div class="empty-state">할 일이 없습니다.</div>';

  /* 인기 아이디어 */
  const ideas = list('ideas', 'createdAt').map(withVotes).sort((a, b) => b.up - a.up || b.createdAt - a.createdAt).slice(0, 5);
  $('#dash-ideas').innerHTML = ideas.length ? ideas.map((x, i) => {
    const t = tagOf(x.tag);
    return '<div class="mini-row"><span class="mini-rank">' + (i + 1) + '</span>' +
      '<i class="swatch" style="background:' + slotColor(t.slot) + '"></i>' +
      '<span class="mini-title">' + esc(x.title) + '</span>' +
      '<span class="mini-score">👍 ' + x.up + (x.concern ? ' · 🤔 ' + x.concern : '') + '</span></div>';
  }).join('') : '<div class="empty-state">아이디어를 먼저 쌓아보세요.</div>';
}

/* ═══ 4. 아이디어 보드 ═════════════════════════════════════════ */

let ideaFilter = 'all', ideaSort = 'votes';

function withVotes(x) {
  const v = x.voters || {};
  const keys = Object.keys(v);
  x.up = keys.filter(k => v[k] && v[k].v === 'up').length;
  x.concern = keys.filter(k => v[k] && v[k].v === 'concern').length;
  x.mine = v[ME.id] ? v[ME.id].v : null;
  return x;
}

function renderIdeas() {
  /* 필터 칩 (태그별) */
  const fw = $('#idea-filter');
  if (fw.children.length <= 1) {
    fw.innerHTML = '<button class="seg-btn is-active" data-tag="all" type="button">전체</button>' +
      TAGS.map(t => '<button class="seg-btn" data-tag="' + t.id + '" type="button">' + t.label + '</button>').join('');
  }
  $$('#idea-filter .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tag === ideaFilter));
  $$('#idea-sort .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.sort === ideaSort));

  let items = list('ideas', 'createdAt').map(withVotes);
  if (ideaFilter !== 'all') items = items.filter(x => x.tag === ideaFilter);
  items.sort(ideaSort === 'votes'
    ? (a, b) => (b.up - b.concern) - (a.up - a.concern) || b.createdAt - a.createdAt
    : (a, b) => b.createdAt - a.createdAt);

  $('#idea-list').innerHTML = items.length ? items.map(x => {
    const t = tagOf(x.tag), col = slotColor(t.slot);
    const cmts = Object.keys(x.comments || {}).map(k => Object.assign({ id: k }, x.comments[k])).sort((a, b) => a.ts - b.ts);
    return '<article class="idea">' +
      '<div class="idea-top"><div class="idea-title">' + esc(x.title) + '</div>' +
        '<span class="tag" style="color:' + col + ';border-color:' + col + '">' + t.label + '</span></div>' +
      (x.desc ? '<div class="idea-desc">' + esc(x.desc) + '</div>' : '') +
      (cmts.length ? '<div class="cmt-list">' + cmts.map(c =>
          '<div class="cmt"><b>' + esc(c.nick) + '</b> ' + esc(c.text) + '</div>').join('') + '</div>' : '') +
      '<form class="cmt-form" data-act="cmt-add" data-id="' + x.id + '">' +
        '<input type="text" placeholder="한 마디 남기기" maxlength="120" data-fkey="cmt-' + x.id + '">' +
        '<button class="btn btn-xs" type="submit">등록</button></form>' +
      '<div class="idea-foot">' +
        '<button class="vote-btn' + (x.mine === 'up' ? ' on-up' : '') + '" data-act="vote" data-v="up" data-id="' + x.id + '">👍 ' + x.up + '</button>' +
        '<button class="vote-btn' + (x.mine === 'concern' ? ' on-concern' : '') + '" data-act="vote" data-v="concern" data-id="' + x.id + '">🤔 ' + x.concern + '</button>' +
        '<span class="idea-author">' + esc(x.author || '익명') + '</span>' +
        '<button class="btn btn-xs btn-danger" data-act="idea-del" data-id="' + x.id + '">삭제</button>' +
      '</div></article>';
  }).join('') : '<div class="empty-state">아직 아이디어가 없습니다. 위에서 한 줄만 적어보세요.</div>';
}

function addIdea(title, desc, tag) {
  title = (title || '').trim(); if (!title) return null;
  const id = uid();
  Store.set('ideas/' + id, { title: title, desc: (desc || '').trim(), tag: tag || 'etc', author: ME.nick || '익명', createdAt: nowTs() });
  return id;
}

$('#idea-add').addEventListener('click', () => {
  const id = addIdea($('#idea-title').value, $('#idea-desc').value, $('#idea-tag').value);
  if (!id) return toast('아이디어를 한 줄 적어주세요.', true);
  $('#idea-title').value = ''; $('#idea-desc').value = '';
  toast('추가했습니다');
});
$('#idea-title').addEventListener('keydown', e => { if (e.key === 'Enter') $('#idea-add').click(); });
$('#idea-filter').addEventListener('click', e => { const b = e.target.closest('.seg-btn'); if (b) { ideaFilter = b.dataset.tag; render(); } });
$('#idea-sort').addEventListener('click', e => { const b = e.target.closest('.seg-btn'); if (b) { ideaSort = b.dataset.sort; render(); } });

/* ═══ 5. 조 편성 ═══════════════════════════════════════════════ */

function renderTeams(d) {
  $('#team-list').innerHTML = d.teams.length ? d.teams.map((t, i) => {
    const c = d.byTeam[t.id];
    return '<div class="team-row" style="border-left-color:' + slotColor(i) + '">' +
      '<span class="team-emoji">' + esc(t.emoji || '🎯') + '</span>' +
      '<div><div class="team-name-l">' + esc(t.name) + '</div>' +
        '<div class="team-meta">' + c.n + '/' + (+t.capacity || 0) + '명 · 본사 ' + c.hq + ' · 파견 ' + c.field +
        ' · 1인 ' + won(+t.unitCost || 0) + '</div></div>' +
      '<input type="number" min="1" value="' + (+t.capacity || 0) + '" style="width:70px" title="정원" ' +
        'data-act="team-edit" data-f="capacity" data-id="' + t.id + '" data-fkey="tc-' + t.id + '">' +
      '<button class="btn btn-xs btn-danger" data-act="team-del" data-id="' + t.id + '">삭제</button></div>';
  }).join('') : '<div class="empty-state">조를 추가하면 색이 자동 배정됩니다.</div>';

  /* 참가자 */
  const teams = d.teams;
  $('#roster-count').textContent = d.roster.length + '명 등록 · ' + d.assigned + '명 배정';
  $('#roster-list').innerHTML = d.roster.length ? d.roster.map(r => {
    const opts = '<option value="">미배정</option>' + teams.map(t =>
      '<option value="' + t.id + '"' + (r.assigned === t.id ? ' selected' : '') + '>' + esc((t.emoji || '') + t.name) + '</option>').join('');
    return '<span class="pill">' +
      '<i class="org" style="background:' + (r.org === 'field' ? 'var(--org-field)' : 'var(--org-hq)') + '">' + (r.org === 'field' ? '파견' : '본사') + '</i>' +
      esc(r.nick) +
      '<select data-act="ros-assign" data-id="' + r.id + '" data-fkey="ra-' + r.id + '">' + opts + '</select>' +
      '<button class="x" data-act="ros-del" data-id="' + r.id + '" title="삭제">×</button></span>';
  }).join('') : '<div class="empty-state">참가자를 추가하거나 “참가자 슬롯 자동 생성”을 눌러보세요.</div>';

  syncSelect($('#ros-pref'), [{ v: '', l: '희망 조 없음' }].concat(teams.map(t => ({ v: t.id, l: (t.emoji || '') + t.name }))));
}

/** value 를 보존하면서 select 옵션을 갱신 */
function syncSelect(sel, opts) {
  if (!sel) return;
  const cur = sel.value;
  const sig = opts.map(o => o.v + '' + o.l).join('');
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  sel.innerHTML = opts.map(o => '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>').join('');
  if (opts.some(o => o.v === cur)) sel.value = cur;
}

$('#team-add').addEventListener('click', () => {
  const name = $('#team-name').value.trim();
  if (!name) return toast('조 이름을 적어주세요.', true);
  const order = list('teams').length;
  Store.set('teams/' + uid(), {
    name: name, emoji: $('#team-emoji').value.trim() || '🎯',
    capacity: +$('#team-cap').value || 8, unitCost: +$('#team-cost').value || 0,
    order: order, createdAt: nowTs()
  });
  $('#team-name').value = ''; $('#team-emoji').value = ''; $('#team-cap').value = ''; $('#team-cost').value = '';
  toast('조를 추가했습니다');
});

$('#ros-add').addEventListener('click', () => {
  const nick = $('#ros-nick').value.trim();
  if (!nick) return toast('닉네임을 적어주세요.', true);
  Store.set('roster/' + uid(), {
    nick: nick, org: $('#ros-org').value, pref: $('#ros-pref').value || '',
    assigned: '', createdAt: nowTs()
  });
  $('#ros-nick').value = '';
  toast(nick + ' 추가');
});
$('#ros-nick').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ros-add').click(); });

$('#ros-bulk').addEventListener('click', () => {
  const d = derived();
  const n = +prompt('생성할 참가자 슬롯 수 (익명 번호로 만듭니다)', String(d.expected || 40));
  if (!n || n < 1 || n > 200) return;
  const hqShare = d.total ? (+d.s.hq || 0) / d.total : .5;
  const hqN = Math.round(n * hqShare);
  const map = {};
  const base = list('roster', 'createdAt').length;
  for (let i = 0; i < n; i++) {
    const isHq = i < hqN;
    map['roster/' + uid()] = {
      nick: (isHq ? '본사' : '파견') + String((isHq ? i : i - hqN) + 1).padStart(2, '0'),
      org: isHq ? 'hq' : 'field', pref: '', assigned: '', createdAt: nowTs() + base + i
    };
  }
  Store.update(map);
  toast(n + '명 슬롯 생성');
});

$('#ros-clear').addEventListener('click', () => {
  const map = {};
  list('roster', 'createdAt').forEach(r => map['roster/' + r.id + '/assigned'] = '');
  Store.update(map);
  toast('배정을 초기화했습니다');
});

$('#ros-auto').addEventListener('click', () => {
  const d = derived();
  if (!d.teams.length) return toast('조를 먼저 만들어주세요.', true);
  const slots = {}; d.teams.forEach(t => slots[t.id] = { cap: +t.capacity || 0, hq: 0, field: 0, n: 0 });
  const map = {};
  const people = d.roster.slice();
  for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = people[i]; people[i] = people[j]; people[j] = t; }

  const place = (p, tid) => { const s = slots[tid]; s.n++; s[p.org === 'field' ? 'field' : 'hq']++; map['roster/' + p.id + '/assigned'] = tid; };

  /* 1차: 희망 조 우선 */
  const rest = [];
  people.forEach(p => {
    if (p.pref && slots[p.pref] && slots[p.pref].n < slots[p.pref].cap) place(p, p.pref);
    else rest.push(p);
  });
  /* 2차: 소속 비율이 가장 모자란 조부터 채운다 (본사·파견 번갈아 투입) */
  const hqRatio = d.roster.length
    ? d.roster.filter(r => r.org !== 'field').length / d.roster.length
    : (d.total ? (+d.s.hq || 0) / d.total : .5);
  const queue = [];
  const hqRest = rest.filter(p => p.org !== 'field');
  const fieldRest = rest.filter(p => p.org === 'field');
  while (hqRest.length || fieldRest.length) {          // 번갈아 꺼내 순서 편향 제거
    if (hqRest.length) queue.push(hqRest.shift());
    if (fieldRest.length) queue.push(fieldRest.shift());
  }
  queue.forEach(p => {
    const isField = p.org === 'field';
    let best = null, bestScore = -Infinity;
    d.teams.forEach(t => {
      const s = slots[t.id];
      if (s.cap && s.n >= s.cap) return;
      /* 이 조가 목표 비율을 맞추려면 이 소속이 몇 명 더 필요한가 */
      const want = (s.cap || 0) * (isField ? 1 - hqRatio : hqRatio);
      const deficit = want - (isField ? s.field : s.hq);
      const room = s.cap ? s.cap - s.n : 0;
      const score = deficit * 2 + room * 0.35;
      if (score > bestScore) { bestScore = score; best = t.id; }
    });
    if (best) place(p, best);
    else map['roster/' + p.id + '/assigned'] = '';
  });
  Store.update(map);
  const left = Object.keys(map).filter(k => map[k] === '').length;
  toast('자동 배정 완료' + (left ? ' · 정원 초과로 ' + left + '명 미배정' : ''));
});

/* ═══ 6. 타임테이블 ════════════════════════════════════════════ */

function renderAgenda(d) {
  const startInput = $('#ag-start');
  if (document.activeElement !== startInput) startInput.value = d.s.startTime || '13:30';
  $('#ag-total').textContent = d.agenda.length
    ? '총 ' + fmtDur(d.minutes) + ' · 종료 ' + toHHMM(toMin(d.s.startTime) + d.minutes) : '';

  let acc = toMin(d.s.startTime);
  $('#agenda-list').innerHTML = d.agenda.length ? d.agenda.map((a, i) => {
    const from = acc; acc += (+a.minutes || 0);
    const type = AG_TYPES[a.type] || AG_TYPES.all;
    return '<div class="ag-row" draggable="true" data-id="' + a.id + '" style="border-left-color:' + slotColor(type.slot) + '">' +
      '<span class="ag-handle" title="드래그해서 순서 변경">⠿</span>' +
      '<span class="ag-time">' + toHHMM(from) + '–' + toHHMM(from + (+a.minutes || 0)) + '</span>' +
      '<span class="ag-label">' + esc(a.label) + '<br><span class="muted small">' + type.label + '</span></span>' +
      '<input class="ag-min" type="number" min="0" step="5" value="' + (+a.minutes || 0) + '" ' +
        'data-act="ag-edit" data-f="minutes" data-id="' + a.id + '" data-fkey="am-' + a.id + '" style="width:64px">' +
      '<span class="ag-acts">' +
        '<button class="btn btn-xs" data-act="ag-move" data-dir="-1" data-id="' + a.id + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn btn-xs" data-act="ag-move" data-dir="1" data-id="' + a.id + '"' + (i === d.agenda.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn btn-xs btn-danger" data-act="ag-del" data-id="' + a.id + '">×</button>' +
      '</span></div>';
  }).join('') : '<div class="empty-state">블록을 추가해 반나절 흐름을 만들어보세요.</div>';
}

$('#ag-add').addEventListener('click', () => {
  const label = $('#ag-label').value.trim();
  if (!label) return toast('블록 이름을 적어주세요.', true);
  Store.set('agenda/' + uid(), {
    label: label, minutes: +$('#ag-min').value || 30, type: $('#ag-type').value,
    order: list('agenda').length, createdAt: nowTs()
  });
  $('#ag-label').value = ''; $('#ag-min').value = '';
});
$('#ag-label').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ag-add').click(); });
$('#ag-start').addEventListener('change', e => Store.set('settings/startTime', e.target.value || '13:30'));

function reorderAgenda(ids) {
  const map = {}; ids.forEach((id, i) => map['agenda/' + id + '/order'] = i);
  Store.update(map);
}
function moveAgenda(id, dir) {
  const ids = list('agenda').map(a => a.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  ids.splice(j, 0, ids.splice(i, 1)[0]);
  reorderAgenda(ids);
}

/* 드래그 앤 드롭 */
let dragId = null;
$('#agenda-list').addEventListener('dragstart', e => {
  const row = e.target.closest('.ag-row'); if (!row) return;
  dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
});
$('#agenda-list').addEventListener('dragover', e => {
  const row = e.target.closest('.ag-row'); if (!row || !dragId) return;
  e.preventDefault();
  $$('#agenda-list .ag-row').forEach(r => r.classList.toggle('drag-over', r === row && r.dataset.id !== dragId));
});
$('#agenda-list').addEventListener('dragleave', e => {
  const row = e.target.closest('.ag-row'); if (row) row.classList.remove('drag-over');
});
$('#agenda-list').addEventListener('drop', e => {
  const row = e.target.closest('.ag-row'); if (!row || !dragId) return;
  e.preventDefault();
  const ids = list('agenda').map(a => a.id);
  const from = ids.indexOf(dragId), to = ids.indexOf(row.dataset.id);
  if (from < 0 || to < 0 || from === to) { dragId = null; render(); return; }
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  dragId = null;
  reorderAgenda(ids);
});
$('#agenda-list').addEventListener('dragend', () => { dragId = null; $$('#agenda-list .ag-row').forEach(r => r.classList.remove('drag-over')); });

/* ═══ 7. 예산 · 준비물 ═════════════════════════════════════════ */

function renderBudget(d) {
  $('#budget-cap-sub').textContent = (+d.s.cap ? '상한 ' + won(d.s.cap) : '설정에서 상한을 지정할 수 있습니다');

  const items = list('budget', 'createdAt');
  const rows = d.teams.map((t, i) => {
    const n = d.byTeam[t.id].n || +t.capacity || 0;
    return { label: (t.emoji || '') + ' ' + t.name + ' 활동비', detail: won(+t.unitCost || 0) + ' × ' + n + '명',
             amount: (+t.unitCost || 0) * n, color: slotColor(i), fixed: true };
  }).concat(items.map(it => ({
    label: it.label, detail: it.type === 'perPerson' ? won(+it.amount || 0) + ' × ' + d.expected + '명' : '총액',
    amount: it.type === 'perPerson' ? (+it.amount || 0) * d.expected : (+it.amount || 0),
    color: 'var(--series-other)', id: it.id
  })));

  $('#budget-table').innerHTML =
    '<thead><tr><th>항목</th><th>산식</th><th class="num">금액</th><th></th></tr></thead><tbody>' +
    (rows.length ? rows.map(r =>
      '<tr><td><i class="swatch" style="background:' + r.color + ';margin-right:6px"></i>' + esc(r.label) + '</td>' +
      '<td class="muted small">' + esc(r.detail) + '</td>' +
      '<td class="num">' + won(r.amount) + '</td>' +
      '<td class="num">' + (r.id ? '<button class="btn btn-xs btn-danger" data-act="bg-del" data-id="' + r.id + '">×</button>' : '') + '</td></tr>'
    ).join('') : '<tr><td colspan="4" class="muted small">항목이 없습니다. 조를 만들면 활동비가 자동으로 잡힙니다.</td></tr>') +
    '</tbody><tfoot><tr><td colspan="2">합계</td><td class="num">' + won(d.budgetTotal) + '</td><td></td></tr>' +
    (d.expected ? '<tr><td colspan="2" class="muted small" style="font-weight:400">1인당</td><td class="num muted small" style="font-weight:400">' + won(d.budgetTotal / d.expected) + '</td><td></td></tr>' : '') +
    '</tfoot>';

  const cap = +d.s.cap || 0;
  const pct = cap ? d.budgetTotal / cap * 100 : 0;
  $('#budget-meter').innerHTML = cap ?
    '<div class="meter-row" style="margin-top:14px"><div class="meter-name">상한 대비</div>' +
    '<div class="meter-val">' + Math.round(pct) + '% · 잔여 ' + won(Math.max(0, cap - d.budgetTotal)) + '</div>' +
    '<div class="meter-track"><div class="meter-fill" style="width:' + Math.min(100, pct) + '%;background:' +
      (pct > 100 ? 'var(--critical)' : pct > 90 ? 'var(--warning)' : 'var(--good)') + '"></div></div></div>' : '';

  /* 체크리스트 */
  const owners = tfMembers(d.s);
  syncSelect($('#ck-owner'), [{ v: '', l: '담당 미정' }].concat(owners.map(o => ({ v: o, l: o }))));

  const today = new Date().toISOString().slice(0, 10);
  $('#check-sub').textContent = d.checks.length ? d.done + ' / ' + d.checks.length + ' 완료' : '';
  $('#check-list').innerHTML = d.checks.length ? d.checks.map(c => {
    const opts = '<option value="">미정</option>' + owners.map(o =>
      '<option value="' + esc(o) + '"' + (c.owner === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
    return '<div class="check-row' + (c.done ? ' done' : '') + '">' +
      '<input type="checkbox"' + (c.done ? ' checked' : '') + ' data-act="ck-toggle" data-id="' + c.id + '">' +
      '<span class="check-task">' + esc(c.task) + '</span>' +
      '<select class="check-owner" data-act="ck-owner" data-id="' + c.id + '" data-fkey="co-' + c.id + '">' + opts + '</select>' +
      (c.due ? '<span class="check-due' + (!c.done && c.due < today ? ' late' : '') + '">' + esc(c.due.slice(5)) + '</span>' : '') +
      '<button class="btn btn-xs btn-danger" data-act="ck-del" data-id="' + c.id + '">×</button></div>';
  }).join('') : '<div class="empty-state">할 일을 추가해 TF 4명이 나눠 가지세요.</div>';
}

function tfMembers(s) {
  const arr = String((s || S()).tf || '').split(',').map(x => x.trim()).filter(Boolean);
  if (ME.nick && arr.indexOf(ME.nick) < 0) arr.push(ME.nick);
  return arr;
}

$('#bg-add').addEventListener('click', () => {
  const label = $('#bg-label').value.trim();
  if (!label) return toast('항목 이름을 적어주세요.', true);
  Store.set('budget/' + uid(), { label: label, amount: +$('#bg-amount').value || 0, type: $('#bg-type').value, createdAt: nowTs() });
  $('#bg-label').value = ''; $('#bg-amount').value = '';
});
$('#bg-label').addEventListener('keydown', e => { if (e.key === 'Enter') $('#bg-add').click(); });

function addCheck(task, owner, due) {
  task = (task || '').trim(); if (!task) return;
  Store.set('checklist/' + uid(), { task: task, owner: owner || '', due: due || '', done: false, createdAt: nowTs() });
}
$('#ck-add').addEventListener('click', () => {
  if (!$('#ck-task').value.trim()) return toast('할 일을 적어주세요.', true);
  addCheck($('#ck-task').value, $('#ck-owner').value, $('#ck-due').value);
  $('#ck-task').value = ''; $('#ck-due').value = '';
});
$('#ck-task').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ck-add').click(); });

/* ═══ 이벤트 위임 (click / change / submit) ═══════════════════ */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'vote': {
      const idea = (Store.state.ideas || {})[id]; if (!idea) return;
      const cur = (idea.voters || {})[ME.id];
      const v = el.dataset.v;
      Store.set('ideas/' + id + '/voters/' + ME.id, cur && cur.v === v ? null : { v: v, nick: ME.nick || '익명' });
      break;
    }
    case 'idea-del':  if (confirm('이 아이디어를 삭제할까요?')) Store.remove('ideas/' + id); break;
    case 'team-del':  if (confirm('조를 삭제하면 배정도 풀립니다. 삭제할까요?')) {
      const map = { ['teams/' + id]: null };
      list('roster', 'createdAt').forEach(r => { if (r.assigned === id) map['roster/' + r.id + '/assigned'] = ''; });
      Store.update(map);
    } break;
    case 'ros-del':   Store.remove('roster/' + id); break;
    case 'ag-move':   moveAgenda(id, +el.dataset.dir); break;
    case 'ag-del':    Store.remove('agenda/' + id); break;
    case 'bg-del':    Store.remove('budget/' + id); break;
    case 'ck-del':    Store.remove('checklist/' + id); break;
    case 'ck-toggle': Store.set('checklist/' + id + '/done', el.checked); break;
    case 'ai-apply':  aiApply(el); break;
  }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'team-edit')  Store.set('teams/' + id + '/' + el.dataset.f, +el.value || 0);
  if (act === 'ag-edit')    Store.set('agenda/' + id + '/' + el.dataset.f, +el.value || 0);
  if (act === 'ros-assign') Store.set('roster/' + id + '/assigned', el.value || '');
  if (act === 'ck-owner')   Store.set('checklist/' + id + '/owner', el.value || '');
});

document.addEventListener('submit', e => {
  const f = e.target.closest('[data-act="cmt-add"]'); if (!f) return;
  e.preventDefault();
  const input = f.querySelector('input');
  const text = input.value.trim(); if (!text) return;
  Store.set('ideas/' + f.dataset.id + '/comments/' + uid(), { nick: ME.nick || '익명', text: text, ts: nowTs() });
  input.value = '';
});

/* ═══ 8. AI 스튜디오 (Gemini) ═════════════════════════════════ */

const DEFAULT_MODEL = 'gemini-2.5-flash';
const SYS = [
  '너는 한국 대기업 조직의 사내 워크숍을 기획하는 4인 미니 TF를 돕는 기획 파트너다.',
  '반드시 한국어로, 사내 행사에 그대로 쓸 수 있을 만큼 구체적으로 답한다.',
  '',
  '[이 워크숍의 성격]',
  '· 한 실(室) 단위 임원 조직, 총원 약 50명. 이 중 절반은 사업회사에 파견되어 큰 룰은 같지만 회사 사정에 맞춰 조금씩 다르게 일한다.',
  '· 그래서 서로 얼굴을 익히고 소통할 기회가 구조적으로 없다. 목적 1은 "교류 늘리기"다.',
  '· 지금까지 쉼 없이 달려와 다들 지쳐 있다. 목적 2는 "약간의 재미와 여유"다. 성과 압박·경쟁·평가처럼 느껴지는 요소는 피한다.',
  '· 형식은 오후 반나절: 다 같이 타운홀 → 관심사별 테마 조 활동(볼링/라면/사진 등) → 석식.',
  '· 참가자는 실명 대신 익명 닉네임으로 관리한다. 개인을 특정하거나 평가하는 표현은 쓰지 않는다.',
  '',
  '준비 부담이 큰 안은 피하고, 진행자 없이도 굴러가는 쪽을 우선한다.'
].join('\n');

function contextBrief() {
  const d = derived();
  const L = [];
  L.push('[현재 보드 상태]');
  L.push('· 행사: ' + (d.s.title || '미정') + (d.s.date ? ' / ' + d.s.date : '') + ' / ' + d.s.startTime + ' 시작');
  L.push('· 인원: 본사 ' + d.s.hq + '명, 파견 ' + d.s.field + '명, 참석률 ' + d.s.rate + '% → 예상 ' + d.expected + '명');
  if (d.teams.length) L.push('· 조: ' + d.teams.map(t => t.name + '(정원 ' + (+t.capacity || 0) + ', 현재 ' + d.byTeam[t.id].n + ')').join(', '));
  if (d.agenda.length) L.push('· 타임테이블: ' + d.agenda.map(a => a.label + ' ' + (+a.minutes || 0) + '분').join(' → '));
  if (+d.s.cap) L.push('· 예산 상한 ' + won(d.s.cap) + ' / 현재 계획 ' + won(d.budgetTotal));
  const top = list('ideas', 'createdAt').map(withVotes).sort((a, b) => b.up - a.up).slice(0, 8);
  if (top.length) L.push('· 나온 아이디어: ' + top.map(x => x.title + '(👍' + x.up + ')').join(', '));
  return L.join('\n');
}

function aiReady() { return !!LS.get('gemini.key', ''); }

async function gemini(prompt, opts) {
  opts = opts || {};
  const key = LS.get('gemini.key', '');
  if (!key) throw new Error('Gemini API 키가 없습니다. 위의 “Gemini 연결”에서 키를 저장하세요.');
  const model = LS.get('gemini.model', '') || DEFAULT_MODEL;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    systemInstruction: { parts: [{ text: SYS }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: opts.temp == null ? 1.0 : opts.temp }
  };
  if (opts.json) body.generationConfig.responseMimeType = 'application/json';

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error('네트워크 오류로 Gemini에 연결하지 못했습니다.\n사내망에서 generativelanguage.googleapis.com 이 차단되어 있을 수 있습니다.');
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j.error && j.error.message) || ''; } catch (e) {}
    if (res.status === 400 && /API key/i.test(detail)) throw new Error('API 키가 올바르지 않습니다. (400)');
    if (res.status === 403) throw new Error('권한 오류(403). 키가 이 모델에 접근할 수 있는지 확인하세요.\n' + detail);
    if (res.status === 404) throw new Error('모델 “' + model + '”을 찾을 수 없습니다. 모델명을 확인하세요. (404)');
    if (res.status === 429) throw new Error('무료 할당량을 초과했습니다(429). 잠시 후 다시 시도하세요.');
    throw new Error('Gemini API 오류 ' + res.status + '\n' + detail);
  }
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
  if (!text) {
    const fr = cand && cand.finishReason ? ' (finishReason: ' + cand.finishReason + ')' : '';
    throw new Error('응답이 비어 있습니다.' + fr);
  }
  if (!opts.json) return text;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) {
    const m = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    throw new Error('JSON 파싱 실패. 모델 응답:\n' + text.slice(0, 400));
  }
}

const AI_CACHE = {};   /* 결과를 '보드에 반영' 할 때 다시 꺼내 쓰기 위한 임시 보관 */

function aiBusy(outSel, msg) {
  $(outSel).innerHTML = '<div class="ai-loading"><span class="spin"></span>' + esc(msg || '생성 중…') + '</div>';
}
function aiError(outSel, err) {
  $(outSel).innerHTML = '<div class="ai-error">⚠ ' + esc(err.message || String(err)) + '</div>';
}

function renderAI(d) {
  const on = aiReady();
  $('#ai-status').textContent = on ? '연결됨' : '미연결';
  $('#ai-status').dataset.on = on ? '1' : '0';
  if (document.activeElement !== $('#ai-model')) $('#ai-model').value = LS.get('gemini.model', '') || '';
  if (document.activeElement !== $('#ai-key') && LS.get('gemini.key', '')) $('#ai-key').placeholder = '저장됨 (••••)';
  $$('.ai-tool .btn-primary').forEach(b => b.disabled = !on);

  const ideas = list('ideas', 'createdAt').map(withVotes).sort((a, b) => b.up - a.up);
  syncSelect($('#ai-idea-pick'), ideas.length
    ? ideas.map(x => ({ v: x.id, l: '👍' + x.up + ' · ' + x.title }))
    : [{ v: '', l: '먼저 아이디어를 추가하세요' }]);
}

$('#ai-save').addEventListener('click', () => {
  const k = $('#ai-key').value.trim();
  if (k) { LS.set('gemini.key', k); $('#ai-key').value = ''; }
  LS.set('gemini.model', $('#ai-model').value.trim());
  toast(k ? '키를 저장했습니다 (이 브라우저에만)' : '모델을 저장했습니다');
  render();
});
$('#ai-clear').addEventListener('click', () => { LS.del('gemini.key'); $('#ai-key').placeholder = 'AIza...'; toast('키를 삭제했습니다'); render(); });
$('#ai-test').addEventListener('click', async () => {
  const box = $('#ai-out-expand'); aiBusy('#ai-out-expand', '연결 테스트 중…');
  try { const t = await gemini('연결 테스트입니다. "연결 정상"이라고만 답하세요.', { temp: 0 });
    box.innerHTML = '<div class="ai-card">✅ ' + esc(t) + '</div>'; }
  catch (e) { aiError('#ai-out-expand', e); }
});

/* ① 아이디어 확장 */
$('#ai-run-expand').addEventListener('click', async () => {
  const id = $('#ai-idea-pick').value;
  const idea = (Store.state.ideas || {})[id];
  if (!idea) return toast('확장할 아이디어를 골라주세요.', true);
  aiBusy('#ai-out-expand');
  try {
    const r = await gemini(contextBrief() + '\n\n[확장할 아이디어]\n제목: ' + idea.title + '\n설명: ' + (idea.desc || '(없음)') +
      '\n\n이 아이디어를 실제로 굴릴 수 있는 서로 다른 구체안 3개로 확장하라. 서로 겹치지 않게, 준비 난이도를 낮음/보통/높음으로 하나씩 배치하라.\n' +
      '아래 JSON 스키마로만 답하라.\n' +
      '{"options":[{"title":"안 이름","how":["진행 순서 3~5단계"],"why":"교류/휴식 목적에 어떻게 맞는지 1문장","risk":"예상 리스크 1문장","prep":"낮음|보통|높음","time":"소요 시간(예: 60분)","cost":"1인당 예상 비용(예: 15,000원 또는 0원)"}]}',
      { json: true });
    AI_CACHE.expand = r;
    $('#ai-out-expand').innerHTML = (r.options || []).map((o, i) =>
      '<div class="ai-card"><h4>' + esc(o.title) + '</h4>' +
      '<div class="muted small">준비 ' + esc(o.prep || '-') + ' · ' + esc(o.time || '-') + ' · ' + esc(o.cost || '-') + '</div>' +
      '<ul>' + (o.how || []).map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' +
      '<p class="small" style="margin:8px 0 0">' + esc(o.why || '') + '</p>' +
      (o.risk ? '<p class="small risk" style="margin:2px 0 0">⚠ ' + esc(o.risk) + '</p>' : '') +
      '<div class="ai-actions"><button class="btn btn-xs" data-act="ai-apply" data-kind="expand" data-i="' + i + '">아이디어 보드에 추가</button></div></div>'
    ).join('') || '<div class="ai-error">결과가 비어 있습니다.</div>';
  } catch (e) { aiError('#ai-out-expand', e); }
});

/* ② 아이스브레이킹 */
let iceKind = 'quiz';
$('#ai-ice-kind').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn'); if (!b) return;
  iceKind = b.dataset.kind;
  $$('#ai-ice-kind .seg-btn').forEach(x => x.classList.toggle('is-active', x === b));
});
$('#ai-run-ice').addEventListener('click', async () => {
  aiBusy('#ai-out-ice');
  const ask = {
    quiz:     '본사 인원과 파견 인원이 섞인 팀 대항 O/X·객관식 퀴즈 6개를 만들어라. 조직 내부 지식이 없어도 웃으며 풀 수 있어야 하고, 답에는 왜 그런지 한 줄 해설을 붙여라. head=문제, body=정답과 해설, tip=진행 팁.',
    question: '4~6명이 둘러앉아 서로를 알아가는 질문 8개를 만들어라. 업무 성과·직급·평가와 무관하고, 파견 나가 있는 사람과 본사 사람이 서로의 일상을 알게 되는 방향으로. head=질문, body=이 질문이 여는 대화, tip=진행 팁.',
    script:   '타운홀 오프닝 진행 멘트를 만들어라. 지쳐 있는 사람들을 부담 주지 않고 편안하게 만드는 톤. 여는 인사, 오늘의 목적 설명, 조 활동 안내, 마무리 4개 블록으로. head=블록 이름, body=실제 읽을 멘트(3~5문장), tip=진행 팁.'
  }[iceKind];
  try {
    const r = await gemini(contextBrief() + '\n\n' + ask + '\n\nJSON 스키마: {"items":[{"head":"","body":"","tip":""}]}', { json: true });
    AI_CACHE.ice = r;
    $('#ai-out-ice').innerHTML = (r.items || []).map(o =>
      '<div class="ai-card"><h4>' + esc(o.head) + '</h4>' +
      '<p class="small" style="margin:0;white-space:pre-wrap">' + esc(o.body || '') + '</p>' +
      (o.tip ? '<p class="small muted" style="margin:6px 0 0">💡 ' + esc(o.tip) + '</p>' : '') + '</div>'
    ).join('') + '<div class="ai-actions"><button class="btn btn-xs" data-act="ai-apply" data-kind="ice-copy">전체 복사</button></div>';
  } catch (e) { aiError('#ai-out-ice', e); }
});

/* ③ 회의 정리 */
$('#ai-run-notes').addEventListener('click', async () => {
  const notes = $('#ai-notes').value.trim();
  if (!notes) return toast('회의 메모를 붙여넣어주세요.', true);
  aiBusy('#ai-out-notes');
  try {
    const r = await gemini(contextBrief() + '\n\n[회의 메모]\n' + notes.slice(0, 8000) +
      '\n\n위 메모를 결정사항 / 할 일 / 아이디어로 분류하라. 메모에 없는 내용을 지어내지 말 것. ' +
      '담당자(owner)는 메모에 나온 닉네임만 쓰고 없으면 빈 문자열. 기한(due)은 YYYY-MM-DD 또는 빈 문자열. ' +
      'tag는 activity|townhall|food|gift|ops|etc 중 하나.\n' +
      'JSON 스키마: {"decisions":["..."],"todos":[{"task":"","owner":"","due":""}],"ideas":[{"title":"","desc":"","tag":""}]}',
      { json: true, temp: 0.4 });
    AI_CACHE.notes = r;
    const sec = (t, html) => html ? '<div class="ai-card"><h4>' + t + '</h4>' + html + '</div>' : '';
    $('#ai-out-notes').innerHTML =
      sec('결정사항', (r.decisions || []).length ? '<ul>' + r.decisions.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      sec('할 일 ' + ((r.todos || []).length ? '(' + r.todos.length + ')' : ''),
        (r.todos || []).length ? '<ul>' + r.todos.map(t => '<li>' + esc(t.task) + (t.owner ? ' — <b>' + esc(t.owner) + '</b>' : '') + (t.due ? ' <span class="muted">' + esc(t.due) + '</span>' : '') + '</li>').join('') + '</ul>' +
          '<div class="ai-actions"><button class="btn btn-xs" data-act="ai-apply" data-kind="notes-todos">준비물 목록에 전부 추가</button></div>' : '') +
      sec('아이디어 ' + ((r.ideas || []).length ? '(' + r.ideas.length + ')' : ''),
        (r.ideas || []).length ? '<ul>' + r.ideas.map(x => '<li>' + esc(x.title) + '</li>').join('') + '</ul>' +
          '<div class="ai-actions"><button class="btn btn-xs" data-act="ai-apply" data-kind="notes-ideas">아이디어 보드에 전부 추가</button></div>' : '') ||
      '<div class="ai-error">분류할 내용을 찾지 못했습니다.</div>';
  } catch (e) { aiError('#ai-out-notes', e); }
});

/* ④ 조 편성 추천 */
$('#ai-run-teams').addEventListener('click', async () => {
  const d = derived();
  if (!d.teams.length || !d.roster.length) return toast('조와 참가자를 먼저 등록해주세요.', true);
  aiBusy('#ai-out-teams');
  const people = d.roster.map(r => ({
    nick: r.nick, org: r.org === 'field' ? '파견' : '본사',
    pref: r.pref && Store.state.teams[r.pref] ? Store.state.teams[r.pref].name : ''
  }));
  try {
    const r = await gemini(contextBrief() +
      '\n\n[조 정원]\n' + d.teams.map(t => '· ' + t.name + ': ' + (+t.capacity || 0) + '명').join('\n') +
      '\n\n[참가자 ' + people.length + '명]\n' + JSON.stringify(people) +
      ($('#ai-team-note').value.trim() ? '\n\n[추가 조건]\n' + $('#ai-team-note').value.trim() : '') +
      '\n\n모든 참가자를 정원 안에서 배정하라. 원칙: (1) 희망 조를 최대한 존중, (2) 각 조에 본사와 파견이 고루 섞이게, (3) 정원 초과 금지. ' +
      'team 값은 위 조 이름과 정확히 일치해야 한다. nick 값도 참가자 목록의 닉네임과 정확히 일치해야 한다.\n' +
      'JSON 스키마: {"summary":"편성 결과 요약 2문장","assignments":[{"nick":"","team":"","reason":"짧은 근거"}],"warnings":["주의사항"]}',
      { json: true, temp: 0.5 });
    AI_CACHE.teams = r;
    const byTeamName = {};
    (r.assignments || []).forEach(a => { (byTeamName[a.team] = byTeamName[a.team] || []).push(a.nick); });
    $('#ai-out-teams').innerHTML =
      '<div class="ai-card"><p class="small" style="margin:0">' + esc(r.summary || '') + '</p></div>' +
      Object.keys(byTeamName).map(tn =>
        '<div class="ai-card"><h4>' + esc(tn) + ' <span class="muted small">' + byTeamName[tn].length + '명</span></h4>' +
        '<p class="small" style="margin:0">' + esc(byTeamName[tn].join(', ')) + '</p></div>').join('') +
      ((r.warnings || []).length ? '<div class="ai-card"><h4>주의</h4><ul>' + r.warnings.map(w => '<li class="risk">' + esc(w) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="ai-actions"><button class="btn btn-xs btn-primary" data-act="ai-apply" data-kind="teams">이 편성안 적용</button></div>';
  } catch (e) { aiError('#ai-out-teams', e); }
});

/* AI 결과 → 보드 반영 */
function aiApply(el) {
  const kind = el.dataset.kind;
  if (kind === 'expand') {
    const o = ((AI_CACHE.expand || {}).options || [])[+el.dataset.i]; if (!o) return;
    addIdea(o.title, (o.how || []).join('\n') + (o.why ? '\n\n→ ' + o.why : '') + (o.risk ? '\n⚠ ' + o.risk : ''), 'activity');
    toast('아이디어 보드에 추가했습니다');
  }
  if (kind === 'ice-copy') {
    const txt = ((AI_CACHE.ice || {}).items || []).map(i => '■ ' + i.head + '\n' + (i.body || '') + (i.tip ? '\n💡 ' + i.tip : '')).join('\n\n');
    copy(txt);
  }
  if (kind === 'notes-todos') {
    ((AI_CACHE.notes || {}).todos || []).forEach(t => addCheck(t.task, t.owner, t.due));
    toast('할 일을 추가했습니다');
  }
  if (kind === 'notes-ideas') {
    ((AI_CACHE.notes || {}).ideas || []).forEach(x => addIdea(x.title, x.desc, x.tag));
    toast('아이디어를 추가했습니다');
  }
  if (kind === 'teams') {
    const d = derived();
    const teamByName = {}; d.teams.forEach(t => teamByName[t.name.trim()] = t.id);
    const rosByNick = {}; d.roster.forEach(r => rosByNick[r.nick.trim()] = r.id);
    const map = {}; let ok = 0, miss = 0;
    ((AI_CACHE.teams || {}).assignments || []).forEach(a => {
      const rid = rosByNick[String(a.nick || '').trim()], tid = teamByName[String(a.team || '').trim()];
      if (rid && tid) { map['roster/' + rid + '/assigned'] = tid; ok++; } else miss++;
    });
    if (!ok) return toast('적용할 수 있는 배정이 없습니다 (닉네임/조 이름 불일치).', true);
    Store.update(map);
    toast(ok + '명 배정 적용' + (miss ? ' · ' + miss + '건은 이름이 맞지 않아 건너뜀' : ''));
  }
}

function copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('복사했습니다'), () => fallbackCopy(text));
  } else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('복사했습니다'); } catch (e) { toast('복사 실패 — 직접 선택해 주세요', true); }
  ta.remove();
}

/* ═══ 9. 설정 · 온보딩 · 데이터 ═══════════════════════════════ */

function renderSettings(d) {
  const set = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
  set('#st-title', d.s.title); set('#st-date', d.s.date);
  set('#st-hq', d.s.hq); set('#st-field', d.s.field); set('#st-rate', d.s.rate);
  set('#st-cap', d.s.cap); set('#st-tf', d.s.tf);
  const cfg = fbConfig();
  const builtin = fbIsBuiltin();
  $('#fb-status').textContent = Store.mode === 'live'
    ? (builtin ? '연결됨 (코드 내장)' : '연결됨') : (cfg ? '설정됨(미연결)' : '미설정');
  $('#fb-status').dataset.on = Store.mode === 'live' ? '1' : '0';
  const bnote = $('#fb-builtin-note'); if (bnote) bnote.hidden = !builtin;   /* index.html 이 구버전이어도 안전하게 */
  if (document.activeElement !== $('#fb-config') && cfg && !builtin && !$('#fb-config').value)
    $('#fb-config').value = JSON.stringify(cfg, null, 2);

  /* 내 계정 */
  $('#acct-status').textContent = USER ? idOf(USER.email) : '로컬 모드';
  $('#acct-status').dataset.on = USER ? '1' : '0';
  $('#acct-info').textContent = USER
    ? '아이디 ' + idOf(USER.email) + ' 로 로그인 중 · 보드에는 닉네임 “' + ME.nick + '” 으로 표시됩니다.'
    : 'Firebase를 연결하면 TF 계정(kian / joon / eugene / sean)으로 로그인해서 씁니다.';
  $('#btn-pw').hidden = !USER;
  $('#btn-logout2').hidden = !USER;
  set('#st-room', Store.room || '');
}

[['#st-title', 'title', 's'], ['#st-date', 'date', 's'], ['#st-hq', 'hq', 'n'],
 ['#st-field', 'field', 'n'], ['#st-rate', 'rate', 'n'], ['#st-cap', 'cap', 'n'], ['#st-tf', 'tf', 's']]
.forEach(([sel, key, type]) => {
  $(sel).addEventListener('change', e => Store.set('settings/' + key, type === 'n' ? (+e.target.value || 0) : e.target.value));
});

/* Firebase 설정 — 콘솔에서 어떤 형태로 복사해 오든 받아냅니다.
   ① 전체 코드 스니펫(import 문·주석 포함)  ② const firebaseConfig = {...};
   ③ 중괄호만 있는 객체              ④ 중괄호 없이 안쪽만 (가장 흔한 실수) */
function extractConfigObject(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charAt(i) !== '{') continue;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const c = s.charAt(j);
      if (c === '{') depth++;
      else if (c === '}') {
        if (--depth === 0) {
          const block = s.slice(i, j + 1);
          if (/apiKey/.test(block)) return block;   /* import {...} 같은 다른 블록은 건너뛴다 */
          i = j;
          break;
        }
      }
    }
  }
  return null;
}
function parseFbConfig(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('비어 있습니다.');
  let obj = extractConfigObject(s);
  if (!obj) {
    if (!/apiKey/.test(s)) throw new Error('apiKey 가 보이지 않습니다. Firebase 콘솔의 “SDK 설정 및 구성 → 구성” 내용을 복사했는지 확인하세요.');
    obj = '{' + s.replace(/^[{\s]+/, '').replace(/[};\s]+$/, '') + '}';   /* 중괄호 없이 붙여넣은 경우 */
  }
  const json = obj
    .replace(/'/g, '"')                                       /* 홑따옴표 → 큰따옴표 */
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')   /* 따옴표 없는 키 */
    .replace(/,(\s*[}\]])/g, '$1');                           /* 마지막 쉼표 */
  return JSON.parse(json);
}

$('#fb-save').addEventListener('click', () => {
  const raw = $('#fb-config').value.trim();
  if (!raw) return toast('config를 붙여넣어주세요.', true);
  let cfg;
  try { cfg = parseFbConfig(raw); }
  catch (e) { return toast('config를 읽지 못했습니다: ' + e.message, true); }
  if (!cfg.apiKey) return toast('apiKey 가 없습니다. 복사한 내용을 다시 확인해주세요.', true);
  if (!cfg.databaseURL) return toast('databaseURL 이 없습니다. Realtime Database를 먼저 만들고 config를 다시 복사하세요.', true);
  LS.del('fbOff');
  LS.set('fbconfig', cfg);
  toast('저장했습니다. 새로고침해서 연결합니다…');
  setTimeout(() => location.reload(), 700);
});
$('#fb-clear').addEventListener('click', () => {
  if (!confirm('Firebase 연결을 해제하고 로컬 모드로 돌아갈까요? (이 브라우저에서만 적용됩니다)')) return;
  LS.del('fbconfig');
  LS.set('fbOff', true);      /* 코드에 내장된 config 도 이 브라우저에선 쓰지 않는다 */
  location.reload();
});

/* ═══ 산출물(기획서) 내보내기 ═════════════════════════════════
   보드 내용을 사람이 읽는 문서 한 장으로 만듭니다.
   reportModel() 로 한 번 정리한 뒤 Markdown / HTML 두 가지로 씁니다.
   ═════════════════════════════════════════════════════════════ */

function reportModel() {
  const d = derived();
  const teamName = {};
  d.teams.forEach(t => teamName[t.id] = (t.emoji || '') + ' ' + t.name);

  let acc = toMin(d.s.startTime);
  const agenda = d.agenda.map(a => {
    const from = acc, min = +a.minutes || 0; acc += min;
    return { from: toHHMM(from), to: toHHMM(from + min), min: min,
             label: a.label, type: (AG_TYPES[a.type] || AG_TYPES.all).label };
  });

  const teams = d.teams.map((t, i) => {
    const c = d.byTeam[t.id];
    const head = c.n || +t.capacity || 0;
    return {
      slot: i, emoji: t.emoji || '🎯', name: t.name,
      capacity: +t.capacity || 0, count: c.n, hq: c.hq, field: c.field,
      unitCost: +t.unitCost || 0, cost: (+t.unitCost || 0) * head,
      members: d.roster.filter(r => r.assigned === t.id).map(r => ({ nick: r.nick, org: r.org === 'field' ? '파견' : '본사' }))
    };
  });

  const budgetRows = teams.map(t => ({
    label: t.emoji + ' ' + t.name + ' 활동비',
    detail: won(t.unitCost) + ' × ' + (t.count || t.capacity) + '명', amount: t.cost
  })).concat(list('budget', 'createdAt').map(b => ({
    label: b.label,
    detail: b.type === 'perPerson' ? won(+b.amount || 0) + ' × ' + d.expected + '명' : '총액',
    amount: b.type === 'perPerson' ? (+b.amount || 0) * d.expected : (+b.amount || 0)
  })));

  const ideas = list('ideas', 'createdAt').map(withVotes)
    .sort((a, b) => (b.up - b.concern) - (a.up - a.concern) || b.createdAt - a.createdAt)
    .map(x => ({
      title: x.title, desc: x.desc || '', tag: tagOf(x.tag).label, slot: tagOf(x.tag).slot,
      up: x.up, concern: x.concern, author: x.author || '익명',
      comments: Object.keys(x.comments || {}).map(k => x.comments[k])
        .sort((a, b) => (a.ts || 0) - (b.ts || 0)).map(c => ({ nick: c.nick, text: c.text }))
    }));

  return {
    title: d.s.title || '워크숍', date: d.s.date || '',
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    start: d.s.startTime, end: toHHMM(toMin(d.s.startTime) + d.minutes), minutes: d.minutes,
    hq: +d.s.hq || 0, field: +d.s.field || 0, total: d.total, rate: d.s.rate, expected: d.expected,
    capacity: d.capacity, assigned: d.assigned,
    unassigned: d.roster.filter(r => !r.assigned || !d.byTeam[r.assigned])
      .map(r => ({ nick: r.nick, org: r.org === 'field' ? '파견' : '본사' })),
    agenda: agenda, teams: teams, budgetRows: budgetRows,
    budgetTotal: d.budgetTotal, budgetCap: +d.s.cap || 0,
    checks: d.checks.map(c => ({ task: c.task, owner: c.owner || '미정', due: c.due || '', done: !!c.done })),
    checkDone: d.done, ideas: ideas, tf: tfMembers(d.s)
  };
}

const mdCell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function reportMarkdown() {
  const r = reportModel();
  const L = [];
  L.push('# ' + r.title);
  L.push('');
  L.push('> 미니TF 스튜디오에서 ' + r.generatedAt + ' 에 생성');
  L.push('');
  L.push('## 1. 개요');
  L.push('');
  L.push('| 항목 | 내용 |');
  L.push('|---|---|');
  L.push('| 일시 | ' + (r.date || '미정') + ' ' + r.start + ' ~ ' + r.end + ' (' + fmtDur(r.minutes) + ') |');
  L.push('| 대상 | 본사 ' + r.hq + '명 + 파견 ' + r.field + '명 = ' + r.total + '명 |');
  L.push('| 예상 참석 | ' + r.expected + '명 (참석률 ' + r.rate + '% 가정) |');
  L.push('| 조 정원 합계 | ' + r.capacity + '석 (배정 ' + r.assigned + '명) |');
  L.push('| 예상 총예산 | ' + won(r.budgetTotal) + (r.expected ? ' · 1인당 ' + won(r.budgetTotal / r.expected) : '') +
    (r.budgetCap ? ' / 상한 ' + won(r.budgetCap) : '') + ' |');
  if (r.tf.length) L.push('| TF | ' + mdCell(r.tf.join(', ')) + ' |');
  L.push('');

  L.push('## 2. 타임테이블');
  L.push('');
  if (r.agenda.length) {
    L.push('| 시간 | 구분 | 내용 | 소요 |');
    L.push('|---|---|---|---|');
    r.agenda.forEach(a => L.push('| ' + a.from + '–' + a.to + ' | ' + a.type + ' | ' + mdCell(a.label) + ' | ' + a.min + '분 |'));
    L.push('');
    L.push('총 ' + fmtDur(r.minutes) + ' (' + r.start + ' 시작 → ' + r.end + ' 종료)');
  } else L.push('_아직 없음_');
  L.push('');

  L.push('## 3. 조 편성');
  L.push('');
  if (r.teams.length) {
    L.push('| 조 | 인원 | 본사 | 파견 | 1인 단가 | 활동비 |');
    L.push('|---|---|---|---|---|---|');
    r.teams.forEach(t => L.push('| ' + mdCell(t.emoji + ' ' + t.name) + ' | ' + t.count + '/' + t.capacity +
      ' | ' + t.hq + ' | ' + t.field + ' | ' + won(t.unitCost) + ' | ' + won(t.cost) + ' |'));
    L.push('');
    r.teams.forEach(t => {
      L.push('### ' + t.emoji + ' ' + t.name + ' (' + t.count + '/' + t.capacity + '명)');
      L.push('');
      L.push(t.members.length
        ? t.members.map(m => '- ' + m.nick + ' (' + m.org + ')').join('\n')
        : '_배정된 인원 없음_');
      L.push('');
    });
    if (r.unassigned.length) {
      L.push('### 미배정 (' + r.unassigned.length + '명)');
      L.push('');
      L.push(r.unassigned.map(m => '- ' + m.nick + ' (' + m.org + ')').join('\n'));
      L.push('');
    }
  } else { L.push('_아직 없음_'); L.push(''); }

  L.push('## 4. 예산');
  L.push('');
  if (r.budgetRows.length) {
    L.push('| 항목 | 산식 | 금액 |');
    L.push('|---|---|---:|');
    r.budgetRows.forEach(b => L.push('| ' + mdCell(b.label) + ' | ' + mdCell(b.detail) + ' | ' + won(b.amount) + ' |'));
    L.push('| **합계** | | **' + won(r.budgetTotal) + '** |');
    L.push('');
    if (r.expected) L.push('1인당 약 ' + won(r.budgetTotal / r.expected) + (r.budgetCap
      ? ' · 상한 ' + won(r.budgetCap) + ' 대비 ' + Math.round(r.budgetTotal / r.budgetCap * 100) + '%' : ''));
  } else L.push('_아직 없음_');
  L.push('');

  L.push('## 5. 준비물 · 할 일');
  L.push('');
  L.push(r.checks.length
    ? r.checks.map(c => '- [' + (c.done ? 'x' : ' ') + '] ' + c.task + ' — ' + c.owner + (c.due ? ' (~' + c.due + ')' : '')).join('\n')
      + '\n\n완료 ' + r.checkDone + ' / ' + r.checks.length + '건'
    : '_아직 없음_');
  L.push('');

  L.push('## 6. 아이디어 (투표순)');
  L.push('');
  if (r.ideas.length) {
    r.ideas.forEach((x, i) => {
      L.push('### ' + (i + 1) + '. ' + x.title + '  `' + x.tag + '`');
      L.push('');
      L.push('👍 ' + x.up + ' · 🤔 ' + x.concern + ' · 제안 ' + x.author);
      if (x.desc) { L.push(''); L.push(x.desc.split('\n').map(s => '> ' + s).join('\n')); }
      if (x.comments.length) {
        L.push('');
        x.comments.forEach(c => L.push('- **' + c.nick + '**: ' + c.text));
      }
      L.push('');
    });
  } else { L.push('_아직 없음_'); L.push(''); }

  L.push('---');
  L.push('');
  L.push('*참가자는 익명 닉네임으로만 관리합니다. 사내 문서로 옮길 때 실명 매핑이 필요하면 별도로 관리하세요.*');
  return L.join('\n');
}

function reportHtml() {
  const r = reportModel();
  const e = esc;
  const cols = i => i < 8 ? ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'][i] : '#898781';
  const dot = i => '<i class="dot" style="background:' + cols(i) + '"></i>';
  const H = [];

  H.push('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">');
  H.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  H.push('<title>' + e(r.title) + ' — 기획서</title><style>');
  H.push(`
  :root{--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e1e0d9;--rule:#c3c2b7;--bg:#fff;--sunk:#f5f5f2}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 64px;background:var(--bg);color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;line-height:1.6;font-size:15px}
  .doc{max-width:860px;margin:0 auto}
  h1{font-size:30px;letter-spacing:-.02em;margin:0 0 4px}
  h2{font-size:19px;margin:38px 0 12px;padding-bottom:7px;border-bottom:2px solid var(--rule)}
  h3{font-size:15px;margin:20px 0 6px}
  .sub{color:var(--muted);font-size:13px;margin:0 0 26px}
  table{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:12.5px;color:var(--muted);font-weight:600;background:var(--sunk)}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;border-top:2px solid var(--rule);border-bottom:0}
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;vertical-align:middle}
  ul{margin:6px 0;padding-left:20px}li{margin:2px 0}
  .members{columns:2;column-gap:26px;font-size:14px}
  .kv{display:grid;grid-template-columns:120px 1fr;gap:4px 14px;font-size:14px;margin:10px 0}
  .kv dt{color:var(--muted)}.kv dd{margin:0}
  .idea{border-left:3px solid var(--line);padding:2px 0 2px 14px;margin:16px 0}
  .idea .meta{color:var(--muted);font-size:12.5px}
  .idea blockquote{margin:6px 0;color:var(--ink2);font-size:14px;white-space:pre-wrap}
  .cmt{font-size:13px;color:var(--ink2)}
  .tag{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid;font-weight:600;white-space:nowrap}
  .chk{list-style:none;padding:0}
  .chk li{padding:3px 0}.chk .done{color:var(--muted);text-decoration:line-through}
  .note{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
  .empty{color:var(--muted);font-size:14px}
  @media print{body{padding:0;font-size:11.5pt}h2{page-break-after:avoid}
    table,.idea,.members{page-break-inside:avoid}@page{margin:16mm}}
  @media (max-width:560px){.members{columns:1}.kv{grid-template-columns:1fr}body{padding:20px 14px 40px}}
  `);
  H.push('</style></head><body><div class="doc">');

  H.push('<h1>' + e(r.title) + '</h1>');
  H.push('<p class="sub">미니TF 스튜디오 · ' + e(r.generatedAt) + ' 생성</p>');

  H.push('<h2>1. 개요</h2><dl class="kv">');
  H.push('<dt>일시</dt><dd>' + e(r.date || '미정') + ' ' + e(r.start) + ' ~ ' + e(r.end) + ' (' + e(fmtDur(r.minutes)) + ')</dd>');
  H.push('<dt>대상</dt><dd>본사 ' + r.hq + '명 + 파견 ' + r.field + '명 = ' + r.total + '명</dd>');
  H.push('<dt>예상 참석</dt><dd><b>' + r.expected + '명</b> <span class="empty">(참석률 ' + e(r.rate) + '% 가정)</span></dd>');
  H.push('<dt>조 정원</dt><dd>' + r.capacity + '석 · 배정 ' + r.assigned + '명</dd>');
  H.push('<dt>예상 예산</dt><dd><b>' + won(r.budgetTotal) + '</b>' +
    (r.expected ? ' <span class="empty">· 1인당 ' + won(r.budgetTotal / r.expected) + '</span>' : '') +
    (r.budgetCap ? ' <span class="empty">/ 상한 ' + won(r.budgetCap) + '</span>' : '') + '</dd>');
  if (r.tf.length) H.push('<dt>TF</dt><dd>' + e(r.tf.join(', ')) + '</dd>');
  H.push('</dl>');

  H.push('<h2>2. 타임테이블</h2>');
  if (r.agenda.length) {
    H.push('<div class="scroll"><table><thead><tr><th>시간</th><th>구분</th><th>내용</th><th class="num">소요</th></tr></thead><tbody>');
    r.agenda.forEach(a => H.push('<tr><td>' + a.from + '–' + a.to + '</td><td>' + e(a.type) + '</td><td>' +
      e(a.label) + '</td><td class="num">' + a.min + '분</td></tr>'));
    H.push('</tbody><tfoot><tr><td colspan="3">총 소요</td><td class="num">' + e(fmtDur(r.minutes)) + '</td></tr></tfoot></table></div>');
  } else H.push('<p class="empty">아직 없음</p>');

  H.push('<h2>3. 조 편성</h2>');
  if (r.teams.length) {
    H.push('<div class="scroll"><table><thead><tr><th>조</th><th class="num">인원</th><th class="num">본사</th><th class="num">파견</th><th class="num">1인 단가</th><th class="num">활동비</th></tr></thead><tbody>');
    r.teams.forEach(t => H.push('<tr><td>' + dot(t.slot) + e(t.emoji + ' ' + t.name) + '</td><td class="num">' +
      t.count + '/' + t.capacity + '</td><td class="num">' + t.hq + '</td><td class="num">' + t.field +
      '</td><td class="num">' + won(t.unitCost) + '</td><td class="num">' + won(t.cost) + '</td></tr>'));
    H.push('</tbody></table></div>');
    r.teams.forEach(t => {
      H.push('<h3>' + dot(t.slot) + e(t.emoji + ' ' + t.name) + ' <span class="empty">' + t.count + '/' + t.capacity + '명</span></h3>');
      H.push(t.members.length
        ? '<ul class="members">' + t.members.map(m => '<li>' + e(m.nick) + ' <span class="empty">(' + e(m.org) + ')</span></li>').join('') + '</ul>'
        : '<p class="empty">배정된 인원 없음</p>');
    });
    if (r.unassigned.length) {
      H.push('<h3>미배정 <span class="empty">' + r.unassigned.length + '명</span></h3>');
      H.push('<ul class="members">' + r.unassigned.map(m => '<li>' + e(m.nick) + ' <span class="empty">(' + e(m.org) + ')</span></li>').join('') + '</ul>');
    }
  } else H.push('<p class="empty">아직 없음</p>');

  H.push('<h2>4. 예산</h2>');
  if (r.budgetRows.length) {
    H.push('<div class="scroll"><table><thead><tr><th>항목</th><th>산식</th><th class="num">금액</th></tr></thead><tbody>');
    r.budgetRows.forEach(b => H.push('<tr><td>' + e(b.label) + '</td><td class="empty">' + e(b.detail) +
      '</td><td class="num">' + won(b.amount) + '</td></tr>'));
    H.push('</tbody><tfoot><tr><td colspan="2">합계</td><td class="num">' + won(r.budgetTotal) + '</td></tr>');
    if (r.expected) H.push('<tr><td colspan="2" class="empty" style="font-weight:400">1인당</td><td class="num empty" style="font-weight:400">' + won(r.budgetTotal / r.expected) + '</td></tr>');
    H.push('</tfoot></table></div>');
    if (r.budgetCap) H.push('<p class="empty">상한 ' + won(r.budgetCap) + ' 대비 ' +
      Math.round(r.budgetTotal / r.budgetCap * 100) + '%' +
      (r.budgetTotal > r.budgetCap ? ' — ' + won(r.budgetTotal - r.budgetCap) + ' 초과' : '') + '</p>');
  } else H.push('<p class="empty">아직 없음</p>');

  H.push('<h2>5. 준비물 · 할 일</h2>');
  if (r.checks.length) {
    H.push('<ul class="chk">' + r.checks.map(c => '<li class="' + (c.done ? 'done' : '') + '">' +
      (c.done ? '☑' : '☐') + ' ' + e(c.task) + ' <span class="empty">— ' + e(c.owner) +
      (c.due ? ' (~' + e(c.due) + ')' : '') + '</span></li>').join('') + '</ul>');
    H.push('<p class="empty">완료 ' + r.checkDone + ' / ' + r.checks.length + '건</p>');
  } else H.push('<p class="empty">아직 없음</p>');

  H.push('<h2>6. 아이디어 <span class="empty" style="font-size:13px;font-weight:400">투표순</span></h2>');
  if (r.ideas.length) {
    r.ideas.forEach((x, i) => {
      H.push('<div class="idea"><h3>' + (i + 1) + '. ' + e(x.title) +
        ' <span class="tag" style="color:' + cols(x.slot) + ';border-color:' + cols(x.slot) + '">' + e(x.tag) + '</span></h3>');
      H.push('<div class="meta">👍 ' + x.up + ' · 🤔 ' + x.concern + ' · 제안 ' + e(x.author) + '</div>');
      if (x.desc) H.push('<blockquote>' + e(x.desc) + '</blockquote>');
      if (x.comments.length) H.push('<ul>' + x.comments.map(c =>
        '<li class="cmt"><b>' + e(c.nick) + '</b> ' + e(c.text) + '</li>').join('') + '</ul>');
      H.push('</div>');
    });
  } else H.push('<p class="empty">아직 없음</p>');

  H.push('<p class="note">참가자는 익명 닉네임으로만 관리합니다. 사내 문서로 옮길 때 실명 매핑이 필요하면 별도로 관리하세요.</p>');
  H.push('</div></body></html>');
  return H.join('\n');
}

function download(name, text, mime) {
  const blob = new Blob(['﻿' + text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function reportFilename(ext) {
  const r = S();
  const base = ('워크숍기획서-' + (r.title || '워크숍') + '-' + (r.date || new Date().toISOString().slice(0, 10)))
    .replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  return base + '.' + ext;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-dl]'); if (!b) return;
  const kind = b.dataset.dl;
  try {
    if (kind === 'md')   { download(reportFilename('md'), reportMarkdown(), 'text/markdown'); toast('기획서 MD를 저장했습니다'); }
    if (kind === 'html') { download(reportFilename('html'), reportHtml(), 'text/html'); toast('기획서 HTML을 저장했습니다'); }
    if (kind === 'copy') { copy(reportMarkdown()); }
  } catch (err) { toast('내보내기 실패: ' + err.message, true); }
});

/* JSON 백업 / 복원 */
$('#btn-export').addEventListener('click', () => {
  const out = { _app: 'minitf-studio', _v: 1, room: Store.room, exportedAt: new Date().toISOString(), settings: S() };
  COLLS.forEach(c => out[c] = Store.state[c] || {});
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'minitf-' + Store.room + '-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const obj = JSON.parse(rd.result);
      if (!confirm('현재 보드를 이 파일 내용으로 덮어씁니다. 계속할까요?')) return;
      Store.replaceAll(obj);
      toast('가져왔습니다');
    } catch (err) { toast('파일을 읽지 못했습니다: ' + err.message, true); }
  };
  rd.readAsText(f);
  e.target.value = '';
});

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('이 방의 모든 데이터를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
  Store.replaceAll({ settings: S() });
  toast('보드를 비웠습니다');
});

/* 시작 템플릿 */
function seed() {
  const now = nowTs();
  const teams = [
    ['🎳', '볼링조', 12, 18000], ['🍜', '라면 원정대', 10, 12000], ['📷', '사진 산책조', 10, 5000],
    ['🎲', '보드게임조', 8, 15000], ['☕', '카페 투어조', 8, 12000]
  ];
  const agenda = [
    ['오프닝 · 타운홀', 50, 'all'], ['아이스브레이킹', 30, 'all'], ['조별 이동', 20, 'move'],
    ['테마 조 활동', 120, 'group'], ['석식 장소 이동', 20, 'move'], ['다 같이 석식', 90, 'meal']
  ];
  const ideas = [
    ['조 이름 셀프 작명 대결', '조별로 이름과 한 줄 구호를 직접 만들고 타운홀에서 공개', 'townhall'],
    ['파견-본사 랜덤 짝꿍 인터뷰', '3분씩 서로 인터뷰하고 상대를 대신 소개해주기', 'townhall'],
    ['조별 인증샷 미션', '활동 중 정해진 미션 사진을 단톡방에 올리기 (경쟁 아님)', 'activity'],
    ['석식은 조별 자리 섞기', '활동 조와 다른 조합으로 앉아 한 번 더 섞기', 'food']
  ];
  const checks = [
    ['장소·시간 확정 및 공지', 14], ['조별 예약 (볼링/식당)', 10], ['참석 여부 조사', 12],
    ['타운홀 자료 준비', 5], ['상품·다과 구매', 4], ['당일 진행 시나리오 정리', 2]
  ];
  const budget = [['다과 · 음료', 6000, 'perPerson'], ['상품 · 굿즈', 300000, 'fixed'], ['석식', 35000, 'perPerson']];

  const map = {};
  teams.forEach((t, i)  => map['teams/' + uid()]  = { emoji: t[0], name: t[1], capacity: t[2], unitCost: t[3], order: i, createdAt: now + i });
  agenda.forEach((a, i) => map['agenda/' + uid()] = { label: a[0], minutes: a[1], type: a[2], order: i, createdAt: now + i });
  ideas.forEach((x, i)  => map['ideas/' + uid()]  = { title: x[0], desc: x[1], tag: x[2], author: '템플릿', createdAt: now + i });
  budget.forEach((b, i) => map['budget/' + uid()] = { label: b[0], amount: b[1], type: b[2], createdAt: now + i });
  checks.forEach((c, i) => {
    const due = new Date(); due.setDate(due.getDate() + (14 - c[1]) + 7);
    map['checklist/' + uid()] = { task: c[0], owner: '', due: due.toISOString().slice(0, 10), done: false, createdAt: now + i };
  });
  const s = S();
  ['title', 'startTime', 'hq', 'field', 'rate'].forEach(k => map['settings/' + k] = s[k]);
  if (!s.cap) map['settings/cap'] = 2500000;
  Store.update(map);
  toast('시작 템플릿을 불러왔습니다');
}
$('#btn-seed').addEventListener('click', seed);
$('#btn-seed2').addEventListener('click', () => {
  const empty = COLLS.every(c => !Object.keys(Store.state[c] || {}).length);
  if (!empty && !confirm('기존 항목 위에 템플릿을 더합니다. 계속할까요?')) return;
  seed();
});

/* 테마 */
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(LS.get('theme', 'auto'));
$('#btn-theme').addEventListener('click', () => {
  const cur = LS.get('theme', 'auto');
  const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
  LS.set('theme', next); applyTheme(next);
  toast('테마: ' + ({ auto: '시스템 설정', light: '라이트', dark: '다크' })[next]);
});

/* 방 공유 */
$('#btn-share').addEventListener('click', () => {
  const url = location.origin + location.pathname + '#room=' + encodeURIComponent(Store.room);
  copy(url);
  if (Store.mode === 'local') toast('링크를 복사했습니다 (지금은 로컬 모드 — 설정에서 Firebase를 연결해야 공유됩니다)', true);
});

/* 닉네임 변경 */
$('#btn-me').addEventListener('click', () => {
  const v = prompt('닉네임', ME.nick || '');
  if (v === null) return;
  const n = v.trim().slice(0, 12);
  if (!n) return;
  ME.nick = n; LS.set('nick', n);
  if (Store.mode === 'live') { try { Store._ref.child('presence/' + ME.id + '/nick').set(n); } catch (e) {} }
  if (USER) { try { firebase.database().ref('users/' + USER.uid + '/nick').set(n); } catch (e) {} }
  render();
});

/* ═══ 10. 인증 (Firebase Auth) ═════════════════════════════════
   아이디 kian → 내부적으로 kian@minitf.local 계정으로 로그인합니다.
   비밀번호는 Firebase가 보관하며 이 코드는 절대 저장하지 않습니다.
   ═════════════════════════════════════════════════════════════ */

const ID_DOMAIN = 'minitf.local';
const DEFAULT_ROOM = 'minitf';
let AUTH = null;        /* firebase.auth() — Firebase 연결 시에만 */
let USER = null;        /* 로그인한 사용자 */
let pendingPw = '';     /* 최초 비밀번호 변경 시 재인증용. 메모리에만 두고 즉시 지웁니다 */
let pwForced = false;

const emailOf = id => id.indexOf('@') >= 0 ? id.trim() : id.trim().toLowerCase() + '@' + ID_DOMAIN;
const idOf = email => String(email || '').split('@')[0];
const safeRoom = r => String(r || '').trim().replace(/[.#$\[\]\/\s]/g, '-').slice(0, 24) || DEFAULT_ROOM;

function authMsg(e) {
  const c = (e && e.code) || '';
  if (/wrong-password|user-not-found|invalid-credential|invalid-login/.test(c)) return '아이디 또는 비밀번호가 맞지 않습니다.';
  if (c === 'auth/invalid-email')          return '아이디 형식이 올바르지 않습니다.';
  if (c === 'auth/too-many-requests')      return '시도가 너무 많습니다. 잠시 후 다시 시도하세요.';
  if (c === 'auth/network-request-failed') return '네트워크에 연결하지 못했습니다. 사내망에서 차단되었을 수 있습니다.';
  if (c === 'auth/weak-password')          return '비밀번호는 6자 이상이어야 합니다.';
  if (c === 'auth/requires-recent-login')  return '보안을 위해 다시 로그인한 뒤 변경해주세요.';
  if (c === 'auth/operation-not-allowed')  return 'Firebase 콘솔 → Authentication 에서 “이메일/비밀번호”를 사용 설정해야 합니다.';
  return (e && e.message) || '알 수 없는 오류';
}

function showPanel(name) {
  $('#gate').hidden = !name;
  $$('#gate .panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (name === 'login') setTimeout(() => $('#lg-id').focus(), 50);
  if (name === 'pw')    setTimeout(() => $($('#pw-cur-wrap').hidden ? '#pw-new' : '#pw-cur').focus(), 50);
  if (name === 'local') setTimeout(() => $('#ob-nick').focus(), 50);
}
function gateErr(sel, msg) { const el = $(sel); el.hidden = !msg; el.textContent = msg || ''; }

/* --- 로그인 --- */
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#lg-id').value.trim(), pw = $('#lg-pw').value;
  if (!id || !pw) return gateErr('#lg-err', '아이디와 비밀번호를 모두 입력하세요.');
  gateErr('#lg-err', '');
  const btn = $('#lg-go'); btn.disabled = true; btn.textContent = '로그인 중…';
  /* onAuthStateChanged 가 아래 await 보다 먼저 발화하므로 반드시 호출 전에 담아둔다.
     최초 1회 비밀번호 변경의 재인증에만 쓰고, 변경 즉시 지운다. */
  pendingPw = pw;
  try {
    await AUTH.signInWithEmailAndPassword(emailOf(id), pw);
    $('#lg-pw').value = '';
  } catch (err) {
    pendingPw = '';
    gateErr('#lg-err', authMsg(err));
  } finally { btn.disabled = false; btn.textContent = '로그인'; }
});

async function onSignedIn(user) {
  USER = user;
  ME.id = user.uid;
  const myId = idOf(user.email);
  let prof = {};
  try { prof = (await firebase.database().ref('users/' + user.uid).once('value')).val() || {}; }
  catch (err) {
    toast('DB 접근 권한이 없습니다. 보안 규칙을 README대로 넣었는지 확인하세요.', true);
  }
  ME.nick = prof.nick || myId;
  LS.set('nick', ME.nick);
  if (!prof.pwChanged) { openPwPanel(true); return; }   /* 초기 비밀번호 → 변경 강제 */
  enterApp();
}

/* --- 비밀번호 변경 --- */
function openPwPanel(forced) {
  pwForced = !!forced;
  $('#pw-lead').textContent = forced
    ? '처음 로그인하셨네요. 초기 비밀번호를 본인만 아는 것으로 바꿔주세요.'
    : '비밀번호를 변경합니다.';
  $('#pw-cur-wrap').hidden = !!(forced && pendingPw);
  $('#pw-skip').hidden = !!forced;
  $('#pw-cur').value = ''; $('#pw-new').value = ''; $('#pw-new2').value = '';
  gateErr('#pw-err', '');
  showPanel('pw');
}

$('#pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  const cur = $('#pw-cur-wrap').hidden ? pendingPw : $('#pw-cur').value;
  const a = $('#pw-new').value, b = $('#pw-new2').value;
  if (!cur)          return gateErr('#pw-err', '현재 비밀번호를 입력하세요.');
  if (a.length < 8)  return gateErr('#pw-err', '새 비밀번호는 8자 이상으로 정해주세요.');
  if (a !== b)       return gateErr('#pw-err', '새 비밀번호가 서로 다릅니다.');
  if (a === cur)     return gateErr('#pw-err', '지금 쓰는 비밀번호와 다른 것으로 바꿔주세요.');
  gateErr('#pw-err', '');
  const btn = $('#pw-go'); btn.disabled = true; btn.textContent = '변경 중…';
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(USER.email, cur);
    await USER.reauthenticateWithCredential(cred);
    await USER.updatePassword(a);
    await firebase.database().ref('users/' + USER.uid)
      .update({ pwChanged: true, nick: ME.nick, id: idOf(USER.email), updatedAt: nowTs() });
    pendingPw = '';
    toast('비밀번호를 변경했습니다');
    enterApp();
  } catch (err) { gateErr('#pw-err', authMsg(err)); }
  finally { btn.disabled = false; btn.textContent = '변경하기'; }
});
$('#pw-skip').addEventListener('click', () => { if (!pwForced) enterApp(); });

/* --- 로그아웃 --- */
function logout() {
  if (!AUTH) return;
  if (!confirm('로그아웃할까요?')) return;
  try { if (Store._ref) Store._ref.child('presence/' + ME.id).remove(); } catch (e) {}
  AUTH.signOut().then(() => location.reload(), e => toast('로그아웃 실패: ' + e.message, true));
}
$('#btn-logout').addEventListener('click', logout);
$('#btn-logout2').addEventListener('click', logout);
$('#btn-pw').addEventListener('click', () => openPwPanel(false));

/* --- 방 이동 --- */
function goRoom(r) {
  const clean = safeRoom(r);
  LS.set('room', clean);
  try { history.replaceState(null, '', '#room=' + encodeURIComponent(clean)); } catch (e) {}
  return clean;
}
function currentRoom() {
  const h = (location.hash.match(/room=([^&]+)/) || [])[1];
  return goRoom(h ? decodeURIComponent(h) : (LS.get('room', '') || DEFAULT_ROOM));
}
$('#btn-room-go').addEventListener('click', () => {
  const r = goRoom($('#st-room').value);
  Store.connect(r, !!USER); render();
  toast('방 “' + r + '” 으로 이동했습니다');
});

/* --- 진입 --- */
function enterApp() {
  showPanel(null);
  Store.connect(currentRoom(), !!USER);
  render();
}

function boot() {
  $('#idea-tag').innerHTML = TAGS.map(t => '<option value="' + t.id + '">' + t.label + '</option>').join('');
  $('#idea-tag').value = 'activity';

  const cfg = fbConfig();
  if (cfg && typeof firebase === 'undefined') {
    setTimeout(() => toast('Firebase SDK를 불러오지 못했습니다(사내망 차단 가능). 로컬 모드로 동작합니다.', true), 500);
  }
  if (cfg && cfg.databaseURL && typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      AUTH = firebase.auth();
      showPanel('login');
      AUTH.onAuthStateChanged(u => { if (u) onSignedIn(u); else { USER = null; showPanel('login'); } });
      return;
    } catch (e) {
      console.error(e); AUTH = null;
      toast('Firebase 초기화 실패: ' + e.message, true);
    }
  }
  /* Firebase 미설정 → 로그인 없이 로컬 모드 */
  if (ME.nick) { enterApp(); return; }
  $('#ob-nick').value = '';
  $('#ob-room').value = LS.get('room', '') || DEFAULT_ROOM;
  showPanel('local');
}

$('#ob-room-gen').addEventListener('click', () => { $('#ob-room').value = 'minitf-' + uid().slice(0, 6); });
$('#ob-start').addEventListener('click', () => {
  const n = $('#ob-nick').value.trim().slice(0, 12);
  if (!n) return toast('닉네임을 입력해주세요.', true);
  ME.nick = n; LS.set('nick', n);
  goRoom($('#ob-room').value);
  enterApp();
});
$('#ob-nick').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ob-start').click(); });
$('#ob-room').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ob-start').click(); });

boot();
window.MiniTF = { Store: Store, derived: derived, seed: seed };   /* 콘솔 디버그용 */

})();

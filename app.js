import { firebaseConfig } from './firebase-config.js';

const PERSONS = ['nina', 'robert', 'zusammen'];
const PERSON_LABEL = { nina: 'Nina', robert: 'Robert', zusammen: 'Zusammen' };
const REPEATS = ['none', 'weekly', 'monthly', 'yearly'];
const EMOJIS = ['❤️', '🎉', '🎂', '🥂', '✈️', '🏖️', '⛰️', '🚆', '🍽️', '☕', '🎬', '🎵',
  '⚽', '🏃', '🧘', '🚴', '💼', '📚', '🏥', '🦷', '🛒', '🏠', '🚗', '🎁', '👨‍👩‍👧', '🐶', '🎄', '⭐'];
const DAY_MS = 86400000;

// ?demo forces demo mode (local test data only) - handy for trying things out without touching the real calendar
const forceDemo = new URLSearchParams(location.search).has('demo');
const isDemo = forceDemo || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'DEIN_API_KEY';
document.getElementById('demo-banner').hidden = !isDemo;

// ---- Small helpers ----
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('nrk.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('nrk.' + key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  },
};

const pad2 = (n) => String(n).padStart(2, '0');

function dateToLocalISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeToLocal(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dateTimeToLocalISO(d) {
  return `${dateToLocalISO(d)}T${timeToLocal(d)}`;
}

function todayISO() {
  return dateToLocalISO(new Date());
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToLocalISO(new Date(y, m - 1, d + days));
}

function dayDiff(a, b) {
  // whole calendar days from a to b, DST-safe
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

// Parses "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm" as *local* time (never UTC)
function parseLocal(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (m && !/(Z|[+-]\d{2}:?\d{2})$/.test(str)) {
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

const fmtWeekdayDate = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLongDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function normalizeEvent(raw) {
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    person: PERSONS.includes(raw.person) ? raw.person : 'zusammen',
    allDay: !!raw.allDay,
    start: raw.start,
    end: raw.end || null,
    emoji: typeof raw.emoji === 'string' ? raw.emoji : '',
    location: typeof raw.location === 'string' ? raw.location : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    repeat: REPEATS.includes(raw.repeat) ? raw.repeat : 'none',
  };
}

function displayTitle(e) {
  return (e.emoji ? e.emoji + ' ' : '') + (e.title || '(ohne Titel)');
}

// ---- Recurrence ----
function shiftByPeriod(base, repeat, k) {
  if (repeat === 'weekly') return addDays(base, 7 * k);
  const months = base.getMonth() + (repeat === 'monthly' ? k : 12 * k);
  const y = base.getFullYear() + Math.floor(months / 12);
  const m = ((months % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate(); // clamp 31st -> 30th/28th, 29 Feb -> 28 Feb
  return new Date(y, m, Math.min(base.getDate(), lastDay), base.getHours(), base.getMinutes());
}

// All occurrences of an event that overlap [rangeStart, rangeEnd)
function occurrences(e, rangeStart, rangeEnd) {
  const start = parseLocal(e.start);
  if (!start) return [];
  let end = parseLocal(e.end);
  if (!end || end < start) end = e.allDay ? addDays(start, 1) : new Date(start.getTime() + 3600000);
  if (e.allDay && end <= start) end = addDays(start, 1);

  const spanDays = Math.max(1, dayDiff(start, end));
  const durationMs = end - start;
  const makeEnd = (s) => (e.allDay ? addDays(s, spanDays) : new Date(s.getTime() + durationMs));
  const overlaps = (s, en) => s < rangeEnd && Math.max(en, s.getTime() + 1) > rangeStart;

  if (e.repeat === 'none') return overlaps(start, end) ? [{ start, end, k: 0 }] : [];

  let k = 0;
  if (rangeStart > start) {
    if (e.repeat === 'weekly') k = Math.floor(dayDiff(start, rangeStart) / 7) - Math.ceil(spanDays / 7) - 1;
    else if (e.repeat === 'monthly') {
      k = (rangeStart.getFullYear() - start.getFullYear()) * 12 + rangeStart.getMonth() - start.getMonth()
        - Math.ceil(spanDays / 28) - 1;
    } else k = rangeStart.getFullYear() - start.getFullYear() - Math.ceil(spanDays / 365) - 1;
    k = Math.max(0, k);
  }

  const out = [];
  for (let guard = 0; guard < 2000; guard++, k++) {
    const s = shiftByPeriod(start, e.repeat, k);
    if (s >= rangeEnd) break;
    const en = makeEnd(s);
    if (overlaps(s, en)) out.push({ start: s, end: en, k });
  }
  return out;
}

// ---- German public holidays (nationwide) ----
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function holidaysForYear(y) {
  const easter = easterSunday(y);
  return [
    [new Date(y, 0, 1), 'Neujahr'],
    [addDays(easter, -2), 'Karfreitag'],
    [addDays(easter, 1), 'Ostermontag'],
    [new Date(y, 4, 1), 'Tag der Arbeit'],
    [addDays(easter, 39), 'Christi Himmelfahrt'],
    [addDays(easter, 50), 'Pfingstmontag'],
    [new Date(y, 9, 3), 'Tag der Dt. Einheit'],
    [new Date(y, 11, 25), '1. Weihnachtstag'],
    [new Date(y, 11, 26), '2. Weihnachtstag'],
  ];
}

function holidayEvents(rangeStart, rangeEnd) {
  const out = [];
  for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
    for (const [date, name] of holidaysForYear(y)) {
      if (date >= rangeStart && date < rangeEnd) {
        out.push({
          id: 'holiday-' + dateToLocalISO(date),
          title: name,
          start: date,
          allDay: true,
          display: 'background',
          classNames: ['holiday'],
          editable: false,
        });
      }
    }
  }
  return out;
}

// ---- State ----
let events = [];
const savedFilters = store.get('filters', PERSONS);
let activePersons = new Set(PERSONS.filter((p) => (Array.isArray(savedFilters) ? savedFilters : PERSONS).includes(p)));
let db = null; // { add, update, remove, restore }

function buildCalendarEvents(rangeStart, rangeEnd) {
  const out = [];
  for (const e of events) {
    if (!activePersons.has(e.person)) continue;
    const recurring = e.repeat !== 'none';
    for (const occ of occurrences(e, rangeStart, rangeEnd)) {
      out.push({
        id: occ.k ? `${e.id}::${occ.k}` : e.id,
        title: displayTitle(e),
        start: occ.start,
        end: occ.end,
        allDay: e.allDay,
        classNames: ['ev-' + e.person].concat(recurring ? ['is-recurring'] : []),
        editable: !recurring,
        extendedProps: { baseId: e.id, location: e.location, notes: e.notes, person: e.person },
      });
    }
  }
  return out.concat(holidayEvents(rangeStart, rangeEnd));
}

function onDataChanged() {
  calendar.refetchEvents();
  renderSidebar();
}

// ---- Sync status ----
const syncEl = document.getElementById('sync-status');
function setSync(state) {
  const labels = {
    connecting: ['Verbinde …', 'Verbindung wird aufgebaut'],
    live: ['Live', 'Synchronisiert – Änderungen erscheinen sofort bei euch beiden'],
    offline: ['Offline', 'Offline – Änderungen werden übertragen, sobald wieder Internet da ist'],
    demo: ['Demo', 'Demo-Modus – nichts wird gespeichert'],
  };
  syncEl.className = 'sync ' + state;
  syncEl.querySelector('.sync-label').textContent = labels[state][0];
  syncEl.title = labels[state][1];
}

// ---- Toast ----
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const toastAction = document.getElementById('toast-action');
let toastTimer = null;
let toastHandler = null;

function toast(message, { actionLabel, onAction, error = false, duration } = {}) {
  clearTimeout(toastTimer);
  toastText.textContent = message;
  toastEl.classList.toggle('error', error);
  toastHandler = onAction || null;
  toastAction.hidden = !actionLabel;
  toastAction.textContent = actionLabel || '';
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; toastHandler = null; }, duration || (actionLabel ? 6000 : 2600));
}

toastAction.addEventListener('click', () => {
  const fn = toastHandler;
  toastEl.hidden = true;
  toastHandler = null;
  clearTimeout(toastTimer);
  if (fn) fn();
});

function reportWriteError(err) {
  console.error('Speichern fehlgeschlagen:', err);
  toast('Konnte nicht gespeichert werden. Bitte nochmal versuchen.', { error: true, duration: 5000 });
}

// ---- Data layer ----
function initDemo() {
  const t = new Date();
  const iso = (days) => dateToLocalISO(addDays(t, days));
  events = [
    { id: 'demo1', title: 'Kino-Abend', emoji: '🎬', person: 'zusammen', start: `${iso(0)}T20:00`, end: `${iso(0)}T22:30`, allDay: false, location: 'Kino am Markt' },
    { id: 'demo2', title: 'Fußball', emoji: '⚽', person: 'robert', start: `${iso(1)}T18:30`, end: `${iso(1)}T20:00`, allDay: false, repeat: 'weekly' },
    { id: 'demo3', title: 'Yoga', emoji: '🧘', person: 'nina', start: `${iso(2)}T07:30`, end: `${iso(2)}T08:30`, allDay: false },
    { id: 'demo4', title: 'Wochenende am See', emoji: '🏖️', person: 'zusammen', start: iso(12), end: iso(15), allDay: true, notes: 'Badesachen nicht vergessen' },
    { id: 'demo5', title: 'Jahrestag', emoji: '❤️', person: 'zusammen', start: iso(40), end: iso(41), allDay: true, repeat: 'yearly' },
  ].map(normalizeEvent);

  let n = 0;
  db = {
    add: async (data) => { events.push(normalizeEvent({ id: 'demo-new-' + (++n), ...data })); onDataChanged(); },
    update: async (id, patch) => {
      events = events.map((e) => (e.id === id ? normalizeEvent({ ...e, ...patch }) : e));
      onDataChanged();
    },
    remove: async (id) => { events = events.filter((e) => e.id !== id); onDataChanged(); },
    restore: async (id, data) => { events.push(normalizeEvent({ id, ...data })); onDataChanged(); },
  };
  setSync('demo');
  onDataChanged();
}

async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
  const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

  const app = initializeApp(firebaseConfig);
  let firestore;
  try {
    // Offline cache: calendar opens instantly and works without signal, syncs when back online
    firestore = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Offline-Cache nicht verfügbar, nutze Standard:', err);
    firestore = fs.getFirestore(app);
  }
  const auth = getAuth(app);
  const eventsCol = fs.collection(firestore, 'events');

  try {
    await signInAnonymously(auth);
  } catch (err) {
    // Offline start: cached data can still be shown, the listener retries once online
    console.warn('Anonyme Anmeldung fehlgeschlagen:', err);
  }

  fs.onSnapshot(eventsCol, { includeMetadataChanges: true }, (snap) => {
    events = snap.docs.map((d) => normalizeEvent({ id: d.id, ...d.data() }));
    setSync(snap.metadata.fromCache ? 'offline' : 'live');
    onDataChanged();
  }, (err) => {
    console.error('Firestore-Listener:', err);
    setSync('offline');
    toast('Verbindung zur Datenbank fehlgeschlagen.', { error: true, duration: 5000 });
  });

  db = {
    add: (data) => fs.addDoc(eventsCol, data),
    update: (id, patch) => fs.updateDoc(fs.doc(firestore, 'events', id), patch),
    remove: (id) => fs.deleteDoc(fs.doc(firestore, 'events', id)),
    restore: (id, data) => fs.setDoc(fs.doc(firestore, 'events', id), data),
  };
}

// ---- Calendar ----
const VIEWS = ['timeGridWeek', 'dayGridMonth', 'multiMonthYear', 'listMonth'];
const savedView = store.get('view', 'dayGridMonth');

const calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
  locale: 'de',
  initialView: VIEWS.includes(savedView) ? savedView : 'dayGridMonth',
  firstDay: 1,
  height: 'auto',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridWeek,dayGridMonth,multiMonthYear,listMonth',
  },
  buttonText: { today: 'Heute', month: 'Monat', week: 'Woche', list: 'Liste' },
  allDayText: 'Ganztägig',
  noEventsText: 'Keine Termine in diesem Zeitraum',
  views: {
    multiMonthYear: { type: 'multiMonth', duration: { years: 1 }, buttonText: 'Jahr', multiMonthMaxColumns: 3 },
    timeGridWeek: { height: 760, scrollTime: '07:00:00' },
    listMonth: { buttonText: 'Liste' },
  },
  weekNumbers: true,
  nowIndicator: true,
  dayMaxEvents: 4,
  eventDisplay: 'block',
  eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  selectable: true,
  selectMirror: true,
  editable: true,
  longPressDelay: 400,
  eventSources: [{
    id: 'main',
    events: (info, success) => success(buildCalendarEvents(info.start, info.end)),
  }],
  select: (info) => {
    calendar.unselect();
    openFromRange(info.start, info.end, info.allDay);
  },
  dateClick: (info) => {
    // Taps on touch screens only fire dateClick (select needs a long press); openFromRange ignores duplicates
    const end = info.allDay ? addDays(info.date, 1) : new Date(info.date.getTime() + 3600000);
    openFromRange(info.date, end, info.allDay);
  },
  eventClick: (info) => {
    info.jsEvent.preventDefault();
    const base = events.find((e) => e.id === info.event.extendedProps.baseId);
    if (base) openModal(base);
  },
  eventDrop: persistMove,
  eventResize: persistMove,
  eventDidMount: (info) => {
    const { location: loc, notes } = info.event.extendedProps;
    if (info.event.display === 'background') return;
    info.el.title = [info.event.title, loc && '📍 ' + loc, notes].filter(Boolean).join('\n');
    if (loc && info.view.type.startsWith('list')) {
      const titleEl = info.el.querySelector('.fc-list-event-title');
      if (titleEl) {
        const span = document.createElement('span');
        span.className = 'fc-event-loc';
        span.textContent = ' · ' + loc;
        titleEl.appendChild(span);
      }
    }
  },
  datesSet: (info) => store.set('view', info.view.type),
});
calendar.render();

function persistMove(info) {
  const ev = info.event;
  const baseId = ev.extendedProps.baseId;
  const orig = events.find((e) => e.id === baseId);
  if (!orig || orig.repeat !== 'none') { info.revert(); return; }

  let start, end;
  if (ev.allDay) {
    start = dateToLocalISO(ev.start);
    end = ev.end ? dateToLocalISO(ev.end) : addDaysToDateStr(start, 1);
  } else {
    start = dateTimeToLocalISO(ev.start);
    end = dateTimeToLocalISO(ev.end || new Date(ev.start.getTime() + 3600000));
  }
  const before = { allDay: orig.allDay, start: orig.start, end: orig.end || null };
  db.update(baseId, { allDay: ev.allDay, start, end }).catch(reportWriteError);
  toast(`„${orig.title}“ verschoben`, {
    actionLabel: 'Rückgängig',
    onAction: () => db.update(baseId, before).catch(reportWriteError),
  });
}

// ---- Sidebar: countdown + upcoming ----
const countdownEl = document.getElementById('countdown');
const upcomingList = document.getElementById('upcoming-list');
const upcomingEmpty = document.getElementById('upcoming-empty');
let countdownEvent = null;

function describeTime(e, occ) {
  if (e.allDay) {
    const lastDay = addDays(occ.end, -1);
    return dayDiff(occ.start, lastDay) > 0 ? `Ganztägig · bis ${fmtWeekdayDate.format(lastDay)}` : 'Ganztägig';
  }
  if (occ.end.getTime() === occ.start.getTime()) return timeToLocal(occ.start);
  return dayDiff(occ.start, occ.end) === 0
    ? `${timeToLocal(occ.start)}–${timeToLocal(occ.end)}`
    : `${timeToLocal(occ.start)} – ${fmtWeekdayDate.format(occ.end)} ${timeToLocal(occ.end)}`;
}

function dayLabel(date, today) {
  const diff = dayDiff(today, date);
  if (diff < 0) return 'Läuft gerade';
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return fmtWeekdayDate.format(date);
}

function renderSidebar() {
  const now = new Date();
  const today = startOfDay(now);

  // Upcoming (next 60 days, respects filters)
  const horizon = addDays(today, 61);
  const upcoming = [];
  for (const e of events) {
    if (!activePersons.has(e.person)) continue;
    for (const occ of occurrences(e, now, horizon)) upcoming.push({ e, occ });
  }
  upcoming.sort((a, b) => a.occ.start - b.occ.start || a.e.title.localeCompare(b.e.title));

  upcomingList.replaceChildren();
  let lastLabel = null;
  for (const { e, occ } of upcoming.slice(0, 10)) {
    const label = dayLabel(occ.start, today);
    if (label !== lastLabel) {
      const li = document.createElement('li');
      li.className = 'upcoming-day';
      li.textContent = label;
      upcomingList.appendChild(li);
      lastLabel = label;
    }
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'upcoming-item ev-' + e.person;
    btn.innerHTML = '<span class="upcoming-bar"></span><span class="upcoming-body"><span class="upcoming-title"></span><span class="upcoming-meta"></span></span>';
    btn.querySelector('.upcoming-title').textContent = displayTitle(e);
    btn.querySelector('.upcoming-title').style.display = 'block';
    const meta = [describeTime(e, occ)];
    if (e.person !== 'zusammen') meta.push(PERSON_LABEL[e.person]);
    if (e.location) meta.push('📍 ' + e.location);
    const metaEl = btn.querySelector('.upcoming-meta');
    metaEl.textContent = meta.join(' · ');
    metaEl.style.display = 'block';
    btn.addEventListener('click', () => openModal(e));
    li.appendChild(btn);
    upcomingList.appendChild(li);
  }
  upcomingEmpty.hidden = upcoming.length > 0;

  // Countdown: next shared event that isn't a weekly routine
  let best = null;
  const yearAhead = addDays(today, 400);
  for (const e of events) {
    if (e.person !== 'zusammen' || e.repeat === 'weekly') continue;
    for (const occ of occurrences(e, today, yearAhead)) {
      if (occ.start < today) continue;
      if (!best || occ.start < best.occ.start) best = { e, occ };
      break; // occurrences are chronological
    }
  }
  countdownEvent = best ? best.e : null;
  countdownEl.hidden = !best;
  if (best) {
    const days = dayDiff(today, best.occ.start);
    document.getElementById('countdown-title').textContent = displayTitle(best.e);
    document.getElementById('countdown-num').textContent = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : `${days}`;
    document.getElementById('countdown-unit').textContent = days > 1 ? 'Tage' : '';
    document.getElementById('countdown-date').textContent = fmtLongDate.format(best.occ.start)
      + (best.e.allDay ? '' : ` · ${timeToLocal(best.occ.start)} Uhr`);
  }
}

countdownEl.addEventListener('click', () => { if (countdownEvent) openModal(countdownEvent); });

// ---- Filters ----
document.querySelectorAll('.filters .chip').forEach((chip) => {
  const person = chip.dataset.person;
  chip.setAttribute('aria-pressed', String(activePersons.has(person)));
  chip.addEventListener('click', () => {
    if (activePersons.has(person)) activePersons.delete(person);
    else activePersons.add(person);
    chip.setAttribute('aria-pressed', String(activePersons.has(person)));
    store.set('filters', [...activePersons]);
    onDataChanged();
  });
});

// ---- Modal ----
const overlay = document.getElementById('modal-overlay');
const heading = document.getElementById('modal-heading');
const fTitle = document.getElementById('f-title');
const fPerson = document.getElementById('f-person');
const fAllDay = document.getElementById('f-allday');
const fStartDate = document.getElementById('f-start-date');
const fStartTime = document.getElementById('f-start-time');
const fEndDate = document.getElementById('f-end-date');
const fEndTime = document.getElementById('f-end-time');
const fRepeat = document.getElementById('f-repeat');
const fLocation = document.getElementById('f-location');
const fNotes = document.getElementById('f-notes');
const startTimeWrap = document.getElementById('f-start-time-wrap');
const endTimeWrap = document.getElementById('f-end-time-wrap');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const deleteBtn = document.getElementById('delete-btn');
const duplicateBtn = document.getElementById('duplicate-btn');
const saveBtn = document.getElementById('save-btn');
const formError = document.getElementById('form-error');

let editingId = null;
let currentPerson = 'zusammen';
let currentEmoji = '';
let lastStartDate = '';

const isModalOpen = () => !overlay.hidden;

function setPerson(p) {
  currentPerson = PERSONS.includes(p) ? p : 'zusammen';
  fPerson.querySelectorAll('.seg').forEach((b) => {
    const on = b.dataset.value === currentPerson;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

fPerson.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => setPerson(b.dataset.value)));
fPerson.addEventListener('keydown', (ev) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  ev.preventDefault();
  const i = PERSONS.indexOf(currentPerson);
  const next = PERSONS[(i + (ev.key === 'ArrowRight' ? 1 : PERSONS.length - 1)) % PERSONS.length];
  setPerson(next);
  fPerson.querySelector(`[data-value="${next}"]`).focus();
});

// Emoji picker
function setEmoji(em) {
  currentEmoji = em || '';
  emojiBtn.textContent = currentEmoji || '＋';
  emojiBtn.classList.toggle('has-emoji', !!currentEmoji);
  emojiPicker.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b.dataset.emoji === currentEmoji));
}

function toggleEmojiPicker(show) {
  emojiPicker.hidden = !show;
  emojiBtn.setAttribute('aria-expanded', String(show));
}

(() => {
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'emoji-none';
  none.dataset.emoji = '';
  none.textContent = 'Kein';
  emojiPicker.appendChild(none);
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.emoji = em;
    b.textContent = em;
    b.setAttribute('aria-label', 'Symbol ' + em);
    emojiPicker.appendChild(b);
  }
  emojiPicker.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    setEmoji(b.dataset.emoji);
    toggleEmojiPicker(false);
    fTitle.focus();
  });
  emojiBtn.addEventListener('click', () => toggleEmojiPicker(emojiPicker.hidden));
})();

function defaultStartTime(dateStr) {
  if (dateStr === todayISO()) {
    const h = new Date().getHours() + 1;
    if (h >= 8 && h <= 23) return `${pad2(h)}:00`;
  }
  return '19:00';
}

function fillTimesIfEmpty() {
  if (fAllDay.checked) return;
  if (!fStartTime.value) fStartTime.value = defaultStartTime(fStartDate.value);
  if (!fEndTime.value) fEndTime.value = addMinutesToTime(fStartTime.value, 60);
}

function updateTimeVisibility() {
  const hide = fAllDay.checked;
  startTimeWrap.hidden = hide;
  endTimeWrap.hidden = hide;
}

function fillForm(e) {
  fTitle.value = e.title || '';
  setPerson(e.person);
  setEmoji(e.emoji);
  fAllDay.checked = !!e.allDay;
  fRepeat.value = e.repeat || 'none';
  fLocation.value = e.location || '';
  fNotes.value = e.notes || '';
  const start = parseLocal(e.start) || new Date();
  let end = parseLocal(e.end);
  fStartDate.value = dateToLocalISO(start);
  if (e.allDay) {
    // Stored all-day "end" is exclusive -> show the inclusive last day in the form
    fEndDate.value = end && end > start ? dateToLocalISO(addDays(end, -1)) : fStartDate.value;
    fStartTime.value = '';
    fEndTime.value = '';
  } else {
    if (!end || end < start) end = start;
    fStartTime.value = timeToLocal(start);
    fEndDate.value = dateToLocalISO(end);
    fEndTime.value = timeToLocal(end);
  }
}

function openModal(existing, defaults) {
  if (!db) return;
  formError.hidden = true;
  toggleEmojiPicker(false);
  if (existing) {
    editingId = existing.id;
    heading.textContent = existing.repeat !== 'none' ? 'Serie bearbeiten' : 'Termin bearbeiten';
    deleteBtn.hidden = false;
    duplicateBtn.hidden = false;
    fillForm(existing);
  } else {
    editingId = null;
    heading.textContent = 'Neuer Termin';
    deleteBtn.hidden = true;
    duplicateBtn.hidden = true;
    const d = defaults || {};
    fillForm({
      title: '',
      person: store.get('lastPerson', 'zusammen'),
      allDay: d.allDay !== false,
      start: d.start || todayISO(),
      end: d.end || null,
      repeat: 'none',
    });
    fillTimesIfEmpty();
  }
  lastStartDate = fStartDate.value;
  updateTimeVisibility();
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  if (!existing) fTitle.focus();
}

function openFromRange(start, end, allDay) {
  if (isModalOpen()) return;
  if (allDay) {
    openModal(null, { allDay: true, start: dateToLocalISO(start), end: dateToLocalISO(end) });
  } else {
    openModal(null, { allDay: false, start: dateTimeToLocalISO(start), end: dateTimeToLocalISO(end) });
  }
}

function closeModal() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  editingId = null;
  toggleEmojiPicker(false);
}

fAllDay.addEventListener('change', () => {
  fillTimesIfEmpty();
  updateTimeVisibility();
});

fStartDate.addEventListener('change', () => {
  if (!fStartDate.value) return;
  // Keep the event's length when moving the start date
  const span = lastStartDate && fEndDate.value ? dayDiff(parseLocal(lastStartDate), parseLocal(fEndDate.value)) : 0;
  fEndDate.value = addDaysToDateStr(fStartDate.value, Math.max(0, span));
  lastStartDate = fStartDate.value;
});

fStartTime.addEventListener('change', () => {
  if (!fStartTime.value) return;
  if (fEndDate.value === fStartDate.value && (!fEndTime.value || fEndTime.value <= fStartTime.value)) {
    fEndTime.value = addMinutesToTime(fStartTime.value, 60);
  }
});

function showError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function readForm() {
  const title = fTitle.value.trim();
  if (!title) return showError('Bitte einen Titel eingeben.');
  if (!fStartDate.value) return showError('Bitte ein Datum wählen.');
  const allDay = fAllDay.checked;
  const endDate = fEndDate.value || fStartDate.value;

  let start, end;
  if (allDay) {
    if (endDate < fStartDate.value) return showError('Das Ende liegt vor dem Beginn.');
    start = fStartDate.value;
    // FullCalendar all-day "end" is exclusive -> add one day so the chosen end date is included
    end = addDaysToDateStr(endDate, 1);
  } else {
    if (!fStartTime.value) return showError('Bitte eine Uhrzeit wählen.');
    start = `${fStartDate.value}T${fStartTime.value}`;
    end = `${endDate}T${fEndTime.value || addMinutesToTime(fStartTime.value, 60)}`;
    if (parseLocal(end) < parseLocal(start)) return showError('Das Ende liegt vor dem Beginn.');
  }

  return {
    title,
    person: currentPerson,
    allDay,
    start,
    end,
    emoji: currentEmoji,
    repeat: REPEATS.includes(fRepeat.value) ? fRepeat.value : 'none',
    location: fLocation.value.trim(),
    notes: fNotes.value.trim(),
  };
}

function save() {
  if (!isModalOpen()) return;
  const data = readForm();
  if (!data) return;
  store.set('lastPerson', data.person);
  const id = editingId;
  closeModal();
  // Don't block the UI on the server round trip - Firestore shows local changes immediately
  (id ? db.update(id, data) : db.add(data)).catch(reportWriteError);
  toast(id ? 'Änderungen gespeichert' : 'Termin eingetragen ✓');
}

document.getElementById('add-btn').addEventListener('click', () => openModal(null));
document.getElementById('fab').addEventListener('click', () => openModal(null));
document.getElementById('cancel-btn').addEventListener('click', closeModal);
document.getElementById('close-btn').addEventListener('click', closeModal);
saveBtn.addEventListener('click', save);
overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });

deleteBtn.addEventListener('click', () => {
  const orig = events.find((e) => e.id === editingId);
  if (!orig) return;
  const { id, ...data } = orig;
  closeModal();
  db.remove(id).catch(reportWriteError);
  toast(`„${orig.title}“ gelöscht`, {
    actionLabel: 'Rückgängig',
    onAction: () => db.restore(id, data).catch(reportWriteError),
  });
});

duplicateBtn.addEventListener('click', () => {
  const data = readForm();
  if (!data) return;
  editingId = null;
  heading.textContent = 'Kopie anlegen';
  deleteBtn.hidden = true;
  duplicateBtn.hidden = true;
  fTitle.focus();
});

document.addEventListener('keydown', (ev) => {
  if (isModalOpen()) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (!emojiPicker.hidden) toggleEmojiPicker(false);
      else closeModal();
    } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      save();
    } else if (ev.key === 'Enter' && (ev.target === fTitle || ev.target === fLocation)) {
      ev.preventDefault();
      save();
    }
    return;
  }
  const typing = ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]');
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'n') { ev.preventDefault(); openModal(null); }
  else if (ev.key === 't') calendar.today();
  else if (ev.key === 'ArrowLeft') calendar.prev();
  else if (ev.key === 'ArrowRight') calendar.next();
});

// Keep "today" correct when the app stays open overnight / is resumed from the home screen
let renderedDay = todayISO();
function checkDayChange() {
  if (todayISO() === renderedDay) return;
  renderedDay = todayISO();
  calendar.render();
  onDataChanged();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
setInterval(() => { checkDayChange(); renderSidebar(); }, 5 * 60 * 1000);

// ---- Start ----
if (isDemo) {
  initDemo();
} else {
  setSync('connecting');
  initFirebase().catch((err) => {
    console.error('Firebase-Initialisierung fehlgeschlagen:', err);
    const banner = document.getElementById('demo-banner');
    banner.hidden = false;
    banner.textContent = 'Verbindung zu Firebase fehlgeschlagen – bitte Seite neu laden. Angezeigte Termine sind nur Beispiele.';
    initDemo();
  });
}

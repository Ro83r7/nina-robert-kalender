import { firebaseConfig } from './firebase-config.js';

const PERSON_COLORS = { nina: '#ec4899', robert: '#3b82f6', zusammen: '#22c55e' };
const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'DEIN_API_KEY';
document.getElementById('demo-banner').hidden = !isDemo;

let events = [];
let fb = null; // { addEvent, updateEvent, deleteEvent }

function dateToLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayISO() {
  return dateToLocalISO(new Date());
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToLocalISO(new Date(y, m - 1, d + days));
}

async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
  const {
    getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
  const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  const eventsCol = collection(db, 'events');

  await signInAnonymously(auth);

  onSnapshot(eventsCol, (snap) => {
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEvents();
  });

  fb = {
    addEvent: (data) => addDoc(eventsCol, data),
    updateEvent: (id, data) => updateDoc(doc(db, 'events', id), data),
    deleteEvent: (id) => deleteDoc(doc(db, 'events', id)),
  };
}

function loadDemoEvents() {
  events = [
    { id: 'demo1', title: 'Beispiel: Kino-Abend', person: 'zusammen', start: todayISO(), allDay: true },
    { id: 'demo2', title: 'Beispiel: Fußball', person: 'robert', start: todayISO(), allDay: true },
  ];
  renderEvents();
}

function toCalendarEvent(e) {
  return {
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end || undefined,
    allDay: !!e.allDay,
    backgroundColor: PERSON_COLORS[e.person] || PERSON_COLORS.zusammen,
    borderColor: PERSON_COLORS[e.person] || PERSON_COLORS.zusammen,
    extendedProps: { person: e.person },
  };
}

function renderEvents() {
  calendar.removeAllEvents();
  events.forEach((e) => calendar.addEvent(toCalendarEvent(e)));
}

const calendarEl = document.getElementById('calendar');
const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'dayGridMonth',
  locale: 'de',
  firstDay: 1,
  height: 'auto',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridWeek,dayGridMonth,multiMonthYear',
  },
  buttonText: { today: 'Heute', month: 'Monat', week: 'Woche' },
  allDayText: 'Ganztägig',
  views: {
    multiMonthYear: { type: 'multiMonth', duration: { years: 1 }, buttonText: 'Jahr', multiMonthMaxColumns: 3 },
  },
  selectable: true,
  select: (info) => openModal(null, { start: info.startStr, end: info.endStr, allDay: info.allDay }),
  eventClick: (info) => {
    const e = events.find((ev) => ev.id === info.event.id);
    if (e) openModal(e);
  },
  windowResize: () => {
    calendar.setOption('multiMonthMaxColumns', window.innerWidth < 700 ? 1 : 3);
  },
});
calendar.render();

if (isDemo) {
  loadDemoEvents();
} else {
  initFirebase().catch((err) => {
    console.error('Firebase-Initialisierung fehlgeschlagen:', err);
    document.getElementById('demo-banner').hidden = false;
    document.getElementById('demo-banner').textContent =
      'Firebase-Verbindung fehlgeschlagen (siehe Konsole). Prüfe firebase-config.js und die Firestore-Regeln.';
    loadDemoEvents();
  });
}

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
const startTimeWrap = document.getElementById('f-start-time-wrap');
const endTimeWrap = document.getElementById('f-end-time-wrap');
const deleteBtn = document.getElementById('delete-btn');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const formError = document.getElementById('form-error');

let editingId = null;

function splitDateTime(iso, fallbackAllDay) {
  if (!iso) return { date: '', time: '' };
  if (fallbackAllDay || iso.length <= 10) return { date: iso.slice(0, 10), time: '' };
  const d = new Date(iso);
  const date = dateToLocalISO(d);
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

function openModal(existing, defaults) {
  formError.hidden = true;
  deleteArmed = false;
  deleteBtn.textContent = 'Löschen';
  if (existing) {
    editingId = existing.id;
    heading.textContent = 'Termin bearbeiten';
    deleteBtn.hidden = false;
    fTitle.value = existing.title || '';
    fPerson.value = existing.person || 'zusammen';
    fAllDay.checked = !!existing.allDay;
    const s = splitDateTime(existing.start, existing.allDay);
    fStartDate.value = s.date;
    fStartTime.value = s.time;
    const e = splitDateTime(existing.end, existing.allDay);
    // Stored all-day "end" is exclusive -> show the inclusive last day in the form
    fEndDate.value = existing.allDay ? addDaysToDateStr(e.date || s.date, -1) : (e.date || s.date);
    fEndTime.value = e.time;
  } else {
    editingId = null;
    heading.textContent = 'Neuer Termin';
    deleteBtn.hidden = true;
    fTitle.value = '';
    fPerson.value = 'zusammen';
    const d = defaults || {};
    fAllDay.checked = d.allDay !== false;
    const start = (d.start || todayISO()).slice(0, 10);
    fStartDate.value = start;
    fStartTime.value = '';
    fEndDate.value = start;
    fEndTime.value = '';
  }
  updateTimeVisibility();
  overlay.hidden = false;
  fTitle.focus();
}

function closeModal() {
  overlay.hidden = true;
  editingId = null;
}

function updateTimeVisibility() {
  const hide = fAllDay.checked;
  startTimeWrap.style.display = hide ? 'none' : 'flex';
  endTimeWrap.style.display = hide ? 'none' : 'flex';
}

fAllDay.addEventListener('change', updateTimeVisibility);
fStartDate.addEventListener('change', () => { fEndDate.value = fStartDate.value; });
document.getElementById('add-btn').addEventListener('click', () => openModal(null));
cancelBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

let deleteArmed = false;
deleteBtn.addEventListener('click', async () => {
  if (!editingId) return;
  if (!deleteArmed) {
    deleteArmed = true;
    deleteBtn.textContent = 'Wirklich löschen?';
    setTimeout(() => { deleteArmed = false; deleteBtn.textContent = 'Löschen'; }, 3000);
    return;
  }
  deleteArmed = false;
  deleteBtn.textContent = 'Löschen';
  if (isDemo) {
    events = events.filter((e) => e.id !== editingId);
    renderEvents();
  } else {
    await fb.deleteEvent(editingId);
  }
  closeModal();
});

saveBtn.addEventListener('click', async () => {
  const title = fTitle.value.trim();
  if (!title) {
    formError.textContent = 'Bitte einen Titel eingeben.';
    formError.hidden = false;
    return;
  }
  if (!fStartDate.value) {
    formError.textContent = 'Bitte ein Start-Datum wählen.';
    formError.hidden = false;
    return;
  }
  const allDay = fAllDay.checked;
  const endDate = fEndDate.value || fStartDate.value;

  let start, end;
  if (allDay) {
    start = fStartDate.value;
    // FullCalendar all-day "end" is exclusive -> add one day so the chosen end date is included
    end = addDaysToDateStr(endDate, 1);
  } else {
    start = `${fStartDate.value}T${fStartTime.value || '00:00'}`;
    end = `${endDate}T${fEndTime.value || fStartTime.value || '23:59'}`;
  }

  if (new Date(end) < new Date(start)) {
    formError.textContent = 'Das Ende liegt vor dem Start.';
    formError.hidden = false;
    return;
  }

  const data = { title, person: fPerson.value, allDay, start, end };

  if (isDemo) {
    if (editingId) {
      events = events.map((e) => (e.id === editingId ? { ...e, ...data } : e));
    } else {
      events.push({ id: 'demo-' + Date.now(), ...data });
    }
    renderEvents();
  } else if (editingId) {
    await fb.updateEvent(editingId, data);
  } else {
    await fb.addEvent(data);
  }
  closeModal();
});

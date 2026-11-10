/* =====================================================================
   Clinic portal — Dr. Khalil Chidiac
   Local-first: all records live in this browser, encrypted with
   AES-256-GCM using a key derived from the doctor's passphrase
   (PBKDF2-SHA256). Nothing is sent to any server.
   ===================================================================== */
(() => {
"use strict";

/* ---------------- constants ---------------- */
const STORE_KEY = "kc-portal-v1";
const AUTO_LOCK_MIN = 15;
const LOCATIONS = ["Bikfaya clinic", "Antelias clinic", "Video", "Hospital"];
const HOSPITALS = ["Abou Jaoude Hospital", "Haroun Hospital", "Lebanese Geitaoui University Hospital", "Serhal Hospital", "Bsalim Hospital", "Other"];
const PROCEDURES = ["Gastroscopy", "Colonoscopy", "Gastroscopy + colonoscopy", "Intragastric balloon – placement", "Intragastric balloon – removal", "Band ligation", "Polypectomy", "Other"];
const STATUSES = [
  ["scheduled", "Scheduled", ""], ["checked-in", "Checked in", "warn"], ["in-room", "In the room", "blue"],
  ["done", "Seen", "ok"], ["no-show", "No-show", "bad"], ["cancelled", "Cancelled", ""]
];
// Typical adult reference ranges — every lab differs; ranges are editable per result.
const LABS = {
  "ALT":              { unit: "U/L",     lo: 7,    hi: 56 },
  "AST":              { unit: "U/L",     lo: 10,   hi: 40 },
  "ALP":              { unit: "U/L",     lo: 44,   hi: 147 },
  "GGT":              { unit: "U/L",     lo: 9,    hi: 48 },
  "Total bilirubin":  { unit: "mg/dL",   lo: 0.1,  hi: 1.2 },
  "Albumin":          { unit: "g/dL",    lo: 3.5,  hi: 5.0 },
  "INR":              { unit: "",        lo: 0.8,  hi: 1.2 },
  "Platelets":        { unit: "×10³/µL", lo: 150,  hi: 400 },
  "Hemoglobin":       { unit: "g/dL",    lo: 12,   hi: 17.5 },
  "Ferritin":         { unit: "ng/mL",   lo: 20,   hi: 250 },
  "CRP":              { unit: "mg/L",    lo: 0,    hi: 5 },
  "Fecal calprotectin": { unit: "µg/g",  lo: 0,    hi: 50 },
  "Lipase":           { unit: "U/L",     lo: 0,    hi: 160 },
  "Creatinine":       { unit: "mg/dL",   lo: 0.6,  hi: 1.2 },
  "HbA1c":            { unit: "%",       lo: 4,    hi: 5.6 },
  "HBV DNA":          { unit: "IU/mL",   lo: 0,    hi: 20 },
  "HCV RNA":          { unit: "IU/mL",   lo: 0,    hi: 15 }
};

/* ---------------- tiny helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = parse(s); d.setMonth(d.getMonth() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOWS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const fmtDate = s => { if (!s) return "—"; const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtShort = s => { const d = parse(s); return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
const age = dob => { if (!dob) return ""; const b = parse(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const fullName = p => p ? `${p.firstName} ${p.lastName}`.trim() : "Unknown patient";
const initials = p => p ? ((p.firstName[0] || "") + (p.lastName[0] || "")).toUpperCase() : "?";
const relDays = s => { const n = daysBetween(today(), s); if (n === 0) return "today"; if (n === 1) return "tomorrow"; if (n === -1) return "yesterday"; return n > 0 ? `in ${n} days` : `${-n} days ago`; };
const flag = l => (l.refLow !== "" && l.refLow != null && +l.value < +l.refLow) ? "lo" : (l.refHigh !== "" && l.refHigh != null && +l.value > +l.refHigh) ? "hi" : "n";

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------------- crypto ---------------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(obj, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { app: "kc-portal", v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function open(env, pass) {
  const salt = unb64(env.salt), key = await deriveKey(pass, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
  return { data: JSON.parse(dec.decode(pt)), key, salt };
}

/* ---------------- store ---------------- */
const empty = () => ({ patients: [], appointments: [], visits: [], labs: [], meds: [], procedures: [] });
let DB = null, KEY = null, SALT = null;
async function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(await seal(DB, KEY, SALT))); }
  catch (e) { alert("Could not save: " + e.message + "\nExport a backup from Backup & settings."); }
}
const byPatient = (coll, id) => DB[coll].filter(x => x.patientId === id);
const patient = id => DB.patients.find(p => p.id === id);
function upsert(coll, rec) { const i = DB[coll].findIndex(x => x.id === rec.id); if (i >= 0) DB[coll][i] = rec; else DB[coll].push(rec); return save(); }
function remove(coll, id) { DB[coll] = DB[coll].filter(x => x.id !== id); return save(); }

/* ---------------- lock / unlock ---------------- */
function showLock() {
  DB = null; KEY = null;
  $("#app").hidden = true; $("#lock").hidden = false;
  const setup = !localStorage.getItem(STORE_KEY);
  $("#lock-title").textContent = setup ? "Set up the clinic portal" : "Welcome back, Doctor";
  $("#lock-sub").textContent = setup ? "Choose a passphrase (at least 8 characters). It encrypts every record on this device." : "Enter your passphrase to unlock patient records.";
  $("#lock-confirm-wrap").hidden = !setup;
  $("#lock-confirm").required = setup;
  $("#lock-btn").textContent = setup ? "Create portal" : "Unlock";
  $("#lock-err").textContent = "";
  $("#lock-pass").value = ""; $("#lock-confirm").value = "";
  setTimeout(() => $("#lock-pass").focus(), 50);
}
$("#lock-form").addEventListener("submit", async e => {
  e.preventDefault();
  const pass = $("#lock-pass").value, err = $("#lock-err"), btn = $("#lock-btn");
  err.textContent = "";
  if (!crypto.subtle) { err.textContent = "This page must be opened over https (e.g. GitHub Pages) for encryption to work."; return; }
  const stored = localStorage.getItem(STORE_KEY);
  btn.disabled = true; const label = btn.textContent; btn.textContent = "Working…";
  try {
    if (!stored) {
      if (pass.length < 8) throw new Error("Use at least 8 characters.");
      if (pass !== $("#lock-confirm").value) throw new Error("The two passphrases don't match.");
      SALT = crypto.getRandomValues(new Uint8Array(16));
      KEY = await deriveKey(pass, SALT);
      DB = empty();
      await save();
    } else {
      try { const r = await open(JSON.parse(stored), pass); DB = Object.assign(empty(), r.data); KEY = r.key; SALT = r.salt; }
      catch { throw new Error("Wrong passphrase."); }
    }
    $("#lock").hidden = true; $("#app").hidden = false;
    armAutoLock(); route();
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; btn.textContent = label; }
});
$("#lock-now").addEventListener("click", () => { location.hash = "#/"; showLock(); });
let idleT;
function armAutoLock() { clearTimeout(idleT); if (DB) idleT = setTimeout(() => { if ($("#modal").open) $("#modal").close(); showLock(); }, AUTO_LOCK_MIN * 60000); }
["click", "keydown", "pointermove", "scroll"].forEach(ev => addEventListener(ev, armAutoLock, { passive: true }));

/* ---------------- modal form ---------------- */
function field(f, v) {
  const id = "f-" + f.name, req = f.required ? "required" : "", val = v ?? f.default ?? "";
  const cls = f.full ? "fld full" : "fld";
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : "";
  if (f.type === "select") {
    const opts = f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? "selected" : ""}>${esc(ol)}</option>`; }).join("");
    return `<label class="${cls}" for="${id}">${esc(f.label)}<select id="${id}" name="${f.name}" ${req}>${opts}</select>${hint}</label>`;
  }
  if (f.type === "textarea") return `<label class="${cls}" for="${id}">${esc(f.label)}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea>${hint}</label>`;
  if (f.type === "password") return `<label class="${cls}" for="${id}">${esc(f.label)}<input id="${id}" name="${f.name}" type="password" ${req} autocomplete="off">${hint}</label>`;
  if (f.type === "file") return `<label class="${cls}" for="${id}">${esc(f.label)}<input id="${id}" name="${f.name}" type="file" accept="${esc(f.accept || "")}" ${req}>${hint}</label>`;
  return `<label class="${cls}" for="${id}">${esc(f.label)}<input id="${id}" name="${f.name}" type="${f.type || "text"}" value="${esc(val)}" ${req} ${f.step ? `step="${f.step}"` : ""} placeholder="${esc(f.placeholder || "")}" ${f.list ? `list="${id}-list"` : ""}>${f.list ? `<datalist id="${id}-list">${f.list.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : ""}${hint}</label>`;
}
function form({ title, fields, values = {}, okLabel = "Save", onSave, onDelete, onInput, intro = "" }) {
  const dlg = $("#modal"), body = $("#modal-body");
  $("#modal-title").textContent = title;
  body.innerHTML = (intro ? `<div class="notice" style="margin-bottom:14px">${intro}</div>` : "") + `<div class="form-grid">${fields.map(f => field(f, values[f.name])).join("")}</div>`;
  $("#modal-ok").textContent = okLabel;
  $("#modal-del").hidden = !onDelete;
  const frm = $("#modal-form");
  const close = () => dlg.close();
  $("#modal-x").onclick = close; $("#modal-cancel").onclick = close;
  $("#modal-del").onclick = async () => { if (confirm("Delete this record? This can't be undone.")) { await onDelete(); close(); route(); toast("Deleted"); } };
  frm.oninput = frm.onchange = onInput ? e => onInput(e, frm) : null;
  frm.onsubmit = async e => {
    e.preventDefault();
    if (!frm.reportValidity()) return;
    const data = {};
    fields.forEach(f => { const el = frm.elements[f.name]; data[f.name] = f.type === "file" ? el.files[0] : el.value.trim(); });
    const ok = await onSave(data);
    if (ok !== false) { close(); route(); }
  };
  dlg.showModal();
  const first = body.querySelector("input,select,textarea"); if (first) first.focus();
}

/* ---------------- record forms ---------------- */
const patientOptions = () => DB.patients.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => [p.id, fullName(p)]);

function editPatient(p) {
  const isNew = !p; p = p || { id: uid(), createdAt: today() };
  form({
    title: isNew ? "New patient" : "Edit patient",
    values: p,
    fields: [
      { name: "firstName", label: "First name", required: true },
      { name: "lastName", label: "Last name", required: true },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "sex", label: "Sex", type: "select", options: ["", "Female", "Male"] },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Address / town", full: true },
      { name: "bloodType", label: "Blood type", type: "select", options: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { name: "insurance", label: "Insurance / NSSF" },
      { name: "allergies", label: "Allergies", full: true, placeholder: "e.g. Penicillin — leave empty if none known" },
      { name: "conditions", label: "Main conditions", full: true, hint: "Separate with commas", placeholder: "e.g. GERD, Fatty liver" },
      { name: "emergency", label: "Emergency contact", full: true },
      { name: "notes", label: "Background notes", type: "textarea", full: true, placeholder: "Past history, surgeries, family history, smoking/alcohol…" }
    ],
    onSave: async d => { Object.assign(p, d); await upsert("patients", p); toast(isNew ? "Patient added" : "Saved"); if (isNew) location.hash = `#/patient/${p.id}`; },
    onDelete: isNew ? null : async () => {
      ["appointments", "visits", "labs", "meds", "procedures"].forEach(c => DB[c] = DB[c].filter(x => x.patientId !== p.id));
      await remove("patients", p.id); location.hash = "#/patients";
    }
  });
}
function editAppointment(a, preset = {}) {
  if (!DB.patients.length) { toast("Add a patient first"); return editPatient(); }
  const isNew = !a; a = a || { id: uid(), status: "scheduled", date: today(), time: "09:00", location: LOCATIONS[0], ...preset };
  form({
    title: isNew ? "New appointment" : "Edit appointment", values: a,
    fields: [
      { name: "patientId", label: "Patient", type: "select", options: patientOptions(), required: true, full: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "time", label: "Time", type: "time", required: true },
      { name: "location", label: "Location", type: "select", options: LOCATIONS },
      { name: "status", label: "Status", type: "select", options: STATUSES.map(s => [s[0], s[1]]) },
      { name: "reason", label: "Reason", full: true, placeholder: "e.g. Follow-up, colonoscopy results" }
    ],
    onSave: async d => { Object.assign(a, d); await upsert("appointments", a); toast("Appointment saved"); },
    onDelete: isNew ? null : () => remove("appointments", a.id)
  });
}
function editVisit(v, pid) {
  const isNew = !v; v = v || { id: uid(), patientId: pid, date: today() };
  form({
    title: isNew ? "New visit note" : "Edit visit note", values: v,
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "type", label: "Type", type: "select", options: ["In clinic", "Video", "Hospital", "Phone"] },
      { name: "reason", label: "Reason for visit", full: true, required: true, placeholder: "e.g. Epigastric pain for 3 weeks" },
      { name: "discussion", label: "What was discussed / history", type: "textarea", full: true, rows: 4 },
      { name: "findings", label: "Examination & findings", type: "textarea", full: true },
      { name: "plan", label: "Plan & next steps", type: "textarea", full: true }
    ],
    onSave: async d => { Object.assign(v, d); await upsert("visits", v); toast("Note saved"); },
    onDelete: isNew ? null : () => remove("visits", v.id)
  });
}
function editLab(l, pid, presetTest) {
  const isNew = !l;
  const t0 = presetTest && LABS[presetTest] ? presetTest : "ALT";
  l = l || { id: uid(), patientId: pid, date: today(), test: t0, unit: LABS[t0].unit, refLow: LABS[t0].lo, refHigh: LABS[t0].hi };
  form({
    title: isNew ? "Add lab result" : "Edit lab result", values: l,
    fields: [
      { name: "test", label: "Test", required: true, list: Object.keys(LABS), hint: "Pick from the list or type any test name" },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "value", label: "Result", type: "number", step: "any", required: true },
      { name: "unit", label: "Unit" },
      { name: "refLow", label: "Normal range – low", type: "number", step: "any" },
      { name: "refHigh", label: "Normal range – high", type: "number", step: "any", hint: "Use the range on the lab's report" },
      { name: "comment", label: "Comment", full: true }
    ],
    onInput: (e, frm) => {
      if (e.target.name !== "test") return;
      const c = LABS[e.target.value]; if (!c) return;
      frm.elements.unit.value = c.unit; frm.elements.refLow.value = c.lo; frm.elements.refHigh.value = c.hi;
    },
    onSave: async d => { Object.assign(l, d, { value: +d.value }); await upsert("labs", l); toast(flag(l) === "n" ? "Result saved" : "Saved — result is out of range"); },
    onDelete: isNew ? null : () => remove("labs", l.id)
  });
}
function editMed(m, pid) {
  const isNew = !m; m = m || { id: uid(), patientId: pid, start: today(), active: "yes" };
  form({
    title: isNew ? "Add medication" : "Edit medication", values: m,
    fields: [
      { name: "name", label: "Medicine", required: true, full: true },
      { name: "dose", label: "Dose", placeholder: "e.g. 40 mg" },
      { name: "frequency", label: "How often", placeholder: "e.g. once daily before breakfast" },
      { name: "indication", label: "Prescribed for" },
      { name: "start", label: "Start date", type: "date" },
      { name: "active", label: "Status", type: "select", options: [["yes", "Active"], ["no", "Stopped"]] },
      { name: "end", label: "Stop date", type: "date" },
      { name: "notes", label: "Notes", full: true, placeholder: "Side effects, reason stopped…" }
    ],
    onSave: async d => { Object.assign(m, d); if (m.active === "no" && !m.end) m.end = today(); await upsert("meds", m); toast("Medication saved"); },
    onDelete: isNew ? null : () => remove("meds", m.id)
  });
}
function editProcedure(pr, pid) {
  const isNew = !pr; pr = pr || { id: uid(), patientId: pid, date: today(), type: PROCEDURES[0], hospital: HOSPITALS[0] };
  form({
    title: isNew ? "Add procedure" : "Edit procedure", values: pr,
    fields: [
      { name: "type", label: "Procedure", type: "select", options: PROCEDURES },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "hospital", label: "Hospital", type: "select", options: HOSPITALS, full: true },
      { name: "indication", label: "Indication", full: true },
      { name: "findings", label: "Findings", type: "textarea", full: true },
      { name: "biopsy", label: "Biopsy / pathology", type: "textarea", full: true, rows: 2 },
      { name: "followUp", label: "Next follow-up / surveillance", type: "date", hint: "Shows on the dashboard when due" }
    ],
    onSave: async d => { Object.assign(pr, d); await upsert("procedures", pr); toast("Procedure saved"); },
    onDelete: isNew ? null : () => remove("procedures", pr.id)
  });
}

/* ---------------- shared render bits ---------------- */
const statusMeta = s => STATUSES.find(x => x[0] === s) || STATUSES[0];
const statusSelect = a => `<select class="status" data-status="${a.id}" aria-label="Status for ${esc(fullName(patient(a.patientId)))}">${STATUSES.map(s => `<option value="${s[0]}" ${s[0] === a.status ? "selected" : ""}>${s[1]}</option>`).join("")}</select>`;
const chip = (txt, cls = "") => `<span class="chip ${cls}">${esc(txt)}</span>`;
const empt = t => `<div class="empty">${esc(t)}</div>`;
const plusIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const chevron = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A5B74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

function apptItem(a, showDate) {
  const p = patient(a.patientId);
  return `<div class="item">
    <span class="t">${esc(a.time)}</span>
    <span class="avatar">${esc(initials(p))}</span>
    <a class="who" href="#/patient/${a.patientId}" style="text-decoration:none;color:inherit"><strong>${esc(fullName(p))}</strong><span>${showDate ? esc(fmtDate(a.date)) + " · " : ""}${esc(a.reason || "Consultation")} · ${esc(a.location)}</span></a>
    ${statusSelect(a)}
    <button class="icon-btn" data-act="edit-appt" data-id="${a.id}" aria-label="Edit appointment"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
  </div>`;
}

function sparkSVG(rows) {
  const W = 320, H = 120, P = 14;
  const vals = rows.map(r => +r.value), last = rows[rows.length - 1];
  const lo = last.refLow === "" || last.refLow == null ? null : +last.refLow, hi = last.refHigh === "" || last.refHigh == null ? null : +last.refHigh;
  let min = Math.min(...vals, lo ?? Infinity), max = Math.max(...vals, hi ?? -Infinity);
  if (!isFinite(min)) min = Math.min(...vals); if (!isFinite(max)) max = Math.max(...vals);
  const span = (max - min) || Math.abs(max) || 1; min -= span * .12; max += span * .12;
  const y = v => P + (H - 2 * P) * (1 - (v - min) / (max - min));
  const x = i => rows.length === 1 ? W / 2 : P + i * (W - 2 * P) / (rows.length - 1);
  const band = (lo != null || hi != null) ? `<rect x="0" y="${y(hi ?? max).toFixed(1)}" width="${W}" height="${Math.max(0, y(lo ?? min) - y(hi ?? max)).toFixed(1)}" fill="#E3F6EC"/>` : "";
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(+r.value).toFixed(1)}`).join(" ");
  const dots = rows.map((r, i) => { const f = flag(r); return `<circle cx="${x(i).toFixed(1)}" cy="${y(+r.value).toFixed(1)}" r="5" fill="${f === "n" ? "#1F4FD8" : "#B42318"}" stroke="#fff" stroke-width="2"><title>${esc(fmtDate(r.date))}: ${esc(r.value)} ${esc(r.unit)}</title></circle>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(last.test)} trend, ${rows.length} results, latest ${esc(last.value)} ${esc(last.unit)}">${band}<line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="#D5E0EF" stroke-width="2"/><path d="${path}" fill="none" stroke="#1F4FD8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

/* ---------------- views ---------------- */
function viewDashboard() {
  const t = today(), hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const todays = DB.appointments.filter(a => a.date === t && a.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const seen = todays.filter(a => a.status === "done").length;
  const nextA = todays.find(a => ["scheduled", "checked-in"].includes(a.status));
  const recentAbn = DB.labs.filter(l => flag(l) !== "n" && daysBetween(l.date, t) <= 30).sort((a, b) => b.date.localeCompare(a.date));
  const due = DB.procedures.filter(p => p.followUp && daysBetween(t, p.followUp) <= 30).sort((a, b) => a.followUp.localeCompare(b.followUp));
  const upcoming = DB.appointments.filter(a => a.date > t && a.date <= addDays(t, 7) && a.status !== "cancelled").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const d = new Date();

  return `
  <div class="head">
    <div><p class="muted small" style="font-weight:600">${DOWS[d.getDay()]}, ${fmtDate(t)}</p>
    <h1>${greet}, <em>Dr. Chidiac.</em></h1></div>
    <div class="chips">
      <button class="btn btn-white" data-act="new-patient">${plusIcon}New patient</button>
      <button class="btn btn-blue" data-act="new-appt">${plusIcon}New appointment</button>
    </div>
  </div>
  ${DB.patients.length ? "" : `<div class="card-blue"><strong style="font-size:18px">Your portal is empty.</strong><p class="small">Add your first patient, or load sample patients from <a href="#/settings">Backup &amp; settings</a> to try it out.</p></div>`}
  <div class="row stretch">
    <div class="card-blue stat"><span class="lbl">Today's appointments</span><span class="num">${todays.length}</span><span class="sub" style="color:#2C3E5A">${seen} seen · ${todays.length - seen} to go</span></div>
    <div class="card stat"><span class="lbl">Out-of-range labs (30 days)</span><span class="num">${recentAbn.length}</span><span class="sub">${recentAbn.length ? "Review below" : "All clear"}</span></div>
    <div class="card stat"><span class="lbl">Follow-ups due</span><span class="num">${due.length}</span><span class="sub">Procedures &amp; surveillance</span></div>
    <div class="card-navy stat"><span class="lbl">Next patient</span><span style="font-size:20px;font-weight:800;line-height:1.2">${nextA ? esc(fullName(patient(nextA.patientId))) : "No one waiting"}</span><span class="sub">${nextA ? esc(nextA.time + " · " + (nextA.reason || "Consultation")) : `${DB.patients.length} patients on file`}</span></div>
  </div>
  <div class="row">
    <section class="col-main card">
      <div class="card-title"><h2>Today's schedule</h2><a href="#/appointments" class="small" style="font-weight:700;text-decoration:none">Full calendar</a></div>
      <div class="list">${todays.map(a => apptItem(a)).join("") || empt("No appointments today.")}</div>
    </section>
    <div class="col-side">
      <section class="card">
        <div class="card-title"><h2>Labs to review</h2></div>
        <div class="list">${recentAbn.slice(0, 6).map(l => `<a class="item" href="#/patient/${l.patientId}/labs"><span class="who"><strong>${esc(fullName(patient(l.patientId)))}</strong><span>${esc(l.test)} · ${esc(fmtDate(l.date))}</span></span>${chip(`${l.value} ${l.unit} ${flag(l) === "hi" ? "↑" : "↓"}`, "bad")}</a>`).join("") || empt("No out-of-range results.")}</div>
      </section>
      <section class="card-blue">
        <h2 style="font-size:20px;font-weight:800">Follow-ups due</h2>
        <div class="list">${due.slice(0, 6).map(p => { const n = daysBetween(t, p.followUp); return `<a class="item" style="background:#fff" href="#/patient/${p.patientId}/procedures"><span class="who"><strong>${esc(fullName(patient(p.patientId)))}</strong><span>${esc(p.type)} · ${esc(fmtDate(p.followUp))}</span></span>${chip(n < 0 ? "Overdue" : relDays(p.followUp), n < 0 ? "bad" : "warn")}</a>`; }).join("") || `<div class="empty" style="background:#fff">Nothing due in the next 30 days.</div>`}</div>
      </section>
    </div>
  </div>
  <section class="card">
    <div class="card-title"><h2>Next 7 days</h2></div>
    <div class="list">${upcoming.slice(0, 12).map(a => apptItem(a, true)).join("") || empt("No upcoming appointments this week.")}</div>
  </section>`;
}

function viewPatients(q = "") {
  const t = today();
  const ql = q.toLowerCase();
  const rows = DB.patients.filter(p => !ql || [fullName(p), p.phone, p.conditions].join(" ").toLowerCase().includes(ql))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const last = id => byPatient("visits", id).map(v => v.date).sort().pop();
  const next = id => byPatient("appointments", id).filter(a => a.date >= t && a.status !== "cancelled").map(a => a.date).sort()[0];
  return `
  <div class="head">
    <h1>Patients <em>(${DB.patients.length})</em></h1>
    <div class="chips">
      <label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A5B74" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <span class="tiny" style="position:absolute;left:-9999px">Search patients</span>
        <input id="psearch" type="search" placeholder="Search name, phone, condition…" value="${esc(q)}"></label>
      <button class="btn btn-blue" data-act="new-patient">${plusIcon}New patient</button>
    </div>
  </div>
  <section class="card">
    <div class="tbl-wrap"><table>
      <thead><tr><th>Patient</th><th>Age</th><th>Phone</th><th>Conditions</th><th>Last visit</th><th>Next appointment</th></tr></thead>
      <tbody>${rows.map(p => `<tr class="click" data-go="#/patient/${p.id}">
        <td><a href="#/patient/${p.id}" style="font-weight:800;text-decoration:none;color:#0B1F3A;display:flex;align-items:center;gap:10px"><span class="avatar" style="width:36px;height:36px;font-size:13px">${esc(initials(p))}</span>${esc(fullName(p))}</a></td>
        <td>${esc(age(p.dob))}</td><td>${esc(p.phone || "—")}</td><td>${esc(p.conditions || "—")}</td>
        <td>${last(p.id) ? fmtDate(last(p.id)) : "—"}</td><td style="font-weight:700">${next(p.id) ? fmtDate(next(p.id)) : "—"}</td></tr>`).join("")}</tbody>
    </table></div>
    ${rows.length ? "" : empt(q ? "No patients match your search." : "No patients yet — add your first one.")}
  </section>`;
}

const TABS = [["overview", "Overview"], ["visits", "Visits & notes"], ["labs", "Blood tests"], ["meds", "Medications"], ["procedures", "Procedures"], ["appointments", "Appointments"]];

function viewPatient(id, tab = "overview") {
  const p = patient(id);
  if (!p) return `<div class="card">${empt("Patient not found.")}<a href="#/patients">Back to patients</a></div>`;
  const t = today();
  const conds = (p.conditions || "").split(",").map(s => s.trim()).filter(Boolean);
  const allergy = (p.allergies || "").trim();
  const header = `
  <a href="#/patients" class="small" style="font-weight:700;text-decoration:none;padding:6px 4px">← All patients</a>
  <section class="p-head">
    <div class="p-id">
      <span class="avatar xl">${esc(initials(p))}</span>
      <div style="display:flex;flex-direction:column;gap:6px">
        <h1>${esc(fullName(p))}</h1>
        <span class="meta">${[p.sex, p.dob ? `${age(p.dob)} years · born ${fmtDate(p.dob)}` : "", p.phone].filter(Boolean).map(esc).join(" · ") || "No details yet"}</span>
        <div class="chips">${conds.map(c => chip(c, "white")).join("")}${allergy ? chip("Allergy: " + allergy, "bad") : chip("No known allergies", "white")}</div>
      </div>
    </div>
    <div class="chips">
      <button class="btn btn-white" data-act="edit-patient" data-id="${p.id}">Edit details</button>
      <button class="btn btn-white" data-act="print">Print</button>
      <button class="btn btn-dark" data-act="new-visit" data-id="${p.id}">${plusIcon}Visit note</button>
    </div>
  </section>
  <nav class="seg" aria-label="Patient sections">${TABS.map(([k, l]) => `<a href="#/patient/${p.id}/${k}" ${k === tab ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;

  const visits = byPatient("visits", id).sort((a, b) => b.date.localeCompare(a.date));
  const labs = byPatient("labs", id).sort((a, b) => a.date.localeCompare(b.date));
  const meds = byPatient("meds", id).sort((a, b) => (a.active === b.active ? (b.start || "").localeCompare(a.start || "") : a.active === "yes" ? -1 : 1));
  const procs = byPatient("procedures", id).sort((a, b) => b.date.localeCompare(a.date));
  const appts = byPatient("appointments", id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const nextAppt = appts.filter(a => a.date >= t && a.status !== "cancelled").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  const visitHTML = v => `<article class="visit">
      <div class="when"><strong>${esc(fmtDate(v.date))}</strong><span class="small muted" style="font-weight:600">${esc(v.type || "")}</span></div>
      <div class="body"><h3>${esc(v.reason)}</h3>
        ${v.discussion ? `<p>${esc(v.discussion)}</p>` : ""}
        ${v.findings ? `<p><strong>Findings:</strong> ${esc(v.findings)}</p>` : ""}
        ${v.plan ? `<p class="plan"><strong>Plan:</strong> ${esc(v.plan)}</p>` : ""}</div>
      <div class="actions"><button class="btn btn-soft btn-sm" data-act="edit-visit" data-id="${v.id}">Edit</button></div>
    </article>`;

  const groups = {};
  labs.forEach(l => (groups[l.test] = groups[l.test] || []).push(l));
  const labCard = (test, rows) => {
    const last = rows[rows.length - 1], f = flag(last), prev = rows[rows.length - 2];
    const delta = prev ? Math.round((last.value - prev.value) * 100) / 100 : null;
    return `<div class="lab-card">
      <div class="top"><div><h3>${esc(test)}</h3><span class="tiny muted">Normal ${esc(last.refLow ?? "")}–${esc(last.refHigh ?? "")} ${esc(last.unit)}</span></div>
        <div style="text-align:right"><div class="latest">${esc(last.value)} <small>${esc(last.unit)}</small></div>
        ${chip(f === "n" ? "Normal" : f === "hi" ? "High" : "Low", f === "n" ? "ok" : "bad")}</div></div>
      ${sparkSVG(rows)}
      <div class="vals">${rows.slice().reverse().map(r => `<button type="button" data-act="edit-lab" data-id="${r.id}" aria-label="Edit ${esc(test)} on ${esc(fmtDate(r.date))}"><b class="${flag(r)}">${esc(r.value)}</b><span>${esc(fmtShort(r.date))}</span></button>`).join("")}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span class="small muted" style="font-weight:600">${delta == null ? "First result" : `${delta > 0 ? "↑" : delta < 0 ? "↓" : "="} ${Math.abs(delta)} since ${fmtDate(prev.date)}`}</span>
        <button class="btn btn-soft btn-sm" data-act="add-lab" data-id="${p.id}" data-test="${esc(test)}">${plusIcon}Add</button></div>
    </div>`;
  };

  const medsTable = rows => rows.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Medicine</th><th>Dose &amp; frequency</th><th>For</th><th>Since</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(m => `<tr><td class="strong">${esc(m.name)}</td><td>${esc([m.dose, m.frequency].filter(Boolean).join(" · ") || "—")}</td><td>${esc(m.indication || "—")}</td>
        <td>${esc(fmtDate(m.start))}${m.active === "no" && m.end ? ` → ${esc(fmtDate(m.end))}` : ""}</td>
        <td>${m.active === "yes" ? chip("Active", "ok") : chip("Stopped")}</td>
        <td style="white-space:nowrap">${m.active === "yes" ? `<button class="btn btn-soft btn-sm" data-act="stop-med" data-id="${m.id}">Stop</button> ` : ""}<button class="btn btn-soft btn-sm" data-act="edit-med" data-id="${m.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : empt("No medications recorded.");

  const procHTML = pr => { const n = pr.followUp ? daysBetween(t, pr.followUp) : null; return `<article class="visit">
      <div class="when"><strong>${esc(fmtDate(pr.date))}</strong><span class="small muted" style="font-weight:600">${esc(pr.hospital || "")}</span></div>
      <div class="body"><h3>${esc(pr.type)}</h3>
        ${pr.indication ? `<p><strong>Indication:</strong> ${esc(pr.indication)}</p>` : ""}
        ${pr.findings ? `<p><strong>Findings:</strong> ${esc(pr.findings)}</p>` : ""}
        ${pr.biopsy ? `<p><strong>Pathology:</strong> ${esc(pr.biopsy)}</p>` : ""}
        ${pr.followUp ? `<p class="plan"><strong>Follow-up:</strong> ${esc(fmtDate(pr.followUp))} ${chip(n < 0 ? "Overdue" : relDays(pr.followUp), n < 0 ? "bad" : n <= 30 ? "warn" : "")}</p>` : ""}</div>
      <div class="actions"><button class="btn btn-soft btn-sm" data-act="edit-proc" data-id="${pr.id}">Edit</button></div></article>`; };

  let body = "";
  if (tab === "overview") {
    const latestPerTest = Object.entries(groups).map(([k, r]) => r[r.length - 1]);
    body = `
    <div class="row stretch">
      <section class="card" style="flex:1 1 320px">
        <div class="card-title"><h2>Details</h2></div>
        ${[["Date of birth", fmtDate(p.dob)], ["Phone", p.phone], ["Email", p.email], ["Address", p.address], ["Blood type", p.bloodType], ["Insurance", p.insurance], ["Emergency contact", p.emergency], ["Patient since", fmtDate(p.createdAt)]]
          .map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v || "—")}</span></div>`).join("")}
        ${p.notes ? `<p class="small" style="line-height:1.6;white-space:pre-line;color:#2C3E5A"><strong>Background:</strong> ${esc(p.notes)}</p>` : ""}
      </section>
      <div class="col-side" style="flex:1 1 300px">
        <section class="card-navy"><span class="lbl" style="font-weight:700;font-size:14px;color:#C9D6EA">Next appointment</span>
          <span style="font-size:22px;font-weight:800">${nextAppt ? esc(fmtDate(nextAppt.date) + " · " + nextAppt.time) : "None booked"}</span>
          <span class="small" style="color:#C9D6EA">${nextAppt ? esc((nextAppt.reason || "Consultation") + " · " + nextAppt.location) : ""}</span>
          <button class="btn btn-white" style="align-self:flex-start;margin-top:6px" data-act="new-appt" data-id="${p.id}">${plusIcon}Book</button></section>
        <section class="card"><div class="card-title"><h2>Current medications</h2><a href="#/patient/${p.id}/meds" class="small" style="font-weight:700;text-decoration:none">Manage</a></div>
          ${meds.filter(m => m.active === "yes").map(m => `<div class="kv"><span>${esc(m.name)}</span><span>${esc([m.dose, m.frequency].filter(Boolean).join(" · "))}</span></div>`).join("") || empt("None active.")}</section>
      </div>
    </div>
    <section class="card"><div class="card-title"><h2>Latest blood tests</h2><a href="#/patient/${p.id}/labs" class="small" style="font-weight:700;text-decoration:none">See trends</a></div>
      <div class="chips">${latestPerTest.map(l => chip(`${l.test}: ${l.value} ${l.unit}${flag(l) === "hi" ? " ↑" : flag(l) === "lo" ? " ↓" : ""} · ${fmtShort(l.date)}`, flag(l) === "n" ? "ok" : "bad")).join("") || `<span class="muted small">No results yet.</span>`}</div></section>
    <section class="card"><div class="card-title"><h2>Last visit</h2><a href="#/patient/${p.id}/visits" class="small" style="font-weight:700;text-decoration:none">All visits</a></div>
      ${visits[0] ? visitHTML(visits[0]) : empt("No visits recorded yet.")}</section>
    ${procs[0] ? `<section class="card"><div class="card-title"><h2>Last procedure</h2></div>${procHTML(procs[0])}</section>` : ""}`;
  }
  if (tab === "visits") body = `<section class="card"><div class="card-title"><h2>Visit history</h2><button class="btn btn-blue" data-act="new-visit" data-id="${p.id}">${plusIcon}New note</button></div>
      <div class="list">${visits.map(visitHTML).join("") || empt("No visits recorded yet.")}</div></section>`;
  if (tab === "labs") body = `<section class="card"><div class="card-title"><div><h2>Blood tests over time</h2><p class="small muted">Green band = normal range from the lab report. Red points are out of range. Tap a value to edit it.</p></div>
      <button class="btn btn-blue" data-act="add-lab" data-id="${p.id}">${plusIcon}Add result</button></div>
      ${Object.keys(groups).length ? `<div class="lab-grid">${Object.entries(groups).map(([k, r]) => labCard(k, r)).join("")}</div>` : empt("No lab results yet.")}</section>`;
  if (tab === "meds") body = `<section class="card"><div class="card-title"><h2>Medications</h2><button class="btn btn-blue" data-act="add-med" data-id="${p.id}">${plusIcon}Add medication</button></div>${medsTable(meds)}</section>`;
  if (tab === "procedures") body = `<section class="card"><div class="card-title"><h2>Procedures &amp; endoscopy</h2><button class="btn btn-blue" data-act="add-proc" data-id="${p.id}">${plusIcon}Add procedure</button></div>
      <div class="list">${procs.map(procHTML).join("") || empt("No procedures recorded.")}</div></section>`;
  if (tab === "appointments") body = `<section class="card"><div class="card-title"><h2>Appointments</h2><button class="btn btn-blue" data-act="new-appt" data-id="${p.id}">${plusIcon}Book</button></div>
      <div class="list">${appts.map(a => apptItem(a, true)).join("") || empt("No appointments.")}</div></section>`;
  return header + body;
}

let calDay = null;
function viewAppointments() {
  const t = today(); calDay = calDay || t;
  const list = DB.appointments.filter(a => a.date === calDay).sort((a, b) => a.time.localeCompare(b.time));
  const d = parse(calDay);
  const week = [...Array(7)].map((_, i) => addDays(calDay, i - parse(calDay).getDay() + 1)); // Mon..Sun
  return `
  <div class="head"><h1>Appointments</h1><button class="btn btn-blue" data-act="new-appt" data-date="${calDay}">${plusIcon}New appointment</button></div>
  <section class="card">
    <div class="card-title">
      <h2>${DOWS[d.getDay()]}, ${fmtDate(calDay)} ${calDay === t ? chip("Today", "blue") : ""}</h2>
      <div class="chips" style="align-items:center">
        <button class="icon-btn" data-act="cal-prev" aria-label="Previous week"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>
        <input type="date" class="input" style="width:auto" id="cal-date" value="${calDay}" aria-label="Go to date">
        <button class="icon-btn" data-act="cal-next" aria-label="Next week"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>
        <button class="btn btn-soft" data-act="cal-today">Today</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">
      ${week.map(w => { const wd = parse(w), n = DB.appointments.filter(a => a.date === w && a.status !== "cancelled").length, on = w === calDay;
        return `<button type="button" data-act="cal-pick" data-date="${w}" aria-pressed="${on}" style="border:0;cursor:pointer;border-radius:16px;padding:10px 0;min-height:72px;background:${on ? "#0B1F3A" : "#F3F7FC"};color:${on ? "#fff" : "#0B1F3A"};display:flex;flex-direction:column;align-items:center;gap:3px">
          <span style="font-size:12px;font-weight:600;color:${on ? "#C9D6EA" : "#4A5B74"}">${DOWS[wd.getDay()].slice(0, 3)}</span><strong style="font-size:18px">${wd.getDate()}</strong>
          <span style="font-size:11px;font-weight:700;color:${on ? "#C9D6EA" : "#1F4FD8"}">${n ? n + " appt" + (n > 1 ? "s" : "") : "&nbsp;"}</span></button>`; }).join("")}
    </div>
    <div class="list">${list.map(a => apptItem(a)).join("") || empt("No appointments on this day.")}</div>
  </section>`;
}

function viewSettings() {
  const size = (localStorage.getItem(STORE_KEY) || "").length;
  return `
  <div class="head"><h1>Backup &amp; <em>settings</em></h1></div>
  <div class="notice">Records are stored only in this browser on this computer, encrypted with your passphrase. Clearing browser data or losing this device deletes them — <strong>export a backup regularly</strong> and keep it somewhere safe (e.g. a USB drive). Never upload backups to GitHub.</div>
  <div class="row stretch">
    <section class="card" style="flex:1 1 300px">
      <h2 style="font-size:20px">Backup</h2>
      <p class="small muted">Downloads an encrypted file. Restoring it needs the passphrase that was active when it was made.</p>
      <div class="chips"><button class="btn btn-blue" data-act="export">Export backup</button><button class="btn btn-white" data-act="import">Restore from backup</button></div>
      <p class="tiny muted">${DB.patients.length} patients · ${DB.visits.length} visit notes · ${DB.labs.length} lab results · ${(size / 1024).toFixed(0)} KB of ~5,000 KB used</p>
    </section>
    <section class="card" style="flex:1 1 300px">
      <h2 style="font-size:20px">Security</h2>
      <p class="small muted">The portal locks itself after ${AUTO_LOCK_MIN} minutes without activity.</p>
      <div class="chips"><button class="btn btn-white" data-act="change-pass">Change passphrase</button></div>
    </section>
    <section class="card" style="flex:1 1 300px">
      <h2 style="font-size:20px">Try it out</h2>
      <p class="small muted">Adds six fictional patients with visits, labs, medications and procedures so you can explore the portal.</p>
      <div class="chips"><button class="btn btn-soft" data-act="demo">Load sample patients</button><button class="btn btn-danger" data-act="wipe">Delete all data</button></div>
    </section>
  </div>`;
}

/* ---------------- router ---------------- */
function route() {
  if (!DB) return;
  const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
  const [page, id, tab] = parts;
  let html, nav = "dash";
  if (page === "patients") { html = viewPatients(route.q || ""); nav = "patients"; }
  else if (page === "patient") { html = viewPatient(id, tab || "overview"); nav = "patients"; }
  else if (page === "appointments") { html = viewAppointments(); nav = "appointments"; }
  else if (page === "settings") { html = viewSettings(); nav = "settings"; }
  else html = viewDashboard();
  const view = $("#view");
  const keepSearch = document.activeElement && document.activeElement.id === "psearch";
  view.innerHTML = html;
  $$(".side-nav a").forEach(a => a.dataset.nav === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const s = $("#psearch");
  if (s) { s.oninput = () => { route.q = s.value; route(); }; if (keepSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
  const cd = $("#cal-date"); if (cd) cd.onchange = () => { if (cd.value) { calDay = cd.value; route(); } };
}
addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

/* ---------------- actions (event delegation) ---------------- */
const find = (coll, id) => DB[coll].find(x => x.id === id);
const ACTIONS = {
  "new-patient": () => editPatient(),
  "edit-patient": el => editPatient(patient(el.dataset.id)),
  "new-appt": el => editAppointment(null, { ...(el.dataset.id ? { patientId: el.dataset.id } : {}), ...(el.dataset.date ? { date: el.dataset.date } : {}) }),
  "edit-appt": el => editAppointment(find("appointments", el.dataset.id)),
  "new-visit": el => editVisit(null, el.dataset.id),
  "edit-visit": el => editVisit(find("visits", el.dataset.id)),
  "add-lab": el => editLab(null, el.dataset.id, el.dataset.test),
  "edit-lab": el => editLab(find("labs", el.dataset.id)),
  "add-med": el => editMed(null, el.dataset.id),
  "edit-med": el => editMed(find("meds", el.dataset.id)),
  "stop-med": async el => { const m = find("meds", el.dataset.id); if (!confirm(`Stop ${m.name} today?`)) return; m.active = "no"; m.end = today(); await save(); route(); toast("Medication stopped"); },
  "add-proc": el => editProcedure(null, el.dataset.id),
  "edit-proc": el => editProcedure(find("procedures", el.dataset.id)),
  "print": () => window.print(),
  "cal-prev": () => { calDay = addDays(calDay, -7); route(); },
  "cal-next": () => { calDay = addDays(calDay, 7); route(); },
  "cal-today": () => { calDay = today(); route(); },
  "cal-pick": el => { calDay = el.dataset.date; route(); },
  "export": async () => {
    const blob = new Blob([JSON.stringify(await seal(DB, KEY, SALT))], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `clinic-backup-${today()}.kcbackup.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast("Backup downloaded");
  },
  "import": () => form({
    title: "Restore from backup", okLabel: "Restore",
    intro: "This <strong>replaces</strong> every record currently in the portal with the backup's contents.",
    fields: [{ name: "file", label: "Backup file", type: "file", accept: ".json", required: true, full: true }, { name: "pass", label: "Passphrase used when the backup was made", type: "password", required: true, full: true }],
    onSave: async d => {
      try {
        const env = JSON.parse(await d.file.text());
        if (env.app !== "kc-portal") throw new Error("This isn't a clinic portal backup.");
        const r = await open(env, d.pass);
        DB = Object.assign(empty(), r.data); KEY = r.key; SALT = r.salt; await save(); toast("Backup restored");
      } catch (e) { alert(e.message && e.message !== "The operation failed for an operation-specific reason" ? e.message : "Wrong passphrase or damaged file."); return false; }
    }
  }),
  "change-pass": () => form({
    title: "Change passphrase", okLabel: "Change",
    fields: [{ name: "cur", label: "Current passphrase", type: "password", required: true, full: true }, { name: "n1", label: "New passphrase (8+ characters)", type: "password", required: true, full: true }, { name: "n2", label: "Repeat new passphrase", type: "password", required: true, full: true }],
    onSave: async d => {
      try { await open(JSON.parse(localStorage.getItem(STORE_KEY)), d.cur); } catch { alert("Current passphrase is wrong."); return false; }
      if (d.n1.length < 8 || d.n1 !== d.n2) { alert("New passphrases must match and be at least 8 characters."); return false; }
      SALT = crypto.getRandomValues(new Uint8Array(16)); KEY = await deriveKey(d.n1, SALT); await save(); toast("Passphrase changed — export a fresh backup");
    }
  }),
  "demo": async () => { loadDemo(); await save(); toast("Sample patients added"); location.hash = "#/"; route(); },
  "wipe": async () => {
    if (prompt('This permanently deletes every record on this device. Type DELETE to confirm.') !== "DELETE") return;
    localStorage.removeItem(STORE_KEY); showLock();
  }
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && DB && ACTIONS[el.dataset.act]) { e.preventDefault(); ACTIONS[el.dataset.act](el); return; }
  const row = e.target.closest("tr[data-go]");
  if (row && !e.target.closest("a,button,select")) location.hash = row.dataset.go;
});
document.addEventListener("change", async e => {
  const s = e.target.closest("select[data-status]"); if (!s || !DB) return;
  const a = find("appointments", s.dataset.status); a.status = s.value; await save(); toast("Status: " + statusMeta(a.status)[1]); route();
});

/* ---------------- sample data ---------------- */
function loadDemo() {
  const t = today(), P = [];
  const mk = (firstName, lastName, sex, dob, extra) => { const p = { id: uid(), firstName, lastName, sex, dob, createdAt: addMonths(t, -18), ...extra }; P.push(p); DB.patients.push(p); return p.id; };
  const ap = (patientId, d, time, reason, location, status = "scheduled") => DB.appointments.push({ id: uid(), patientId, date: d, time, reason, location, status });
  const vi = (patientId, date, reason, discussion, findings, plan, type = "In clinic") => DB.visits.push({ id: uid(), patientId, date, type, reason, discussion, findings, plan });
  const lab = (patientId, test, pairs) => pairs.forEach(([mAgo, v]) => DB.labs.push({ id: uid(), patientId, date: addMonths(t, -mAgo), test, value: v, unit: LABS[test].unit, refLow: LABS[test].lo, refHigh: LABS[test].hi }));
  const med = (patientId, name, dose, frequency, indication, start, active = "yes", end = "") => DB.meds.push({ id: uid(), patientId, name, dose, frequency, indication, start, active, end });
  const proc = (patientId, type, date, hospital, indication, findings, biopsy, followUp) => DB.procedures.push({ id: uid(), patientId, type, date, hospital, indication, findings, biopsy, followUp });

  const a = mk("Layla", "Haddad", "Female", "1972-03-14", { phone: "+961 3 000 001", address: "Bikfaya", bloodType: "A+", allergies: "Penicillin", conditions: "Fatty liver (MASLD), GERD", insurance: "NSSF", emergency: "Sami Haddad (husband)", notes: "Non-smoker. Occasional alcohol. Mother had gallstones." });
  lab(a, "ALT", [[12, 78], [8, 64], [4, 52], [0, 41]]); lab(a, "AST", [[12, 52], [8, 46], [4, 38], [0, 33]]); lab(a, "GGT", [[12, 71], [4, 55], [0, 44]]);
  med(a, "Pantoprazole", "40 mg", "once daily before breakfast", "GERD", addMonths(t, -14));
  med(a, "Omeprazole", "20 mg", "once daily", "GERD", addMonths(t, -30), "no", addMonths(t, -14));
  proc(a, "Gastroscopy", addMonths(t, -14), "Abou Jaoude Hospital", "Persistent heartburn", "LA grade A oesophagitis, small hiatal hernia.", "Antral biopsies: H. pylori negative.", "");
  vi(a, addMonths(t, -4), "Fatty liver follow-up", "Lost 4 kg since last visit, walking daily. Heartburn controlled on pantoprazole.", "Abdomen soft, non-tender.", "Continue lifestyle changes. Repeat liver tests in 4 months.");
  vi(a, t, "Liver tests review", "Feels well, energy better. Reflux only after late dinners.", "ALT now 41 — back in range.", "Keep pantoprazole; try stepping down to every other day in 2 months. Ultrasound in 6 months.");
  ap(a, t, "09:00", "Liver tests review", "Bikfaya clinic", "done");

  const b = mk("Karim", "Nassar", "Male", "1964-07-02", { phone: "+961 3 000 002", address: "Antelias", bloodType: "O+", allergies: "", conditions: "Cirrhosis (treated hepatitis C), Oesophageal varices", insurance: "Private", emergency: "Nadia Nassar (wife)" });
  lab(b, "Platelets", [[9, 92], [6, 98], [3, 104], [0, 101]]); lab(b, "Total bilirubin", [[9, 1.9], [6, 1.6], [3, 1.4], [0, 1.3]]); lab(b, "Albumin", [[9, 3.1], [6, 3.3], [3, 3.4], [0, 3.5]]); lab(b, "INR", [[6, 1.4], [0, 1.3]]);
  med(b, "Propranolol", "40 mg", "twice daily", "Variceal prophylaxis", addMonths(t, -10));
  med(b, "Spironolactone", "100 mg", "once daily", "Ascites", addMonths(t, -10));
  proc(b, "Band ligation", addMonths(t, -1), "Lebanese Geitaoui University Hospital", "Grade 2 oesophageal varices", "3 bands applied, no bleeding.", "", addDays(t, 6));
  vi(b, addMonths(t, -1), "Varices surveillance", "No black stools, no vomiting blood. Mild ankle swelling.", "Grade 2 varices on endoscopy, banded.", "Repeat banding session in ~5 weeks. Low-salt diet.", "Hospital");
  ap(b, t, "09:30", "Pre-banding review", "Antelias clinic", "done");

  const c = mk("Rana", "Khoury", "Female", "1979-11-21", { phone: "+961 3 000 003", address: "Jounieh", bloodType: "B+", allergies: "", conditions: "Crohn's disease (ileal)", insurance: "Private" });
  lab(c, "Fecal calprotectin", [[9, 620], [6, 410], [3, 190], [0, 85]]); lab(c, "CRP", [[9, 24], [6, 14], [3, 7], [0, 3.2]]); lab(c, "Hemoglobin", [[9, 10.9], [3, 12.1], [0, 12.6]]);
  med(c, "Adalimumab", "40 mg", "every 2 weeks (injection)", "Crohn's disease", addMonths(t, -8));
  med(c, "Prednisone", "taper from 40 mg", "daily", "Crohn's flare", addMonths(t, -9), "no", addMonths(t, -7));
  proc(c, "Colonoscopy", addMonths(t, -9), "Serhal Hospital", "Diarrhoea and weight loss", "Terminal ileitis with ulcers; colon normal.", "Chronic active ileitis, consistent with Crohn's.", addMonths(t, 3));
  vi(c, t, "Crohn's follow-up", "2 soft stools/day, no blood, no pain. Tolerating injections well.", "Calprotectin down to 85.", "Continue adalimumab. Colonoscopy to confirm healing in 3 months.", "Video");
  ap(c, t, "10:00", "Calprotectin results", "Video", "in-room");

  const d = mk("Elias", "Saab", "Male", "1967-01-09", { phone: "+961 3 000 004", address: "Dbayeh", bloodType: "A-", allergies: "Iodinated contrast", conditions: "Colon polyps", insurance: "NSSF" });
  proc(d, "Colonoscopy", addMonths(t, -36), "Haroun Hospital", "Screening at 55", "Two polyps (8 mm, 5 mm) removed from sigmoid colon.", "Tubular adenomas, low-grade dysplasia.", addDays(t, -10));
  vi(d, addMonths(t, -36), "Colonoscopy results", "Discussed adenoma findings and surveillance.", "", "Surveillance colonoscopy in 3 years.");
  ap(d, t, "10:30", "Plan surveillance colonoscopy", "Antelias clinic", "checked-in");

  const e = mk("Maya", "Fares", "Female", "1989-05-30", { phone: "+961 3 000 005", address: "Bikfaya", bloodType: "O-", allergies: "", conditions: "Obesity (BMI 34)", insurance: "Private" });
  proc(e, "Intragastric balloon – placement", addMonths(t, -5), "Bsalim Hospital", "Weight loss", "Balloon placed, 600 mL.", "", addDays(t, 25));
  med(e, "Esomeprazole", "40 mg", "once daily while balloon in place", "Gastric protection", addMonths(t, -5));
  lab(e, "HbA1c", [[6, 6.1], [0, 5.6]]);
  vi(e, addMonths(t, -1), "Balloon follow-up", "Down 14 kg. Occasional nausea in the morning.", "", "Balloon removal at 6 months. Dietitian follow-up.");
  ap(e, t, "11:15", "Balloon follow-up", "Bikfaya clinic");
  ap(e, addDays(t, 25), "08:00", "Balloon removal", "Hospital");

  const f = mk("Georges", "Aoun", "Male", "1953-09-12", { phone: "+961 3 000 006", address: "Antelias", bloodType: "AB+", allergies: "Aspirin", conditions: "Iron-deficiency anaemia, Atrial fibrillation", insurance: "Army", emergency: "Joanna Aoun (daughter)" });
  lab(f, "Hemoglobin", [[5, 9.8], [3, 10.9], [1, 11.8], [0, 12.4]]); lab(f, "Ferritin", [[5, 8], [3, 15], [0, 46]]);
  med(f, "Ferrous sulfate", "325 mg", "once daily", "Iron deficiency", addMonths(t, -5));
  med(f, "Apixaban", "5 mg", "twice daily (cardiologist)", "Atrial fibrillation", addMonths(t, -30));
  proc(f, "Gastroscopy + colonoscopy", addMonths(t, -5), "Abou Jaoude Hospital", "Iron-deficiency anaemia", "Gastric angiodysplasia treated with argon plasma; colon normal.", "", "");
  vi(f, addMonths(t, -1), "Anaemia follow-up", "More energy, no visible bleeding.", "Hb 11.8.", "Continue iron 3 more months then recheck.");
  ap(f, t, "12:00", "Anaemia review", "Antelias clinic");
  ap(f, addDays(t, 2), "16:00", "Results review", "Video");
  ap(a, addDays(t, 3), "10:30", "Ultrasound results", "Bikfaya clinic");
  ap(d, addDays(t, 5), "08:30", "Surveillance colonoscopy", "Hospital");
}

/* ---------------- boot ---------------- */
showLock();
})();

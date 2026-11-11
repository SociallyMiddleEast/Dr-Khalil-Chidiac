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
// Lab report catalog, grouped like a lab report.
// Typical adult reference ranges — every lab differs, so ranges are editable
// per result and the patient's last-used unit/range is remembered.
// [name, unit, low, high]  — or [name, "", "", "", normalText] for qualitative tests.
const CATALOG = [
  ["Hematology — CBC", [
    ["WBC", "×10³/µL", 4.0, 11.0], ["RBC", "×10⁶/µL", 4.2, 5.9], ["Hemoglobin", "g/dL", 12, 17.5],
    ["Hematocrit", "%", 36, 52], ["MCV", "fL", 80, 100], ["MCH", "pg", 27, 33], ["MCHC", "g/dL", 32, 36],
    ["RDW", "%", 11.5, 14.5], ["Platelets", "×10³/µL", 150, 400], ["MPV", "fL", 7.5, 11.5],
    ["Neutrophils", "%", 40, 75], ["Lymphocytes", "%", 20, 45], ["Monocytes", "%", 2, 10],
    ["Eosinophils", "%", 1, 6], ["Basophils", "%", 0, 1], ["Reticulocytes", "%", 0.5, 2.5], ["ESR", "mm/h", 0, 20]
  ]],
  ["Coagulation", [
    ["PT", "s", 11, 13.5], ["INR", "", 0.8, 1.2], ["aPTT", "s", 25, 35], ["Fibrinogen", "mg/dL", 200, 400]
  ]],
  ["Liver function", [
    ["ALT", "U/L", 7, 56], ["AST", "U/L", 10, 40], ["ALP", "U/L", 44, 147], ["GGT", "U/L", 9, 48],
    ["Total bilirubin", "mg/dL", 0.1, 1.2], ["Direct bilirubin", "mg/dL", 0, 0.3], ["Albumin", "g/dL", 3.5, 5.0],
    ["Total protein", "g/dL", 6.0, 8.3], ["LDH", "U/L", 140, 280]
  ]],
  ["Kidney & electrolytes", [
    ["Urea (BUN)", "mg/dL", 7, 20], ["Creatinine", "mg/dL", 0.6, 1.2], ["eGFR", "mL/min/1.73m²", 90, ""],
    ["Sodium", "mmol/L", 135, 145], ["Potassium", "mmol/L", 3.5, 5.1], ["Chloride", "mmol/L", 98, 107],
    ["Bicarbonate", "mmol/L", 22, 29], ["Calcium", "mg/dL", 8.5, 10.5], ["Magnesium", "mg/dL", 1.7, 2.2],
    ["Phosphorus", "mg/dL", 2.5, 4.5], ["Uric acid", "mg/dL", 3.5, 7.2]
  ]],
  ["Glucose & lipids", [
    ["Fasting glucose", "mg/dL", 70, 100], ["HbA1c", "%", 4, 5.6], ["Total cholesterol", "mg/dL", "", 200],
    ["LDL cholesterol", "mg/dL", "", 100], ["HDL cholesterol", "mg/dL", 40, ""], ["Triglycerides", "mg/dL", "", 150]
  ]],
  ["Iron & vitamins", [
    ["Serum iron", "µg/dL", 60, 170], ["Ferritin", "ng/mL", 20, 250], ["TIBC", "µg/dL", 250, 450],
    ["Transferrin saturation", "%", 20, 50], ["Vitamin B12", "pg/mL", 200, 900], ["Folate", "ng/mL", 2.7, 17],
    ["Vitamin D (25-OH)", "ng/mL", 30, 100]
  ]],
  ["Inflammation & pancreas", [
    ["CRP", "mg/L", "", 5], ["Lipase", "U/L", "", 160], ["Amylase", "U/L", 30, 110]
  ]],
  ["Thyroid", [
    ["TSH", "mIU/L", 0.4, 4.0], ["Free T4", "ng/dL", 0.8, 1.8]
  ]],
  ["Hepatitis & infection", [
    ["HBsAg", "", "", "", "Negative"], ["Anti-HBs", "mIU/mL", 10, ""], ["Anti-HBc (total)", "", "", "", "Negative"],
    ["HBV DNA", "IU/mL", "", 20], ["Anti-HCV", "", "", "", "Negative"], ["HCV RNA", "IU/mL", "", 15],
    ["H. pylori stool antigen", "", "", "", "Negative"], ["H. pylori breath test", "", "", "", "Negative"]
  ]],
  ["Stool tests", [
    ["Fecal calprotectin", "µg/g", "", 50], ["Fecal occult blood (FIT)", "", "", "", "Negative"],
    ["Stool culture", "", "", "", "Negative"], ["Stool ova & parasites", "", "", "", "Negative"]
  ]],
  ["Tumor markers", [
    ["CEA", "ng/mL", "", 5], ["CA 19-9", "U/mL", "", 37], ["AFP", "ng/mL", "", 10]
  ]],
  ["Other", []]
];
const LABS = {};
const labOrder = name => { const i = Object.keys(LABS).indexOf(name); return i < 0 ? 9999 : i; };
CATALOG.forEach(([cat, tests]) => tests.forEach(([name, unit, lo, hi, text]) => { LABS[name] = { cat, unit, lo, hi, text: text || "" }; }));

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
const isNum = v => v !== "" && v != null && !isNaN(+v);
const has = v => v !== "" && v != null;
// n = normal, lo / hi = out of numeric range, ab = qualitative result differs from expected
const flag = l => {
  if (!has(l.value)) return "n";
  if (l.normalText) return String(l.value).trim().toLowerCase() === String(l.normalText).trim().toLowerCase() ? "n" : "ab";
  if (!isNum(l.value)) return "n";
  if (has(l.refLow) && +l.value < +l.refLow) return "lo";
  if (has(l.refHigh) && +l.value > +l.refHigh) return "hi";
  return "n";
};
const arrow = f => f === "hi" ? " ↑" : f === "lo" ? " ↓" : f === "ab" ? " !" : "";
const flagLabel = f => ({ n: "Normal", hi: "High", lo: "Low", ab: "Abnormal" }[f]);
const rangeText = l => l.normalText ? `Normal: ${l.normalText}` : has(l.refLow) && has(l.refHigh) ? `${l.refLow}–${l.refHigh}` : has(l.refHigh) ? `< ${l.refHigh}` : has(l.refLow) ? `> ${l.refLow}` : "—";

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
const empty = () => ({ patients: [], appointments: [], visits: [], labs: [], meds: [], procedures: [], customTests: [] });
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
// Fix or delete one existing result (new results go through the lab report table).
function editLab(l) {
  form({
    title: `Edit ${l.test} · ${fmtDate(l.date)}`, values: l,
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "value", label: "Result", required: true },
      { name: "unit", label: "Unit" },
      ...(l.normalText ? [{ name: "normalText", label: "Normal result" }] : [
        { name: "refLow", label: "Normal range – low", type: "number", step: "any" },
        { name: "refHigh", label: "Normal range – high", type: "number", step: "any" }]),
      { name: "comment", label: "Comment", full: true }
    ],
    onSave: async d => { Object.assign(l, d, { value: isNum(d.value) ? +d.value : d.value }); await upsert("labs", l); toast(flag(l) === "n" ? "Result saved" : "Saved — result is out of range"); },
    onDelete: () => remove("labs", l.id)
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
        <div class="list">${recentAbn.slice(0, 6).map(l => `<a class="item" href="#/patient/${l.patientId}/labs"><span class="who"><strong>${esc(fullName(patient(l.patientId)))}</strong><span>${esc(l.test)} · ${esc(fmtDate(l.date))}</span></span>${chip(`${l.value} ${l.unit || ""}${arrow(flag(l))}`, "bad")}</a>`).join("") || empt("No out-of-range results.")}</div>
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
      <a class="btn btn-white" href="#/patient/${p.id}/labentry" data-act="lab-entry" data-id="${p.id}">Lab report</a>
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
    const numeric = rows.filter(r => isNum(r.value));
    const delta = prev && isNum(last.value) && isNum(prev.value) ? Math.round((last.value - prev.value) * 100) / 100 : null;
    const trend = prev ? (delta == null ? `Previous: ${prev.value} on ${fmtDate(prev.date)}` : `${delta > 0 ? "↑" : delta < 0 ? "↓" : "="} ${Math.abs(delta)} since ${fmtDate(prev.date)}`) : "First result";
    return `<div class="lab-card">
      <div class="top"><div><h3>${esc(test)}</h3><span class="tiny muted">${last.normalText ? esc(rangeText(last)) : `Normal ${esc(rangeText(last))} ${esc(last.unit)}`}</span></div>
        <div style="text-align:right"><div class="latest">${esc(last.value)} <small>${esc(last.unit || "")}</small></div>
        ${chip(flagLabel(f), f === "n" ? "ok" : "bad")}</div></div>
      ${!last.normalText && numeric.length ? sparkSVG(numeric) : ""}
      <div class="vals">${rows.slice().reverse().map(r => `<button type="button" data-act="edit-lab" data-id="${r.id}" aria-label="Edit ${esc(test)} on ${esc(fmtDate(r.date))}"><b class="${flag(r)}">${esc(r.value)}</b><span>${esc(fmtShort(r.date))}</span></button>`).join("")}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span class="small muted" style="font-weight:600">${esc(trend)}</span>
        <a class="btn btn-soft btn-sm" href="#/patient/${p.id}/labentry" data-act="lab-entry" data-id="${p.id}" data-test="${esc(test)}">${plusIcon}Add</a></div>
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
    <section class="card"><div class="card-title"><h2>Latest blood tests</h2><span class="chips"><a href="#/patient/${p.id}/labs" class="btn btn-soft btn-sm">See trends</a><a href="#/patient/${p.id}/labentry" data-act="lab-entry" data-id="${p.id}" class="btn btn-blue btn-sm">${plusIcon}Enter lab report</a></span></div>
      <div class="chips">${latestPerTest.map(l => chip(`${l.test}: ${l.value} ${l.unit || ""}${arrow(flag(l))} · ${fmtShort(l.date)}`, flag(l) === "n" ? "ok" : "bad")).join("") || `<span class="muted small">No results yet.</span>`}</div></section>
    <section class="card"><div class="card-title"><h2>Last visit</h2><a href="#/patient/${p.id}/visits" class="small" style="font-weight:700;text-decoration:none">All visits</a></div>
      ${visits[0] ? visitHTML(visits[0]) : empt("No visits recorded yet.")}</section>
    ${procs[0] ? `<section class="card"><div class="card-title"><h2>Last procedure</h2></div>${procHTML(procs[0])}</section>` : ""}`;
  }
  if (tab === "visits") body = `<section class="card"><div class="card-title"><h2>Visit history</h2><button class="btn btn-blue" data-act="new-visit" data-id="${p.id}">${plusIcon}New note</button></div>
      <div class="list">${visits.map(visitHTML).join("") || empt("No visits recorded yet.")}</div></section>`;
  if (tab === "labs") body = `<section class="card"><div class="card-title"><div><h2>Blood tests over time</h2><p class="small muted">Green band = normal range from the lab report. Red points are out of range. Tap a value to fix or delete it.</p></div>
      <a class="btn btn-blue" href="#/patient/${p.id}/labentry" data-act="lab-entry" data-id="${p.id}">${plusIcon}Enter lab report</a></div>
      ${Object.keys(groups).length ? `<div class="lab-grid">${Object.entries(groups).sort((a, b) => labOrder(a[0]) - labOrder(b[0])).map(([k, r]) => labCard(k, r)).join("")}</div>` : empt("No lab results yet.")}</section>`;
  if (tab === "meds") body = `<section class="card"><div class="card-title"><h2>Medications</h2><button class="btn btn-blue" data-act="add-med" data-id="${p.id}">${plusIcon}Add medication</button></div>${medsTable(meds)}</section>`;
  if (tab === "procedures") body = `<section class="card"><div class="card-title"><h2>Procedures &amp; endoscopy</h2><button class="btn btn-blue" data-act="add-proc" data-id="${p.id}">${plusIcon}Add procedure</button></div>
      <div class="list">${procs.map(procHTML).join("") || empt("No procedures recorded.")}</div></section>`;
  if (tab === "appointments") body = `<section class="card"><div class="card-title"><h2>Appointments</h2><button class="btn btn-blue" data-act="new-appt" data-id="${p.id}">${plusIcon}Book</button></div>
      <div class="list">${appts.map(a => apptItem(a, true)).join("") || empt("No appointments.")}</div></section>`;
  return header + body;
}


/* ---------------- lab report entry ---------------- */
// One draft per patient survives navigation until saved or discarded.
const LE = {};               // pid -> { date, labName, draft: {test: {value, unit, refLow, refHigh, normalText, pre}}, focus, q, onlyPrev }
function leState(pid) {
  if (!LE[pid]) { LE[pid] = { date: today(), labName: "", draft: {}, q: "", onlyPrev: false, focus: null }; lePrefill(pid); }
  return LE[pid];
}
// Tests shown, per category: catalog + doctor's custom tests + anything in this patient's history.
function leTests() {
  const cats = CATALOG.map(([cat, tests]) => ({ cat, tests: tests.map(t => t[0]) }));
  const byCat = Object.fromEntries(cats.map(c => [c.cat, c]));
  (DB.customTests || []).forEach(t => { const c = byCat[t.cat] || byCat.Other; if (!c.tests.includes(t.name)) c.tests.push(t.name); });
  const known = new Set(cats.flatMap(c => c.tests));
  DB.labs.forEach(l => { if (!known.has(l.test)) { byCat.Other.tests.push(l.test); known.add(l.test); } });
  return cats;
}
// Defaults for a row: patient's last result for that test (keeps that lab's range), else custom test, else catalog.
function leDefaults(pid, test) {
  const last = byPatient("labs", pid).filter(l => l.test === test).sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (last) return { unit: last.unit || "", refLow: last.refLow ?? "", refHigh: last.refHigh ?? "", normalText: last.normalText || "" };
  const c = (DB.customTests || []).find(t => t.name === test) || LABS[test];
  if (c) return { unit: c.unit || "", refLow: c.lo ?? c.refLow ?? "", refHigh: c.hi ?? c.refHigh ?? "", normalText: c.text || c.normalText || "" };
  return { unit: "", refLow: "", refHigh: "", normalText: "" };
}
function lePrevious(pid, test, date) {
  return byPatient("labs", pid).filter(l => l.test === test && l.date < date).sort((a, b) => a.date.localeCompare(b.date)).pop();
}
// Load results already saved for the report date, so a report can be finished later.
function lePrefill(pid) {
  const st = LE[pid];
  Object.keys(st.draft).forEach(k => { if (st.draft[k].pre && !st.draft[k].touched) delete st.draft[k]; });
  byPatient("labs", pid).filter(l => l.date === st.date).forEach(l => {
    if (st.draft[l.test] && st.draft[l.test].touched) return;
    st.draft[l.test] = { value: String(l.value), unit: l.unit || "", refLow: l.refLow ?? "", refHigh: l.refHigh ?? "", normalText: l.normalText || "", pre: l.id };
    if (l.labName) st.labName = st.labName || l.labName;
  });
}
const leRow = (pid, test, st) => {
  const d = st.draft[test] || { value: "", ...leDefaults(pid, test) };
  const prev = lePrevious(pid, test, st.date);
  const f = flag(d), text = !!d.normalText;
  return `<tr data-test="${esc(test)}" class="le-row ${has(d.value) ? "filled" : ""} f-${f}" ${prev ? 'data-prev="1"' : ""}>
    <th scope="row" class="le-name">${esc(test)}</th>
    <td class="le-prev">${prev ? `<b class="${flag(prev)}">${esc(prev.value)}</b> <span>${esc(prev.unit || "")}</span><small>${esc(fmtDate(prev.date))}</small>` : `<span class="muted">—</span>`}</td>
    <td><input class="le-in le-res" data-k="value" value="${esc(d.value)}" ${text ? `list="le-qual" placeholder="${esc(d.normalText)}"` : 'inputmode="decimal"'} aria-label="${esc(test)} result" autocomplete="off"></td>
    <td><input class="le-in le-sm" data-k="unit" value="${esc(d.unit)}" aria-label="${esc(test)} unit"></td>
    ${text ? `<td colspan="2"><input class="le-in" data-k="normalText" value="${esc(d.normalText)}" aria-label="${esc(test)} normal result"></td>`
           : `<td><input class="le-in le-sm" data-k="refLow" value="${esc(d.refLow)}" inputmode="decimal" aria-label="${esc(test)} normal low"></td>
              <td><input class="le-in le-sm" data-k="refHigh" value="${esc(d.refHigh)}" inputmode="decimal" aria-label="${esc(test)} normal high"></td>`}
    <td class="le-flag">${has(d.value) ? chip(flagLabel(f), f === "n" ? "ok" : "bad") : ""}</td>
  </tr>`;
};
function leCounts(st) {
  const filled = Object.values(st.draft).filter(d => has(d.value));
  return { n: filled.length, bad: filled.filter(d => flag(d) !== "n").length };
}
function viewLabEntry(pid) {
  const p = patient(pid);
  if (!p) return `<div class="card">${empt("Patient not found.")}</div>`;
  const st = leState(pid), c = leCounts(st);
  const cats = leTests();
  const hasPrev = t => byPatient("labs", pid).some(l => l.test === t);
  return `
  <a href="#/patient/${pid}/labs" class="small" style="font-weight:700;text-decoration:none;padding:6px 4px">← Back to ${esc(fullName(p))}</a>
  <section class="p-head" style="padding:22px 24px">
    <div class="p-id"><span class="avatar xl" style="width:64px;height:64px;font-size:22px">${esc(initials(p))}</span>
      <div><h1 style="font-size:28px">New lab report</h1><span class="meta">${esc(fullName(p))}${p.dob ? ` · ${age(p.dob)} years` : ""}</span></div></div>
    <div class="le-meta">
      <label class="fld">Report date<input type="date" id="le-date" value="${esc(st.date)}" required></label>
      <label class="fld">Laboratory<input id="le-lab" value="${esc(st.labName)}" placeholder="e.g. hospital lab" list="le-labs"></label>
    </div>
  </section>
  <datalist id="le-qual"><option value="Negative"><option value="Positive"><option value="Not detected"><option value="Detected"></datalist>
  <datalist id="le-labs">${[...new Set(DB.labs.map(l => l.labName).filter(Boolean))].map(n => `<option value="${esc(n)}">`).join("")}</datalist>
  <section class="card le-card">
    <div class="le-tools">
      <label class="search" style="flex:1 1 260px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A5B74" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="le-q" type="search" placeholder="Find a test… e.g. ALT, ferritin" value="${esc(st.q)}" aria-label="Find a test"></label>
      <div class="seg" role="group" aria-label="Which tests to show">
        <button type="button" data-act="le-only" data-v="0" aria-pressed="${!st.onlyPrev}">All tests</button>
        <button type="button" data-act="le-only" data-v="1" aria-pressed="${st.onlyPrev}">Done before</button>
      </div>
      <div class="chips"><button type="button" class="btn btn-soft btn-sm" data-act="le-fold" data-v="1">Expand all</button><button type="button" class="btn btn-soft btn-sm" data-act="le-fold" data-v="0">Collapse all</button></div>
    </div>
    <p class="small muted">Type results only for the tests on this report — empty rows are ignored. Units and normal ranges come from this patient's last report (or typical values) and can be changed. Press <kbd>Enter</kbd> to jump to the next result.</p>
    ${cats.map(({ cat, tests }) => {
      const nIn = tests.filter(t => st.draft[t] && has(st.draft[t].value)).length;
      const open = nIn > 0 || tests.some(hasPrev) || (st.focus && tests.includes(st.focus));
      return `<details class="le-cat" data-cat="${esc(cat)}" ${open ? "open" : ""}>
        <summary><span class="le-cat-name">${esc(cat)}</span><span class="chip ${nIn ? "blue" : ""} le-cat-count">${nIn ? nIn + " entered" : tests.length + " tests"}</span></summary>
        <div class="tbl-wrap"><table class="le-table">
          <thead><tr><th scope="col">Test</th><th scope="col">Previous result</th><th scope="col">Result</th><th scope="col">Unit</th><th scope="col">Normal low</th><th scope="col">Normal high</th><th scope="col"><span class="sr">Flag</span></th></tr></thead>
          <tbody>${tests.map(t => leRow(pid, t, st)).join("")}</tbody>
        </table></div>
        <button type="button" class="btn btn-soft btn-sm le-add" data-act="le-add" data-cat="${esc(cat)}">${plusIcon}Add a test to ${esc(cat)}</button>
      </details>`; }).join("")}
  </section>
  <div class="le-bar">
    <span id="le-count"><strong>${c.n}</strong> result${c.n === 1 ? "" : "s"} entered${c.bad ? ` · <span class="bad-txt">${c.bad} out of range</span>` : ""}</span>
    <span class="grow"></span>
    <button type="button" class="btn btn-white" data-act="le-discard" data-id="${pid}">Discard</button>
    <button type="button" class="btn btn-blue" data-act="le-save" data-id="${pid}">Save report</button>
  </div>`;
}
function leAfterRender(pid) {
  const st = LE[pid]; if (!st) return;
  leFilter(st);
  if (st.focus) {
    const row = $(`.le-row[data-test="${CSS.escape(st.focus)}"]`);
    if (row) { row.closest("details").open = true; row.scrollIntoView({ block: "center" }); row.querySelector(".le-res").focus(); row.classList.add("hl"); }
    st.focus = null;
  }
}
function leFilter(st) {
  const q = (st.q || "").toLowerCase();
  $$(".le-cat").forEach(cat => {
    let any = 0;
    $$(".le-row", cat).forEach(r => {
      const show = (!q || r.dataset.test.toLowerCase().includes(q) || cat.dataset.cat.toLowerCase().includes(q)) && (!st.onlyPrev || r.dataset.prev || r.classList.contains("filled"));
      r.hidden = !show; if (show) any++;
    });
    cat.hidden = !any && (q || st.onlyPrev);
    if (q && any) cat.open = true;
  });
}
function leUpdateRow(pid, row) {
  const st = LE[pid], test = row.dataset.test;
  const d = st.draft[test] || (st.draft[test] = { value: "", ...leDefaults(pid, test) });
  $$(".le-in", row).forEach(i => d[i.dataset.k] = i.value.trim());
  d.touched = true;
  const f = flag(d);
  row.className = `le-row ${has(d.value) ? "filled" : ""} f-${f}`;
  row.querySelector(".le-flag").innerHTML = has(d.value) ? chip(flagLabel(f), f === "n" ? "ok" : "bad") : "";
  const cat = row.closest(".le-cat"), nIn = $$(".le-row.filled", cat).length, cc = cat.querySelector(".le-cat-count");
  cc.textContent = nIn ? nIn + " entered" : $$(".le-row", cat).length + " tests"; cc.classList.toggle("blue", !!nIn);
  const c = leCounts(st);
  $("#le-count").innerHTML = `<strong>${c.n}</strong> result${c.n === 1 ? "" : "s"} entered${c.bad ? ` · <span class="bad-txt">${c.bad} out of range</span>` : ""}`;
}
async function leSave(pid) {
  const st = LE[pid];
  if (!st.date) { toast("Choose the report date"); return; }
  let added = 0, updated = 0, removed = 0, bad = 0;
  for (const [test, d] of Object.entries(st.draft)) {
    const existing = d.pre ? find("labs", d.pre) : DB.labs.find(l => l.patientId === pid && l.test === test && l.date === st.date);
    if (!has(d.value)) { if (existing && d.pre) { DB.labs = DB.labs.filter(l => l.id !== existing.id); removed++; } continue; }
    const rec = existing || { id: uid(), patientId: pid, test };
    Object.assign(rec, { date: st.date, labName: st.labName, value: isNum(d.value) ? +d.value : d.value, unit: d.unit, refLow: d.normalText ? "" : (isNum(d.refLow) ? +d.refLow : ""), refHigh: d.normalText ? "" : (isNum(d.refHigh) ? +d.refHigh : ""), normalText: d.normalText || "" });
    if (existing) updated++; else { DB.labs.push(rec); added++; }
    if (flag(rec) !== "n") bad++;
  }
  if (!added && !updated && !removed) { toast("Nothing entered yet"); return; }
  await save();
  delete LE[pid];
  location.hash = `#/patient/${pid}/labs`;
  toast(`Saved ${added + updated} result${added + updated === 1 ? "" : "s"}${bad ? ` · ${bad} out of range` : ""}`);
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
  else if (page === "patient" && tab === "labentry") { html = viewLabEntry(id); nav = "patients"; }
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
  if (page === "patient" && tab === "labentry" && LE[id]) {
    const st = LE[id];
    $("#le-date").onchange = e => { if (!e.target.value) return; st.date = e.target.value; lePrefill(id); route(); };
    $("#le-lab").oninput = e => { st.labName = e.target.value; };
    $("#le-q").oninput = e => { st.q = e.target.value; leFilter(st); };
    leAfterRender(id);
  }
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
  "edit-lab": el => editLab(find("labs", el.dataset.id)),
  "lab-entry": el => { const st = leState(el.dataset.id); if (el.dataset.test) st.focus = el.dataset.test; const h = `#/patient/${el.dataset.id}/labentry`; if (location.hash === h) route(); else location.hash = h; },
  "le-only": el => { const pid = location.hash.split("/")[2], st = LE[pid]; st.onlyPrev = el.dataset.v === "1"; $$("[data-act=le-only]").forEach(b => b.setAttribute("aria-pressed", String(b === el))); leFilter(st); },
  "le-fold": el => $$(".le-cat").forEach(d => { if (!d.hidden) d.open = el.dataset.v === "1"; }),
  "le-add": async el => {
    const pid = location.hash.split("/")[2], st = LE[pid], cat = el.dataset.cat;
    const name = (prompt(`Name of the new test in ${cat}:`) || "").trim(); if (!name) return;
    const exists = Object.keys(LABS).concat((DB.customTests || []).map(t => t.name)).find(n => n.toLowerCase() === name.toLowerCase());
    if (!exists) { DB.customTests = DB.customTests || []; DB.customTests.push({ cat, name, unit: "", refLow: "", refHigh: "" }); await save(); toast(`${name} added — it will appear for every patient`); }
    st.focus = exists || name; route();
  },
  "le-discard": el => { const pid = el.dataset.id; if (leCounts(LE[pid]).n && !confirm("Discard the results typed on this report?")) return; delete LE[pid]; location.hash = `#/patient/${pid}/labs`; },
  "le-save": el => leSave(el.dataset.id),
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
document.addEventListener("input", e => {
  const inp = e.target.closest(".le-in"); if (!inp || !DB) return;
  leUpdateRow(location.hash.split("/")[2], inp.closest(".le-row"));
});
document.addEventListener("keydown", e => {
  const inp = e.target.closest(".le-res"); if (!inp || e.key !== "Enter") return;
  e.preventDefault();
  const all = $$(".le-res").filter(i => !i.closest("tr").hidden && i.closest("details").open);
  const nx = all[all.indexOf(inp) + (e.shiftKey ? -1 : 1)]; if (nx) { nx.focus(); nx.select(); }
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
  const lab = (patientId, test, pairs) => pairs.forEach(([mAgo, v]) => DB.labs.push({ id: uid(), patientId, date: addMonths(t, -mAgo), test, value: v, unit: LABS[test].unit, refLow: LABS[test].lo, refHigh: LABS[test].hi, normalText: LABS[test].text, labName: "Hospital lab" }));
  const med = (patientId, name, dose, frequency, indication, start, active = "yes", end = "") => DB.meds.push({ id: uid(), patientId, name, dose, frequency, indication, start, active, end });
  const proc = (patientId, type, date, hospital, indication, findings, biopsy, followUp) => DB.procedures.push({ id: uid(), patientId, type, date, hospital, indication, findings, biopsy, followUp });

  const a = mk("Layla", "Haddad", "Female", "1972-03-14", { phone: "+961 3 000 001", address: "Bikfaya", bloodType: "A+", allergies: "Penicillin", conditions: "Fatty liver (MASLD), GERD", insurance: "NSSF", emergency: "Sami Haddad (husband)", notes: "Non-smoker. Occasional alcohol. Mother had gallstones." });
  lab(a, "ALT", [[12, 78], [8, 64], [4, 52], [0, 41]]); lab(a, "H. pylori stool antigen", [[14, "Negative"]]); lab(a, "AST", [[12, 52], [8, 46], [4, 38], [0, 33]]); lab(a, "GGT", [[12, 71], [4, 55], [0, 44]]);
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
  lab(f, "WBC", [[5, 7.1], [1, 6.8]]); lab(f, "RBC", [[5, 3.6], [1, 4.1]]); lab(f, "Hematocrit", [[5, 31], [1, 36.5]]);
  lab(f, "MCV", [[5, 72], [1, 79]]); lab(f, "MCH", [[5, 24], [1, 26.5]]); lab(f, "RDW", [[5, 17.2], [1, 15.1]]); lab(f, "Platelets", [[5, 388], [1, 301]]);
  lab(f, "Serum iron", [[5, 31], [0, 72]]); lab(f, "Transferrin saturation", [[5, 7], [0, 22]]);
  lab(f, "Fecal occult blood (FIT)", [[5, "Positive"], [1, "Negative"]]);
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

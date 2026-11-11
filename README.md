# Dr. Khalil Chidiac, MD — website & clinic portal

Two things live in this repo:

| Path | What it is | Who uses it |
|---|---|---|
| `/` (`index.html`) | Public website: services, about, hospital affiliations, clinics, appointment requests | Patients |
| `/portal/` | Private clinic portal: patients, appointments, visit notes, blood-test trends, medications, procedures & follow-ups | Dr. Chidiac only |

Plain HTML, CSS and JavaScript. Nothing to install and no build step.

---

## 1. Put it on GitHub Pages

1. Create a new repository on GitHub, e.g. `dr-khalil-chidiac`.
2. Upload every file in this folder, keeping the folders as they are, then commit.
   Or use the command line:
   ```bash
   git init
   git add .
   git commit -m "Website and clinic portal"
   git branch -M main
   git remote add origin https://github.com/<your-username>/dr-khalil-chidiac.git
   git push -u origin main
   ```
3. On GitHub go to **Settings → Pages**. Under **Source** pick **Deploy from a branch**, then choose **main** and **/ (root)**.
4. After a minute the site is live at `https://<your-username>.github.io/dr-khalil-chidiac/`.
   The portal is at `…/dr-khalil-chidiac/portal/`.

**Custom domain (optional):** under **Settings → Pages → Custom domain**, enter e.g. `drchidiac.com`. Then point the domain's DNS to GitHub Pages as GitHub explains on that screen.

---

## 2. Finish the public site

Open `assets/js/site.js` and fill in the settings at the top:

```js
const CONFIG = {
  phone: "+961 …",       // shown on the contact card
  whatsapp: "961…",      // digits only: the booking form opens WhatsApp with the request filled in
  email: "",             // used if there is no WhatsApp number
  ...
};
```

- **Photo:** add a portrait as `assets/img/doctor.jpg`, ideally portrait orientation and about 900×1200 px. Until it's added, his initials show instead.
- **Clinic days:** each location has a `days` list in `CONFIG`, where 0 is Sunday and 6 is Saturday. Set it to the days he actually sees patients there.
- **Time slots:** edit the `slots` list in the same place.

Where the public details came from: his Instagram (@dr.khalilchidiac), his trakMD profile and Hôpital Libanais Geitaoui's doctor directory. **Have Dr. Chidiac review all text before going live.**

---

## 3. The clinic portal — how data is kept

- **Encryption:** the first time the portal opens, Dr. Chidiac picks a passphrase. Every record is encrypted with it (AES-256-GCM, key derived with PBKDF2-SHA256 using 310,000 iterations).
- **Storage:** records are saved **only in that browser, on that computer**. Nothing is uploaded, and **patient data never goes to GitHub**. GitHub only hosts the empty app.
- **Auto-lock:** the portal locks itself after 15 minutes without activity.
- **Backups:** use **Backup & settings → Export backup** regularly. Clearing browser data, reinstalling or losing the computer erases the records. Backups are encrypted with the passphrase that was active when they were made. Keep them on a USB drive or similar, never in this repository.
- **Lost passphrase:** if the passphrase is lost, the data cannot be recovered.
- **Other computers:** a second computer, e.g. the Antelias clinic, will start empty. Restore a backup there to move data across.
- **Try it out:** **Backup & settings → Load sample patients** adds six fictional patients. Use **Delete all data** before entering real patients.

### Entering lab results

Open a patient, then **Lab report**. Tests are grouped by category: Hematology (CBC), Coagulation, Liver, Kidney & electrolytes, Glucose & lipids, Iron & vitamins, Inflammation & pancreas, Thyroid, Hepatitis & infection, Stool tests, and Tumor markers.

- **Typing results:** type only the results on the paper report and press **Enter** to jump to the next test. Out-of-range values turn red as you type.
- **Previous results:** each row shows the patient's previous result and its date.
- **Units and ranges:** these are copied from the patient's last report and can be edited.
- **New tests:** use **Add a test to …** to create one. It's remembered for every patient.
- **Finishing later:** reopening the report on the same date reloads what was already saved.

### Limits of this version

This is a single-user, single-device tool. It has no syncing between clinics, no secretary accounts and no audit log.

For several devices or users it needs a proper backend. For example, Supabase or Firebase with row-level security, encrypted storage, backups and access logs, hosted under the medical-data rules that apply in Lebanon. The screens can stay the same.

---

## Files

```
index.html              public site
assets/css/site.css     public site styles
assets/js/site.js       booking widget + settings (CONFIG)
assets/img/favicon.svg
portal/index.html       portal shell (not indexed by search engines)
portal/portal.css
portal/app.js           portal logic, encryption, sample data
.nojekyll               tells GitHub Pages to serve files as-is
```

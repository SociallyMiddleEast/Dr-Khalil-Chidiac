/* =========================================================
   CLINIC SETTINGS — edit these values, nothing else needed.
   WhatsApp number: international format, digits only
   (e.g. "9613123456"). Leave empty to hide.
   ========================================================= */
const CONFIG = {
  phone: "",            // e.g. "+961 3 123 456"
  whatsapp: "",         // e.g. "9613123456"
  email: "",            // e.g. "clinic@example.com"
  locations: [
    { id: "bikfaya", label: "Bikfaya", days: [1, 2, 3, 4, 5, 6] },   // 0 = Sunday … 6 = Saturday
    { id: "antelias", label: "Antelias", days: [1, 2, 3, 4, 5, 6] },
    { id: "video", label: "Video", days: [1, 2, 3, 4, 5, 6] }
  ],
  slots: ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"]
};

(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Mobile menu
  const menuBtn = $(".menu-btn"), nav = $("#nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", e => { if (e.target.closest("a")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });

  // Booking state
  const state = { loc: 0, day: 0, slot: 1 };

  function nextDays(loc) {
    const out = [], d = new Date();
    d.setHours(0, 0, 0, 0);
    while (out.length < 6) {
      d.setDate(d.getDate() + 1);
      if (CONFIG.locations[loc].days.includes(d.getDay())) out.push(new Date(d));
    }
    return out;
  }

  function pressed(btn, on) { btn.setAttribute("aria-pressed", on ? "true" : "false"); }

  function render() {
    const days = nextDays(state.loc);
    if (state.day >= days.length) state.day = 0;

    const locRow = $("#loc-row");
    locRow.innerHTML = "";
    CONFIG.locations.forEach((l, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = l.label; pressed(b, i === state.loc);
      b.onclick = () => { state.loc = i; render(); };
      locRow.appendChild(b);
    });

    const dayWrap = $("#days");
    dayWrap.innerHTML = "";
    days.forEach((d, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span>${DOW[d.getDay()]}</span><strong>${d.getDate()}</strong>`;
      b.setAttribute("aria-label", `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`);
      pressed(b, i === state.day);
      b.onclick = () => { state.day = i; render(); };
      dayWrap.appendChild(b);
    });

    const slotWrap = $("#slots");
    slotWrap.innerHTML = "";
    CONFIG.slots.forEach((t, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = t; pressed(b, i === state.slot);
      b.onclick = () => { state.slot = i; render(); };
      slotWrap.appendChild(b);
    });

    const d = days[state.day];
    $("#month-label").textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    $("#summary").textContent = `${CONFIG.locations[state.loc].label} · ${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${CONFIG.slots[state.slot]}`;
  }
  render();

  // Submit: WhatsApp → email → fallback message
  $("#book").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#b-name").value.trim(), phone = $("#b-phone").value.trim(), msg = $("#book-msg");
    if (!name || !phone) { msg.textContent = "Please add your name and phone number."; (!name ? $("#b-name") : $("#b-phone")).focus(); return; }
    const text = `Hello Dr. Chidiac, I'd like to request an appointment.\nName: ${name}\nPhone: ${phone}\nRequest: ${$("#summary").textContent}`;
    if (CONFIG.whatsapp) {
      window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      msg.textContent = "Opening WhatsApp… the clinic will confirm your appointment.";
    } else if (CONFIG.email) {
      location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent("Appointment request")}&body=${encodeURIComponent(text)}`;
      msg.textContent = "Opening your email app…";
    } else {
      msg.textContent = "Online requests are coming soon — please message the clinic on Instagram (@dr.khalilchidiac).";
    }
  });

  // Contact phone (hidden until configured)
  const cp = $("#c-phone");
  if (CONFIG.phone) { cp.href = "tel:" + CONFIG.phone.replace(/\s+/g, ""); cp.querySelector("span").textContent = CONFIG.phone; }
  else cp.remove();

  $("#year").textContent = new Date().getFullYear();

  // Reveal on scroll
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.08 });
    document.querySelectorAll("main > section:not(#top) > *, main > section.section").forEach(el => { el.classList.add("reveal"); io.observe(el); });
  }
})();

/* Familiekalender – hele appen i én fil, uten byggesteg. */
(() => {
  "use strict";

  const CFG = window.KALENDER_CONFIG;
  const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_KEY;
  const MEMBERS = CFG.MEMBERS;
  const MEMBER = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
  const HOUR = 52; // piksler per time i uke-/dagsvisning
  document.documentElement.style.setProperty("--hour", HOUR + "px");

  const $ = (s) => document.querySelector(s);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("fk-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fk-" + k, JSON.stringify(v)); } catch { /* full eller blokkert */ } },
    del(k) { try { localStorage.removeItem("fk-" + k); } catch { /* ignorer */ } },
  };

  // Lite hjelpemiddel for å lage DOM-elementer trygt (ingen innerHTML med brukertekst)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") Object.assign(el.style, v);
      else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  // =====================================================================
  //  Datoer
  // =====================================================================
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const sow = (d) => addDays(sod(d), -((d.getDay() + 6) % 7)); // mandag
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const atTime = (dateStr, timeStr) => { const d = parseYmd(dateStr); const [H, M] = (timeStr || "00:00").split(":").map(Number); d.setHours(H, M, 0, 0); return d; };
  const daysBetween = (a, b) => Math.round((sod(b) - sod(a)) / 864e5);
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }
  const F = (opts) => new Intl.DateTimeFormat("nb-NO", opts);
  const fMonth = F({ month: "long", year: "numeric" });
  const fDayLong = F({ weekday: "long", day: "numeric", month: "long" });
  const fWd = F({ weekday: "short" });
  const fDayLabel = F({ weekday: "long", day: "numeric", month: "short" });
  const fDm = F({ day: "numeric", month: "short" });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const WEEKDAYS = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];

  // =====================================================================
  //  Tilstand
  // =====================================================================
  const state = {
    view: LS.get("view", "month"),
    date: sod(new Date()),
    events: [],
    hidden: new Set(LS.get("hidden", [])),
    me: null,             // { email, member_id, can_edit }
    scrollTop: null,
  };

  // =====================================================================
  //  Datalag: Supabase eller demo (localStorage)
  // =====================================================================
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Kunne ikke laste " + src));
      document.head.append(s);
    });
  }

  function supabaseStore() {
    let client;
    return {
      async init() {
        await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
        client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: "fk-auth" },
        });
        const { data } = await client.auth.getSession();
        return data.session ? data.session.user : null;
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
      },
      async signOut() { await client.auth.signOut(); },
      async me() {
        const { data, error } = await client.from("allowed_users").select("email, member_id, can_edit").maybeSingle();
        if (error) throw error;
        return data;
      },
      async list() {
        const { data, error } = await client.from("events").select("*").order("start_at");
        if (error) throw error;
        return data;
      },
      async insert(row) { const { error } = await client.from("events").insert(row); if (error) throw error; },
      async update(id, row) { const { error } = await client.from("events").update(row).eq("id", id); if (error) throw error; },
      async remove(id) { const { error } = await client.from("events").delete().eq("id", id); if (error) throw error; },
      subscribe(cb) {
        client.channel("events-feed")
          .on("postgres_changes", { event: "*", schema: "public", table: "events" }, cb)
          .subscribe();
      },
    };
  }

  function demoStore() {
    const KEY = "demo-events";
    const read = () => LS.get(KEY, null);
    const write = (rows) => LS.set(KEY, rows);
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    function seed() {
      const mon = sow(new Date());
      const at = (dayOffset, time) => { const d = addDays(mon, dayOffset); const [H, M] = time.split(":"); d.setHours(+H, +M, 0, 0); return d.toISOString(); };
      const base = { all_day: false, location: null, notes: null, recurrence: "none", recur_until: null, exdates: [] };
      const all = MEMBERS.map((m) => m.id);
      return [
        { ...base, title: "Fotballtrening", start_at: at(1, "17:30"), end_at: at(1, "19:00"), members: ["vegard"], recurrence: "weekly", location: "Kunstgresset" },
        { ...base, title: "Fotballtrening", start_at: at(3, "17:30"), end_at: at(3, "19:00"), members: ["vegard"], recurrence: "weekly", location: "Kunstgresset" },
        { ...base, title: "Håndball", start_at: at(0, "18:00"), end_at: at(0, "19:30"), members: ["ane"], recurrence: "weekly" },
        { ...base, title: "Tannlege", start_at: at(2, "08:30"), end_at: at(2, "09:15"), members: ["hilde"] },
        { ...base, title: "Foreldremøte 6. trinn", start_at: at(2, "18:00"), end_at: at(2, "19:30"), members: ["kristoffer", "hilde"], location: "Skolen" },
        { ...base, title: "Langtur på ski", start_at: at(5, "10:00"), end_at: at(5, "13:00"), members: ["kristoffer"] },
        { ...base, title: "Middag hos besteforeldre", start_at: at(6, "15:00"), end_at: at(6, "18:00"), members: all },
        { ...base, title: "Hyttetur", start_at: at(11, "00:00"), end_at: at(13, "00:00"), all_day: true, members: all },
        { ...base, title: "Skirenn", start_at: at(5, "00:00"), end_at: at(5, "00:00"), all_day: true, members: ["kristoffer", "ane", "vegard"] },
        { ...base, title: "Svømming", start_at: at(3, "19:15"), end_at: at(3, "20:15"), members: ["hilde", "ane", "vegard"] },
        { ...base, title: "Kino med venner", start_at: at(4, "19:00"), end_at: at(4, "21:30"), members: ["ane"] },
      ].map((r) => ({ id: uid(), ...r }));
    }
    return {
      async init() { if (!read()) write(seed()); return { email: "demo" }; },
      async signIn() { return { email: "demo" }; },
      async signOut() { LS.del(KEY); },
      async me() { return { email: "demo@familie", member_id: MEMBERS[0].id, can_edit: true }; },
      async list() { return read() || []; },
      async insert(row) { write([...read(), { id: uid(), exdates: [], ...row }]); },
      async update(id, row) { write(read().map((r) => (r.id === id ? { ...r, ...row } : r))); },
      async remove(id) { write(read().filter((r) => r.id !== id)); },
      subscribe(cb) { window.addEventListener("storage", (e) => { if (e.key === "fk-" + KEY) cb(); }); },
    };
  }

  const store = DEMO ? demoStore() : supabaseStore();

  // =====================================================================
  //  Avtaler og gjentakelser
  // =====================================================================
  function normalize(r) {
    const members = (r.members && r.members.length ? r.members : MEMBERS.map((m) => m.id)).filter((id) => MEMBER[id])
      .sort((x, y) => MEMBERS.indexOf(MEMBER[x]) - MEMBERS.indexOf(MEMBER[y]));
    return { ...r, members, start: new Date(r.start_at), end: new Date(r.end_at), exdates: r.exdates || [] };
  }

  function colorOf(ev) {
    if (ev.members.length === MEMBERS.length && MEMBERS.length > 1) return CFG.FAMILY_COLOR;
    return (MEMBER[ev.members[0]] || MEMBERS[0]).color;
  }
  // Delt fargestripe for avtaler med flere (men ikke alle) personer
  function stripe(ev, dir) {
    const isFamily = ev.members.length === MEMBERS.length && MEMBERS.length > 1;
    if (isFamily || ev.members.length === 1) return colorOf(ev);
    const n = ev.members.length;
    const stops = ev.members.map((id, i) => `${MEMBER[id].color} ${(i * 100 / n).toFixed(2)}% ${((i + 1) * 100 / n).toFixed(2)}%`);
    return `linear-gradient(${dir}, ${stops.join(", ")})`;
  }
  const isGroup = (ev) => ev.members.length > 1 && ev.members.length < MEMBERS.length;
  const visible = (ev) => ev.members.some((id) => !state.hidden.has(id));

  // Lager en forekomst: s = start, e = slutt (eksklusiv). Heldagsavtaler varer til midnatt etter siste dag.
  function occ(ev, s) {
    let e;
    if (ev.all_day) e = addDays(sod(s), daysBetween(ev.start, ev.end) + 1);
    else e = new Date(s.getTime() + (ev.end - ev.start));
    return { ev, s, e, key: ev.id + "|" + ymd(s) };
  }

  function nth(ev, k) {
    const s = ev.start, H = s.getHours(), M = s.getMinutes();
    switch (ev.recurrence) {
      case "daily": return new Date(s.getFullYear(), s.getMonth(), s.getDate() + k, H, M);
      case "weekly": return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * k, H, M);
      case "biweekly": return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 14 * k, H, M);
      case "monthly":
      case "yearly": {
        const step = ev.recurrence === "monthly" ? k : 12 * k;
        const d = new Date(s.getFullYear(), s.getMonth() + step, s.getDate(), H, M);
        return d.getDate() === s.getDate() ? d : null; // hopp over f.eks. 31. i korte måneder
      }
    }
    return null;
  }
  const PERIOD_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 28, yearly: 365 };

  function occurrences(from, to) {
    const out = [];
    for (const ev of state.events) {
      if (!visible(ev)) continue;
      if (ev.recurrence === "none") {
        const o = occ(ev, ev.start);
        if (o.s < to && o.e > from) out.push(o);
        continue;
      }
      const until = ev.recur_until ? addDays(parseYmd(ev.recur_until), 1) : null;
      const spanDays = Math.max(0, daysBetween(ev.start, ev.end)) + 1;
      let k = Math.max(0, Math.floor((daysBetween(ev.start, from) - spanDays) / PERIOD_DAYS[ev.recurrence]) - 1);
      for (let guard = 0; guard < 800; guard++, k++) {
        const s = nth(ev, k);
        if (s === null) continue;
        if (s >= to || (until && s >= until)) break;
        if (ev.exdates.includes(ymd(s))) continue;
        const o = occ(ev, s);
        if (o.e > from) out.push(o);
      }
    }
    return out.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  }

  // =====================================================================
  //  Visninger
  // =====================================================================
  const view = $("#view");

  function render() {
    document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
    view.className = "view view-" + state.view;
    if (state.view === "month") renderMonth();
    else renderTimeGrid(state.view === "week" ? 7 : 1);
  }

  function setLabel(main, small) {
    const el = $("#period-label");
    el.replaceChildren(main, small ? h("small", {}, small) : "");
  }

  // ---------- Måned ----------
  function renderMonth() {
    const first = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    const start = sow(first);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const weeks = Math.ceil((daysBetween(start, last) + 1) / 7);
    const end = addDays(start, weeks * 7);
    setLabel(cap(fMonth.format(first)));

    const all = occurrences(start, end);
    const rowH = (view.clientHeight - 22) / weeks;
    const maxChips = Math.max(1, Math.floor((rowH - 26) / 16));
    const today = new Date();

    const body = h("div", { class: "month-body", style: { gridTemplateRows: `repeat(${weeks}, minmax(0,1fr))` } });
    for (let w = 0; w < weeks; w++) {
      const row = h("div", { class: "month-row" }, h("div", { class: "wk" }, String(isoWeek(addDays(start, w * 7)))));
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, w * 7 + i);
        const next = addDays(day, 1);
        const items = all.filter((o) => o.s < next && o.e > day)
          .sort((a, b) => (b.ev.all_day - a.ev.all_day) || (a.s - b.s));
        const shown = items.length > maxChips ? items.slice(0, maxChips - 1) : items;
        const cls = ["mcell", day.getMonth() !== first.getMonth() && "other", sameDay(day, today) && "today", isWeekend(day) && "weekend"].filter(Boolean).join(" ");
        row.append(h("button", { class: cls, "aria-label": fDayLong.format(day), onclick: () => go("day", day) },
          h("span", { class: "dnum" }, String(day.getDate())),
          shown.map((o) => h("div", { class: "mchip" + (o.ev.all_day ? "" : " timed"), vars: { "--c": colorOf(o.ev), "--stripe": stripe(o.ev, "to right"), "--bars": isGroup(o.ev) ? o.ev.members.length : 1 } },
            o.ev.all_day ? null : h("span", { class: "tm" }, hm(o.s) + " "), o.ev.title)),
          items.length > shown.length ? h("div", { class: "more" }, `+${items.length - shown.length} til`) : null,
        ));
      }
      body.append(row);
    }
    view.replaceChildren(h("div", { class: "month" },
      h("div", { class: "month-head" }, h("div", {}, ""), WEEKDAYS.map((d) => h("div", {}, d))),
      body));
  }

  // ---------- Uke og dag ----------
  function layoutColumns(items) {
    // Fordel overlappende avtaler side om side
    const placed = [];
    let cluster = [], clusterEnd = 0;
    const flush = () => {
      const cols = [];
      for (const it of cluster) {
        let c = cols.findIndex((end) => end <= it.s);
        if (c === -1) { c = cols.length; cols.push(0); }
        cols[c] = it.e; it.col = c;
      }
      for (const it of cluster) { it.cols = cols.length; placed.push(it); }
      cluster = []; clusterEnd = 0;
    };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) flush();
      cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
    }
    if (cluster.length) flush();
    return placed;
  }

  function renderTimeGrid(n) {
    const start = n === 7 ? sow(state.date) : sod(state.date);
    const end = addDays(start, n);
    const days = Array.from({ length: n }, (_, i) => addDays(start, i));
    const today = new Date();
    const wk = isoWeek(start);

    if (n === 7) setLabel(`Uke ${wk}`, `${fDm.format(start)} – ${fDm.format(addDays(start, 6))}`);
    else setLabel(cap(fDayLabel.format(start)), `uke ${wk}`);

    const all = occurrences(start, end);
    const allDay = all.filter((o) => o.ev.all_day);
    const timed = all.filter((o) => !o.ev.all_day);

    const head = h("div", { class: "tg-head", vars: { "--n": n } },
      h("div", { class: "wkno" }),
      days.map((d) => h("button", {
        class: [sameDay(d, today) && "today", isWeekend(d) && "weekend"].filter(Boolean).join(" "),
        onclick: () => go("day", d),
      }, fWd.format(d).replace(".", ""), h("span", { class: "num" }, String(d.getDate())))));

    const allDayRow = h("div", { class: "tg-allday", vars: { "--n": n } },
      h("div", { class: "lbl" }, allDay.length ? "hele dagen" : ""),
      days.map((d) => h("div", { class: "adcol" },
        allDay.filter((o) => o.s < addDays(d, 1) && o.e > d).map((o) =>
          h("button", { class: "adchip", vars: { "--c": colorOf(o.ev), "--stripe": stripe(o.ev, "to right") }, onclick: () => openEditor({ o }) }, o.ev.title)))));

    const hours = h("div", { class: "hours" },
      Array.from({ length: 24 }, (_, i) => h("span", { style: { top: i * HOUR + "px" } }, pad(i))));

    const cols = days.map((d) => {
      const dayEnd = addDays(d, 1);
      const segs = timed.filter((o) => o.s < dayEnd && o.e > d).map((o) => {
        const s = Math.max(0, (Math.max(o.s, d) - d) / 6e4);
        const e = Math.min(1440, (Math.min(o.e, dayEnd) - d) / 6e4);
        return { o, s, e: Math.max(e, s + 20) };
      });
      const col = h("div", { class: "dcol" + (sameDay(d, today) ? " today" : "") });
      col.addEventListener("click", (ev) => {
        if (ev.target !== col || !state.me?.can_edit) return;
        const min = Math.floor((ev.offsetY / HOUR) * 2) * 30;
        const s = new Date(d); s.setMinutes(min);
        openEditor({ start: s });
      });
      for (const it of layoutColumns(segs)) {
        const o = it.o, w = 100 / it.cols;
        const short = it.e - it.s < 45;
        col.append(h("button", {
          class: "ev" + (isGroup(o.ev) ? " group" : ""),
          vars: { "--c": colorOf(o.ev), "--stripe": stripe(o.ev, "to right"), "--bars": isGroup(o.ev) ? o.ev.members.length : 1 },
          title: o.ev.members.map((id) => MEMBER[id].name).join(", "),
          style: { top: (it.s / 60) * HOUR + "px", height: ((it.e - it.s) / 60) * HOUR - 2 + "px", left: `calc(${it.col * w}% + 1px)`, width: `calc(${w}% - 3px)` },
          onclick: () => openEditor({ o }),
        },
          h("b", {}, o.ev.title),
          short ? null : h("span", { class: "t" }, `${hm(o.s)}–${hm(o.e)}` + (o.ev.location && n === 1 ? ` · ${o.ev.location}` : "")),
        ));
      }
      if (sameDay(d, today)) {
        const mins = today.getHours() * 60 + today.getMinutes();
        col.append(h("div", { class: "nowline", style: { top: (mins / 60) * HOUR + "px" } }));
      }
      return col;
    });

    const scroll = h("div", { class: "tg-scroll" }, h("div", { class: "tg-cols", vars: { "--n": n } }, hours, cols));
    view.replaceChildren(h("div", { class: "tg" }, head, allDayRow, scroll));

    if (state.scrollTop != null) scroll.scrollTop = state.scrollTop;
    else {
      const showsToday = days.some((d) => sameDay(d, today));
      const hour = showsToday ? Math.min(Math.max(CFG.SCROLL_TO_HOUR, today.getHours() - 2), 18) : CFG.SCROLL_TO_HOUR;
      scroll.scrollTop = hour * HOUR;
    }
    scroll.addEventListener("scroll", () => { state.scrollTop = scroll.scrollTop; }, { passive: true });
  }

  // =====================================================================
  //  Navigering
  // =====================================================================
  function go(viewName, date) {
    if (viewName && viewName !== state.view) { state.view = viewName; LS.set("view", viewName); }
    if (date) state.date = sod(date);
    state.scrollTop = null;
    render();
  }
  function step(dir) {
    const d = state.date;
    if (state.view === "month") state.date = addMonths(d, dir);
    else state.date = addDays(d, state.view === "week" ? 7 * dir : dir);
    state.scrollTop = state.view === "month" ? null : state.scrollTop;
    render();
  }

  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  $("#today").onclick = () => go(null, new Date());
  $("#period-label").onclick = () => go(null, new Date());
  document.querySelectorAll(".segmented button").forEach((b) => (b.onclick = () => go(b.dataset.view)));

  // Sveip til venstre/høyre for å bla
  let touch = null;
  view.addEventListener("touchstart", (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, t: Date.now() }; }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch.t < 600) step(dx < 0 ? 1 : -1);
    touch = null;
  }, { passive: true });

  // Tastatur på PC
  document.addEventListener("keydown", (e) => {
    if ($("#editor").open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "t") go(null, new Date());
    else if (e.key === "m") go("month"); else if (e.key === "u") go("week"); else if (e.key === "d") go("day");
  });

  window.addEventListener("resize", () => { if (state.view === "month") render(); });

  // ---------- Filter per person ----------
  function renderFilters() {
    $("#filters").replaceChildren(...MEMBERS.map((m) => h("button", {
      class: "chip", vars: { "--c": m.color }, "aria-pressed": String(!state.hidden.has(m.id)),
      onclick: () => {
        if (state.hidden.has(m.id)) state.hidden.delete(m.id); else state.hidden.add(m.id);
        if (state.hidden.size === MEMBERS.length) state.hidden.delete(m.id); // aldri skjul alle
        LS.set("hidden", [...state.hidden]);
        renderFilters(); render();
      },
    }, m.name)));
  }

  // =====================================================================
  //  Redigering
  // =====================================================================
  const dlg = $("#editor"), form = $("#event-form");
  let editing = null; // { o } eller { new: true }
  let picked = new Set();

  function renderPicker(readonly) {
    $("#member-picker").replaceChildren(...MEMBERS.map((m) => h("button", {
      type: "button", class: "chip", vars: { "--c": m.color }, "aria-pressed": String(picked.has(m.id)), disabled: readonly,
      onclick: () => { picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id); renderPicker(); },
    }, m.name)));
  }

  function syncFormState() {
    const allDay = form.all_day.checked;
    form.classList.toggle("all-day", allDay);
    form.start_time.required = form.end_time.required = !allDay;
    $("#until-field").style.visibility = form.recurrence.value === "none" ? "hidden" : "visible";
  }
  form.all_day.onchange = syncFormState;
  form.recurrence.onchange = syncFormState;
  form.start_date.onchange = () => { if (form.end_date.value < form.start_date.value) form.end_date.value = form.start_date.value; };
  form.start_time.onchange = () => {
    if (form.start_date.value === form.end_date.value && form.end_time.value <= form.start_time.value) {
      const e = new Date(atTime(form.start_date.value, form.start_time.value).getTime() + 36e5);
      form.end_date.value = ymd(e); form.end_time.value = hm(e);
    }
  };

  function openEditor({ o, start }) {
    const canEdit = !!state.me?.can_edit;
    form.reset();
    $("#editor-msg").textContent = "";
    form.classList.toggle("readonly", !canEdit);
    $("#save-btn").hidden = !canEdit;

    if (o) {
      const ev = o.ev;
      editing = { o };
      $("#editor-title").textContent = canEdit ? "Endre avtale" : "Avtale";
      form.title.value = ev.title;
      form.all_day.checked = ev.all_day;
      const lastDay = ev.all_day ? addDays(o.e, -1) : o.e;
      form.start_date.value = ymd(o.s); form.start_time.value = ev.all_day ? "" : hm(o.s);
      form.end_date.value = ymd(lastDay); form.end_time.value = ev.all_day ? "" : hm(o.e);
      form.recurrence.value = ev.recurrence;
      form.recur_until.value = ev.recur_until || "";
      form.location.value = ev.location || "";
      form.notes.value = ev.notes || "";
      picked = new Set(ev.members);
      const series = ev.recurrence !== "none";
      $("#series-hint").hidden = !series || !canEdit;
      $("#delete-zone").hidden = !canEdit;
      $("#delete-one-btn").hidden = !series;
      $("#delete-btn").textContent = series ? "Slett hele serien" : "Slett avtale";
    } else {
      editing = { new: true };
      $("#editor-title").textContent = "Ny avtale";
      const s = start || (() => { const d = new Date(state.date); const now = new Date(); d.setHours(sameDay(d, now) ? now.getHours() + 1 : 12, 0, 0, 0); return d; })();
      const e = new Date(s.getTime() + 36e5);
      form.start_date.value = ymd(s); form.start_time.value = hm(s);
      form.end_date.value = ymd(e); form.end_time.value = hm(e);
      picked = new Set(state.me?.member_id && MEMBER[state.me.member_id] ? [state.me.member_id] : []);
      $("#series-hint").hidden = true;
      $("#delete-zone").hidden = true;
    }
    renderPicker(!canEdit);
    syncFormState();
    dlg.showModal();
    if (!o) setTimeout(() => form.title.focus(), 50);
  }

  $("#cancel-btn").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // trykk utenfor lukker

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#editor-msg");
    const allDay = form.all_day.checked;
    const s = allDay ? parseYmd(form.start_date.value) : atTime(form.start_date.value, form.start_time.value);
    const en = allDay ? parseYmd(form.end_date.value) : atTime(form.end_date.value, form.end_time.value);
    if (en < s || (!allDay && +en === +s)) { msg.textContent = "Slutt må være etter start."; return; }
    const recurrence = form.recurrence.value;
    const until = recurrence === "none" ? null : form.recur_until.value || null;
    if (until && until < form.start_date.value) { msg.textContent = "«Til og med» kan ikke være før startdatoen."; return; }

    const row = {
      title: form.title.value.trim(),
      all_day: allDay,
      members: picked.size ? [...picked] : MEMBERS.map((m) => m.id),
      location: form.location.value.trim() || null,
      notes: form.notes.value.trim() || null,
      recurrence,
      recur_until: until,
    };
    if (!row.title) { msg.textContent = "Skriv hva som skjer."; return; }

    // Endrer man én forekomst i en serie, flyttes hele serien like mye
    let startAt = s, endAt = en;
    if (editing.o && editing.o.ev.recurrence !== "none" && recurrence !== "none") {
      const { o } = editing;
      startAt = new Date(o.ev.start.getTime() + (s - o.s));
      endAt = new Date(startAt.getTime() + (en - s));
      if (allDay) { startAt = sod(addDays(o.ev.start, daysBetween(o.s, s))); endAt = addDays(startAt, daysBetween(s, en)); }
    }
    row.start_at = startAt.toISOString();
    row.end_at = endAt.toISOString();

    $("#save-btn").disabled = true;
    try {
      if (editing.new) await store.insert(row);
      else await store.update(editing.o.ev.id, row);
      dlg.close();
      toast(editing.new ? "Avtalen er lagt inn" : "Endringen er lagret");
      await loadEvents();
    } catch (err) {
      msg.textContent = friendly(err);
    } finally {
      $("#save-btn").disabled = false;
    }
  });

  $("#delete-btn").onclick = async () => {
    const ev = editing.o.ev;
    const series = ev.recurrence !== "none";
    if (!confirm(series ? `Slette hele serien «${ev.title}»?` : `Slette «${ev.title}»?`)) return;
    try { await store.remove(ev.id); dlg.close(); toast("Slettet"); await loadEvents(); }
    catch (err) { $("#editor-msg").textContent = friendly(err); }
  };
  $("#delete-one-btn").onclick = async () => {
    const { o } = editing;
    if (!confirm(`Slette «${o.ev.title}» bare ${fDayLong.format(o.s)}?`)) return;
    try { await store.update(o.ev.id, { exdates: [...o.ev.exdates, ymd(o.s)] }); dlg.close(); toast("Slettet denne dagen"); await loadEvents(); }
    catch (err) { $("#editor-msg").textContent = friendly(err); }
  };

  $("#add-btn").onclick = () => openEditor({});

  // =====================================================================
  //  Lasting, innlogging, oppstart
  // =====================================================================
  function friendly(err) {
    const m = (err && err.message) || String(err);
    if (/Invalid login credentials/i.test(m)) return "Feil e-post eller passord.";
    if (/row-level security|permission denied/i.test(m)) return "Du har ikke tilgang til å endre kalenderen.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Ingen nettforbindelse. Prøv igjen.";
    return m;
  }

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  async function loadEvents() {
    try {
      const rows = await store.list();
      state.events = rows.map(normalize);
      if (!DEMO) LS.set("cache", rows);
      $("#offline-banner").hidden = true;
    } catch (err) {
      const cached = LS.get("cache", null);
      if (cached) { state.events = cached.map(normalize); $("#offline-banner").hidden = false; }
      else toast(friendly(err));
    }
    render();
  }

  let reloadTimer;
  const reloadSoon = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadEvents, 300); };

  async function enterApp() {
    try {
      state.me = await store.me();
      if (state.me) LS.set("me", state.me);
    } catch {
      state.me = LS.get("me", null); // frakoblet: bruk sist kjente
    }
    if (!state.me) {
      await store.signOut();
      showLogin("Denne brukeren har ikke tilgang til kalenderen.");
      return;
    }
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#demo-banner").hidden = !DEMO;
    $("#add-btn").hidden = !state.me.can_edit;
    $("#menu-user").textContent = DEMO ? "Demomodus" :
      `Innlogget som ${state.me.email}` + (state.me.can_edit ? "" : " (kun lesetilgang)");
    $("#logout-btn").textContent = DEMO ? "Nullstill demodata" : "Logg ut";
    renderFilters();
    render();
    await loadEvents();
    try { store.subscribe(reloadSoon); } catch { /* frakoblet ved oppstart */ }
  }

  function showLogin(message) {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login-msg").textContent = message || "";
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    btn.disabled = true; $("#login-msg").textContent = "";
    try {
      await store.signIn(f.email.value.trim(), f.password.value);
      f.password.value = "";
      await enterApp();
    } catch (err) {
      $("#login-msg").textContent = friendly(err);
    } finally { btn.disabled = false; }
  });

  // Meny
  const menu = $("#menu");
  $("#menu-btn").onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  $("#refresh-btn").onclick = () => { menu.hidden = true; loadEvents().then(() => toast("Oppdatert")); };
  $("#logout-btn").onclick = async () => {
    menu.hidden = true;
    if (DEMO) { if (!confirm("Slette demodata og starte på nytt?")) return; await store.signOut(); await store.init(); await loadEvents(); return; }
    await store.signOut();
    LS.del("cache"); LS.del("me");
    state.events = []; state.me = null;
    showLogin();
  };

  // Hent nye data når appen kommer tilbake i forgrunnen (sanntid sover i bakgrunnen)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.me) reloadSoon(); });
  window.addEventListener("online", () => state.me && reloadSoon());
  // Flytt "nå"-streken hvert minutt
  setInterval(() => { if (state.me && state.view !== "month" && !$("#editor").open) render(); }, 60_000);

  async function start() {
    document.title = CFG.APP_NAME;
    document.querySelectorAll(".app-name").forEach((el) => (el.textContent = CFG.APP_NAME));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    try {
      const user = await store.init();
      if (user) await enterApp(); else showLogin();
    } catch (err) {
      // Typisk: frakoblet ved første oppstart
      if (LS.get("me", null)) { state.me = LS.get("me"); await enterApp(); }
      else showLogin(friendly(err));
    }
  }
  start();
})();

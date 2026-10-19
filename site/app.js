/* Shared dedupe tool. Page-level defaults via <body data-*> attributes.
   Zero dependencies, zero network calls. Sticky UX: remembers the last run locally,
   offers a Recent strip, and adds restrained motion feedback (respects reduced motion).

   Two tools share this file:
   · dedupe  — one textarea (#input) → one textarea (#output)          (default)
   · compare — two lists (#inputA / #inputB) → one result (#output) in a chosen mode
               <body data-tool="compare" data-mode="only-a">            (_compare inits) */
(function () {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const doc = document.documentElement;
  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false, addEventListener() {} };
  const still = () => reduceMotion.matches;
  const canHover = window.matchMedia ? window.matchMedia("(hover: hover)") : { matches: false };

  if (body.dataset.tool === "compare") { initCompare(); return; }
  const input = $("input");
  if (!input) return; // pages without the tool
  const output = $("output");
  const stats = $("stats");

  // ---------- storage (local only; never leaves the tab / device) ----------
  const KEY = "linesdedupe:v1:" + (body.dataset.mode || "lines");
  const PAGE = location.pathname.replace(/index\.html$/, "/");
  const RECENT_MAX = 3;
  const RECENT_KEEP = 8000; // chars per snapshot, keeps localStorage small
  const store = (() => {
    try {
      const t = "__ld_t";
      localStorage.setItem(t, "1");
      localStorage.removeItem(t);
      return localStorage;
    } catch (e) {
      return null; // private mode / blocked storage → degrade silently
    }
  })();
  const readJSON = (k, fallback) => {
    if (!store) return fallback;
    try {
      const v = JSON.parse(store.getItem(k));
      return v && typeof v === "object" ? v : fallback;
    } catch (e) {
      return fallback;
    }
  };
  const writeJSON = (k, v) => {
    if (!store) return;
    try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* quota — ignore */ }
  };

  // Per-page defaults: <body data-ignore-case="off" data-keep="first" data-sort="none" data-drop-blank="off">
  const attr = (name, fallback) => (body.dataset[name] != null ? body.dataset[name] : fallback);
  const setCheck = (id, value) => { if ($(id) && value === "off") $(id).checked = false; };
  setCheck("ignoreCase", attr("ignoreCase", "on"));
  setCheck("dropBlank", attr("dropBlank", "on"));
  if ($("keep") && attr("keep", "")) $("keep").value = attr("keep");
  if ($("sort") && attr("sort", "")) $("sort").value = attr("sort");

  // ---------- options state ----------
  const optionIds = ["ignoreCase", "trim", "dropBlank", "keep", "sort"];
  const readOptions = () => {
    const o = {};
    optionIds.forEach((id) => {
      const el = $(id);
      if (!el) return;
      o[id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return o;
  };
  const applyOptions = (o) => {
    if (!o) return;
    optionIds.forEach((id) => {
      const el = $(id);
      if (!el || o[id] == null) return;
      if (el.type === "checkbox") el.checked = !!o[id];
      else el.value = String(o[id]);
    });
  };

  // Email mode: also compare without dots/+tags in the local part (gmail-style aliases)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function emailKey(s) {
    const at = s.lastIndexOf("@");
    if (at < 1) return s;
    let local = s.slice(0, at).split("+")[0];
    let domain = s.slice(at + 1);
    if (/^(gmail\.com|googlemail\.com)$/i.test(domain)) {
      domain = "gmail.com";
      local = local.replace(/\./g, "");
    }
    return local + "@" + domain;
  }

  function norm(line, ignoreCase, trim) {
    let s = trim ? line.trim() : line;
    if (ignoreCase) s = s.toLowerCase();
    return body.dataset.mode === "email" ? emailKey(s) : s;
  }

  // ---------- toast (single reusable node, polite, auto-dismiss) ----------
  const toast = $("toast");
  let toastTimer = 0;
  function say(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("is-on");
    void toast.offsetWidth; // restart the slide-in
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2000);
  }

  // ---------- count tick-up (+ gentle celebrate) ----------
  function countUp(node, to) {
    if (!node) return;
    if (still() || to <= 0) { node.textContent = String(to); return; }
    const from = parseInt(node.dataset.v || "0", 10) || 0;
    node.dataset.v = String(to);
    if (from === to) { node.textContent = String(to); return; }
    const t0 = performance.now();
    const dur = 420;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = String(to);
    };
    requestAnimationFrame(step);
  }

  // ---------- output panel pulse ----------
  const outPanel = output ? output.closest(".pane") : null;
  function pulse(node) {
    if (!node || still()) return;
    node.classList.remove("pulse");
    void node.offsetWidth;
    node.classList.add("pulse");
  }

  let lastOut = null;

  function dedupe() {
    const ignoreCase = $("ignoreCase") ? $("ignoreCase").checked : true;
    const trim = $("trim") ? $("trim").checked : true;
    const dropBlank = $("dropBlank") ? $("dropBlank").checked : true;
    const keep = $("keep") ? $("keep").value : "first";
    const sort = $("sort") ? $("sort").value : "none";
    let lines = input.value.split(/\r\n|\n|\r/);
    if (dropBlank) lines = lines.filter((l) => (trim ? l.trim() : l).length > 0);

    const seen = new Map();
    if (keep === "first") {
      const out = [];
      for (const line of lines) {
        const key = norm(line, ignoreCase, trim);
        if (seen.has(key)) continue;
        seen.set(key, true);
        out.push(trim ? line.trim() : line);
      }
      lines = out;
    } else {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const key = norm(line, ignoreCase, trim);
        if (seen.has(key)) {
          lines[i] = null;
        } else {
          seen.set(key, true);
          lines[i] = trim ? line.trim() : line;
        }
      }
      lines = lines.filter((l) => l !== null);
    }

    if (sort === "asc") lines = lines.slice().sort((a, b) => a.localeCompare(b));
    if (sort === "desc") lines = lines.slice().sort((a, b) => b.localeCompare(a));

    const rawLines = input.value === "" ? [] : input.value.split(/\r\n|\n|\r/);
    const rawCount = rawLines.length;
    const unique = lines.length;
    const removed = Math.max(0, rawCount - unique);
    const next = lines.join("\n");

    if (output) output.value = next;
    if (next !== lastOut) {
      lastOut = next;
      pulse(outPanel);
    }

    let invalid = 0;
    if (body.dataset.mode === "email") invalid = lines.filter((l) => !EMAIL_RE.test(l)).length;
    let msg = rawCount + " in → " + unique + " unique · " + removed + " removed";
    if (invalid) msg += " · " + invalid + " not a valid email";

    if (stats) {
      // Numbers live in spans so they can tick up; the full sentence stays on aria-label
      // (single polite announcement instead of one per number).
      stats.innerHTML =
        '<span class="n" data-v="' + rawCount + '">' + rawCount + "</span> in → " +
        '<span class="n" data-v="' + unique + '">' + unique + "</span> unique · " +
        '<span class="n n-removed" data-v="' + removed + '">' + removed + "</span> removed" +
        (invalid ? ' · <span class="n n-invalid" data-v="' + invalid + '">' + invalid + "</span> not a valid email" : "");
      stats.setAttribute("aria-label", msg);
      stats.querySelectorAll(".n").forEach((n) => countUp(n, parseInt(n.dataset.v, 10)));
      if (removed > 0) {
        stats.classList.toggle("has-removed", true);
        if (!still()) {
          stats.classList.remove("celebrate");
          void stats.offsetWidth;
          stats.classList.add("celebrate");
        }
      } else {
        stats.classList.remove("has-removed");
      }
    }
  }

  // ---------- empty state ----------
  function syncEmpty() {
    doc.classList.toggle("is-empty", input.value.trim() === "");
  }

  // ---------- recent pastes (local only, last 3) ----------
  const recentBar = $("recent");
  const recentList = $("recentList");
  // The Recent shelf is meant to sit right under the document window, not above
  // the editor. Move it in the DOM once, before it is rendered.
  if (recentBar && outPanel && outPanel.closest(".window")) {
    const win = outPanel.closest(".window");
    if (win.parentNode) win.parentNode.insertBefore(recentBar, win.nextSibling);
  }
  const recentClear = $("recentClear");
  const rkey = KEY + ":recent";
  let recent = Array.isArray(readJSON(rkey, [])) ? readJSON(rkey, []) : [];

  const truncLine = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  function renderRecent() {
    if (!recentBar || !recentList) return;
    recentBar.hidden = recent.length === 0;
    recentList.innerHTML = "";
    recent.forEach((snap) => {
      const first = (snap.text.split(/\r\n|\n|\r/).find((l) => l.trim()) || "").trim();
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.title = snap.text.length > 400 ? snap.text.slice(0, 400) + "…" : snap.text;
      const label = document.createElement("span");
      label.className = "chip-text";
      label.textContent = truncLine(first || "(blank lines)", 26);
      const meta = document.createElement("span");
      meta.className = "chip-meta";
      meta.textContent = snap.count + " line" + (snap.count === 1 ? "" : "s");
      b.append(label, meta);
      b.addEventListener("click", () => {
        input.value = snap.text;
        syncEmpty();
        dedupe();
        input.focus();
        say("Restored from this device");
      });
      li.append(b);
      recentList.append(li);
    });
  }

  function pushRecent() {
    const text = input.value;
    if (!text.trim()) return;
    if (recent[0] && recent[0].text === text) return; // already newest
    const entry = {
      text: text.length > RECENT_KEEP ? text.slice(0, RECENT_KEEP) : text,
      count: text.split(/\r\n|\n|\r/).length,
      at: Date.now(),
    };
    recent = [entry].concat(recent.filter((r) => r.text !== entry.text)).slice(0, RECENT_MAX);
    writeJSON(rkey, recent);
    renderRecent();
  }

  if (recentClear) recentClear.addEventListener("click", () => {
    recent = [];
    writeJSON(rkey, recent);
    renderRecent();
    say("Recent list cleared");
  });

  // ---------- restore last session (previous run + options, local only) ----------
  // Options are global to the tool (what you like should stick everywhere);
  // pasted text is restored per page, so an inner long-tail page never opens
  // with someone else's list it never showed that page's example for.
  const saved = readJSON(KEY, null);
  if (saved) {
    applyOptions(saved.options);
    if (typeof saved.text === "string" && saved.text && saved.page === PAGE) {
      input.value = saved.text;
      doc.classList.add("is-restored");
    }
  }
  syncEmpty();
  syncRestoreNote();

  let saveTimer = 0;
  function syncRestoreNote() {
    const note = $("restored");
    if (!note) return;
    note.hidden = !doc.classList.contains("is-restored") || input.value.trim() === "";
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeJSON(KEY, {
        text: input.value.slice(0, 200000),
        options: readOptions(),
        page: PAGE,
        at: Date.now(),
      });
    }, 250);
  }

  // ---------- wire the controls ----------
  ["input", "ignoreCase", "trim", "dropBlank", "keep", "sort"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => { syncEmpty(); dedupe(); saveSoon(); });
    el.addEventListener("change", () => { syncEmpty(); dedupe(); saveSoon(); });
  });

  input.addEventListener("input", () => {
    // once the human edits, the "picked up where you left off" note can go
    doc.classList.remove("is-restored");
    syncRestoreNote();
  });

  if ($("restoredClear")) $("restoredClear").addEventListener("click", () => {
    input.value = "";
    doc.classList.remove("is-restored");
    syncEmpty();
    syncRestoreNote();
    dedupe();
    saveSoon();
    input.focus();
    say("Fresh start");
  });

  if ($("clearIn")) $("clearIn").addEventListener("click", () => {
    input.value = "";
    syncEmpty();
    dedupe();
    saveSoon();
    input.focus();
    say("Cleared");
  });

  if ($("example")) $("example").addEventListener("click", () => {
    input.value = (body.dataset.example || "").replace(/\\n/g, "\n");
    syncEmpty();
    dedupe();
    saveSoon();
    input.focus();
    say("Example loaded");
  });

  async function copyOut() {
    if (!output || !output.value) { say("Nothing to copy yet"); return; }
    const btn = $("copy");
    const label = btn ? btn.querySelector(".btn-label") : null;
    try {
      await navigator.clipboard.writeText(output.value);
    } catch (e) {
      output.select();
      try { document.execCommand("copy"); } catch (err) { say("Copy failed — select and press ⌘/Ctrl+C"); return; }
    }
    if (btn) {
      btn.classList.add("copied");
      if (label) label.textContent = "Copied";
      setTimeout(() => { btn.classList.remove("copied"); if (label) label.textContent = "Copy"; }, 1500);
    }
    const o = readOptions();
    const n = output.value.split(/\r\n|\n|\r/).filter((l) => l.length).length;
    say("Copied " + n + " line" + (n === 1 ? "" : "s") + (o.sort === "asc" ? " (A → Z)" : ""));
    pushRecent();
  }

  if ($("copy")) $("copy").addEventListener("click", copyOut);

  if ($("download")) $("download").addEventListener("click", () => {
    const blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = body.dataset.file || "unique-lines.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    say("Saved " + a.download);
  });

  // ---------- keyboard: ⌘/Ctrl+Enter = run, or copy if already up to date ----------
  function runOrCopy() {
    const before = output ? output.value : "";
    dedupe();
    saveSoon();
    syncEmpty();
    if (output && before && before === output.value) copyOut();
    else if (output && output.value) say("Deduped — ⌘/Ctrl+Enter again to copy");
  }

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runOrCopy();
      return;
    }
    if (e.key === "Escape" && document.activeElement === input) {
      e.preventDefault();
      input.blur();
    }
    // "/" jumps into the input from anywhere (not while typing elsewhere)
    if (e.key === "/" && !e.altKey && !e.metaKey && !e.ctrlKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) &&
        !document.activeElement.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });

  if (!canHover.matches) doc.classList.add("is-touch");

  renderRecent();
  dedupe();
  lastOut = output ? output.value : null; // no pulse on first paint

  /* ============================================================
     Compare two lists
     ============================================================ */
  function initCompare() {
    const A = $("inputA");
    const B = $("inputB");
    if (!A || !B) return;
    const output = $("output");
    const stats = $("stats");
    const outPanel = output ? output.closest(".pane") : null;
    const MODE_IDS = ["onlyA", "onlyB", "both", "unique"];
    const TOOL = "compare";

    // ---------- storage (same prefix + helpers as the dedupe tool) ----------
    const KEY = "linesdedupe:v1:compare";
    const PAGE = location.pathname.replace(/index\.html$/, "/");
    const RECENT_MAX = 3;
    const RECENT_KEEP = 8000;
    const store = (() => {
      try {
        const t = "__ld_t";
        localStorage.setItem(t, "1");
        localStorage.removeItem(t);
        return localStorage;
      } catch (e) {
        return null;
      }
    })();
    const readJSON = (k, fallback) => {
      if (!store) return fallback;
      try {
        const v = JSON.parse(store.getItem(k));
        return v && typeof v === "object" ? v : fallback;
      } catch (e) {
        return fallback;
      }
    };
    const writeJSON = (k, v) => {
      if (!store) return;
      try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* quota — ignore */ }
    };

    // ---------- page defaults: <body data-mode="only-a" data-ignore-case="off" …> ----------
    const MODES = {
      "only-a": "onlyA", "only-b": "onlyB", both: "both", unique: "unique",
    };
    const MODE_LABELS = {
      onlyA: "only in A",
      onlyB: "only in B",
      both: "in both",
      unique: "all unique",
    };
    const optionIds = ["ignoreCase", "trim", "dropBlank", "sort"];
    const readOptions = () => {
      const o = {};
      optionIds.forEach((id) => {
        const el = $(id);
        if (!el) return;
        o[id] = el.type === "checkbox" ? el.checked : el.value;
      });
      if ($("mode")) o.mode = $("mode").value;
      return o;
    };
    const applyOptions = (o) => {
      if (!o) return;
      optionIds.forEach((id) => {
        const el = $(id);
        if (!el || o[id] == null) return;
        if (el.type === "checkbox") el.checked = !!o[id];
        else el.value = String(o[id]);
      });
      if ($("mode") && o.mode && $("mode").querySelector('option[value="' + o.mode + '"]')) {
        $("mode").value = o.mode;
      }
    };
    const setCheck = (id, value) => { if ($(id) && value === "off") $(id).checked = false; };
    setCheck("ignoreCase", body.dataset.ignoreCase || "on");
    setCheck("trim", body.dataset.trim || "on");
    setCheck("dropBlank", body.dataset.dropBlank || "on");
    if ($("sort") && body.dataset.sort) $("sort").value = body.dataset.sort;
    if ($("mode") && MODES[body.dataset.mode]) $("mode").value = MODES[body.dataset.mode];

    // ---------- toast (one reusable node) ----------
    const toast = $("toast");
    let toastTimer = 0;
    function say(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove("is-on");
      void toast.offsetWidth;
      toast.classList.add("is-on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2000);
    }

    function countUp(node, to) {
      if (!node) return;
      if (still() || to <= 0) { node.textContent = String(to); return; }
      const from = parseInt(node.dataset.v || "0", 10) || 0;
      node.dataset.v = String(to);
      if (from === to) { node.textContent = String(to); return; }
      const t0 = performance.now();
      const dur = 420;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = String(Math.round(from + (to - from) * eased));
        if (p < 1) requestAnimationFrame(step);
        else node.textContent = String(to);
      };
      requestAnimationFrame(step);
    }

    function pulse(node) {
      if (!node || still()) return;
      node.classList.remove("pulse");
      void node.offsetWidth;
      node.classList.add("pulse");
    }

    // ---------- the comparison itself ----------
    // Every line is compared by its normalized key (trim / ignore case),
    // but emitted with the original casing so nothing is silently rewritten.
    const squash = (s) => s.replace(/\s+/g, " ").trim();
    // A list pasted from a spreadsheet often lands as one tab/comma-separated line.
    // If there are no newlines but separators, split on them so the tool just works.
    function split(text) {
      let lines = text.split(/\r\n|\n|\r/);
      if (lines.length === 1 && /[\t,]/.test(lines[0])) lines = lines[0].split(/[\t,]/);
      return lines;
    }
    function key(line) {
      let s = trim ? line.trim() : line;
      if (ignoreCase) s = s.toLowerCase();
      return squash(s);
    }

    let lastOut = null;
    // option values, read once per run and shared with key()
    let ignoreCase = true;
    let trim = true;
    let dropBlank = true;
    let sort = "none";

    function compare() {
      ignoreCase = $("ignoreCase") ? $("ignoreCase").checked : true;
      trim = $("trim") ? $("trim").checked : true;
      dropBlank = $("dropBlank") ? $("dropBlank").checked : true;
      sort = $("sort") ? $("sort").value : "none";
      const mode = MODE_IDS.indexOf($("mode") ? $("mode").value : "onlyA") >= 0
        ? $("mode").value : "onlyA";

      const prep = (raw) => {
        let lines = split(raw);
        if (dropBlank) lines = lines.filter((l) => (trim ? l.trim() : l).length > 0);
        return lines;
      };
      const rawA = A.value === "" ? [] : split(A.value);
      const rawB = B.value === "" ? [] : split(B.value);
      const listA = prep(A.value);
      const listB = prep(B.value);

      // unique keys per side, plus the first original line seen for each key
      const uniq = (lines) => {
        const map = new Map();
        for (const line of lines) {
          const k = key(line);
          if (!map.has(k)) map.set(k, trim ? line.trim() : line);
        }
        return map;
      };
      const setA = uniq(listA);
      const setB = uniq(listB);

      let out = [];
      let counter = 0;
      if (mode === "onlyA") {
        for (const [k, v] of setA) if (!setB.has(k)) out.push(v);
        counter = out.length;
      } else if (mode === "onlyB") {
        for (const [k, v] of setB) if (!setA.has(k)) out.push(v);
        counter = out.length;
      } else if (mode === "both") {
        for (const [k, v] of setA) if (setB.has(k)) out.push(v);
        counter = out.length;
      } else {
        const all = new Map();
        for (const [k, v] of setA) all.set(k, v);
        for (const [k, v] of setB) if (!all.has(k)) all.set(k, v);
        out = Array.from(all.values());
        counter = out.length;
      }

      if (sort === "asc") out = out.slice().sort((a, b) => a.localeCompare(b));
      if (sort === "desc") out = out.slice().sort((a, b) => b.localeCompare(a));

      const next = out.join("\n");
      if (output) output.value = next;
      if (next !== lastOut) {
        lastOut = next;
        pulse(outPanel);
      }

      // Status bar: two input counts, then the number this mode produced.
      const nA = setA.size;
      const nB = setB.size;
      const shared = Array.from(setA.keys()).filter((k) => setB.has(k)).length;
      if (stats) {
        // Label the number with the mode, so “3 only in A” never reads ambiguously.
        const label = mode === "unique" ? "all unique" : MODE_LABELS[mode];
        stats.innerHTML =
          '<span class="n" data-v="' + nA + '">' + nA + "</span> in A · " +
          '<span class="n" data-v="' + nB + '">' + nB + "</span> in B · " +
          '<span class="n n-removed" data-v="' + counter + '">' + counter + "</span> " +
          label;
        stats.setAttribute(
          "aria-label",
          nA + " unique in list A, " + nB + " unique in list B, " + shared +
          " in both, result: " + counter + " " + label
        );
        stats.querySelectorAll(".n").forEach((n) => countUp(n, parseInt(n.dataset.v, 10)));
        const interesting = mode === "both" || mode === "unique" ? shared > 0 : counter > 0;
        stats.classList.toggle("has-removed", interesting);
        if (interesting && !still()) {
          stats.classList.remove("celebrate");
          void stats.offsetWidth;
          stats.classList.add("celebrate");
        }
      }
      return { mode, rawCount: rawA.length + rawB.length, count: counter, nA, nB, out };
    }

    // ---------- empty state ----------
    const syncEmpty = () => {
      doc.classList.toggle("is-empty", A.value.trim() === "" && B.value.trim() === "");
    };

    // ---------- recent pairs (local only, last 3) ----------
    const recentBar = $("recent");
    const recentList = $("recentList");
    if (recentBar && outPanel && outPanel.closest(".window")) {
      const win = outPanel.closest(".window");
      if (win.parentNode) win.parentNode.insertBefore(recentBar, win.nextSibling);
    }
    const recentClear = $("recentClear");
    const rkey = KEY + ":recent";
    let recent = Array.isArray(readJSON(rkey, [])) ? readJSON(rkey, []) : [];
    const truncLine = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

    function renderRecent() {
      if (!recentBar || !recentList) return;
      recentBar.hidden = recent.length === 0;
      recentList.innerHTML = "";
      recent.forEach((snap) => {
        const firstA = (split(snap.a || "").find((l) => l.trim()) || "").trim();
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.title = "A: " + truncLine(firstA || "(blank)", 120) + "\nB: " +
          truncLine((split(snap.b || "").find((l) => l.trim()) || "(blank)").trim(), 120);
        const label = document.createElement("span");
        label.className = "chip-text";
        label.textContent = truncLine(firstA || "(blank lines)", 22);
        const meta = document.createElement("span");
        meta.className = "chip-meta is-pair";
        meta.textContent = snap.aCount + " + " + snap.bCount;
        b.append(label, meta);
        b.addEventListener("click", () => {
          A.value = snap.a || "";
          B.value = snap.b || "";
          syncEmpty();
          compare();
          A.focus();
          say("Restored from this device");
        });
        li.append(b);
        recentList.append(li);
      });
    }

    function pushRecent() {
      const a = A.value;
      const b = B.value;
      if (!a.trim() && !b.trim()) return;
      if (recent[0] && recent[0].a === a && recent[0].b === b) return;
      const entry = {
        a: a.length > RECENT_KEEP ? a.slice(0, RECENT_KEEP) : a,
        b: b.length > RECENT_KEEP ? b.slice(0, RECENT_KEEP) : b,
        aCount: a === "" ? 0 : split(a).length,
        bCount: b === "" ? 0 : split(b).length,
        at: Date.now(),
      };
      recent = [entry]
        .concat(recent.filter((r) => !(r.a === entry.a && r.b === entry.b)))
        .slice(0, RECENT_MAX);
      writeJSON(rkey, recent);
      renderRecent();
    }

    if (recentClear) recentClear.addEventListener("click", () => {
      recent = [];
      writeJSON(rkey, recent);
      renderRecent();
      say("Recent list cleared");
    });

    // ---------- restore last session (options everywhere, text only on this page) ----------
    const saved = readJSON(KEY, null);
    if (saved) {
      applyOptions(saved.options);
      if (saved.page === PAGE) {
        if (typeof saved.a === "string" && saved.a) A.value = saved.a;
        if (typeof saved.b === "string" && saved.b) B.value = saved.b;
        if ((A.value || "") !== "" || (B.value || "") !== "") doc.classList.add("is-restored");
      }
    }
    syncEmpty();
    syncRestoreNote();

    let saveTimer = 0;
    function syncRestoreNote() {
      const note = $("restored");
      if (!note) return;
      note.hidden = !doc.classList.contains("is-restored") || (A.value.trim() === "" && B.value.trim() === "");
    }
    function saveSoon() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        writeJSON(KEY, {
          a: A.value.slice(0, 200000),
          b: B.value.slice(0, 200000),
          options: readOptions(),
          page: PAGE,
          at: Date.now(),
        });
      }, 250);
    }

    // ---------- wire the controls ----------
    ["inputA", "inputB", "ignoreCase", "trim", "dropBlank", "sort", "mode"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => { syncEmpty(); compare(); saveSoon(); });
      el.addEventListener("change", () => { syncEmpty(); compare(); saveSoon(); });
    });
    [A, B].forEach((el) => el.addEventListener("input", () => {
      doc.classList.remove("is-restored");
      syncRestoreNote();
    }));

    if ($("restoredClear")) $("restoredClear").addEventListener("click", () => {
      A.value = "";
      B.value = "";
      doc.classList.remove("is-restored");
      syncEmpty();
      syncRestoreNote();
      compare();
      saveSoon();
      A.focus();
      say("Fresh start");
    });
    if ($("clearIn")) $("clearIn").addEventListener("click", () => {
      A.value = "";
      B.value = "";
      doc.classList.remove("is-restored");
      syncEmpty();
      syncRestoreNote();
      compare();
      saveSoon();
      A.focus();
      say("Cleared");
    });
    if ($("copyA")) $("copyA").addEventListener("click", () => {
      copyText(A.value, $("copyA"), "List A");
    });
    if ($("copyB")) $("copyB").addEventListener("click", () => {
      copyText(B.value, $("copyB"), "List B");
    });

    async function copyText(text, btn, what) {
      if (!text) { say(what + " is empty"); return; }
      const label = btn ? btn.querySelector(".btn-label") : null;
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // fall back to a hidden textarea + execCommand (works without clipboard permission)
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        if (!ok) { say("Copy failed — select and press ⌘/Ctrl+C"); return; }
      }
      if (btn) {
        btn.classList.add("copied");
        if (label) label.textContent = "Copied";
        setTimeout(() => { btn.classList.remove("copied"); if (label) label.textContent = "Copy"; }, 1500);
      }
      const n = split(text).filter((l) => l.length).length;
      say("Copied " + what + " · " + n + " line" + (n === 1 ? "" : "s"));
    }

    async function copyOut() {
      if (!output || !output.value) { say("Nothing to copy yet"); return; }
      const btn = $("copy");
      const label = btn ? btn.querySelector(".btn-label") : null;
      try {
        await navigator.clipboard.writeText(output.value);
      } catch (e) {
        output.select();
        try { document.execCommand("copy"); } catch (err) { say("Copy failed — select and press ⌘/Ctrl+C"); return; }
      }
      if (btn) {
        btn.classList.add("copied");
        if (label) label.textContent = "Copied";
        setTimeout(() => { btn.classList.remove("copied"); if (label) label.textContent = "Copy"; }, 1500);
      }
      const n = output.value.split(/\r\n|\n|\r/).filter((l) => l.length).length;
      const mode = $("mode") ? $("mode").value : "onlyA";
      say("Copied " + n + " line" + (n === 1 ? "" : "s") + " · " + MODE_LABELS[mode]);
      pushRecent();
    }
    if ($("copy")) $("copy").addEventListener("click", copyOut);

    if ($("download")) $("download").addEventListener("click", () => {
      if (!output.value) { say("Nothing to download yet"); return; }
      const blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      const mode = $("mode") ? $("mode").value : "onlyA";
      a.href = URL.createObjectURL(blob);
      a.download = body.dataset.file || "compare-two-lists-" + mode + ".txt";
      a.click();
      URL.revokeObjectURL(a.href);
      say("Saved " + a.download);
    });

    // Load example: <body data-example-a="…" data-example-b="…"> (\n = newline)
    if ($("example")) $("example").addEventListener("click", () => {
      A.value = (body.dataset.exampleA || "").replace(/\\n/g, "\n");
      B.value = (body.dataset.exampleB || "").replace(/\\n/g, "\n");
      syncEmpty();
      compare();
      saveSoon();
      A.focus();
      say("Example loaded");
    });

    // ---------- keyboard: ⌘/Ctrl+Enter run → again to copy · Esc blurs · / jumps in ----------
    function runOrCopy() {
      const before = output ? output.value : "";
      compare();
      saveSoon();
      syncEmpty();
      if (output && before && before === output.value) copyOut();
      else if (output && output.value) say("Compared — ⌘/Ctrl+Enter again to copy");
    }
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runOrCopy();
        return;
      }
      if (e.key === "Escape" && (document.activeElement === A || document.activeElement === B)) {
        e.preventDefault();
        document.activeElement.blur();
      }
      if (e.key === "/" && !e.altKey && !e.metaKey && !e.ctrlKey &&
          !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) &&
          !document.activeElement.isContentEditable) {
        e.preventDefault();
        A.focus();
      }
    });

    if (!canHover.matches) doc.classList.add("is-touch");

    renderRecent();
    compare();
    lastOut = output ? output.value : null; // no pulse on first paint
  }
})();

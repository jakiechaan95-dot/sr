(function () {
"use strict";

/* ================= constants & state ================= */
const PAY = [
  { k: "cash", n: "Cash" },
  { k: "sampath", n: "Sampath" },
  { k: "amana", n: "Amana" },
  { k: "seylan", n: "Seylan" },
  { k: "commercial", n: "Commercial" },
  { k: "amex", n: "Amex" },
  { k: "web", n: "Web" }
];
const DEFAULT_BRANCHES = [{ id: "b1", name: "Branch 1" }, { id: "b2", name: "Branch 2" }, { id: "b3", name: "Branch 3" }];
const TABLE = { sales: "sales", income: "other_income", expense: "expenses" };
const WARRANTY = [
  { d: 0, n: "No warranty" }, { d: 7, n: "7 days" }, { d: 14, n: "14 days" }, { d: 30, n: "1 month" },
  { d: 90, n: "3 months" }, { d: 180, n: "6 months" }, { d: 365, n: "1 year" }, { d: 730, n: "2 years" }
];
function warName(d) { const w = WARRANTY.find(x => x.d === Number(d)); return w ? w.n : (d ? d + " days" : "No warranty"); }

const S = {
  date: todayISO(), lastToday: todayISO(), branch: "b1", days: {}, prevClose: {}, me: null,
  branches: DEFAULT_BRANCHES.map(b => ({ ...b })),
  edit: { sale: null, income: null, expense: null }
};
const $ = id => document.getElementById(id);
let sb = null, channel = null, refreshTimer = null;

/* ================= helpers ================= */
function todayISO() { return iso(new Date()); }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function shift(s, n) { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); }
function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function r2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return (Math.abs(n) < 0.005 ? 0 : n).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function bname(id) { return (S.branches.find(b => b.id === id) || {}).name || id; }
function payName(k) { return (PAY.find(p => p.k === k) || {}).n || k; }
function prettyDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function rows(o) { return Object.values(o || {}).filter(r => r && r.id).sort((a, b) => (a.t || 0) - (b.t || 0)); }
function saleTotal(r) { return PAY.reduce((a, p) => a + num(r.pay && r.pay[p.k]), 0); }
function setStatus(t) { $("status").textContent = t; }
function showBanner(t) { const b = $("banner"); b.textContent = t || ""; b.hidden = !t; }
function emptyDay(branch, date) { return { branch, date, opening: 0, banked: 0, counted: null, notes: "", sales: {}, income: {}, expense: {} }; }

function calc(d) {
  d = d || {};
  const z = () => Object.fromEntries(PAY.map(p => [p.k, 0]));
  const sales = rows(d.sales), inc = rows(d.income), exp = rows(d.expense);
  const sBy = z(), iBy = z(), eBy = z();
  sales.forEach(r => PAY.forEach(p => sBy[p.k] += num(r.pay && r.pay[p.k])));
  inc.forEach(r => { const k = r.method in sBy ? r.method : "cash"; iBy[k] += num(r.amount); });
  exp.forEach(r => { const k = r.method in sBy ? r.method : "cash"; eBy[k] += num(r.amount); });
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const opening = num(d.opening), banked = num(d.banked);
  const expected = r2(opening + sBy.cash + iBy.cash - eBy.cash - banked);
  const counted = (d.counted === null || d.counted === undefined || d.counted === "") ? null : num(d.counted);
  const totalSales = sum(sBy);
  return { sales, inc, exp, sBy, iBy, eBy, totalSales, nonCash: totalSales - sBy.cash, totalInc: sum(iBy), totalExp: sum(eBy),
    opening, banked, expected, counted, diff: counted == null ? null : r2(counted - expected), notes: d.notes || "" };
}
function diffPill(c) {
  if (c.counted == null) return '<span class="pill none">Not counted</span>';
  if (Math.abs(c.diff) < 0.005) return '<span class="pill ok">Balanced</span>';
  return c.diff < 0 ? `<span class="pill short">Short ${fmt(-c.diff)}</span>` : `<span class="pill over">Excess ${fmt(c.diff)}</span>`;
}

/* ================= Supabase data layer ================= */
// Build {"b1|2026-10-05": dayObject} from table rows.
function buildDays(days, sales, inc, exp, items) {
  const o = {}, byId = {};
  const get = (b, dt) => o[b + "|" + dt] || (o[b + "|" + dt] = emptyDay(b, dt));
  (days || []).forEach(r => Object.assign(get(r.branch_id, r.date), { opening: r.opening, banked: r.banked, counted: r.counted, notes: r.notes || "", _row: true }));
  (sales || []).forEach(r => {
    byId[r.id] = get(r.branch_id, r.date).sales[r.id] = { id: r.id, t: Date.parse(r.created_at), ref: r.ref, desc: r.description, phone: r.customer_phone || "",
      remarks: r.remarks, items: [], pay: Object.fromEntries(PAY.map(p => [p.k, num(r[p.k])])) };
  });
  (items || []).slice().sort((a, b) => a.line_no - b.line_no).forEach(r => {
    const s = byId[r.sale_id]; if (!s) return;
    s.items.push({ item: r.item, serial: r.serial || "", qty: num(r.qty), unit_price: num(r.unit_price), warranty_days: r.warranty_days || 0, warranty_until: r.warranty_until });
  });
  (inc || []).forEach(r => { get(r.branch_id, r.date).income[r.id] = { id: r.id, t: Date.parse(r.created_at), desc: r.description, amount: num(r.amount), method: r.method }; });
  (exp || []).forEach(r => { get(r.branch_id, r.date).expense[r.id] = { id: r.id, t: Date.parse(r.created_at), desc: r.description, amount: num(r.amount), method: r.method }; });
  return o;
}
function check(res) { if (res.error) throw res.error; return res.data; }

// Fetch every row of a query, 1000 at a time.
async function fetchAll(makeQuery) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const data = check(await makeQuery().range(from, from + step - 1));
    out.push(...data);
    if (data.length < step) break;
  }
  return out;
}
async function loadRange(from, to) {
  const q = t => () => sb.from(t).select("*").gte("date", from).lte("date", to).order("created_at");
  const [d, s, i, e, it] = await Promise.all([
    fetchAll(() => sb.from("days").select("*").gte("date", from).lte("date", to).order("date")),
    fetchAll(q("sales")), fetchAll(q("other_income")), fetchAll(q("expenses")),
    fetchAll(() => sb.from("sale_items").select("*").gte("date", from).lte("date", to).order("created_at"))
  ]);
  return buildDays(d, s, i, e, it);
}
// Closing cash of a day = counted cash, or expected cash if nobody counted.
function closingOf(d) { if (!d) return null; const c = calc(d); return c.counted != null ? c.counted : c.expected; }

async function refresh() {
  const date = S.date;
  try {
    // Previous day's closing comes from a database function that returns only
    // the number, so branch staff never load yesterday's records.
    const [all, closes] = await Promise.all([
      loadRange(date, date),
      Promise.all(S.branches.map(b => sb.rpc("prev_closing", { p_branch: b.id, p_date: date })))
    ]);
    if (date !== S.date) return;
    const o = {}; S.prevClose = {};
    S.branches.forEach((b, i) => {
      if (all[b.id + "|" + date]) o[b.id] = all[b.id + "|" + date];
      const pc = closes[i] && !closes[i].error ? closes[i].data : null;
      if (pc !== null && pc !== undefined) S.prevClose[b.id] = num(pc);
    });
    S.days = o; render();
    setStatus("Synced " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    showBanner("");
    autoCarry(date);
  } catch (e) {
    setStatus("Offline");
    showBanner("Could not load entries: " + (e.message || e) + ". Check your internet connection.");
  }
}
// Today <-> yesterday link: when a branch opens a new day, its opening cash
// is set automatically to the previous day's closing cash (only if not set yet).
const carried = new Set();
async function autoCarry(date) {
  if (date > todayISO() || !canEdit()) return;
  let changed = false;
  for (const b of S.branches) {
    const key = b.id + "|" + date;
    const d = S.days[b.id];
    if ((d && d._row) || S.prevClose[b.id] == null || carried.has(key)) continue;
    carried.add(key);
    const res = await sb.from("days").upsert({ branch_id: b.id, date, opening: r2(S.prevClose[b.id]) },
      { onConflict: "branch_id,date", ignoreDuplicates: true });
    if (!res.error) changed = true;
  }
  if (changed && date === S.date) scheduleRefresh();
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 250); }

async function write(fn) {
  setStatus("Saving…");
  try { await fn(); await refresh(); }
  catch (e) {
    setStatus("Not saved");
    const msg = String(e.message || e);
    showBanner(/row-level security/i.test(msg)
      ? "Not saved: branch staff can only change today's records. Go to today, or ask the admin to fix past days."
      : "Could not save: " + msg);
    throw e;
  }
}
function saveDayField(field, value) {
  return write(async () => check(await sb.from("days").upsert(
    { branch_id: S.branch, date: S.date, [field]: value, updated_at: new Date().toISOString() },
    { onConflict: "branch_id,date" })));
}

// Live updates: reload when anyone changes rows for the selected date.
function subscribeLive() {
  if (channel) sb.removeChannel(channel);
  const f = "date=eq." + S.date;
  channel = sb.channel("day-" + S.date);
  ["days", "sales", "other_income", "expenses", "sale_items"].forEach(t =>
    channel.on("postgres_changes", { event: "*", schema: "public", table: t, filter: f }, scheduleRefresh));
  // deletes carry no date column by default, so also listen unfiltered for deletes
  ["sales", "other_income", "expenses", "sale_items"].forEach(t =>
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: t }, scheduleRefresh));
  channel.on("postgres_changes", { event: "*", schema: "public", table: "branches" }, loadBranches);
  channel.subscribe();
}
function isAdmin() { return !!(S.me && S.me.role === "admin"); }
// Staff may only change today's records; admin may change any day.
function canEdit() { return isAdmin() || S.date === todayISO(); }
async function loadBranches() {
  try {
    const data = check(await sb.from("branches").select("*").order("sort"));
    let list = DEFAULT_BRANCHES.map(b => ({ id: b.id, name: (data.find(x => x.id === b.id) || {}).name || b.name }));
    S.allBranches = list;
    // Staff only ever work with their own branch.
    if (!isAdmin()) list = list.filter(b => S.me && b.id === S.me.branch_id);
    S.branches = list;
    render();
  } catch (e) { /* keep current */ }
}

/* ================= static UI ================= */
$("payGrid").innerHTML = PAY.map(p => `<label class="f"><span class="payname p-${p.k}" data-fill="${p.k}" title="Put the remaining balance here">${p.n}</span><input type="number" step="0.01" min="0" inputmode="decimal" id="s_${p.k}" placeholder="0.00"></label>`).join("");
function simplePanel(kind, title, verb, ph) {
  return `<div class="panel-head"><h2>${title}</h2><span class="meta" id="${kind}Meta"></span></div>
  <form class="entry" id="${kind}Form" autocomplete="off">
    <div class="fields">
      <label class="f">Description<input id="${kind}Desc" maxlength="80" placeholder="${ph}"></label>
      <label class="f">Amount<input type="number" step="0.01" min="0" inputmode="decimal" id="${kind}Amt" placeholder="0.00"></label>
      <label class="f">${verb}<select id="${kind}Method">${PAY.map(p => `<option value="${p.k}">${p.n}</option>`).join("")}</select></label>
    </div>
    <div class="formfoot"><span class="err" id="${kind}Err"></span><div class="actions"><button type="button" class="ghost" id="${kind}Cancel" hidden>Cancel edit</button><button type="submit" class="primary" id="${kind}Save">Add</button></div></div>
  </form>
  <div class="tablewrap"><table class="ledger cards" id="${kind}Table"></table></div>`;
}
$("incomePanel").innerHTML = simplePanel("income", "Other income", "Received by", "e.g. Commission, rent received");
$("expensePanel").innerHTML = simplePanel("expense", "Other expenses", "Paid by", "e.g. Transport, tea, stationery");

/* ================= render ================= */
function renderTabs() {
  $("branchTabs").innerHTML = S.branches.map(b => `<button type="button" data-b="${b.id}" aria-pressed="${S.branch === b.id}">${esc(b.name)}</button>`).join("") +
    (isAdmin() ? `<button type="button" data-b="all" aria-pressed="${S.branch === "all"}">All branches</button><button type="button" class="rename" id="renameBtn">Rename</button>` : "");
}
function renderDateLock() {
  const today = todayISO(), notToday = S.date !== today, can = canEdit();
  const w = $("dateWarn");
  w.hidden = !notToday;
  w.classList.toggle("past-locked", notToday && !can);
  $("date").classList.toggle("notToday", notToday);
  if (notToday) {
    const when = S.date < today ? "a past day" : "a future day";
    $("dateWarnText").textContent = can
      ? `You are viewing ${prettyDate(S.date)}, ${when}, not today. Anything you save goes into ${prettyDate(S.date)}.`
      : `You are viewing ${prettyDate(S.date)}, not today. This day is read-only. Ask the admin to fix past days.`;
  }
  ["saleForm", "incomeForm", "expenseForm"].forEach(id => { $(id).hidden = !can; });
  ["opening", "banked", "counted", "notes", "prevCount"].forEach(id => { $(id).disabled = !can; });
}
function render() {
  renderTabs();
  renderDateLock();
  const admin = isAdmin();
  $("exAll").closest(".exportcard").hidden = !admin;
  $("exRange").closest(".exportcard").hidden = !admin;
  $("lookupPanel").hidden = !admin; // serial & warranty lookup: admin only
  // Staff see today only: no date arrows or picker, just today's date.
  ["prevDay", "nextDay", "todayBtn"].forEach(id => { $(id).hidden = !admin; });
  $("date").disabled = !admin;
  if (!isAdmin()) $("settingsPanel").hidden = true;
  $("date").value = S.date;
  const all = S.branch === "all";
  $("branchView").hidden = all; $("allView").hidden = !all;
  $("exOne").disabled = all;
  $("exOneTitle").textContent = all ? "Pick a branch for a single-branch report" : bname(S.branch) + ", " + prettyDate(S.date);
  if (all) renderAll(); else renderBranch();
}
function kpiHTML(c) {
  return [
    ["Total sales", fmt(c.totalSales)], ["Cash sales", fmt(c.sBy.cash)], ["Card / bank sales", fmt(c.nonCash)],
    ["Other income", fmt(c.totalInc)], ["Other expenses", fmt(c.totalExp)], ["Cash in drawer (expected)", fmt(c.expected) + " " + diffPill(c)]
  ].map(([l, v]) => `<div class="kpi"><span class="lbl">${l}</span><span class="val">${v}</span></div>`).join("");
}
function renderBranch() {
  const d = S.days[S.branch]; const c = calc(d);
  $("kpis").innerHTML = kpiHTML(c);
  $("salesMeta").textContent = c.sales.length ? `${c.sales.length} invoice${c.sales.length > 1 ? "s" : ""} · ${fmt(c.totalSales)}` : "";
  let h = `<thead><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Items</th>${PAY.map(p => `<th class="n pay p-${p.k}">${p.n}</th>`).join("")}<th class="n">Total</th><th>Remarks</th><th></th></tr></thead><tbody>`;
  if (!c.sales.length) h += `<tr><td class="empty" colspan="${PAY.length + 7}">No invoices entered for ${esc(bname(S.branch))} on ${prettyDate(S.date)}. Add the items, enter how the customer paid, then press Save invoice.</td></tr>`;
  c.sales.forEach((r, i) => {
    const cust = [r.desc, r.phone].filter(Boolean).map(esc).join(" · ");
    h += `<tr data-id="${r.id}" class="${S.edit.sale === r.id ? "editing" : ""}"><td class="dim z">${i + 1}</td><td class="title">${r.ref ? esc(r.ref) : "Bill " + (i + 1)}</td><td data-label="Customer" class="full ${cust ? "" : "z"}">${cust}</td>` +
      `<td class="items-cell ${r.items.length ? "" : "z"}">${itemsHTML(r.items)}</td>` +
      PAY.map(p => { const v = num(r.pay && r.pay[p.k]); return `<td class="n ${v ? "" : "z"}" data-label="${p.n}">${v ? fmt(v) : ""}</td>`; }).join("") +
      `<td class="n total" data-label="Total"><strong>${fmt(saleTotal(r))}</strong></td><td data-label="Remarks" class="full ${r.remarks ? "" : "z"}">${esc(r.remarks)}</td>` +
      `<td class="act">${canEdit() ? `<button class="linkbtn" data-act="edit">Edit</button><button class="linkbtn del" data-act="del">Delete</button>` : ""}</td></tr>`;
  });
  h += "</tbody>";
  if (c.sales.length) h += `<tfoot><tr><td class="title" colspan="4">Day total</td>${PAY.map(p => `<td class="n" data-label="${p.n}">${fmt(c.sBy[p.k])}</td>`).join("")}<td class="n total" data-label="Total">${fmt(c.totalSales)}</td><td colspan="2" class="z"></td></tr></tfoot>`;
  $("salesTable").innerHTML = h;
  renderSimple("income", c.inc, c.totalInc);
  renderSimple("expense", c.exp, c.totalExp);
  [["opening", d && d.opening], ["banked", d && d.banked], ["counted", d && d.counted], ["notes", d && d.notes]].forEach(([id, v]) => {
    const el = $(id); if (document.activeElement === el) return;
    if (id === "notes") el.value = v || "";
    else if (id === "counted") el.value = (v === null || v === undefined) ? "" : num(v);
    else el.value = num(v) ? num(v) : "";
  });
  const pc = S.prevClose[S.branch];
  $("carryMsg").textContent = pc == null ? "No closing cash recorded for the previous day."
    : Math.abs(pc - c.opening) < 0.005 ? `Carried from yesterday's closing: ${fmt(pc)}.`
    : `Yesterday closed with ${fmt(pc)}, but today's opening is ${fmt(c.opening)}. Press "Use yesterday's closing" if it should match.`;
  $("calc").innerHTML = [
    ["Opening cash", c.opening, ""], ["+ Cash sales", c.sBy.cash, "sub"], ["+ Other income received in cash", c.iBy.cash, "sub"],
    ["− Expenses paid in cash", -c.eBy.cash, "sub"], ["− Cash banked / handed over", -c.banked, "sub"]
  ].map(([l, v, cl]) => `<div class="line ${cl}"><span>${l}</span><span>${fmt(v)}</span></div>`).join("") +
    `<div class="line strong"><span>Expected cash in drawer</span><span>${fmt(c.expected)}</span></div>` +
    `<div class="line"><span>Counted cash</span><span>${c.counted == null ? "–" : fmt(c.counted)}</span></div>` +
    `<div class="line result"><span>Difference</span><span>${diffPill(c)}</span></div>`;
  renderTypeTable(c);
}
function renderTypeTable(c) {
  let h = `<thead><tr><th>Payment type</th><th class="n">Sales</th><th class="n">Other income</th><th class="n">Expenses</th><th class="n">Net</th></tr></thead><tbody>`;
  PAY.forEach(p => { const net = c.sBy[p.k] + c.iBy[p.k] - c.eBy[p.k]; h += `<tr><td class="payname p-${p.k}">${p.n}</td><td class="n">${fmt(c.sBy[p.k])}</td><td class="n">${fmt(c.iBy[p.k])}</td><td class="n">${fmt(c.eBy[p.k])}</td><td class="n">${fmt(net)}</td></tr>`; });
  h += `</tbody><tfoot><tr><td>Total</td><td class="n">${fmt(c.totalSales)}</td><td class="n">${fmt(c.totalInc)}</td><td class="n">${fmt(c.totalExp)}</td><td class="n">${fmt(c.totalSales + c.totalInc - c.totalExp)}</td></tr></tfoot>`;
  $("typeTable").innerHTML = h;
}
function renderSimple(kind, list, total) {
  const verb = kind === "income" ? "Received by" : "Paid by";
  $(kind + "Meta").textContent = list.length ? `${list.length} item${list.length > 1 ? "s" : ""} · ${fmt(total)}` : "";
  let h = `<thead><tr><th>#</th><th>Description</th><th>${verb}</th><th class="n">Amount</th><th></th></tr></thead><tbody>`;
  if (!list.length) h += `<tr><td class="empty" colspan="5">${kind === "income" ? "No other income today." : "No expenses today."}</td></tr>`;
  list.forEach((r, i) => {
    h += `<tr data-id="${r.id}" class="${S.edit[kind] === r.id ? "editing" : ""}"><td class="dim z">${i + 1}</td><td class="title">${esc(r.desc || "(no description)")}</td><td data-label="${verb}"><span class="payname p-${esc(r.method)}">${esc(payName(r.method))}</span></td><td class="n" data-label="Amount"><strong>${fmt(num(r.amount))}</strong></td><td class="act">${canEdit() ? `<button class="linkbtn" data-act="edit">Edit</button><button class="linkbtn del" data-act="del">Delete</button>` : ""}</td></tr>`;
  });
  h += "</tbody>";
  if (list.length) h += `<tfoot><tr><td class="title" colspan="3">Total</td><td class="n total" data-label="Total">${fmt(total)}</td><td class="z"></td></tr></tfoot>`;
  $(kind + "Table").innerHTML = h;
}
function renderAll() {
  const cs = S.branches.map(b => ({ b, c: calc(S.days[b.id]), has: !!S.days[b.id] }));
  const tot = calc(null);
  ["totalSales", "nonCash", "totalInc", "totalExp", "opening", "banked", "expected"].forEach(k => cs.forEach(x => tot[k] += x.c[k]));
  cs.forEach(({ c }) => PAY.forEach(p => { tot.sBy[p.k] += c.sBy[p.k]; tot.iBy[p.k] += c.iBy[p.k]; tot.eBy[p.k] += c.eBy[p.k]; }));
  const counted = cs.filter(x => x.c.counted != null);
  tot.counted = counted.length === cs.length ? counted.reduce((a, x) => a + x.c.counted, 0) : null;
  tot.diff = tot.counted == null ? null : r2(tot.counted - tot.expected);
  tot.sales = cs.flatMap(x => x.c.sales);
  $("allKpis").innerHTML = kpiHTML(tot);
  $("allMeta").textContent = prettyDate(S.date) + " · " + cs.filter(x => x.has).length + " of " + cs.length + " branches have entries";
  const row = (label, fn) => `<tr><td>${label}</td>${cs.map(x => `<td class="n">${fn(x.c)}</td>`).join("")}<td class="n"><strong>${fn(tot)}</strong></td></tr>`;
  let h = `<thead><tr><th></th>${cs.map(x => `<th class="n">${esc(x.b.name)}</th>`).join("")}<th class="n">All branches</th></tr></thead><tbody>`;
  h += row("Number of bills", c => c.sales.length);
  PAY.forEach(p => h += `<tr><td class="payname p-${p.k}">${p.n} sales</td>${cs.map(x => `<td class="n">${fmt(x.c.sBy[p.k])}</td>`).join("")}<td class="n"><strong>${fmt(tot.sBy[p.k])}</strong></td></tr>`);
  h += row("<strong>Total sales</strong>", c => "<strong>" + fmt(c.totalSales) + "</strong>");
  h += row("Other income", c => fmt(c.totalInc));
  h += row("Other expenses", c => fmt(c.totalExp));
  h += row("<strong>Net (sales + income − expenses)</strong>", c => "<strong>" + fmt(c.totalSales + c.totalInc - c.totalExp) + "</strong>");
  h += row("Opening cash", c => fmt(c.opening));
  h += row("Cash banked / handed over", c => fmt(c.banked));
  h += row("<strong>Expected cash in drawer</strong>", c => "<strong>" + fmt(c.expected) + "</strong>");
  h += row("Counted cash", c => c.counted == null ? "–" : fmt(c.counted));
  h += row("Difference", c => diffPill(c));
  $("allTable").innerHTML = h + "</tbody>";
}

/* ================= forms ================= */
/* ---- invoice items ---- */
function itemsHTML(items) {
  return (items || []).map(it => {
    const war = it.warranty_days > 0 ? `<span class="wt">${warName(it.warranty_days)}${it.warranty_until ? " → " + prettyDate(it.warranty_until).replace(/^\w+, /, "") : ""}</span>` : "";
    return `<div class="itl">${it.qty !== 1 ? fmt(it.qty).replace(/\.00$/, "") + " × " : ""}${esc(it.item)} · ${fmt(it.qty * it.unit_price)}${it.serial ? ` <span class="sn">SN ${esc(it.serial)}</span>` : ""} ${war}</div>`;
  }).join("");
}
function addItemRow(it) {
  it = it || { item: "", serial: "", qty: 1, unit_price: "", warranty_days: 0 };
  const row = document.createElement("div");
  row.className = "itemrow";
  row.innerHTML = `
    <label class="f it-name">Item<input class="i-name" maxlength="100" placeholder="e.g. iPhone 15 128GB Black"></label>
    <label class="f it-serial">Serial / IMEI<input class="i-serial" maxlength="60" placeholder="Leave empty if none"></label>
    <label class="f">Qty<input class="i-qty" type="number" min="1" step="1" inputmode="numeric"></label>
    <label class="f">Unit price<input class="i-price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label>
    <label class="f">Warranty<select class="i-war">${WARRANTY.map(w => `<option value="${w.d}">${w.n}</option>`).join("")}</select></label>
    <div class="it-line"><span>Line total</span><strong class="i-line">0.00</strong></div>
    <button type="button" class="iconbtn i-del" aria-label="Remove item" title="Remove item">×</button>`;
  row.querySelector(".i-name").value = it.item || "";
  row.querySelector(".i-serial").value = it.serial || "";
  row.querySelector(".i-qty").value = it.qty || 1;
  row.querySelector(".i-price").value = it.unit_price === "" ? "" : num(it.unit_price);
  row.querySelector(".i-war").value = String(it.warranty_days || 0);
  $("itemRows").appendChild(row);
  syncRow(row);
  return row;
}
function syncRow(row) {
  const hasSerial = row.querySelector(".i-serial").value.trim() !== "";
  const q = row.querySelector(".i-qty");
  if (hasSerial) { q.value = 1; q.disabled = true; } else q.disabled = false;
  row.querySelector(".i-line").textContent = fmt(num(q.value) * num(row.querySelector(".i-price").value));
}
function readItems() {
  const out = []; let err = "";
  $("itemRows").querySelectorAll(".itemrow").forEach((row, i) => {
    const item = row.querySelector(".i-name").value.trim();
    const serial = row.querySelector(".i-serial").value.trim();
    const price = r2(num(row.querySelector(".i-price").value));
    const qty = serial ? 1 : num(row.querySelector(".i-qty").value);
    const war = Number(row.querySelector(".i-war").value) || 0;
    if (!item && !serial && !price) return; // empty row, ignore
    if (!item) err = err || `Item ${i + 1} needs a name.`;
    if (qty <= 0) err = err || `Item ${i + 1} needs a quantity of 1 or more.`;
    out.push({ item, serial, qty, unit_price: price, warranty_days: war });
  });
  return { items: out, err };
}
function itemsTotal(items) { return r2(items.reduce((a, it) => a + it.qty * it.unit_price, 0)); }

function saleFormRead() {
  const pay = {}; PAY.forEach(p => pay[p.k] = r2(num($("s_" + p.k).value)));
  return { ref: $("sRef").value.trim(), desc: $("sDesc").value.trim(), phone: $("sPhone").value.trim(), remarks: $("sRemarks").value.trim(), pay };
}
function updSaleTotal() {
  const paid = r2(saleTotal(saleFormRead()));
  const { items } = readItems();
  const inv = itemsTotal(items);
  $("sTotal").textContent = fmt(paid);
  $("sItemsTotal").textContent = items.length ? fmt(inv) : "–";
  const bal = r2(inv - paid);
  $("sBal").innerHTML = !items.length ? "" : Math.abs(bal) < 0.005 ? '<span class="bal pos">Fully paid</span>'
    : bal > 0 ? `<span class="bal neg">Balance ${fmt(bal)}</span>` : `<span class="bal warn">Overpaid ${fmt(-bal)}</span>`;
}
function resetSale() {
  ["sRef", "sDesc", "sPhone", "sRemarks", ...PAY.map(p => "s_" + p.k)].forEach(id => $(id).value = "");
  $("itemRows").innerHTML = ""; addItemRow();
  S.edit.sale = null; S.dupOk = null; $("sSave").textContent = "Save invoice"; $("sCancel").hidden = true; $("sErr").textContent = ""; updSaleTotal();
}
$("addItem").onclick = () => { const r = addItemRow(); r.querySelector(".i-name").focus(); };
$("itemRows").addEventListener("click", e => {
  const del = e.target.closest(".i-del"); if (!del) return;
  del.closest(".itemrow").remove();
  if (!$("itemRows").children.length) addItemRow();
  updSaleTotal();
});
$("saleForm").addEventListener("input", e => {
  const row = e.target.closest(".itemrow"); if (row) syncRow(row);
  if (e.target.classList.contains("i-serial")) S.dupOk = null;
  updSaleTotal();
});
// Tap a payment name: put the remaining balance in that box.
$("payGrid").addEventListener("click", e => {
  const k = e.target.dataset && e.target.dataset.fill; if (!k) return;
  e.preventDefault();
  const { items } = readItems(); if (!items.length) { $("s_" + k).focus(); return; }
  const f = saleFormRead(); const others = r2(saleTotal(f) - f.pay[k]);
  const rest = r2(itemsTotal(items) - others);
  $("s_" + k).value = rest > 0 ? rest : ""; $("s_" + k).focus(); updSaleTotal();
});

// Warn if a serial was already sold before (any branch, any date).
async function findSoldSerials(serials, ignoreSaleId) {
  if (!serials.length) return [];
  const res = await sb.rpc("check_serials", { p_serials: serials, p_ignore: ignoreSaleId || null });
  return res.error ? [] : res.data;
}
// Branch names for every branch (staff only load their own, but lookups show all).
const BRANCH_LABEL = id => ((S.allBranches || DEFAULT_BRANCHES).find(b => b.id === id) || {}).name || id;

$("saleForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!canEdit()) return;
  const f = saleFormRead();
  const { items, err } = readItems();
  $("sErr").textContent = "";
  if (err) { $("sErr").textContent = err; return; }
  const paid = r2(saleTotal(f));
  if (paid <= 0) { $("sErr").textContent = "Enter how the customer paid in at least one payment box."; return; }
  if (items.length && Math.abs(itemsTotal(items) - paid) >= 0.005) {
    $("sErr").textContent = `Payments (${fmt(paid)}) don't match the invoice total (${fmt(itemsTotal(items))}). Fix the amounts or tap a payment name to fill the balance.`;
    return;
  }
  const serials = [...new Set(items.map(i => i.serial).filter(Boolean))];
  if (serials.length !== items.filter(i => i.serial).length) { $("sErr").textContent = "The same serial number is entered twice on this invoice."; return; }
  const editId = S.edit.sale;
  const key = serials.join("|");
  if (serials.length && S.dupOk !== key) {
    const sold = await findSoldSerials(serials, editId);
    if (sold.length) {
      S.dupOk = key;
      $("sErr").textContent = "Already sold: " + sold.map(s => `${s.serial} (${BRANCH_LABEL(s.branch_id)}, ${prettyDate(s.sold_on)}${s.ref ? ", " + s.ref : ""})`).join("; ") +
        ". Press Save invoice again to save anyway (for example a return that was resold).";
      return;
    }
  }
  const sale = { branch_id: S.branch, date: S.date, ref: f.ref, description: f.desc, customer_phone: f.phone, remarks: f.remarks, ...f.pay };
  $("sSave").disabled = true;
  try {
    await write(async () => check(await sb.rpc("save_invoice", { p_id: editId, p_sale: sale, p_items: items })));
    resetSale(); render(); $("sRef").focus();
  } catch (_) { /* banner shown */ } finally { $("sSave").disabled = false; }
});
$("sCancel").onclick = () => { resetSale(); render(); };

["income", "expense"].forEach(kind => {
  const reset = () => { $(kind + "Desc").value = ""; $(kind + "Amt").value = ""; $(kind + "Method").value = "cash"; S.edit[kind] = null; $(kind + "Save").textContent = "Add"; $(kind + "Cancel").hidden = true; $(kind + "Err").textContent = ""; };
  $(kind + "Form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!canEdit()) return;
    const amount = r2(num($(kind + "Amt").value));
    if (amount <= 0) { $(kind + "Err").textContent = "Enter an amount above zero."; return; }
    const body = { branch_id: S.branch, date: S.date, description: $(kind + "Desc").value.trim(), amount, method: $(kind + "Method").value };
    const editId = S.edit[kind];
    $(kind + "Save").disabled = true;
    try {
      await write(async () => check(editId ? await sb.from(TABLE[kind]).update(body).eq("id", editId) : await sb.from(TABLE[kind]).insert(body)));
      reset(); render(); $(kind + "Desc").focus();
    } catch (_) {} finally { $(kind + "Save").disabled = false; }
  });
  $(kind + "Cancel").onclick = () => { reset(); render(); };
  $(kind + "Table").addEventListener("click", e => tableAction(e, kind, r => {
    $(kind + "Desc").value = r.desc || ""; $(kind + "Amt").value = num(r.amount) || ""; $(kind + "Method").value = r.method || "cash";
    S.edit[kind] = r.id; $(kind + "Save").textContent = "Update"; $(kind + "Cancel").hidden = false;
    $(kind + "Form").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, reset));
});
$("salesTable").addEventListener("click", e => tableAction(e, "sales", r => {
  $("sRef").value = r.ref || ""; $("sDesc").value = r.desc || ""; $("sPhone").value = r.phone || ""; $("sRemarks").value = r.remarks || "";
  PAY.forEach(p => { const v = num(r.pay && r.pay[p.k]); $("s_" + p.k).value = v ? v : ""; });
  $("itemRows").innerHTML = ""; (r.items.length ? r.items : [null]).forEach(it => addItemRow(it || undefined));
  S.edit.sale = r.id; S.dupOk = null; $("sSave").textContent = "Update invoice"; $("sCancel").hidden = false; updSaleTotal();
  $("saleForm").scrollIntoView({ block: "nearest", behavior: "smooth" });
}, resetSale));

function tableAction(e, coll, onEdit, onReset) {
  const btn = e.target.closest("button[data-act]"); if (!btn || !canEdit()) return;
  const id = btn.closest("tr").dataset.id; const d = S.days[S.branch]; const r = d && d[coll] && d[coll][id]; if (!r) return;
  if (btn.dataset.act === "edit") { onEdit(r); render(); return; }
  if (!btn.hasAttribute("data-armed")) {
    btn.setAttribute("data-armed", ""); btn.textContent = "Confirm delete";
    setTimeout(() => { if (btn.isConnected) { btn.removeAttribute("data-armed"); btn.textContent = "Delete"; } }, 3500);
    return;
  }
  const editKey = coll === "sales" ? "sale" : coll; if (S.edit[editKey] === id) onReset();
  write(async () => check(await sb.from(TABLE[coll]).delete().eq("id", id))).catch(() => {});
}

[["opening", "n"], ["banked", "n"], ["counted", "c"], ["notes", "t"]].forEach(([id, t]) => {
  $(id).addEventListener("change", () => {
    if (S.branch === "all" || !canEdit()) return;
    const v = $(id).value;
    const val = t === "t" ? v.trim() : t === "c" ? (v === "" ? null : r2(num(v))) : r2(num(v));
    saveDayField(id, val).catch(() => {});
  });
});
$("prevCount").onclick = async () => {
  if (!canEdit()) return;
  const v = S.prevClose[S.branch];
  if (v == null) { $("cashMsg").textContent = "No entries for " + prettyDate(shift(S.date, -1)) + "."; return; }
  $("opening").value = r2(v);
  $("cashMsg").textContent = `Opening set to ${fmt(v)}.`;
  try { await saveDayField("opening", r2(v)); } catch (_) {}
};

/* ---- serial & warranty lookup ---- */
function warStatus(it, saleDate) {
  if (!it.warranty_days) return '<span class="pill none">No warranty</span>';
  const until = it.warranty_until || shift(saleDate, it.warranty_days);
  const today = todayISO();
  if (until < today) return `<span class="pill short">Expired ${prettyDate(until).replace(/^\w+, /, "")}</span>`;
  const [y, m, d] = until.split("-").map(Number); const [ty, tm, td] = today.split("-").map(Number);
  const left = Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
  return `<span class="pill ok">Active · ${left} day${left === 1 ? "" : "s"} left</span>`;
}
$("lookupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const q = $("lookupQ").value.trim().replace(/[,()%*\\]/g, "");
  if (q.length < 3) { $("lookupMsg").textContent = "Type at least 3 characters."; return; }
  $("lookupMsg").textContent = "Searching…";
  try {
    // Searches all branches (read-only) through a database function.
    const rows = check(await sb.rpc("warranty_lookup", { q }));
    $("lookupWrap").hidden = !rows.length;
    $("lookupMsg").textContent = rows.length ? `${rows.length} item${rows.length > 1 ? "s" : ""} found.` : "Nothing found for “" + q + "”.";
    $("lookupTable").innerHTML = `<thead><tr><th>Item</th><th>Serial / IMEI</th><th>Sold</th><th>Branch</th><th>Invoice</th><th>Customer</th><th>Warranty</th></tr></thead><tbody>` +
      rows.map(it => `<tr><td class="title">${esc(it.item)}</td><td data-label="Serial / IMEI" class="${it.serial ? "" : "z"}"><span class="sn">${esc(it.serial || "")}</span></td>` +
        `<td data-label="Sold">${prettyDate(it.sold_on)}</td><td data-label="Branch">${esc(BRANCH_LABEL(it.branch_id))}</td><td data-label="Invoice">${esc(it.ref || "–")}</td>` +
        `<td data-label="Customer" class="${it.customer || it.phone ? "" : "z"}">${esc([it.customer, it.phone].filter(Boolean).join(" · "))}</td>` +
        `<td data-label="Warranty">${warName(it.warranty_days)} ${warStatus(it, it.sold_on)}</td></tr>`).join("") + "</tbody>";
  } catch (err) { $("lookupMsg").textContent = "Search failed: " + (err.message || err); }
});

/* ================= navigation ================= */
function setDate(d) {
  if (!d) return;
  if (S.me && !isAdmin()) d = todayISO(); // staff only work with today
  S.date = d; S.days = {}; resetSale(); S.edit.income = S.edit.expense = null; $("cashMsg").textContent = "";
  render(); subscribeLive(); refresh();
}
$("date").addEventListener("change", e => setDate(e.target.value));
$("prevDay").onclick = () => setDate(shift(S.date, -1));
$("nextDay").onclick = () => setDate(shift(S.date, 1));
$("todayBtn").onclick = () => setDate(todayISO());
$("dateWarnBtn").onclick = () => setDate(todayISO());

// New day: if the app was showing "today" when the date changed (midnight,
// or the phone was locked overnight), move to the new today automatically.
function checkDayChange() {
  const t = todayISO();
  if (t === S.lastToday) return;
  const wasOnToday = S.date === S.lastToday;
  S.lastToday = t;
  if (!S.me) { S.date = t; return; }
  if (wasOnToday) setDate(t); else render();
}
setInterval(checkDayChange, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDayChange(); });
window.addEventListener("focus", checkDayChange);
window.addEventListener("pageshow", checkDayChange);
$("branchTabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "renameBtn") { openSettings(); return; }
  S.branch = b.dataset.b; resetSale(); S.edit.income = S.edit.expense = null; $("cashMsg").textContent = "";
  try { localStorage.setItem("dsb-branch", S.branch); } catch (_) {}
  render();
});
function openSettings() { S.branches.forEach(b => $("bn_" + b.id).value = b.name); $("settingsPanel").hidden = false; $("bn_b1").focus(); }
$("settingsClose").onclick = () => $("settingsPanel").hidden = true;
$("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  const list = DEFAULT_BRANCHES.map((b, i) => ({ id: b.id, name: $("bn_" + b.id).value.trim() || b.name, sort: i + 1 }));
  try { check(await sb.from("branches").upsert(list)); await loadBranches(); $("settingsPanel").hidden = true; }
  catch (err) { showBanner("Could not save branch names: " + (err.message || err)); }
});

/* ================= Excel ================= */
function sheetName(s) { return String(s).replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31) || "Sheet"; }
function finishSheet(aoa, widths, intRows) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  Object.keys(ws).forEach(k => { if (k[0] !== "!" && ws[k].t === "n") ws[k].z = "#,##0.00"; });
  (intRows || []).forEach(rIdx => Object.keys(ws).forEach(k => { if (k[0] !== "!" && XLSX.utils.decode_cell(k).r === rIdx && ws[k].t === "n") ws[k].z = "0"; }));
  ws["!cols"] = widths.map(w => ({ wch: w }));
  return ws;
}
function daySheet(branchName, date, d) {
  const c = calc(d); const A = [];
  A.push([branchName + " - Daily Sales Report"]); A.push(["Date", prettyDate(date)]); A.push([]);
  A.push(["SALES"]); A.push(["No", "Invoice", "Customer", ...PAY.map(p => p.n.toUpperCase()), "TOTAL", "REMARKS", "PHONE"]);
  c.sales.forEach((r, i) => A.push([String(i + 1), r.ref || "", r.desc || "", ...PAY.map(p => num(r.pay && r.pay[p.k])), saleTotal(r), r.remarks || "", r.phone || ""]));
  A.push(["", "", "TOTAL", ...PAY.map(p => c.sBy[p.k]), c.totalSales, ""]); A.push([]);
  A.push(["ITEMS SOLD"]); A.push(["No", "Invoice", "Item", "Serial / IMEI", "Qty", "Unit price", "Line total", "Warranty", "Warranty until"]);
  let n = 0;
  c.sales.forEach((r, i) => (r.items || []).forEach(it => A.push([String(++n), r.ref || "Bill " + (i + 1), it.item, it.serial || "", it.qty, it.unit_price, r2(it.qty * it.unit_price), warName(it.warranty_days), it.warranty_until || ""])));
  A.push([]);
  A.push(["OTHER INCOME"]); A.push(["No", "Description", "Received by", "Amount"]);
  c.inc.forEach((r, i) => A.push([String(i + 1), r.desc || "", payName(r.method), num(r.amount)]));
  A.push(["", "TOTAL", "", c.totalInc]); A.push([]);
  A.push(["OTHER EXPENSES"]); A.push(["No", "Description", "Paid by", "Amount"]);
  c.exp.forEach((r, i) => A.push([String(i + 1), r.desc || "", payName(r.method), num(r.amount)]));
  A.push(["", "TOTAL", "", c.totalExp]); A.push([]);
  A.push(["CASH SUMMARY"]);
  A.push(["", "Opening cash", "", c.opening]);
  A.push(["", "Add: cash sales", "", c.sBy.cash]);
  A.push(["", "Add: other income in cash", "", c.iBy.cash]);
  A.push(["", "Less: expenses paid in cash", "", -c.eBy.cash]);
  A.push(["", "Less: cash banked / handed over", "", -c.banked]);
  A.push(["", "Expected cash in drawer", "", c.expected]);
  A.push(["", "Counted cash", "", c.counted == null ? "Not counted" : c.counted]);
  A.push(["", "Difference (short - / excess +)", "", c.diff == null ? "" : c.diff]); A.push([]);
  A.push(["PAYMENT TYPE SUMMARY"]); A.push(["", "Type", "Sales", "Other income", "Expenses", "Net"]);
  PAY.forEach(p => A.push(["", p.n, c.sBy[p.k], c.iBy[p.k], c.eBy[p.k], c.sBy[p.k] + c.iBy[p.k] - c.eBy[p.k]]));
  A.push(["", "TOTAL", c.totalSales, c.totalInc, c.totalExp, c.totalSales + c.totalInc - c.totalExp]);
  if (c.notes) { A.push([]); A.push(["NOTES"]); A.push(["", c.notes]); }
  return finishSheet(A, [6, 26, 24, 12, 12, 12, 12, 12, 12, 13, 24]);
}
function allSheet(date, days) {
  const cs = S.branches.map(b => ({ b, c: calc(days[b.id]) }));
  const A = [["All Branches - Daily Summary"], ["Date", prettyDate(date)], [], ["", ...cs.map(x => x.b.name), "ALL BRANCHES"]];
  const add = (l, fn) => { const v = cs.map(x => fn(x.c)); A.push([l, ...v, v.every(n => typeof n === "number") ? v.reduce((a, b) => a + b, 0) : ""]); };
  add("Number of bills", c => c.sales.length);
  PAY.forEach(p => add(p.n + " sales", c => c.sBy[p.k]));
  add("Total sales", c => c.totalSales); add("Other income", c => c.totalInc); add("Other expenses", c => c.totalExp);
  add("Net (sales + income - expenses)", c => c.totalSales + c.totalInc - c.totalExp);
  add("Opening cash", c => c.opening); add("Cash banked / handed over", c => c.banked); add("Expected cash in drawer", c => c.expected);
  add("Counted cash", c => c.counted == null ? "Not counted" : c.counted); add("Difference", c => c.diff == null ? "" : c.diff);
  return finishSheet(A, [32, 16, 16, 16, 16], [4]);
}
function saveWb(wb, filename) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = filename.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $("exMsg").textContent = "Downloaded " + a.download + ".";
}
function needXlsx() { if (window.XLSX) return true; $("exMsg").textContent = "The Excel tool did not load. Check your connection and reload."; return false; }
$("exOne").onclick = () => {
  if (!needXlsx() || S.branch === "all") return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, daySheet(bname(S.branch), S.date, S.days[S.branch]), sheetName(bname(S.branch)));
  saveWb(wb, `Sales ${bname(S.branch)} ${S.date}.xlsx`);
};
$("exAll").onclick = () => {
  if (!needXlsx()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, allSheet(S.date, S.days), "All Branches");
  S.branches.forEach(b => XLSX.utils.book_append_sheet(wb, daySheet(b.name, S.date, S.days[b.id]), sheetName(b.name)));
  saveWb(wb, `Sales All Branches ${S.date}.xlsx`);
};
$("exRange").onclick = async () => {
  if (!needXlsx()) return;
  const from = $("exFrom").value, to = $("exTo").value;
  if (!from || !to || from > to) { $("exMsg").textContent = "Pick a From date that is on or before the To date."; return; }
  $("exMsg").textContent = "Collecting entries…";
  let map; try { map = await loadRange(from, to); } catch (e) { $("exMsg").textContent = "Could not read entries: " + (e.message || e); return; }
  const list = Object.values(map).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.branch < b.branch ? -1 : 1);
  const sum = [["Date", "Branch", ...PAY.map(p => p.n), "Total sales", "Other income", "Other expenses", "Net", "Opening cash", "Banked", "Expected cash", "Counted cash", "Difference"]];
  const sales = [["Date", "Branch", "Invoice", "Customer", ...PAY.map(p => p.n), "Total", "Remarks", "Phone"]];
  const itemsSheet = [["Date", "Branch", "Invoice", "Customer", "Phone", "Item", "Serial / IMEI", "Qty", "Unit price", "Line total", "Warranty", "Warranty until"]];
  const inc = [["Date", "Branch", "Description", "Received by", "Amount"]], exp = [["Date", "Branch", "Description", "Paid by", "Amount"]];
  const T = { s: Object.fromEntries(PAY.map(p => [p.k, 0])), ts: 0, ti: 0, te: 0 };
  list.forEach(d => {
    const c = calc(d), bn = bname(d.branch);
    sum.push([d.date, bn, ...PAY.map(p => c.sBy[p.k]), c.totalSales, c.totalInc, c.totalExp, c.totalSales + c.totalInc - c.totalExp, c.opening, c.banked, c.expected, c.counted == null ? "" : c.counted, c.diff == null ? "" : c.diff]);
    PAY.forEach(p => T.s[p.k] += c.sBy[p.k]); T.ts += c.totalSales; T.ti += c.totalInc; T.te += c.totalExp;
    c.sales.forEach(r => {
      sales.push([d.date, bn, r.ref || "", r.desc || "", ...PAY.map(p => num(r.pay && r.pay[p.k])), saleTotal(r), r.remarks || "", r.phone || ""]);
      (r.items || []).forEach(it => itemsSheet.push([d.date, bn, r.ref || "", r.desc || "", r.phone || "", it.item, it.serial || "", it.qty, it.unit_price, r2(it.qty * it.unit_price), warName(it.warranty_days), it.warranty_until || ""]));
    });
    c.inc.forEach(r => inc.push([d.date, bn, r.desc || "", payName(r.method), num(r.amount)]));
    c.exp.forEach(r => exp.push([d.date, bn, r.desc || "", payName(r.method), num(r.amount)]));
  });
  sum.push(["TOTAL", "", ...PAY.map(p => T.s[p.k]), T.ts, T.ti, T.te, T.ts + T.ti - T.te]);
  const bt = [["Branch", ...PAY.map(p => p.n), "Total sales", "Other income", "Other expenses", "Net"]];
  S.branches.forEach(b => {
    const ds = list.filter(d => d.branch === b.id).map(calc);
    const s = k => ds.reduce((a, c) => a + c.sBy[k], 0);
    const ts = ds.reduce((a, c) => a + c.totalSales, 0), ti = ds.reduce((a, c) => a + c.totalInc, 0), te = ds.reduce((a, c) => a + c.totalExp, 0);
    bt.push([b.name, ...PAY.map(p => s(p.k)), ts, ti, te, ts + ti - te]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, finishSheet(bt, [18, 12, 12, 12, 12, 12, 12, 14, 14, 14, 14]), "Branch Totals");
  XLSX.utils.book_append_sheet(wb, finishSheet(sum, [12, 16, 12, 12, 12, 12, 12, 12, 14, 14, 14, 14, 14, 12, 14, 14, 12]), "Daily Summary");
  XLSX.utils.book_append_sheet(wb, finishSheet(sales, [12, 16, 14, 22, 12, 12, 12, 12, 12, 12, 13, 24]), "All Sales");
  XLSX.utils.book_append_sheet(wb, finishSheet(itemsSheet, [12, 16, 14, 20, 14, 28, 20, 6, 12, 12, 12, 14]), "Items & Serials");
  XLSX.utils.book_append_sheet(wb, finishSheet(inc, [12, 16, 28, 14, 13]), "Other Income");
  XLSX.utils.book_append_sheet(wb, finishSheet(exp, [12, 16, 28, 14, 13]), "Other Expenses");
  saveWb(wb, `Sales Report ${from} to ${to}.xlsx`);
};

/* ================= auth & start ================= */
function showLogin() { $("app").hidden = true; $("loginView").hidden = false; }
async function showApp(session) {
  // Who is this login? (admin = all branches, staff = one branch)
  const res = await sb.from("staff").select("role, branch_id").eq("user_id", session.user.id).maybeSingle();
  if (res.error || !res.data) {
    S.me = null;
    $("app").hidden = true; $("loginView").hidden = false;
    $("loginErr").textContent = res.error
      ? "Could not check your access: " + res.error.message
      : `${session.user.email} is not linked to a branch yet. Ask the admin to add you, then sign in again.`;
    await sb.auth.signOut();
    return;
  }
  S.me = res.data;
  if (!isAdmin()) { S.branch = S.me.branch_id; S.date = todayISO(); }
  else if (S.branch !== "all" && !DEFAULT_BRANCHES.some(b => b.id === S.branch)) S.branch = "b1";
  $("loginView").hidden = true; $("app").hidden = false;
  $("userEmail").textContent = (session.user.email || "") + (isAdmin() ? " · admin" : "");
  await loadBranches();
  render(); subscribeLive(); refresh();
}
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginErr").textContent = ""; $("loginBtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginPass").value });
  $("loginBtn").disabled = false;
  if (error) $("loginErr").textContent = error.message === "Invalid login credentials" ? "Email or password is wrong." : error.message;
});
$("signOut").onclick = async () => { if (channel) sb.removeChannel(channel); channel = null; await sb.auth.signOut(); };

async function init() {
  try { const b = localStorage.getItem("dsb-branch"); if (b && (b === "all" || DEFAULT_BRANCHES.some(x => x.id === b))) S.branch = b; } catch (_) {}
  $("exFrom").value = S.date.slice(0, 8) + "01"; $("exTo").value = S.date;
  resetSale();
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    $("loginView").hidden = false;
    $("loginErr").textContent = "Setup needed: add your Supabase URL and anon key to config.js, then redeploy.";
    $("loginBtn").disabled = true;
    return;
  }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let current = null;
  sb.auth.onAuthStateChange((_evt, session) => {
    const id = session ? session.user.id : null;
    if (id === current) return;
    current = id;
    if (session) showApp(session); else showLogin();
  });
  const { data } = await sb.auth.getSession();
  if (!data.session && current === null) showLogin();
}
init();
})();

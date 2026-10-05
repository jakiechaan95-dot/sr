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
const CARD = PAY.filter(p => p.k !== "cash");
const DEFAULT_BRANCHES = [{ id: "b1", name: "Branch 1", address: "" }, { id: "b2", name: "Branch 2", address: "" }, { id: "b3", name: "Branch 3", address: "" }];
const TABLE = { sales: "sales", income: "other_income", expense: "expenses" };
const WARRANTY = [
  { d: 0, n: "No warranty" }, { d: 7, n: "7 days" }, { d: 14, n: "14 days" }, { d: 30, n: "1 month" },
  { d: 90, n: "3 months" }, { d: 180, n: "6 months" }, { d: 365, n: "1 year" }, { d: 730, n: "2 years" }
];
const NOTES = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];
const EXPENSE_CHIPS = ["Transfer - Amana", "Transfer - Seylan", "Transfer - Sampath", "Boss", "Breakfast & lunch", "PickMe", "Transport", "Delivery", "Salary", "Shop bike fuel"];
const XL_COLORS = { cash: "000000", sampath: "E46C1E", amana: "1F9488", seylan: "D42A2A", commercial: "6A3D9E", amex: "1D2F6B", web: "0A6C8F" };

const S = {
  date: todayISO(), lastToday: todayISO(), branch: "b1", days: {}, prevClose: {}, me: null,
  branches: DEFAULT_BRANCHES.map(b => ({ ...b })), allBranches: null,
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
function fmtz(n) { return Math.abs(n) < 0.005 ? "–" : fmt(n); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function bname(id) { return ((S.allBranches || S.branches).find(b => b.id === id) || {}).name || id; }
function baddr(id) { return ((S.allBranches || S.branches).find(b => b.id === id) || {}).address || ""; }
function payName(k) { return (PAY.find(p => p.k === k) || {}).n || k; }
function warName(d) { const w = WARRANTY.find(x => x.d === Number(d)); return w ? w.n : (d ? d + " days" : "No warranty"); }
function prettyDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function dayName(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long" }); }
function rows(o) { return Object.values(o || {}).filter(r => r && r.id).sort((a, b) => (a.t || 0) - (b.t || 0)); }
function payTotal(p) { return PAY.reduce((a, x) => a + num(p && p[x.k]), 0); }
function zeroPay() { return Object.fromEntries(PAY.map(p => [p.k, 0])); }
function setStatus(t) { $("status").textContent = t; }
function showBanner(t) { const b = $("banner"); b.textContent = t || ""; b.hidden = !t; }
function emptyDay(branch, date) { return { branch, date, opening: 0, banked: 0, counted: null, notes: "", denoms: {}, sales: {}, income: {}, expense: {} }; }
function isAdmin() { return !!(S.me && S.me.role === "admin"); }
function canEdit() { return isAdmin() || S.date === todayISO(); }

/* ================= calculations ================= */
// Lines of a day, split into phones and accessories (each line has its own payments).
function linesOf(d) {
  const out = [];
  rows(d && d.sales).forEach(s => s.items.forEach((it, i) => out.push({ bill: s, it, first: i === 0 })));
  return out;
}
function calc(d) {
  d = d || {};
  const sales = rows(d.sales), inc = rows(d.income), exp = rows(d.expense);
  const lines = linesOf(d);
  const pBy = zeroPay(), aBy = zeroPay(), sBy = zeroPay(), iBy = zeroPay(), eBy = zeroPay();
  lines.forEach(({ it }) => PAY.forEach(p => { (it.category === "phone" ? pBy : aBy)[p.k] += num(it.pay[p.k]); }));
  sales.forEach(s => PAY.forEach(p => sBy[p.k] += num(s.pay[p.k])));
  inc.forEach(r => { const k = r.method in sBy ? r.method : "cash"; iBy[k] += num(r.amount); });
  exp.forEach(r => { const k = r.method in sBy ? r.method : "cash"; eBy[k] += num(r.amount); });
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const opening = num(d.opening), banked = num(d.banked);
  const totalSales = sum(sBy), totalInc = sum(iBy), totalExp = sum(eBy);
  const card = totalSales - sBy.cash;
  const otherIncome = opening + totalInc;            // "Yesterday cash" is shown as income, like the sheet
  const lessExp = totalExp + banked;
  const net = totalSales + otherIncome - lessExp;
  const adj = (totalInc - iBy.cash) - (totalExp - eBy.cash); // non-cash income/expenses don't touch the drawer
  const expected = r2(net - card - adj);
  const counted = (d.counted === null || d.counted === undefined || d.counted === "") ? null : num(d.counted);
  return { sales, inc, exp, lines, pBy, aBy, sBy, iBy, eBy, totalSales, card, totalInc, totalExp, otherIncome, lessExp, net, adj,
    phones: sum(pBy), accs: sum(aBy), opening, banked, expected, counted, diff: counted == null ? null : r2(counted - expected),
    notes: d.notes || "", denoms: d.denoms || {}, nonCash: card };
}
function diffPill(c) {
  if (c.counted == null) return '<span class="pill none">Not counted</span>';
  if (Math.abs(c.diff) < 0.005) return '<span class="pill ok">Balanced</span>';
  return c.diff < 0 ? `<span class="pill short">Short ${fmt(-c.diff)}</span>` : `<span class="pill over">Excess ${fmt(c.diff)}</span>`;
}

/* ================= Supabase data layer ================= */
function buildDays(days, sales, inc, exp, items) {
  const o = {}, byId = {};
  const get = (b, dt) => o[b + "|" + dt] || (o[b + "|" + dt] = emptyDay(b, dt));
  (days || []).forEach(r => Object.assign(get(r.branch_id, r.date), { opening: r.opening, banked: r.banked, counted: r.counted, notes: r.notes || "", denoms: r.denoms || {}, _row: true }));
  (sales || []).forEach(r => {
    byId[r.id] = get(r.branch_id, r.date).sales[r.id] = { id: r.id, t: Date.parse(r.created_at), ref: r.ref, desc: r.description, phone: r.customer_phone || "",
      remarks: r.remarks, items: [], pay: Object.fromEntries(PAY.map(p => [p.k, num(r[p.k])])) };
  });
  (items || []).slice().sort((a, b) => a.line_no - b.line_no).forEach(r => {
    const s = byId[r.sale_id]; if (!s) return;
    s.items.push({ category: r.category === "phone" ? "phone" : "accessory", item: r.item, serial: r.serial || "", qty: num(r.qty) || 1,
      sales_rep: r.sales_rep || "", remarks: r.remarks || "", warranty_days: r.warranty_days || 0, warranty_until: r.warranty_until,
      pay: Object.fromEntries(PAY.map(p => [p.k, num(r[p.k])])) });
  });
  // Bills saved before line payments existed: show the bill's payment on its first line.
  Object.values(byId).forEach(s => {
    if (!s.items.length) s.items.push({ category: "accessory", item: s.desc || "(no items)", serial: "", qty: 1, sales_rep: "", remarks: "", warranty_days: 0, pay: zeroPay() });
    const linesTotal = s.items.reduce((a, it) => a + payTotal(it.pay), 0);
    if (linesTotal < 0.005 && payTotal(s.pay) > 0) s.items[0].pay = { ...s.pay };
  });
  (inc || []).forEach(r => { get(r.branch_id, r.date).income[r.id] = { id: r.id, t: Date.parse(r.created_at), desc: r.description, amount: num(r.amount), method: r.method }; });
  (exp || []).forEach(r => { get(r.branch_id, r.date).expense[r.id] = { id: r.id, t: Date.parse(r.created_at), desc: r.description, amount: num(r.amount), method: r.method, details: Array.isArray(r.details) ? r.details : [] }; });
  return o;
}
function check(res) { if (res.error) throw res.error; return res.data; }
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
    fetchAll(q("sales")), fetchAll(q("other_income")), fetchAll(q("expenses")), fetchAll(q("sale_items"))
  ]);
  return buildDays(d, s, i, e, it);
}
async function refresh() {
  const date = S.date;
  try {
    // Previous day's closing comes from a database function that returns only the number.
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
    S.days = o; rememberReps(); render();
    setStatus("Synced " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    showBanner("");
    autoCarry(date);
  } catch (e) {
    setStatus("Offline");
    showBanner("Could not load entries: " + (e.message || e) + ". Check your internet connection.");
  }
}
// Today <-> yesterday: a new day's opening cash ("Yesterday cash") = previous day's closing.
const carried = new Set();
async function autoCarry(date) {
  if (date > todayISO() || !canEdit()) return;
  let changed = false;
  for (const b of S.branches) {
    const key = b.id + "|" + date;
    const d = S.days[b.id];
    if ((d && d._row) || S.prevClose[b.id] == null || carried.has(key)) continue;
    carried.add(key);
    const res = await sb.from("days").upsert({ branch_id: b.id, date, opening: r2(S.prevClose[b.id]) }, { onConflict: "branch_id,date", ignoreDuplicates: true });
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
      ? "Not saved: branch staff can only change today's records."
      : "Could not save: " + msg);
    throw e;
  }
}
function saveDay(fields) {
  return write(async () => check(await sb.from("days").upsert(
    { branch_id: S.branch, date: S.date, ...fields, updated_at: new Date().toISOString() }, { onConflict: "branch_id,date" })));
}
function subscribeLive() {
  if (channel) sb.removeChannel(channel);
  const f = "date=eq." + S.date;
  channel = sb.channel("day-" + S.date);
  ["days", "sales", "other_income", "expenses", "sale_items"].forEach(t =>
    channel.on("postgres_changes", { event: "*", schema: "public", table: t, filter: f }, scheduleRefresh));
  ["sales", "other_income", "expenses", "sale_items"].forEach(t =>
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: t }, scheduleRefresh));
  channel.on("postgres_changes", { event: "*", schema: "public", table: "branches" }, loadBranches);
  channel.subscribe();
}
async function loadBranches() {
  try {
    const data = check(await sb.from("branches").select("*").order("sort"));
    const list = DEFAULT_BRANCHES.map(b => { const x = data.find(r => r.id === b.id) || {}; return { id: b.id, name: x.name || b.name, address: x.address || "" }; });
    S.allBranches = list;
    S.branches = isAdmin() ? list : list.filter(b => S.me && b.id === S.me.branch_id);
    render();
  } catch (e) { /* keep current */ }
}

/* ---- sales rep suggestions (remembered on this device) ---- */
function getReps() { try { return JSON.parse(localStorage.getItem("dsb-reps") || "[]"); } catch (_) { return []; } }
function rememberReps(extra) {
  const set = new Set(getReps());
  Object.values(S.days).forEach(d => linesOf(d).forEach(({ it }) => it.sales_rep && set.add(it.sales_rep.toUpperCase())));
  (extra || []).forEach(n => n && set.add(n.toUpperCase()));
  const list = [...set].sort().slice(0, 60);
  try { localStorage.setItem("dsb-reps", JSON.stringify(list)); } catch (_) {}
  $("repList").innerHTML = list.map(n => `<option value="${esc(n)}"></option>`).join("");
}

/* ================= static UI ================= */
function simplePanel(kind, title, verb, ph) {
  const chips = kind === "expense" ? `<div class="chips" id="expenseChips">${EXPENSE_CHIPS.map(c => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>`
                                   : `<div class="chips" id="incomeChips"></div>`;
  const brk = kind === "expense" ? `<div class="brk" id="brkRows"></div><button type="button" class="ghost small" id="addBrk">+ Breakdown line (e.g. lunch per person)</button>` : "";
  return `<div class="panel-head"><h2>${title}</h2><span class="meta" id="${kind}Meta"></span></div>
  <form class="entry" id="${kind}Form" autocomplete="off">
    ${chips}
    <div class="fields">
      <label class="f">Description<input id="${kind}Desc" maxlength="80" placeholder="${ph}"></label>
      <label class="f">Amount<input type="number" step="0.01" min="0" inputmode="decimal" id="${kind}Amt" placeholder="0.00"></label>
      <label class="f">${verb}<select id="${kind}Method">${PAY.map(p => `<option value="${p.k}">${p.n}</option>`).join("")}</select></label>
    </div>
    ${brk}
    <div class="formfoot"><span class="err" id="${kind}Err"></span><div class="actions"><button type="button" class="ghost" id="${kind}Cancel" hidden>Cancel edit</button><button type="submit" class="primary" id="${kind}Save">Add</button></div></div>
  </form>
  <div class="tablewrap"><table class="ledger cards sheet" id="${kind}Table"></table></div>`;
}
$("incomePanel").innerHTML = simplePanel("income", "Income", "Received by", "e.g. Cash at shop, Liberty cash");
$("expensePanel").innerHTML = simplePanel("expense", "Expenses", "Paid by", "e.g. Transport, flowers");

/* ================= render ================= */
function renderTabs() {
  $("branchTabs").innerHTML = S.branches.map(b => `<button type="button" data-b="${b.id}" aria-pressed="${S.branch === b.id}">${esc(b.name)}</button>`).join("") +
    (isAdmin() ? `<button type="button" data-b="all" aria-pressed="${S.branch === "all"}">All branches</button><button type="button" class="rename" id="renameBtn">Branches</button>` : "");
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
      : `You are viewing ${prettyDate(S.date)}, not today. This day is read-only.`;
  }
  $("billPanel").hidden = !can;
  ["incomeForm", "expenseForm"].forEach(id => { $(id).hidden = !can; });
  ["opening", "notes", "prevCount"].forEach(id => { $(id).disabled = !can; });
  document.querySelectorAll("#denomTable input").forEach(i => { i.disabled = !can; });
}
function render() {
  renderTabs();
  renderDateLock();
  const admin = isAdmin();
  $("exportPanel").hidden = !admin;
  $("lookupPanel").hidden = !admin;
  $("exRange").closest(".exportcard").hidden = !admin;
  ["prevDay", "nextDay", "todayBtn"].forEach(id => { $(id).hidden = !admin; });
  $("date").disabled = !admin;
  if (!admin) $("settingsPanel").hidden = true;
  $("date").value = S.date;
  const all = S.branch === "all";
  $("branchView").hidden = all; $("allView").hidden = !all;
  $("exOne").disabled = all;
  $("exOneTitle").textContent = all ? "Pick a branch for a single-branch sheet" : bname(S.branch) + ", " + prettyDate(S.date);
  if (all) renderAll(); else renderBranch();
}
function kpiHTML(c) {
  return [
    ["Phones", fmt(c.phones)], ["Accessories", fmt(c.accs)], ["Total sales", fmt(c.totalSales)],
    ["Card transactions", fmt(c.card)], ["Expenses", fmt(c.lessExp)], ["Cash in hand", fmt(c.expected) + " " + diffPill(c)]
  ].map(([l, v]) => `<div class="kpi"><span class="lbl">${l}</span><span class="val">${v}</span></div>`).join("");
}
const payCells = (p, cls) => PAY.map(x => { const v = num(p[x.k]); return `<td class="n ${v ? "" : "z"} ${cls || ""}" data-label="${x.n}">${v ? fmt(v) : ""}</td>`; }).join("");
const payHeads = () => PAY.map(p => `<th class="n pay p-${p.k}">${p.n}</th>`).join("");

function renderBranch() {
  const d = S.days[S.branch]; const c = calc(d); const can = canEdit();
  // sheet header
  $("sheetHead").innerHTML = `<div class="shop"><strong>${esc(bname(S.branch))}</strong><span>${esc(baddr(S.branch) || "")}</span></div>
    <div class="when"><span class="dow">${dayName(S.date)}</span><span class="dt">${S.date}</span></div>`;
  $("kpis").innerHTML = kpiHTML(c);

  // phones & accessories
  const sec = (cat, tableId, metaId, label) => {
    const list = c.lines.filter(l => l.it.category === cat);
    const by = cat === "phone" ? c.pBy : c.aBy;
    const tot = cat === "phone" ? c.phones : c.accs;
    $(metaId).textContent = list.length ? `${list.length} line${list.length > 1 ? "s" : ""} · ${fmt(tot)}` : "";
    const imeiHead = cat === "phone" ? "<th>IMEI</th>" : "";
    let h = `<thead><tr><th>#</th><th>Bill no.</th>${imeiHead}<th>Description</th><th>Sales rep</th>${payHeads()}<th>Remarks</th><th></th></tr></thead><tbody>`;
    if (!list.length) h += `<tr><td class="empty" colspan="${PAY.length + (cat === "phone" ? 7 : 6)}">No ${label} today.</td></tr>`;
    list.forEach(({ bill, it }, i) => {
      const rem = [bill.desc, bill.phone, it.warranty_days ? warName(it.warranty_days) + " warranty" : "", bill.remarks].filter(Boolean).map(esc).join(" · ");
      h += `<tr data-id="${bill.id}" class="${S.edit.sale === bill.id ? "editing" : ""}">` +
        `<td class="dim z">${i + 1}</td>` +
        `<td data-label="Bill no.">${esc(bill.ref || "–")}</td>` +
        (cat === "phone" ? `<td data-label="IMEI"><span class="sn">${esc(it.serial)}</span></td>` : "") +
        `<td class="title">${it.qty > 1 ? fmt(it.qty).replace(/\.00$/, "") + " × " : ""}${esc(it.item)}</td>` +
        `<td data-label="Sales rep" class="${it.sales_rep ? "" : "z"}">${esc(it.sales_rep)}</td>` +
        payCells(it.pay) +
        `<td data-label="Remarks" class="small full ${rem ? "" : "z"}">${rem}</td>` +
        `<td class="act">${can ? `<button class="linkbtn" data-act="edit">Edit bill</button><button class="linkbtn del" data-act="del">Delete bill</button>` : ""}</td></tr>`;
    });
    h += "</tbody>";
    if (list.length) h += `<tfoot><tr class="subtotal"><td class="title" colspan="${cat === "phone" ? 5 : 4}">Total ${label}</td>${PAY.map(p => `<td class="n" data-label="${p.n}">${fmtz(by[p.k])}</td>`).join("")}<td class="n total" data-label="Total"><strong>${fmt(tot)}</strong></td><td class="z"></td></tr></tfoot>`;
    $(tableId).innerHTML = h;
  };
  sec("phone", "phonesTable", "phonesMeta", "phones");
  sec("accessory", "accTable", "accMeta", "accessories");

  // totals: like the sheet's "TOTAL CARD TRANSACTIONS" / "TOTAL SALES"
  $("totalsTable").innerHTML = `<thead><tr><th></th>${payHeads()}<th class="n">Total</th></tr></thead><tbody>` +
    `<tr><td>Phones</td>${PAY.map(p => `<td class="n">${fmtz(c.pBy[p.k])}</td>`).join("")}<td class="n">${fmt(c.phones)}</td></tr>` +
    `<tr><td>Accessories</td>${PAY.map(p => `<td class="n">${fmtz(c.aBy[p.k])}</td>`).join("")}<td class="n">${fmt(c.accs)}</td></tr>` +
    `<tr class="subtotal"><td>Total card transactions</td><td class="n">–</td>${CARD.map(p => `<td class="n">${fmtz(c.sBy[p.k])}</td>`).join("")}<td class="n">${fmt(c.card)}</td></tr>` +
    `<tr class="grand"><td>Total sales</td>${PAY.map(p => `<td class="n">${fmtz(c.sBy[p.k])}</td>`).join("")}<td class="n">${fmt(c.totalSales)}</td></tr></tbody>`;

  renderIncome(c, can);
  renderExpenses(c, can);

  // summary like the bottom of the sheet
  const line = (l, v, cls) => `<div class="line ${cls || ""}"><span>${l}</span><span>${v}</span></div>`;
  $("calc").innerHTML =
    line("Total sales", fmt(c.totalSales)) +
    line("Other income (incl. yesterday cash)", fmt(c.otherIncome)) +
    line("Less expenses", "− " + fmt(c.lessExp)) +
    line("Net sales", fmt(c.net), "strong") +
    line("Less card transactions", "− " + fmt(c.card), "sub") +
    (Math.abs(c.adj) >= 0.005 ? line("Less income/expenses not in cash", (c.adj > 0 ? "− " : "+ ") + fmt(Math.abs(c.adj)), "sub") : "") +
    line("Cash in hand", fmt(c.expected), "grand") +
    line("Counted (cash count)", c.counted == null ? "–" : fmt(c.counted)) +
    line("Difference", diffPill(c), "result");

  const op = $("opening"), nt = $("notes");
  if (document.activeElement !== op) op.value = c.opening ? c.opening : "";
  if (document.activeElement !== nt) nt.value = c.notes;
  const pc = S.prevClose[S.branch];
  $("carryMsg").textContent = pc == null ? "No closing cash recorded for the previous day."
    : Math.abs(pc - c.opening) < 0.005 ? `Carried from yesterday's closing: ${fmt(pc)}.`
    : `Yesterday closed with ${fmt(pc)}, but today's yesterday-cash is ${fmt(c.opening)}. Press "Use yesterday's closing" if it should match.`;
  renderDenoms(c);
}

function renderIncome(c, can) {
  $("incomeChips").innerHTML = ["Cash at shop", "Liberty cash", ...(S.allBranches || []).filter(b => b.id !== S.branch).map(b => b.name + " cash")]
    .map(n => `<button type="button" class="chip" data-chip="${esc(n)}">${esc(n)}</button>`).join("");
  $("incomeMeta").textContent = fmt(c.otherIncome);
  let h = `<thead><tr><th>#</th><th>Description</th><th>Received by</th><th class="n">Amount</th><th></th></tr></thead><tbody>`;
  h += `<tr><td class="dim z">1</td><td class="title">Yesterday cash <span class="sub">carried from previous day</span></td><td data-label="Received by"><span class="payname p-cash">Cash</span></td><td class="n" data-label="Amount"><strong>${fmt(c.opening)}</strong></td><td class="act"></td></tr>`;
  c.inc.forEach((r, i) => {
    h += `<tr data-id="${r.id}" class="${S.edit.income === r.id ? "editing" : ""}"><td class="dim z">${i + 2}</td><td class="title">${esc(r.desc || "(no description)")}</td><td data-label="Received by"><span class="payname p-${esc(r.method)}">${esc(payName(r.method))}</span></td><td class="n" data-label="Amount"><strong>${fmt(r.amount)}</strong></td><td class="act">${can ? `<button class="linkbtn" data-act="edit">Edit</button><button class="linkbtn del" data-act="del">Delete</button>` : ""}</td></tr>`;
  });
  h += `</tbody><tfoot><tr class="subtotal"><td class="title" colspan="3">Total income</td><td class="n total" data-label="Total">${fmt(c.otherIncome)}</td><td class="z"></td></tr></tfoot>`;
  $("incomeTable").innerHTML = h;
}
function renderExpenses(c, can) {
  $("expenseMeta").textContent = fmt(c.lessExp);
  let h = `<thead><tr><th>#</th><th>Description</th><th>Paid by</th><th class="n">Amount</th><th></th></tr></thead><tbody>`;
  if (!c.exp.length && !c.banked) h += `<tr><td class="empty" colspan="5">No expenses today. Bank transfers (cash taken to the bank) go here too.</td></tr>`;
  c.exp.forEach((r, i) => {
    const brk = (r.details || []).length ? `<span class="sub">${r.details.map(x => esc(x.name) + " " + fmt(num(x.amount))).join(" · ")}</span>` : "";
    h += `<tr data-id="${r.id}" class="${S.edit.expense === r.id ? "editing" : ""}"><td class="dim z">${i + 1}</td><td class="title">${esc(r.desc || "(no description)")}${brk}</td><td data-label="Paid by"><span class="payname p-${esc(r.method)}">${esc(payName(r.method))}</span></td><td class="n" data-label="Amount"><strong>${fmt(r.amount)}</strong></td><td class="act">${can ? `<button class="linkbtn" data-act="edit">Edit</button><button class="linkbtn del" data-act="del">Delete</button>` : ""}</td></tr>`;
  });
  if (c.banked) h += `<tr><td class="dim z"></td><td class="title">Cash banked (older entry)</td><td data-label="Paid by"><span class="payname p-cash">Cash</span></td><td class="n" data-label="Amount"><strong>${fmt(c.banked)}</strong></td><td class="act"></td></tr>`;
  h += "</tbody>";
  if (c.exp.length || c.banked) h += `<tfoot><tr class="subtotal"><td class="title" colspan="3">Total expenses</td><td class="n total" data-label="Total">${fmt(c.lessExp)}</td><td class="z"></td></tr></tfoot>`;
  $("expenseTable").innerHTML = h;
}
function renderDenoms(c) {
  const t = $("denomTable");
  if (!t.dataset.built) {
    t.innerHTML = `<thead><tr><th class="n">Note / coin</th><th class="n">Count</th><th class="n">Amount</th></tr></thead><tbody>` +
      NOTES.map(n => `<tr><td class="n">${n.toLocaleString("en-LK")}</td><td class="n"><input type="number" min="0" step="1" inputmode="numeric" id="dn_${n}" data-note="${n}" aria-label="Number of ${n} notes"></td><td class="n" id="da_${n}">–</td></tr>`).join("") +
      `</tbody><tfoot><tr class="subtotal"><td class="n">Counted</td><td></td><td class="n"><strong id="denomTotal">–</strong></td></tr></tfoot>`;
    t.dataset.built = "1";
  }
  NOTES.forEach(n => {
    const inp = $("dn_" + n);
    const v = c.denoms[n] ?? c.denoms[String(n)];
    if (document.activeElement !== inp) inp.value = v ? v : "";
    $("da_" + n).textContent = v ? fmt(n * num(v)) : "–";
    inp.disabled = !canEdit();
  });
  $("denomTotal").textContent = c.counted == null ? "–" : fmt(c.counted);
}
function renderAll() {
  const cs = S.branches.map(b => ({ b, c: calc(S.days[b.id]), has: !!S.days[b.id] }));
  const tot = { phones: 0, accs: 0, totalSales: 0, card: 0, otherIncome: 0, lessExp: 0, net: 0, opening: 0, expected: 0, sBy: zeroPay(), lines: [] };
  cs.forEach(({ c }) => { ["phones", "accs", "totalSales", "card", "otherIncome", "lessExp", "net", "opening", "expected"].forEach(k => tot[k] += c[k]); PAY.forEach(p => tot.sBy[p.k] += c.sBy[p.k]); tot.lines.push(...c.lines); });
  const counted = cs.filter(x => x.c.counted != null);
  tot.counted = counted.length === cs.length ? counted.reduce((a, x) => a + x.c.counted, 0) : null;
  tot.diff = tot.counted == null ? null : r2(tot.counted - tot.expected);
  $("allKpis").innerHTML = kpiHTML(tot);
  $("allMeta").textContent = prettyDate(S.date) + " · " + cs.filter(x => x.has).length + " of " + cs.length + " branches have entries";
  const row = (label, fn) => `<tr><td>${label}</td>${cs.map(x => `<td class="n">${fn(x.c)}</td>`).join("")}<td class="n"><strong>${fn(tot)}</strong></td></tr>`;
  let h = `<thead><tr><th></th>${cs.map(x => `<th class="n">${esc(x.b.name)}</th>`).join("")}<th class="n">All branches</th></tr></thead><tbody>`;
  h += row("Lines sold", c => c.lines.length);
  h += row("Phones", c => fmt(c.phones));
  h += row("Accessories", c => fmt(c.accs));
  PAY.forEach(p => h += `<tr><td class="payname p-${p.k}">${p.n}</td>${cs.map(x => `<td class="n">${fmt(x.c.sBy[p.k])}</td>`).join("")}<td class="n"><strong>${fmt(tot.sBy[p.k])}</strong></td></tr>`);
  h += row("<strong>Total sales</strong>", c => "<strong>" + fmt(c.totalSales) + "</strong>");
  h += row("Card transactions", c => fmt(c.card));
  h += row("Other income (incl. yesterday cash)", c => fmt(c.otherIncome));
  h += row("Expenses", c => fmt(c.lessExp));
  h += row("Net sales", c => fmt(c.net));
  h += row("<strong>Cash in hand</strong>", c => "<strong>" + fmt(c.expected) + "</strong>");
  h += row("Counted", c => c.counted == null ? "–" : fmt(c.counted));
  h += row("Difference", c => diffPill(c));
  $("allTable").innerHTML = h + "</tbody>";
}

/* ================= bill form ================= */
function addLine(cat, it) {
  it = it || { category: cat, item: "", serial: "", qty: 1, sales_rep: "", warranty_days: 0, pay: zeroPay() };
  const row = document.createElement("div");
  row.className = "itemrow"; row.dataset.cat = cat;
  const isPhone = cat === "phone";
  row.innerHTML = `
    <div class="ir-top">
      <div class="it-type"><span class="catpill">${isPhone ? "Phone" : "Accessory"}</span><button type="button" class="iconbtn i-del" aria-label="Remove line" title="Remove line">×</button></div>
      ${isPhone ? `<label class="f it-serial">IMEI<input class="i-serial" maxlength="60" inputmode="numeric" placeholder="15-digit IMEI"></label>` : ""}
      <label class="f it-desc">Description<input class="i-name" maxlength="120" placeholder="${isPhone ? "e.g. Apple iPhone 17 Pro 256GB - Silver" : "e.g. Apple 40W adapter"}"></label>
      <label class="f">Qty<input class="i-qty" type="number" min="1" step="1" inputmode="numeric"></label>
      <label class="f">Sales rep<input class="i-rep" maxlength="40" list="repList" placeholder="Name" autocapitalize="characters"></label>
      <label class="f">Warranty<select class="i-war">${WARRANTY.map(w => `<option value="${w.d}">${w.n}</option>`).join("")}</select></label>
    </div>
    <div class="ir-pay">
      ${PAY.map(p => `<label class="f"><span class="payname p-${p.k}">${p.n}</span><input class="i-pay" data-k="${p.k}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></label>`).join("")}
      <div class="it-line"><span>Line total</span><strong class="i-line">0.00</strong></div>
    </div>`;
  if (isPhone) row.querySelector(".i-serial").value = it.serial || "";
  row.querySelector(".i-name").value = it.item || "";
  row.querySelector(".i-qty").value = it.qty || 1;
  row.querySelector(".i-rep").value = it.sales_rep || "";
  row.querySelector(".i-war").value = String(it.warranty_days || 0);
  row.querySelectorAll(".i-pay").forEach(inp => { const v = num(it.pay && it.pay[inp.dataset.k]); inp.value = v ? v : ""; });
  $("itemRows").appendChild(row);
  syncLine(row);
  return row;
}
function syncLine(row) {
  const q = row.querySelector(".i-qty");
  if (row.dataset.cat === "phone") { q.value = 1; q.disabled = true; }
  let t = 0; row.querySelectorAll(".i-pay").forEach(i => t += num(i.value));
  row.querySelector(".i-line").textContent = fmt(t);
}
function readLines() {
  const out = []; let err = "";
  $("itemRows").querySelectorAll(".itemrow").forEach((row, i) => {
    const cat = row.dataset.cat;
    const item = row.querySelector(".i-name").value.trim();
    const serial = cat === "phone" ? row.querySelector(".i-serial").value.trim() : "";
    const qty = cat === "phone" ? 1 : Math.max(1, Math.round(num(row.querySelector(".i-qty").value)) || 1);
    const rep = row.querySelector(".i-rep").value.trim().toUpperCase();
    const war = Number(row.querySelector(".i-war").value) || 0;
    const pay = {}; row.querySelectorAll(".i-pay").forEach(inp => pay[inp.dataset.k] = r2(num(inp.value)));
    const total = payTotal(pay);
    if (!item && !serial && !total) return; // empty line
    const n = `Line ${i + 1}`;
    if (!item) err = err || `${n} needs a description.`;
    if (cat === "phone" && !serial) err = err || `${n} is a phone: enter its IMEI.`;
    if (total <= 0) err = err || `${n} needs an amount under Cash, Sampath, Amana, Seylan, Commercial, Amex or Web.`;
    out.push({ category: cat, item, serial, qty, sales_rep: rep, warranty_days: war, ...pay });
  });
  return { lines: out, err };
}
function updBillTotal() {
  let t = 0; $("itemRows").querySelectorAll(".i-pay").forEach(i => t += num(i.value));
  $("sTotal").textContent = fmt(t);
}
function resetSale() {
  ["sRef", "sDesc", "sPhone", "sRemarks"].forEach(id => $(id).value = "");
  $("itemRows").innerHTML = ""; addLine("phone");
  S.edit.sale = null; S.dupOk = null; $("sSave").textContent = "Save bill"; $("billTitle").textContent = "New bill";
  $("sCancel").hidden = true; $("sErr").textContent = ""; updBillTotal();
}
$("addPhone").onclick = () => { addLine("phone").querySelector(".i-serial").focus(); };
$("addAcc").onclick = () => { addLine("accessory").querySelector(".i-name").focus(); };
$("itemRows").addEventListener("click", e => {
  const del = e.target.closest(".i-del"); if (!del) return;
  del.closest(".itemrow").remove();
  if (!$("itemRows").children.length) addLine("accessory");
  updBillTotal();
});
$("saleForm").addEventListener("input", e => {
  const row = e.target.closest(".itemrow"); if (row) syncLine(row);
  if (e.target.classList.contains("i-serial")) S.dupOk = null;
  updBillTotal();
});
async function findSoldSerials(serials, ignoreSaleId) {
  if (!serials.length) return [];
  const res = await sb.rpc("check_serials", { p_serials: serials, p_ignore: ignoreSaleId || null });
  return res.error ? [] : res.data;
}
$("saleForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!canEdit()) return;
  const { lines, err } = readLines();
  $("sErr").textContent = "";
  if (err) { $("sErr").textContent = err; return; }
  if (!lines.length) { $("sErr").textContent = "Add at least one phone or accessory line."; return; }
  const serials = lines.map(l => l.serial).filter(Boolean);
  if (new Set(serials).size !== serials.length) { $("sErr").textContent = "The same IMEI is entered twice on this bill."; return; }
  const editId = S.edit.sale, key = serials.join("|");
  if (serials.length && S.dupOk !== key) {
    const sold = await findSoldSerials(serials, editId);
    if (sold.length) {
      S.dupOk = key;
      $("sErr").textContent = "Already sold: " + sold.map(s => `${s.serial} (${bname(s.branch_id)}, ${prettyDate(s.sold_on)}${s.ref ? ", bill " + s.ref : ""})`).join("; ") +
        ". Press Save bill again to save anyway (for example a returned phone sold again).";
      return;
    }
  }
  const sale = { branch_id: S.branch, date: S.date, ref: $("sRef").value.trim(), description: $("sDesc").value.trim(),
    customer_phone: $("sPhone").value.trim(), remarks: $("sRemarks").value.trim() };
  $("sSave").disabled = true;
  try {
    await write(async () => check(await sb.rpc("save_invoice", { p_id: editId, p_sale: sale, p_items: lines })));
    rememberReps(lines.map(l => l.sales_rep));
    resetSale(); render(); $("sRef").focus();
  } catch (_) { /* banner shown */ } finally { $("sSave").disabled = false; }
});
$("sCancel").onclick = () => { resetSale(); render(); };
function editBill(bill) {
  $("sRef").value = bill.ref || ""; $("sDesc").value = bill.desc || ""; $("sPhone").value = bill.phone || ""; $("sRemarks").value = bill.remarks || "";
  $("itemRows").innerHTML = ""; bill.items.forEach(it => addLine(it.category, it));
  S.edit.sale = bill.id; S.dupOk = null; $("sSave").textContent = "Update bill"; $("billTitle").textContent = "Edit bill " + (bill.ref || "");
  $("sCancel").hidden = false; updBillTotal();
  $("billPanel").scrollIntoView({ block: "start", behavior: "smooth" });
}
["phonesTable", "accTable"].forEach(id => $(id).addEventListener("click", e => tableAction(e, "sales", editBill, resetSale)));

/* ---- income & expenses ---- */
function brkRow(x) {
  const r = document.createElement("div"); r.className = "brkrow";
  r.innerHTML = `<label class="f">Name<input class="b-name" maxlength="40" placeholder="e.g. Sharoze"></label>
    <label class="f">Amount<input class="b-amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></label>
    <button type="button" class="iconbtn b-del" aria-label="Remove breakdown line">×</button>`;
  r.querySelector(".b-name").value = (x && x.name) || ""; r.querySelector(".b-amt").value = x && num(x.amount) ? num(x.amount) : "";
  $("brkRows").appendChild(r); return r;
}
function readBrk() {
  const out = [];
  $("brkRows").querySelectorAll(".brkrow").forEach(r => {
    const name = r.querySelector(".b-name").value.trim(), amount = r2(num(r.querySelector(".b-amt").value));
    if (name || amount) out.push({ name: name || "-", amount });
  });
  return out;
}
function syncBrk() {
  const b = readBrk(); const amt = $("expenseAmt");
  if (b.length) { amt.value = r2(b.reduce((a, x) => a + x.amount, 0)) || ""; amt.disabled = true; } else amt.disabled = false;
}
$("addBrk").onclick = () => { brkRow().querySelector(".b-name").focus(); syncBrk(); };
$("brkRows").addEventListener("click", e => { const d = e.target.closest(".b-del"); if (d) { d.closest(".brkrow").remove(); syncBrk(); } });
$("brkRows").addEventListener("input", syncBrk);

["income", "expense"].forEach(kind => {
  const reset = () => {
    $(kind + "Desc").value = ""; $(kind + "Amt").value = ""; $(kind + "Amt").disabled = false; $(kind + "Method").value = "cash";
    if (kind === "expense") $("brkRows").innerHTML = "";
    S.edit[kind] = null; $(kind + "Save").textContent = "Add"; $(kind + "Cancel").hidden = true; $(kind + "Err").textContent = "";
  };
  $(kind + "Form").addEventListener("click", e => {
    const chip = e.target.closest("[data-chip]"); if (!chip) return;
    $(kind + "Desc").value = chip.dataset.chip; $(kind + "Method").value = "cash";
    if (kind === "expense" && /breakfast|lunch/i.test(chip.dataset.chip) && !$("brkRows").children.length) { brkRow().querySelector(".b-name").focus(); return; }
    $(kind + "Amt").focus();
  });
  $(kind + "Form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!canEdit()) return;
    const details = kind === "expense" ? readBrk() : [];
    const amount = details.length ? r2(details.reduce((a, x) => a + x.amount, 0)) : r2(num($(kind + "Amt").value));
    if (!$(kind + "Desc").value.trim()) { $(kind + "Err").textContent = "Enter a description."; return; }
    if (amount <= 0) { $(kind + "Err").textContent = "Enter an amount above zero."; return; }
    const body = { branch_id: S.branch, date: S.date, description: $(kind + "Desc").value.trim(), amount, method: $(kind + "Method").value };
    if (kind === "expense") body.details = details;
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
    if (kind === "expense") { $("brkRows").innerHTML = ""; (r.details || []).forEach(x => brkRow(x)); syncBrk(); }
    S.edit[kind] = r.id; $(kind + "Save").textContent = "Update"; $(kind + "Cancel").hidden = false;
    $(kind + "Form").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, reset));
});

function tableAction(e, coll, onEdit, onReset) {
  const btn = e.target.closest("button[data-act]"); if (!btn || !canEdit()) return;
  const id = btn.closest("tr").dataset.id; const d = S.days[S.branch]; const r = d && d[coll] && d[coll][id]; if (!r) return;
  if (btn.dataset.act === "edit") { onEdit(r); render(); return; }
  if (!btn.hasAttribute("data-armed")) {
    btn.setAttribute("data-armed", ""); btn.textContent = coll === "sales" ? `Confirm: delete bill${r.items && r.items.length > 1 ? " (" + r.items.length + " lines)" : ""}` : "Confirm delete";
    setTimeout(() => { if (btn.isConnected) { btn.removeAttribute("data-armed"); btn.textContent = coll === "sales" ? "Delete bill" : "Delete"; } }, 4000);
    return;
  }
  const editKey = coll === "sales" ? "sale" : coll; if (S.edit[editKey] === id) onReset();
  write(async () => check(await sb.from(TABLE[coll]).delete().eq("id", id))).catch(() => {});
}

/* ---- opening, notes, cash count ---- */
$("opening").addEventListener("change", () => { if (S.branch !== "all" && canEdit()) saveDay({ opening: r2(num($("opening").value)) }).catch(() => {}); });
$("notes").addEventListener("change", () => { if (S.branch !== "all" && canEdit()) saveDay({ notes: $("notes").value.trim() }).catch(() => {}); });
let denomTimer = null;
$("denomTable").addEventListener("input", e => {
  const inp = e.target.closest("input[data-note]"); if (!inp || !canEdit()) return;
  // live total while typing, save after a short pause
  const den = {}; let total = 0, any = false;
  NOTES.forEach(n => { const v = Math.max(0, Math.round(num($("dn_" + n).value))); if (v) { den[n] = v; total += n * v; any = true; } $("da_" + n).textContent = v ? fmt(n * v) : "–"; });
  $("denomTotal").textContent = any ? fmt(total) : "–";
  clearTimeout(denomTimer);
  denomTimer = setTimeout(() => saveDay({ denoms: den, counted: any ? total : null }).catch(() => {}), 700);
});
$("prevCount").onclick = async () => {
  if (!canEdit()) return;
  const v = S.prevClose[S.branch];
  if (v == null) { $("cashMsg").textContent = "No entries for " + prettyDate(shift(S.date, -1)) + "."; return; }
  $("opening").value = r2(v); $("cashMsg").textContent = `Yesterday cash set to ${fmt(v)}.`;
  try { await saveDay({ opening: r2(v) }); } catch (_) {}
};

/* ---- serial & warranty lookup (admin) ---- */
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
  if (!isAdmin()) return;
  const q = $("lookupQ").value.trim().replace(/[,()%*\\]/g, "");
  if (q.length < 3) { $("lookupMsg").textContent = "Type at least 3 characters."; return; }
  $("lookupMsg").textContent = "Searching…";
  try {
    const rowsFound = check(await sb.rpc("warranty_lookup", { q }));
    $("lookupWrap").hidden = !rowsFound.length;
    $("lookupMsg").textContent = rowsFound.length ? `${rowsFound.length} item${rowsFound.length > 1 ? "s" : ""} found.` : "Nothing found for “" + q + "”.";
    $("lookupTable").innerHTML = `<thead><tr><th>Item</th><th>IMEI</th><th>Sold</th><th>Branch</th><th>Bill</th><th>Customer</th><th>Warranty</th></tr></thead><tbody>` +
      rowsFound.map(it => `<tr><td class="title">${esc(it.item)}</td><td data-label="IMEI" class="${it.serial ? "" : "z"}"><span class="sn">${esc(it.serial || "")}</span></td>` +
        `<td data-label="Sold">${prettyDate(it.sold_on)}</td><td data-label="Branch">${esc(bname(it.branch_id))}</td><td data-label="Bill">${esc(it.ref || "–")}</td>` +
        `<td data-label="Customer" class="${it.customer || it.phone ? "" : "z"}">${esc([it.customer, it.phone].filter(Boolean).join(" · "))}</td>` +
        `<td data-label="Warranty">${warName(it.warranty_days)} ${warStatus(it, it.sold_on)}</td></tr>`).join("") + "</tbody>";
  } catch (err) { $("lookupMsg").textContent = "Search failed: " + (err.message || err); }
});

/* ================= navigation ================= */
function setDate(d) {
  if (!d) return;
  if (S.me && !isAdmin()) d = todayISO();
  S.date = d; S.days = {}; resetSale(); S.edit.income = S.edit.expense = null; $("cashMsg").textContent = "";
  render(); subscribeLive(); refresh();
}
$("date").addEventListener("change", e => setDate(e.target.value));
$("prevDay").onclick = () => setDate(shift(S.date, -1));
$("nextDay").onclick = () => setDate(shift(S.date, 1));
$("todayBtn").onclick = () => setDate(todayISO());
$("dateWarnBtn").onclick = () => setDate(todayISO());
function checkDayChange() {
  const t = todayISO();
  if (t === S.lastToday) return;
  const wasOnToday = S.date === S.lastToday;
  S.lastToday = t;
  if (!S.me) { S.date = t; return; }
  if (wasOnToday || !isAdmin()) setDate(t); else render();
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
function openSettings() {
  (S.allBranches || S.branches).forEach(b => { $("bn_" + b.id).value = b.name; $("ba_" + b.id).value = b.address || ""; });
  $("settingsPanel").hidden = false; $("bn_b1").focus();
}
$("settingsClose").onclick = () => $("settingsPanel").hidden = true;
$("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!isAdmin()) return;
  const list = DEFAULT_BRANCHES.map((b, i) => ({ id: b.id, name: $("bn_" + b.id).value.trim() || b.name, address: $("ba_" + b.id).value.trim(), sort: i + 1 }));
  try { check(await sb.from("branches").upsert(list)); await loadBranches(); $("settingsPanel").hidden = true; }
  catch (err) { showBanner("Could not save branches: " + (err.message || err)); }
});

/* ================= Excel (same layout as the daily sheet) ================= */
const BORDER = { top: { style: "thin", color: { rgb: "999999" } }, bottom: { style: "thin", color: { rgb: "999999" } }, left: { style: "thin", color: { rgb: "999999" } }, right: { style: "thin", color: { rgb: "999999" } } };
function sheetName(s) { return String(s).replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31) || "Sheet"; }
// Build a sheet from rows of cells. A cell is a value, or {v, s} with a style.
function makeSheet(rowsArr, widths, merges) {
  const ws = {}; let maxC = 0;
  rowsArr.forEach((row, r) => (row || []).forEach((cell, c) => {
    if (cell === undefined || cell === null || cell === "") return;
    const o = typeof cell === "object" && !Array.isArray(cell) ? cell : { v: cell };
    const ref = XLSX.utils.encode_cell({ r, c });
    const isNum = typeof o.v === "number";
    ws[ref] = { v: o.v, t: isNum ? "n" : "s", s: o.s || {} };
    if (isNum && !o.int) ws[ref].z = "#,##0.00";
    maxC = Math.max(maxC, c);
  }));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rowsArr.length - 1, 0), c: Math.max(maxC, widths.length - 1) } });
  ws["!cols"] = widths.map(w => ({ wch: w }));
  if (merges) ws["!merges"] = merges;
  return ws;
}
const st = {
  title: { font: { bold: true, sz: 13 }, alignment: { horizontal: "center" } },
  sub: { font: { bold: true, sz: 11 }, alignment: { horizontal: "center" } },
  date: { font: { bold: true, color: { rgb: "C00000" } }, alignment: { horizontal: "center" } },
  dow: { font: { bold: true, sz: 13, color: { rgb: "C00000" } }, alignment: { horizontal: "right" } },
  head: { font: { bold: true }, border: BORDER, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "F2F2F2" } } },
  sect: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "E2EFDA" } }, border: BORDER },
  cell: { border: BORDER },
  imei: { border: BORDER, font: { name: "Consolas" } },
  num: { border: BORDER, alignment: { horizontal: "right" } },
  tot: { font: { bold: true }, border: { ...BORDER, top: { style: "medium" } }, alignment: { horizontal: "right" } },
  totL: { font: { bold: true }, border: { ...BORDER, top: { style: "medium" } } },
  grand: { font: { bold: true, sz: 12 }, border: { ...BORDER, top: { style: "medium" }, bottom: { style: "double" } }, alignment: { horizontal: "right" }, fill: { fgColor: { rgb: "E2EFDA" } } },
  grandL: { font: { bold: true, sz: 12 }, border: { ...BORDER, top: { style: "medium" }, bottom: { style: "double" } }, fill: { fgColor: { rgb: "E2EFDA" } } }
};
const payHead = k => ({ v: payName(k).toUpperCase(), s: { ...st.head, font: { bold: true, color: { rgb: XL_COLORS[k] } } } });
const N = (v, s) => ({ v: r2(v), s: s || st.num });
const blankIfZero = (v, s) => Math.abs(v) < 0.005 ? { v: "", s: s || st.num } : N(v, s);

function daySheetRows(branchId, date, d) {
  const c = calc(d); const A = []; const M = [];
  const W = 5 + PAY.length + 2; // No, Bill, IMEI, Description, Rep, pays..., Total, Remarks
  const lastCol = W - 1;
  const push = r => { A.push(r); return A.length - 1; };
  let r = push([{ v: bname(branchId).toUpperCase(), s: st.title }]); M.push({ s: { r, c: 0 }, e: { r, c: lastCol - 2 } });
  A[r][lastCol - 1] = { v: dayName(date).toUpperCase(), s: st.dow };
  r = push([{ v: (baddr(branchId) || "").toUpperCase(), s: st.sub }]); M.push({ s: { r, c: 0 }, e: { r, c: lastCol - 2 } });
  r = push([{ v: date, s: st.date }]); M.push({ s: { r, c: 0 }, e: { r, c: lastCol - 2 } });
  const head = () => push([{ v: "No", s: st.head }, { v: "BILL NO.", s: st.head }, { v: "IMEI", s: st.head }, { v: "DESCRIPTION", s: st.head }, { v: "SALES REP", s: st.head },
    ...PAY.map(p => payHead(p.k)), { v: "TOTAL", s: st.head }, { v: "REMARKS", s: st.head }]);
  const section = (label) => { const rr = push([{ v: label, s: st.sect }]); for (let k = 1; k <= lastCol; k++) A[rr][k] = { v: "", s: st.sect }; M.push({ s: { r: rr, c: 0 }, e: { r: rr, c: lastCol } }); };
  const lineRows = (cat) => {
    const list = c.lines.filter(l => l.it.category === cat);
    list.forEach(({ bill, it }, i) => push([{ v: i + 1, int: true, s: st.cell }, { v: bill.ref || "", s: st.cell }, { v: it.serial || "", s: st.imei },
      { v: (it.qty > 1 ? it.qty + " x " : "") + (it.item || "").toUpperCase(), s: st.cell }, { v: (it.sales_rep || "").toUpperCase(), s: st.cell },
      ...PAY.map(p => blankIfZero(num(it.pay[p.k]))), N(payTotal(it.pay)),
      { v: [bill.desc, bill.phone, it.warranty_days ? warName(it.warranty_days) + " warranty" : "", bill.remarks].filter(Boolean).join(" · "), s: st.cell }]));
    const by = cat === "phone" ? c.pBy : c.aBy;
    push([{ v: "", s: st.totL }, { v: "", s: st.totL }, { v: "", s: st.totL }, { v: "TOTAL " + (cat === "phone" ? "PHONES" : "ACCESSORIES"), s: st.totL }, { v: "", s: st.totL },
      ...PAY.map(p => N(by[p.k], st.tot)), N(cat === "phone" ? c.phones : c.accs, st.tot), { v: "", s: st.totL }]);
  };
  section("PHONES"); head(); lineRows("phone"); push([]);
  section("ACCESSORIES"); head(); lineRows("accessory"); push([]);
  push([{ v: "", s: st.totL }, { v: "", s: st.totL }, { v: "", s: st.totL }, { v: "TOTAL CARD TRANSACTIONS", s: st.totL }, { v: "", s: st.totL },
    { v: "", s: st.tot }, ...CARD.map(p => N(c.sBy[p.k], st.tot)), N(c.card, st.tot), { v: "", s: st.totL }]);
  push([{ v: "", s: st.grandL }, { v: "", s: st.grandL }, { v: "", s: st.grandL }, { v: "TOTAL SALES", s: st.grandL }, { v: "", s: st.grandL },
    ...PAY.map(p => N(c.sBy[p.k], st.grand)), N(c.totalSales, st.grand), { v: "", s: st.grandL }]);
  push([]);

  // income & expenses: No | Description | Paid/received by | Amount
  const small = (rowsList, label, total) => {
    section(label);
    push([{ v: "No", s: st.head }, { v: "", s: st.head }, { v: "", s: st.head }, { v: "DESCRIPTION", s: st.head }, { v: label === "INCOME" ? "RECEIVED BY" : "PAID BY", s: st.head }, { v: "AMOUNT", s: st.head }]);
    rowsList.forEach((x, i) => push([{ v: i + 1, int: true, s: st.cell }, { v: "", s: st.cell }, { v: "", s: st.cell }, { v: x.desc.toUpperCase(), s: st.cell }, { v: payName(x.method), s: st.cell }, N(x.amount)]));
    push([{ v: "", s: st.totL }, { v: "", s: st.totL }, { v: "", s: st.totL }, { v: "TOTAL " + label, s: st.totL }, { v: "", s: st.totL }, N(total, st.tot)]);
    push([]);
  };
  small([{ desc: "Yesterday cash", method: "cash", amount: c.opening }, ...c.inc], "INCOME", c.otherIncome);
  const expRows = [...c.exp]; if (c.banked) expRows.push({ desc: "Cash banked", method: "cash", amount: c.banked });
  small(expRows, "EXPENSES", c.lessExp);

  // expense breakdowns (e.g. breakfast & lunch per person)
  c.exp.filter(x => (x.details || []).length).forEach(x => {
    push([{ v: "", s: {} }, { v: "", s: {} }, { v: "", s: {} }, { v: x.desc.toUpperCase(), s: st.head }, { v: "AMOUNT", s: st.head }]);
    x.details.forEach(dt => push(["", "", "", { v: String(dt.name).toUpperCase(), s: st.cell }, N(num(dt.amount))]));
    push(["", "", "", { v: "TOTAL", s: st.totL }, N(x.amount, st.tot)]);
    push([]);
  });

  // summary like the bottom of the sheet + cash count
  const sumStart = push(["", "", "", { v: "Total sales", s: { font: { bold: true } } }, "", N(c.totalSales, { alignment: { horizontal: "right" } })]);
  push(["", "", "", { v: "Other income", s: { font: { bold: true } } }, "", N(c.otherIncome, { alignment: { horizontal: "right" } })]);
  push(["", "", "", { v: "Less expenses", s: { font: { bold: true } } }, "", N(-c.lessExp, { alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } })]);
  push(["", "", "", { v: "Net sales", s: { font: { bold: true } } }, "", N(c.net, { font: { bold: true }, alignment: { horizontal: "right" } })]);
  push(["", "", "", { v: "Less card transactions", s: { font: { bold: true, underline: true } } }, "", N(-c.card, { alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } })]);
  if (Math.abs(c.adj) >= 0.005) push(["", "", "", { v: "Less income/expenses not in cash", s: { font: { bold: true } } }, "", N(-c.adj, { alignment: { horizontal: "right" } })]);
  push(["", "", "", { v: "CASH IN HAND", s: { font: { bold: true } } }, "", N(c.expected, { font: { bold: true }, alignment: { horizontal: "right" }, border: { bottom: { style: "double" } } })]);
  push(["", "", "", { v: "Counted", s: { font: { bold: true } } }, "", c.counted == null ? { v: "Not counted" } : N(c.counted, { alignment: { horizontal: "right" } })]);
  push(["", "", "", { v: "Difference (short - / excess +)", s: { font: { bold: true } } }, "", c.diff == null ? "" : N(c.diff, { font: { bold: true, color: { rgb: Math.abs(c.diff) < 0.005 ? "1B6A45" : "C00000" } }, alignment: { horizontal: "right" } })]);

  // cash count table to the right of the summary
  const cc = 7; // column for note value
  const setCell = (row, col, val) => { while (A.length <= row) A.push([]); A[row][col] = val; };
  setCell(sumStart, cc, { v: "NOTE", s: st.head }); setCell(sumStart, cc + 1, { v: "COUNT", s: st.head }); setCell(sumStart, cc + 2, { v: "AMOUNT", s: st.head });
  let tot = 0;
  NOTES.forEach((n, i) => {
    const cnt = num(c.denoms[n] ?? c.denoms[String(n)]); tot += n * cnt;
    setCell(sumStart + 1 + i, cc, { v: n, int: true, s: { ...st.num, numFmt: "#,##0" } });
    setCell(sumStart + 1 + i, cc + 1, { v: cnt, int: true, s: st.num });
    setCell(sumStart + 1 + i, cc + 2, N(n * cnt));
  });
  setCell(sumStart + 1 + NOTES.length, cc + 1, { v: "TOTAL", s: st.totL });
  setCell(sumStart + 1 + NOTES.length, cc + 2, N(tot, st.grand));
  if (c.notes) { push([]); push(["", "", "", { v: "NOTES: " + c.notes, s: { font: { italic: true } } }]); }

  return makeSheet(A, [5, 10, 18, 44, 16, ...PAY.map(() => 13), 14, 34], M);
}
function allSheet(date, days) {
  const cs = S.branches.map(b => ({ b, c: calc(days[b.id]) }));
  const A = [[{ v: "ALL BRANCHES - DAILY SUMMARY", s: st.title }], [{ v: date + "  " + dayName(date).toUpperCase(), s: st.date }], [],
    [{ v: "", s: st.head }, ...cs.map(x => ({ v: x.b.name.toUpperCase(), s: st.head })), { v: "ALL BRANCHES", s: st.head }]];
  const add = (l, fn, bold) => { const v = cs.map(x => fn(x.c)); const allNum = v.every(n => typeof n === "number");
    A.push([{ v: l, s: bold ? st.totL : st.cell }, ...v.map(n => typeof n === "number" ? N(n, bold ? st.tot : st.num) : { v: n, s: st.cell }), allNum ? N(v.reduce((a, b) => a + b, 0), st.tot) : { v: "", s: st.cell }]); };
  add("Phones", c => c.phones); add("Accessories", c => c.accs);
  PAY.forEach(p => add(p.n, c => c.sBy[p.k]));
  add("TOTAL SALES", c => c.totalSales, true); add("Card transactions", c => c.card);
  add("Other income (incl. yesterday cash)", c => c.otherIncome); add("Expenses", c => c.lessExp); add("Net sales", c => c.net, true);
  add("CASH IN HAND", c => c.expected, true); add("Counted", c => c.counted == null ? "Not counted" : c.counted); add("Difference", c => c.diff == null ? "" : c.diff);
  return makeSheet(A, [36, 16, 16, 16, 18], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }]);
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
  if (!isAdmin() || !needXlsx() || S.branch === "all") return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, daySheetRows(S.branch, S.date, S.days[S.branch]), sheetName(bname(S.branch)));
  saveWb(wb, `${bname(S.branch)} ${S.date}.xlsx`);
};
$("exAll").onclick = () => {
  if (!isAdmin() || !needXlsx()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, allSheet(S.date, S.days), "All Branches");
  S.branches.forEach(b => XLSX.utils.book_append_sheet(wb, daySheetRows(b.id, S.date, S.days[b.id]), sheetName(b.name)));
  saveWb(wb, `All Branches ${S.date}.xlsx`);
};
$("exRange").onclick = async () => {
  if (!isAdmin() || !needXlsx()) return;
  const from = $("exFrom").value, to = $("exTo").value;
  if (!from || !to || from > to) { $("exMsg").textContent = "Pick a From date that is on or before the To date."; return; }
  $("exMsg").textContent = "Collecting entries…";
  let map; try { map = await loadRange(from, to); } catch (e) { $("exMsg").textContent = "Could not read entries: " + (e.message || e); return; }
  const list = Object.values(map).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.branch < b.branch ? -1 : 1);
  const H = arr => arr.map(v => ({ v, s: st.head }));
  const sum = [H(["Date", "Branch", "Phones", "Accessories", ...PAY.map(p => p.n), "Total sales", "Card transactions", "Other income", "Expenses", "Net sales", "Cash in hand", "Counted", "Difference"])];
  const lines = [H(["Date", "Branch", "Bill no.", "Type", "IMEI", "Description", "Qty", "Sales rep", ...PAY.map(p => p.n), "Total", "Warranty", "Warranty until", "Customer", "Phone"])];
  const inc = [H(["Date", "Branch", "Description", "Received by", "Amount"])], exp = [H(["Date", "Branch", "Description", "Paid by", "Amount", "Breakdown"])];
  const reps = {};
  list.forEach(d => {
    const c = calc(d), bn = bname(d.branch);
    sum.push([d.date, bn, N(c.phones), N(c.accs), ...PAY.map(p => N(c.sBy[p.k])), N(c.totalSales), N(c.card), N(c.otherIncome), N(c.lessExp), N(c.net), N(c.expected), c.counted == null ? "" : N(c.counted), c.diff == null ? "" : N(c.diff)]);
    c.lines.forEach(({ bill, it }) => {
      lines.push([d.date, bn, bill.ref || "", it.category === "phone" ? "Phone" : "Accessory", it.serial || "", it.item, { v: it.qty, int: true }, it.sales_rep || "",
        ...PAY.map(p => blankIfZero(num(it.pay[p.k]), {})), N(payTotal(it.pay), {}), warName(it.warranty_days), it.warranty_until || "", bill.desc || "", bill.phone || ""]);
      const key = (it.sales_rep || "(no rep)") + "|" + bn;
      const o = reps[key] || (reps[key] = { rep: it.sales_rep || "(no rep)", branch: bn, phones: 0, pAmt: 0, accs: 0, aAmt: 0 });
      if (it.category === "phone") { o.phones += 1; o.pAmt += payTotal(it.pay); } else { o.accs += it.qty; o.aAmt += payTotal(it.pay); }
    });
    inc.push([d.date, bn, "Yesterday cash", "Cash", N(c.opening, {})]);
    c.inc.forEach(r => inc.push([d.date, bn, r.desc || "", payName(r.method), N(r.amount, {})]));
    c.exp.forEach(r => exp.push([d.date, bn, r.desc || "", payName(r.method), N(r.amount, {}), (r.details || []).map(x => x.name + " " + fmt(num(x.amount))).join(", ")]));
  });
  const repRows = [H(["Sales rep", "Branch", "Phones sold", "Phones amount", "Accessories sold", "Accessories amount", "Total amount"])];
  Object.values(reps).sort((a, b) => (b.pAmt + b.aAmt) - (a.pAmt + a.aAmt)).forEach(o => repRows.push([o.rep, o.branch, { v: o.phones, int: true }, N(o.pAmt, {}), { v: o.accs, int: true }, N(o.aAmt, {}), N(o.pAmt + o.aAmt, {})]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeSheet(sum, [12, 14, 14, 14, ...PAY.map(() => 12), 14, 14, 14, 14, 14, 14, 14, 12]), "Daily Summary");
  XLSX.utils.book_append_sheet(wb, makeSheet(lines, [12, 14, 10, 11, 18, 40, 6, 14, ...PAY.map(() => 12), 13, 12, 13, 18, 14]), "Phones & Accessories");
  XLSX.utils.book_append_sheet(wb, makeSheet(repRows, [18, 14, 12, 15, 15, 17, 15]), "Sales by Rep");
  XLSX.utils.book_append_sheet(wb, makeSheet(inc, [12, 14, 30, 14, 14]), "Income");
  XLSX.utils.book_append_sheet(wb, makeSheet(exp, [12, 14, 30, 14, 14, 60]), "Expenses");
  saveWb(wb, `Sales Report ${from} to ${to}.xlsx`);
};

/* ================= auth & start ================= */
function showLogin() { $("app").hidden = true; $("loginView").hidden = false; }
async function showApp(session) {
  const res = await sb.from("staff").select("role, branch_id").eq("user_id", session.user.id).maybeSingle();
  if (res.error || !res.data) {
    S.me = null;
    $("app").hidden = true; $("loginView").hidden = false;
    $("loginErr").textContent = res.error ? "Could not check your access: " + res.error.message
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
  rememberReps();
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

// Refiner result page: paste the AI's answer, see the visual result,
// approve learnings into the team context wiki page.

const $ = (id) => document.getElementById(id);

const page = { key: null, run: null };

// ---------- helpers ----------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

function notice(msg, kind) {
  const n = $('notice');
  if (!msg) { n.hidden = true; return; }
  n.textContent = msg;
  n.className = 'notice' + (kind ? ' ' + kind : '');
  n.hidden = false;
}

function lastSegment(path) {
  return String(path || '').split('\\').pop();
}

function workItemUrl(id) {
  return page.run.ctx.api + '/_workitems/edit/' + id;
}

function knownItems() {
  const map = {};
  (page.run.items || []).forEach((i) => { map[i.id] = i; });
  return map;
}

function storyChip(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  const known = knownItems()[n];
  const a = el('a', 'chip' + (known ? '' : ' unknown'), '#' + n);
  a.href = workItemUrl(n);
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = known ? (known.title + (known.state ? ' · ' + known.state : '') + (known.kind === 'related' ? ' · linked as Related' : ''))
    : 'Not one of the work items in this review. Check the ID.';
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function save() {
  return chrome.storage.local.set({ [page.key]: page.run });
}

// ---------- pasting the AI answer ----------

function showResultFromPaste() {
  const obj = ANSWER.parse($('answer').value);
  if (!obj) {
    $('paste-error').textContent = 'No result block found. Copy the AI\'s whole answer, including the part that starts with "sprint-assistant-result".';
    return;
  }
  if (obj.mode !== page.run.mode) {
    $('paste-error').textContent = 'This answer is for a ' + (obj.mode === 'feature' ? 'Feature Coverage' : 'Sprint Readiness') +
      ' review, but this page is for a ' + (page.run.mode === 'feature' ? 'Feature Coverage' : 'Sprint Readiness') + ' review.';
    return;
  }
  $('paste-error').textContent = '';
  page.run.result = obj;
  page.run.pastedAt = new Date().toISOString();
  page.run.approved = [];
  save();
  render();
}

// ---------- rendering ----------

function groupClass(group, name) {
  const s = (String(group || '') + ' ' + String(name || '')).toLowerCase();
  if (/firmware|mysense|connect|device|sensor|hardware/.test(s)) return 'g-fw';
  if (/ccu/.test(s)) return 'g-ccu';
  if (/cloud|portal|app|facilisight|web|mobile|backend/.test(s)) return 'g-cloud';
  if (/qe|qa|test/.test(s)) return 'g-qe';
  return 'g-other';
}

const STATUS_LABEL = { covered: 'Covered', partial: 'Partly covered', missing: 'No story' };

function checkIcon(status) {
  const box = el('span', 'box ' + status);
  box.setAttribute('aria-hidden', 'true');
  if (status === 'covered' || status === 'partial') {
    box.innerHTML = status === 'covered'
      ? '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 6H9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  return box;
}

function renderFeature(r, root) {
  const comps = Array.isArray(r.components) ? r.components : [];
  const items = comps.flatMap((c) => Array.isArray(c.items) ? c.items : []);
  const norm = (s) => (s === 'covered' || s === 'partial' ? s : 'missing');
  const covered = items.filter((i) => norm(i.status) === 'covered').length;
  const partial = items.filter((i) => norm(i.status) === 'partial').length;
  const missing = items.filter((i) => norm(i.status) === 'missing').length;
  const extra = Array.isArray(r.extra) ? r.extra : [];

  const sum = el('div', 'summary');
  sum.append(el('span', 'title', 'Coverage'));
  sum.append(el('span', 'pill ok', covered + ' of ' + items.length + ' covered'));
  if (partial) sum.append(el('span', 'pill warn', partial + ' partly'));
  sum.append(el('span', 'pill ' + (missing ? 'err' : 'ok'), missing + ' missing'));
  if (extra.length) sum.append(el('span', 'pill', extra.length + ' not in the Feature'));
  root.append(sum);

  const diagrams = Math.max(Number(r.unreadableDiagrams) || 0, page.run.diagrams || 0);
  if (diagrams) {
    root.append(el('div', 'notice warn', diagrams + (diagrams === 1 ? ' diagram' : ' diagrams') +
      ' in the Feature couldn\'t be read. Requirements shown only in them aren\'t checked.'));
  }

  const lanes = el('div', 'lanes');
  comps.forEach((c, ci) => {
    if (ci > 0) {
      const con = el('div', 'connector');
      con.innerHTML = '<svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><path d="M7 1V15M2 10L7 15L12 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      lanes.append(con);
    }
    const cls = groupClass(c.group, c.name);
    const list = Array.isArray(c.items) ? c.items : [];
    const done = list.filter((i) => norm(i.status) === 'covered').length;
    const lane = el('div', 'lane');
    const card = el('div', 'lane-card ' + cls);
    card.append(el('div', 'name', c.name || 'Component'));
    if (c.group) card.append(el('div', 'group', c.group));
    card.append(el('div', 'count', done + ' / ' + list.length + ' covered'));
    const box = el('div', 'lane-items ' + cls);
    list.forEach((it) => {
      const status = norm(it.status);
      const row = el('button', 'item');
      row.type = 'button';
      row.setAttribute('aria-expanded', 'false');
      row.append(checkIcon(status));
      const txt = el('span', 'item-text');
      const t = el('span', 't', it.text || '');
      if (it.source) t.append(el('span', 'src', it.source));
      txt.append(t);
      const note = el('span', 'note', (STATUS_LABEL[status] || '') + (it.note ? ': ' + it.note : ''));
      note.hidden = true;
      txt.append(note);
      row.append(txt);
      const right = el('span', 'item-right');
      const ids = Array.isArray(it.stories) ? it.stories : [];
      const chips = ids.map(storyChip).filter(Boolean);
      if (chips.length) chips.forEach((ch) => right.append(ch));
      else right.append(el('span', 'no-story', status === 'missing' ? 'no story' : '—'));
      row.append(right);
      row.setAttribute('aria-label', (it.text || '') + '. ' + (STATUS_LABEL[status] || '') + '. ' +
        (ids.length ? 'Stories ' + ids.join(', ') : 'No story') + '. Show reason.');
      row.addEventListener('click', () => {
        note.hidden = !note.hidden;
        row.setAttribute('aria-expanded', String(!note.hidden));
      });
      box.append(row);
    });
    lane.append(card, box);
    lanes.append(lane);
  });
  root.append(lanes);

  if (extra.length) {
    const p = el('section', 'panel dashed');
    p.append(el('h2', null, 'Not in the Feature'));
    p.append(el('p', 'muted', 'Linked as children, but the Feature doesn\'t ask for them. Add them to the Feature or confirm scope.'));
    const l = el('div', 'extra-list');
    extra.forEach((x) => {
      const span = el('span');
      const chip = storyChip(x.id);
      if (chip) span.append(chip, ' ');
      span.append(document.createTextNode(x.title || ''));
      l.append(span);
    });
    p.append(l);
    root.append(p);
  }

  renderFixFirst(r.fixFirst, root);
}

function renderFixFirst(list, root) {
  const fix = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!fix.length) return;
  const p = el('section', 'panel');
  p.append(el('h2', null, 'Fix first'));
  const ol = el('ol');
  fix.slice(0, 5).forEach((f) => ol.append(el('li', null, f)));
  p.append(ol);
  root.append(p);
}

const VERDICTS = {
  not_ready: { label: '❌ Not ready', order: 0 },
  clarify: { label: '⚠️ Needs clarification', order: 1 },
  ready: { label: '✅ Ready', order: 2 }
};

function renderReadiness(r, root) {
  const stories = (Array.isArray(r.stories) ? r.stories : []).map((s) => Object.assign({}, s, {
    verdict: VERDICTS[s.verdict] ? s.verdict : 'clarify'
  }));
  stories.sort((a, b) => VERDICTS[a.verdict].order - VERDICTS[b.verdict].order ||
    String(a.assignee || '').localeCompare(String(b.assignee || '')));
  const count = (v) => stories.filter((s) => s.verdict === v).length;

  const sum = el('div', 'summary');
  sum.append(el('span', 'title', 'Readiness'));
  sum.append(el('span', 'pill err', count('not_ready') + ' not ready'));
  sum.append(el('span', 'pill warn', count('clarify') + ' need clarification'));
  sum.append(el('span', 'pill ok', count('ready') + ' ready'));
  root.append(sum);

  const table = el('table', 'stories');
  const thead = el('thead');
  const hr = el('tr');
  ['Story', 'Owner', 'Verdict', 'Fix first'].forEach((h, i) => {
    const th = el('th', i === 1 ? 'col-owner' : null, h);
    th.scope = 'col';
    hr.append(th);
  });
  thead.append(hr);
  table.append(thead);
  const tbody = el('tbody');
  stories.forEach((s) => {
    const tr = el('tr');
    const td1 = el('td');
    const chip = storyChip(s.id);
    if (chip) td1.append(chip, ' ');
    td1.append(document.createTextNode(s.title || ''));
    tr.append(td1, el('td', 'col-owner', s.assignee || 'Unassigned'));
    const td3 = el('td');
    td3.append(el('span', 'badge ' + s.verdict, VERDICTS[s.verdict].label));
    tr.append(td3, el('td', null, s.verdict === 'ready' ? '—' : (s.fix || '')));
    tbody.append(tr);
  });
  table.append(tbody);
  root.append(table);
  root.append(el('p', 'muted', 'The full gaps and questions for each story are in the chat answer.'));
}

function renderLearnings(list, root) {
  const learnings = (Array.isArray(list) ? list : []).filter((l) => l && l.rule);
  if (!learnings.length) return;
  const p = el('section', 'panel');
  p.append(el('h2', null, 'Candidate learnings'));
  const target = page.run.contextPath;
  p.append(el('p', 'muted', target
    ? 'Approve to add a rule under "Approved learnings" on ' + target.replace(/^\//, '').split('/').join(' / ') + '.'
    : 'This review had no team context page. Create one from the extension popup to approve learnings into it.'));
  learnings.forEach((l, i) => {
    const row = el('div', 'learning');
    const left = el('div');
    left.append(el('div', 'rule', l.rule));
    const ev = (Array.isArray(l.evidence) ? l.evidence : []).map((n) => '#' + n).join(', ');
    left.append(el('div', 'meta', [l.section, ev].filter(Boolean).join(' · ')));
    row.append(left);
    if ((page.run.approved || []).includes(i)) {
      row.append(el('span', 'done', 'Added to wiki'));
    } else {
      const btn = el('button', 'secondary', 'Approve');
      btn.type = 'button';
      btn.disabled = !target;
      btn.addEventListener('click', () => approveLearning(l, i, btn, row));
      row.append(btn);
    }
    p.append(row);
  });
  root.append(p);
}

function render() {
  const run = page.run;
  const r = run.result;
  $('paste').hidden = !!r;
  $('result').hidden = !r;
  $('foot-links').hidden = !r;
  if (!r) return;
  const root = $('result');
  root.textContent = '';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '16px';
  if (r.mode === 'feature') renderFeature(r, root);
  else renderReadiness(r, root);
  renderLearnings(r.learnings, root);
}

// ---------- approving learnings ----------

async function findAdoTab() {
  const c = page.run.ctx;
  try {
    const t = await chrome.tabs.get(c.tabId);
    if (t && t.url && t.url.startsWith(c.base)) return t.id;
  } catch (e) { /* tab closed */ }
  const tabs = await chrome.tabs.query({ url: c.base + '/*' });
  return tabs.length ? tabs[0].id : null;
}

async function approveLearning(learning, index, btn, row) {
  const path = page.run.contextPath;
  const date = new Date().toISOString().slice(0, 10);
  const line = WIKI.learningLine(learning, date);
  if (!window.confirm('Add this line to the wiki page ' + path + '?\n\n' + line)) return;
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const tabId = await findAdoTab();
    if (!tabId) {
      notice('Open Azure DevOps (' + page.run.ctx.org + ' / ' + page.run.ctx.project + ') in a tab, then approve again.', 'warn');
      btn.disabled = false;
      btn.textContent = 'Approve';
      return;
    }
    const ctx = { tabId, api: page.run.ctx.api };
    const wiki = await WIKI.getWiki(ctx);
    if (!wiki) throw new Error('No project wiki found.');
    const res = await WIKI.appendLearning(ctx, wiki, path, line);
    if (!res.ok) throw new Error(res.message);
    page.run.approved = (page.run.approved || []).concat(index);
    await save();
    btn.replaceWith(el('span', 'done', res.already ? 'Already on the page' : 'Added to wiki'));
    notice('Added to ' + path.replace(/^\//, '').split('/').join(' / ') + '. The next review will use it.', 'ok');
  } catch (e) {
    notice('Could not add the learning: ' + (e && e.message ? e.message : e), 'err');
    btn.disabled = false;
    btn.textContent = 'Approve';
  }
}

// ---------- start ----------

async function init() {
  page.key = decodeURIComponent(location.hash.replace(/^#/, ''));
  const stored = page.key ? (await chrome.storage.local.get(page.key))[page.key] : null;
  if (!stored) {
    notice('This review is no longer saved. Run the review again from the extension.', 'warn');
    return;
  }
  page.run = stored;
  const when = new Date(stored.createdAt).toLocaleString();
  if (stored.mode === 'feature') {
    $('title').textContent = 'Feature #' + stored.feature.id + ' · ' + stored.feature.title;
    $('subtitle').textContent = 'Feature Coverage · copied ' + when;
  } else {
    $('title').textContent = 'Sprint Readiness · ' + lastSegment(stored.scope.iteration);
    $('subtitle').textContent = lastSegment(stored.scope.area) + ' · ' + (stored.items || []).length + ' stories · copied ' + when;
  }
  document.title = $('title').textContent + ' · Refiner';

  $('btn-show').addEventListener('click', showResultFromPaste);
  $('btn-repaste').addEventListener('click', () => {
    page.run.result = null;
    $('answer').value = '';
    notice('');
    render();
    $('answer').focus();
  });
  render();
  if (!stored.result) $('answer').focus();
}

init();

window.addEventListener('hashchange', () => location.reload());

// Credit line: "Refiner <version>  ·  Made by Vinay"
try {
  const v = chrome.runtime.getManifest().version;
  document.querySelectorAll('.credit .ver').forEach((el) => { el.textContent = 'Refiner ' + v; });
} catch (e) { /* outside the extension */ }

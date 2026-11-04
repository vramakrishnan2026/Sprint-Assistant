// Sprint Assistant side panel: guided flow for Sprint Readiness and Feature Coverage.

// ---- Adjust these to match your process template ----
const WORK_ITEM_TYPE = 'User Story';
const EXCLUDED_STATES = ['Closed', 'Removed'];      // Sprint Readiness: stories left out
const FEATURE_TYPES = ['Feature'];                    // Feature Coverage: allowed parent types
const PARENT_TYPES = ['Feature', 'Epic'];             // Related items of these types are sent as summaries only
const FINISHED_STATES = ['Done', 'Closed', 'Resolved', 'Completed'];
const DEFAULT_CONTEXT_ROOT = 'Sprint Assistant';
// -----------------------------------------------------

const API = 'api-version=7.0';

const ASSISTANTS = {
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/app' },
  copilot: { label: 'Copilot', url: 'https://copilot.microsoft.com/' },
  claude: { label: 'Claude', url: 'https://claude.ai/new' },
  custom: { label: 'Other (my own link)', url: '' }
};

const $ = (id) => document.getElementById(id);

const state = {
  ctx: null,              // connected Azure DevOps tab: { tabId, org, project, base, api }
  view: 'home',
  previousView: 'home',
  assistant: null,        // { id, url } once chosen
  // readiness
  areas: [],
  iterations: [],
  scopeLoaded: false,
  stories: [],
  scope: null,
  context: null,
  // feature
  featureData: null,
  featureContext: null,
  detected: null,         // { id, title } Feature open in the active tab
  detectedChecked: null,
  // current review
  run: null,
  // settings
  contextRoot: DEFAULT_CONTEXT_ROOT,
  contextOverride: '',
  // caches
  wiki: undefined,
  contextPages: undefined,
  contextCache: {},
  scopeCtxToken: 0,
  welcomeChoice: null
};

// ---------- small helpers ----------

function setStatus(msg, kind) {
  const el = $('status');
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
  el.hidden = false;
}

function projectKey(prefix) {
  return prefix + ':' + state.ctx.org + '/' + state.ctx.project;
}

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function kChars(n) {
  return n >= 1000 ? 'about ' + Math.round(n / 1000) + 'k' : String(n);
}

function lastSegment(path) {
  return String(path || '').split('\\').pop();
}

function errMsg(e) {
  return e && e.message ? e.message : String(e);
}

function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 48 * 60) return Math.round(mins / 60) + ' h ago';
  return Math.round(mins / 1440) + ' days ago';
}

function assistantLabel() {
  if (!state.assistant) return 'your assistant';
  return state.assistant.id === 'custom' ? 'your assistant' : ASSISTANTS[state.assistant.id].label;
}

// ---------- views & stepper ----------

const STEP_OF = { readiness: 1, feature: 1, ask: 2, result: 3 };

function show(view) {
  ['welcome', 'home', 'readiness', 'feature', 'ask', 'result', 'settings'].forEach((v) => {
    $('view-' + v).hidden = v !== view;
  });
  if (view !== 'settings' && view !== 'welcome') state.previousView = view;
  state.view = view;
  const step = STEP_OF[view];
  $('stepper').hidden = !step;
  if (step) {
    document.querySelectorAll('#stepper li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.className = n < step ? 'done' : n === step ? 'current' : '';
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  if (view === 'home') renderHome();
  const body = $('view-' + view).querySelector('.body');
  if (body) body.scrollTop = 0;
}

// ---------- Azure DevOps connection ----------

const ADO_URLS = ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'];

async function findAdoTab() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const fromActive = active && ADO.parseUrl(active.url, active.id);
  if (fromActive) return { ctx: fromActive, activeWorkItem: fromActive.workItemId };
  const tabs = await chrome.tabs.query({ url: ADO_URLS });
  for (const t of tabs) {
    const c = ADO.parseUrl(t.url, t.id);
    if (c) return { ctx: c, activeWorkItem: null };
  }
  return { ctx: null, activeWorkItem: null };
}

function renderConnection() {
  const conn = $('conn');
  if (state.connecting) {
    conn.className = 'conn';
    $('conn-text').textContent = 'Looking for Azure DevOps…';
    return;
  }
  if (state.ctx) {
    conn.className = 'conn ok';
    $('conn-text').textContent = state.ctx.org + ' / ' + state.ctx.project;
    conn.title = 'Connected to Azure DevOps';
  } else {
    conn.className = 'conn warn';
    $('conn-text').textContent = 'Open Azure DevOps in a tab';
    conn.title = 'Not connected';
  }
  $('home-noado').hidden = !!state.ctx;
  $('card-readiness').disabled = !state.ctx;
  $('card-feature').disabled = !state.ctx;
  $('btn-load-feature').disabled = !state.ctx;
}

let connectTimer = null;
function scheduleConnect() {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(connect, 300);
}

async function connect() {
  let found;
  try {
    found = await findAdoTab();
  } catch (e) {
    found = { ctx: null };
  }
  const prev = state.ctx;
  const c = found.ctx;
  if (c && prev && c.org === prev.org && c.project === prev.project) {
    // Same project: keep everything, just follow the tab.
    if (c.tabId !== prev.tabId) {
      try { await chrome.tabs.get(prev.tabId); } catch (e) { prev.tabId = c.tabId; }
    }
  } else if (c) {
    state.ctx = { tabId: c.tabId, org: c.org, project: c.project, base: c.base, api: c.api };
    resetProjectData();
    const perProject = await chrome.storage.local.get([projectKey('ctxOverride'), projectKey('feature')]);
    state.contextOverride = perProject[projectKey('ctxOverride')] || '';
    if (!$('feature-id').value && perProject[projectKey('feature')]) $('feature-id').value = perProject[projectKey('feature')];
    loadScopeOptions().catch((e) => setStatus('Could not load areas and sprints: ' + errMsg(e)));
  } else if (prev) {
    // Our tab may have closed; stay connected only if it still exists.
    try { await chrome.tabs.get(prev.tabId); } catch (e) { state.ctx = null; }
  }
  renderConnection();
  await detectFeature(c ? found.activeWorkItem : null);
}

function resetProjectData() {
  state.scopeLoaded = false;
  state.stories = [];
  state.scope = null;
  state.featureData = null;
  state.detected = null;
  state.detectCache = {};
  state.wiki = undefined;
  clearContextCaches();
  $('stories').hidden = true;
  $('feature-result').hidden = true;
  $('btn-next-readiness').disabled = true;
  $('btn-next-feature').disabled = true;
}

// Notices a Feature open in the active tab.
async function detectFeature(workItemId) {
  if (!state.ctx || !workItemId) {
    state.detected = null;
    renderDetected();
    return;
  }
  state.detectCache = state.detectCache || {};
  if (!(workItemId in state.detectCache)) {
    try {
      const res = await fetchItems([workItemId], { fields: ['System.Title', 'System.WorkItemType'] });
      const w = res.items[0];
      state.detectCache[workItemId] = w && FEATURE_TYPES.includes(w.fields['System.WorkItemType'])
        ? { id: w.id, title: w.fields['System.Title'] } : null;
    } catch (e) {
      return;
    }
  }
  const before = state.detected && state.detected.id;
  state.detected = state.detectCache[workItemId];
  renderDetected();
  if (before === (state.detected && state.detected.id)) return;
  // In the Feature step with nothing loaded yet: use it straight away.
  if (state.detected && state.view === 'feature' && !state.featureData) {
    $('feature-id').value = state.detected.id;
    loadFeature();
  }
}

function renderDetected() {
  const d = state.detected;
  const badge = $('home-detected');
  badge.hidden = !d;
  if (d) badge.textContent = 'Open in your tab: #' + d.id;
  const banner = $('feature-detected');
  const showBanner = d && (!state.featureData || state.featureData.feature.id !== d.id);
  banner.hidden = !showBanner;
  banner.textContent = '';
  if (showBanner) {
    banner.append(document.createTextNode('Feature #' + d.id + ' is open in your tab: ' + d.title));
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'link';
    use.textContent = 'Check this Feature';
    use.addEventListener('click', () => { $('feature-id').value = d.id; loadFeature(); });
    banner.append(use);
  }
}

// ---------- fetching ----------

async function fetchItems(ids, body) {
  if (!ids.length) return { items: [], failed: false };
  const reqs = [];
  for (let i = 0; i < ids.length; i += 200) {
    reqs.push({
      url: state.ctx.api + '/_apis/wit/workitemsbatch?' + API,
      method: 'POST',
      body: Object.assign({ ids: ids.slice(i, i + 200), errorPolicy: 'Omit' }, body)
    });
  }
  const res = await ADO.run(state.ctx, reqs, 2);
  let failed = false;
  const items = [];
  res.forEach((r) => {
    if (!r.ok) { failed = true; return; }
    (r.data.value || []).forEach((w) => { if (w) items.push(w); });
  });
  return { items, failed, error: res.find((r) => !r.ok) };
}

async function fetchComments(ids, query) {
  const res = await ADO.run(state.ctx, ids.map((id) => ({
    url: state.ctx.api + '/_apis/wit/workItems/' + id + '/comments?api-version=7.0-preview.3&' + query
  })), 6);
  const byId = {};
  let missing = 0;
  ids.forEach((id, i) => {
    if (res[i] && res[i].ok) byId[id] = res[i].data;
    else missing++;
  });
  return { byId, missing };
}

// ---------- team context (wiki) ----------

async function getWiki() {
  if (state.wiki !== undefined) return state.wiki;
  state.wiki = await WIKI.getWiki(state.ctx);
  return state.wiki;
}

function contextRootPath() {
  return WIKI.normalizePath(state.contextRoot || DEFAULT_CONTEXT_ROOT);
}

async function getContextPages(wiki) {
  if (state.contextPages !== undefined) return state.contextPages;
  const page = await WIKI.getPage(state.ctx, wiki, contextRootPath(), { subPages: true });
  state.contextPages = page.status === 'ok' ? page.subPages : null;
  return state.contextPages;
}

function pageLabel(path) {
  return path.replace(/^\//, '').split('/').join(' / ');
}

function suggestPageName(areaPath) {
  return lastSegment(areaPath).replace(/[\/\\#?%*:|"<>]/g, ' ').replace(/\s+/g, ' ').trim() || 'Team';
}

// { status: 'ok' | 'empty' | 'none' | 'error', path, label, content, message, canCreate, suggested }
async function resolveContext(areaPath) {
  try {
    const wiki = await getWiki();
    if (!wiki) return { status: 'none', message: 'No project wiki found. The check runs without team context.' };

    let path = (state.contextOverride || '').trim();
    if (path) {
      path = WIKI.normalizePath(path);
    } else {
      const pages = await getContextPages(wiki);
      if (pages === null) {
        return { status: 'none', canCreate: true, suggested: suggestPageName(areaPath),
          message: 'No team context page yet. The check works without it, but is sharper with it.' };
      }
      path = ADO.matchContextPage(areaPath, pages);
      if (!path) {
        return { status: 'none', canCreate: true, suggested: suggestPageName(areaPath),
          message: 'No team context page for ' + lastSegment(areaPath) + ' yet. The check works without it, but is sharper with it.' };
      }
    }

    const label = pageLabel(path);
    if (state.contextCache[path]) return state.contextCache[path];
    const page = await WIKI.getPage(state.ctx, wiki, path);
    let info;
    if (page.status !== 'ok') {
      info = { status: 'error', path, label, message: 'Could not read the wiki page ' + label + '. The check runs without team context.' };
    } else if (!page.content.trim()) {
      info = { status: 'empty', path, label, content: '', message: 'Team context page ' + label + ' is empty.' };
    } else {
      info = { status: 'ok', path, label, content: page.content };
    }
    state.contextCache[path] = info;
    return info;
  } catch (e) {
    return { status: 'error', message: 'Could not read team context: ' + errMsg(e) };
  }
}

function clearContextCaches() {
  state.contextPages = undefined;
  state.contextCache = {};
}

function wikiPageLink(path) {
  if (!state.wiki) return null;
  return state.ctx.base + '/' + encodeURIComponent(state.ctx.project) + '/_wiki/wikis/' +
    encodeURIComponent(state.wiki.name) + '?pagePath=' + encodeURIComponent(path);
}

// Team context line; offers to create a page when none matches.
function renderContext(el, info, onCreated) {
  el.textContent = '';
  if (!info) { el.className = 'ctx'; return; }
  if (info.status === 'ok') {
    el.className = 'ctx ok';
    el.textContent = '✓ Using team context: ' + info.label;
    return;
  }
  el.className = 'ctx warn';
  const msg = document.createElement('div');
  msg.textContent = info.message;
  el.appendChild(msg);
  if (info.status === 'empty' && info.path) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ctx-btn';
    open.textContent = 'Open the page to fill it in';
    open.addEventListener('click', () => { const u = wikiPageLink(info.path); if (u) chrome.tabs.create({ url: u }); });
    el.appendChild(open);
  }
  if (!info.canCreate || !onCreated) return;

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'ctx-btn';
  start.textContent = 'Create a team context page';
  el.appendChild(start);

  start.addEventListener('click', () => {
    start.remove();
    const form = document.createElement('div');
    form.className = 'ctx-form';
    const label = document.createElement('label');
    label.textContent = 'Page name (created under "' + state.contextRoot + '" in your wiki)';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = info.suggested || '';
    label.appendChild(input);
    const row = document.createElement('div');
    row.className = 'ctx-row';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'ctx-btn primary-sm';
    ok.textContent = 'Create page';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ctx-btn';
    cancel.textContent = 'Cancel';
    row.append(ok, cancel);
    form.append(label, row);
    el.appendChild(form);
    input.focus();

    cancel.addEventListener('click', () => renderContext(el, info, onCreated));
    ok.addEventListener('click', async () => {
      const name = input.value.replace(/[\/\\#?%*:|"<>]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!name) { input.focus(); return; }
      ok.disabled = true;
      ok.textContent = 'Creating…';
      const wiki = await getWiki();
      const path = WIKI.normalizePath(contextRootPath() + '/' + name);
      const res = await WIKI.createPage(state.ctx, wiki, path, WIKI.starterTemplate(name), WIKI.parentTemplate());
      if (!res.ok) {
        setStatus(res.message);
        ok.disabled = false;
        ok.textContent = 'Create page';
        return;
      }
      clearContextCaches();
      setStatus('Created ' + pageLabel(path) + ' in the wiki. It opened in a new tab: fill in the [brackets] when you have time.', 'ok');
      const link = wikiPageLink(path);
      if (link) chrome.tabs.create({ url: link, active: false });
      onCreated();
    });
  });
}

// ---------- home ----------

async function listRuns() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('run:')).map((k) => all[k])
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function runTitle(run) {
  return run.mode === 'feature'
    ? 'Feature #' + run.feature.id + ' · ' + run.feature.title
    : 'Sprint Readiness · ' + lastSegment(run.scope.iteration);
}

async function renderHome() {
  renderConnection();
  renderDetected();
  const runs = (await listRuns()).slice(0, 4);
  $('recent').hidden = !runs.length;
  const ul = $('recent-list');
  ul.textContent = '';
  runs.forEach((run) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recent-item';
    const txt = document.createElement('span');
    txt.className = 'ri-text';
    const t = document.createElement('span');
    t.className = 'ri-title';
    t.textContent = runTitle(run);
    const m = document.createElement('span');
    m.className = 'ri-meta';
    m.textContent = ago(run.createdAt);
    txt.append(t, m);
    const tag = document.createElement('span');
    tag.className = 'tag ' + (run.result ? 'ready' : 'waiting');
    tag.textContent = run.result ? 'Result ready' : 'Waiting for answer';
    b.append(txt, tag);
    b.addEventListener('click', () => {
      state.run = run;
      if (run.result) showResultStep(); else showAskStep();
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

// ---------- welcome ----------

function renderWelcome() {
  const grid = $('welcome-assistants');
  grid.textContent = '';
  state.welcomeChoice = state.assistant ? state.assistant.id : null;
  Object.keys(ASSISTANTS).forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.textContent = id === 'custom' ? 'Other' : ASSISTANTS[id].label;
    b.setAttribute('aria-pressed', String(state.welcomeChoice === id));
    b.addEventListener('click', () => {
      state.welcomeChoice = id;
      grid.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('welcome-custom').hidden = id !== 'custom';
      if (id === 'custom') $('welcome-custom-url').focus();
      updateWelcomeButton();
    });
    grid.appendChild(b);
  });
  $('welcome-custom').hidden = state.welcomeChoice !== 'custom';
  $('welcome-custom-url').value = state.assistant && state.assistant.id === 'custom' ? state.assistant.url : '';
  $('btn-welcome-done').textContent = state.assistant ? 'Done' : 'Get started';
  updateWelcomeButton();
}

function updateWelcomeButton() {
  const id = state.welcomeChoice;
  const ok = id && (id !== 'custom' || /^https:\/\/\S+$/.test($('welcome-custom-url').value.trim()));
  $('btn-welcome-done').disabled = !ok;
}

async function finishWelcome() {
  const id = state.welcomeChoice;
  const url = id === 'custom' ? $('welcome-custom-url').value.trim() : ASSISTANTS[id].url;
  await setAssistant({ id, url });
  await chrome.storage.local.set({ welcomed: true });
  show('home');
}

// ---------- assistant ----------

async function setAssistant(a) {
  state.assistant = a;
  await chrome.storage.local.set({ assistant: a });
  renderAssistantPickers();
}

function fillAssistantSelect(sel) {
  sel.textContent = '';
  if (!state.assistant) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Choose your assistant…';
    o.disabled = true;
    o.selected = true;
    sel.appendChild(o);
  }
  Object.keys(ASSISTANTS).forEach((id) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = ASSISTANTS[id].label;
    sel.appendChild(o);
  });
  if (state.assistant) sel.value = state.assistant.id;
}

function renderAssistantPickers() {
  fillAssistantSelect($('assistant-pick'));
  fillAssistantSelect($('assistant'));
  $('btn-open').textContent = state.assistant ? 'Open ' + assistantLabel() : 'Open';
  $('btn-open').disabled = !state.assistant;
}

async function onPickAssistant() {
  const id = $('assistant-pick').value;
  if (id === 'custom') {
    if (state.assistant && state.assistant.id === 'custom' && state.assistant.url) return;
    openSettings(true);
    return;
  }
  await setAssistant({ id, url: ASSISTANTS[id].url });
}

function openAssistant() {
  if (!state.assistant || !state.assistant.url) { openSettings(true); return; }
  chrome.tabs.create({ url: state.assistant.url });
}

// ---------- Sprint Readiness: step 1 ----------

async function loadScopeOptions() {
  if (!state.ctx) return;
  $('area').disabled = true;
  $('iteration').disabled = true;
  $('btn-fetch').disabled = true;
  const res = await ADO.run(state.ctx, [
    { url: state.ctx.api + '/_apis/wit/classificationnodes/Areas?$depth=20&' + API },
    { url: state.ctx.api + '/_apis/wit/classificationnodes/Iterations?$depth=20&' + API }
  ], 2);
  const bad = res.find((r) => !r.ok);
  if (bad) {
    setStatus(ADO.explainError(bad));
    return;
  }
  state.areas = ADO.flattenAreas(res[0].data);
  state.iterations = ADO.flattenIterations(res[1].data);

  const saved = (await chrome.storage.local.get(projectKey('scope')))[projectKey('scope')] || {};
  $('sub-areas').checked = saved.subAreas !== false;
  renderAreas(saved.area);
  renderIterations(saved.iteration);
  $('area').disabled = false;
  $('iteration').disabled = false;
  $('btn-fetch').disabled = false;
  state.scopeLoaded = true;
  updateScopeContext();
}

function renderAreas(selectedPath) {
  const sel = $('area');
  sel.textContent = '';
  state.areas.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.path;
    opt.textContent = '    '.repeat(a.depth) + a.name;
    sel.appendChild(opt);
  });
  if (selectedPath && state.areas.some((a) => a.path === selectedPath)) sel.value = selectedPath;
}

function renderIterations(selectedPath) {
  const sel = $('iteration');
  const keep = selectedPath || sel.value;
  const showPast = $('show-past').checked;
  const today = todayKey();

  const dated = state.iterations.filter((i) => i.start && i.finish).sort((a, b) => a.start.localeCompare(b.start));
  const undated = state.iterations.filter((i) => !(i.start && i.finish));
  const current = dated.find((i) => i.start <= today && today <= i.finish);
  const next = dated.find((i) => i.start > today);

  sel.textContent = '';
  const visibleDated = dated.filter((i) => showPast || i.finish >= today);
  if (visibleDated.length) {
    const group = document.createElement('optgroup');
    group.label = 'Sprints';
    visibleDated.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.path;
      let label = i.name + ' · ' + fmtDate(i.start) + '–' + fmtDate(i.finish);
      if (i === current) label += ' · current';
      if (i === next) label += ' · next';
      opt.textContent = label;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  }
  if (undated.length) {
    const group = document.createElement('optgroup');
    group.label = 'Other iterations';
    undated.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.path;
      opt.textContent = i.path.split('\\').slice(1).join(' \\ ') || i.name;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  }

  const values = Array.from(sel.options).map((o) => o.value);
  const pick = [keep, next && next.path, current && current.path].find((v) => v && values.includes(v));
  if (pick) sel.value = pick;
}

async function updateScopeContext() {
  const token = ++state.scopeCtxToken;
  const el = $('ctx-scope');
  el.className = 'ctx';
  el.textContent = 'Checking for team context…';
  const info = await resolveContext($('area').value);
  if (token === state.scopeCtxToken) renderContext(el, info, updateScopeContext);
}

function scopeChanged() {
  // A different area or sprint: the list found earlier no longer applies.
  if (!$('stories').hidden) {
    $('stories').hidden = true;
    state.stories = [];
    $('btn-next-readiness').disabled = true;
  }
}

async function fetchStories() {
  setStatus('');
  if (!state.ctx) { setStatus('Open Azure DevOps in a tab first.'); return; }
  const area = $('area').value;
  const iteration = $('iteration').value;
  const subAreas = $('sub-areas').checked;
  await chrome.storage.local.set({ [projectKey('scope')]: { area, iteration, subAreas } });

  const btn = $('btn-fetch');
  btn.disabled = true;
  btn.textContent = 'Finding stories…';
  try {
    const query =
      'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project' +
      " AND [System.WorkItemType] = '" + ADO.wiqlEscape(WORK_ITEM_TYPE) + "'" +
      ' AND [System.AreaPath] ' + (subAreas ? 'UNDER' : '=') + " '" + ADO.wiqlEscape(area) + "'" +
      " AND [System.IterationPath] = '" + ADO.wiqlEscape(iteration) + "'" +
      ' AND [System.State] NOT IN (' + EXCLUDED_STATES.map((s) => "'" + ADO.wiqlEscape(s) + "'").join(', ') + ')' +
      ' ORDER BY [System.Id]';
    const [wiql] = await ADO.run(state.ctx, [{ url: state.ctx.api + '/_apis/wit/wiql?' + API, method: 'POST', body: { query } }]);
    if (!wiql.ok) { setStatus(ADO.explainError(wiql)); return; }

    const ids = (wiql.data.workItems || []).map((w) => w.id);
    if (!ids.length) {
      setStatus('No open user stories in this area and sprint. Try another sprint, or tick "Include sub-areas".', 'info');
      return;
    }

    btn.textContent = 'Reading ' + plural(ids.length, 'story', 'stories') + '…';
    const main = await fetchItems(ids, { $expand: 'All' });
    if (main.failed) { setStatus(ADO.explainError(main.error)); return; }
    const items = main.items;

    const linkedIds = collectLinkedIds(items, ['predecessors', 'successors', 'children']);
    const linked = await fetchItems(linkedIds, { fields: ['System.Title', 'System.State', 'System.WorkItemType'] });
    const linkedById = {};
    linked.items.forEach((w) => { linkedById[w.id] = w; });

    btn.textContent = 'Reading discussions…';
    const comments = await fetchComments(ids, 'order=asc&$top=200');
    state.context = await resolveContext(area);

    const byId = {};
    items.forEach((it) => { byId[it.id] = it; });
    state.stories = ids.filter((id) => byId[id]).map((id) => buildStory(byId[id], comments.byId[id], linkedById));
    state.scope = { area, iteration, subAreas };
    renderList();
    $('stories').hidden = false;
    $('stories').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const notes = [];
    if (comments.missing) notes.push('Discussion could not be read for ' + plural(comments.missing, 'story', 'stories') + '.');
    if (linked.failed) notes.push('Some linked work items could not be read.');
    if (notes.length) setStatus(notes.join(' ') + ' The stories are still included.', 'info');
  } catch (e) {
    setStatus('Something went wrong: ' + errMsg(e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Find stories again';
  }
}

function renderList() {
  const list = $('list');
  list.textContent = '';
  state.stories.forEach((s) => {
    const row = document.createElement('label');
    row.className = 'row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = s.selected;
    box.addEventListener('change', () => { s.selected = box.checked; updateCounts(); });
    const main = document.createElement('div');
    main.className = 'row-main';
    const top = document.createElement('div');
    top.className = 'row-top';
    const id = document.createElement('span');
    id.className = 'row-id';
    id.textContent = '#' + s.id;
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = s.title;
    title.title = s.title;
    top.append(id, title);
    const who = document.createElement('div');
    who.className = 'row-who';
    if (s.assignedTo) {
      who.textContent = s.assignedTo;
    } else {
      const un = document.createElement('span');
      un.className = 'unassigned';
      un.textContent = 'Unassigned';
      who.append(un, document.createTextNode(' · created by ' + (s.createdBy || 'unknown')));
    }
    main.append(top, who);
    row.append(box, main);
    list.appendChild(row);
  });
  updateCounts();
}

function updateCounts() {
  const total = state.stories.length;
  const n = state.stories.filter((s) => s.selected).length;
  $('count-label').textContent = plural(total, 'story', 'stories') + ' found';
  $('selected-count').textContent = n + ' selected';
  const all = $('select-all');
  all.checked = n === total && total > 0;
  all.indeterminate = n > 0 && n < total;
  const next = $('btn-next-readiness');
  next.disabled = n === 0;
  next.textContent = n === 0 ? 'Select at least one story' : 'Next: ask the AI about ' + plural(n, 'story', 'stories');
}

function toggleAll() {
  const on = $('select-all').checked;
  state.stories.forEach((s) => { s.selected = on; });
  $('list').querySelectorAll('input[type="checkbox"]').forEach((b) => { b.checked = on; });
  updateCounts();
}

// ---------- Feature Coverage: step 1 ----------

async function loadFeature(auto) {
  setStatus('');
  if (!state.ctx) { setStatus('Open Azure DevOps in a tab first.'); return; }
  const raw = $('feature-id').value.trim().replace(/^#/, '');
  if (!/^\d+$/.test(raw)) { setStatus('Enter a Feature ID (numbers only), or open the Feature in Azure DevOps.'); return; }
  const id = parseInt(raw, 10);
  const btn = $('btn-load-feature');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  state.featureData = null;
  $('btn-next-feature').disabled = true;
  $('feature-result').hidden = true;
  try {
    const main = await fetchItems([id], { $expand: 'All' });
    if (main.failed) { setStatus(ADO.explainError(main.error)); return; }
    const item = main.items[0];
    if (!item) { setStatus('#' + id + ' was not found, or you don\'t have access to it.'); return; }
    const type = item.fields['System.WorkItemType'];
    if (!FEATURE_TYPES.includes(type)) {
      setStatus('#' + id + ' is a ' + type + '. Feature Coverage works on Features.' +
        (type === 'User Story' ? ' To check a story, use Sprint Readiness.' : ''));
      return;
    }

    const links = linksByKind(item);
    const depIds = links.predecessors.concat(links.successors);
    const relatedIds = links.related.filter((r) => !links.children.includes(r) && !depIds.includes(r));
    const [contentRes, depRes, featureComments] = await Promise.all([
      fetchItems(links.children.concat(relatedIds), { fields: ITEM_FIELDS }),
      fetchItems(depIds, { fields: ['System.Title', 'System.State', 'System.WorkItemType'] }),
      fetchComments([id], 'order=asc&$top=200')
    ]);
    const byId = {};
    depRes.items.concat(contentRes.items).forEach((w) => { byId[w.id] = w; });

    const childWis = links.children.map((cid) => byId[cid]).filter(Boolean);
    const removed = childWis.filter((w) => w.fields['System.State'] === 'Removed').length;
    const activeChildren = childWis.filter((w) => w.fields['System.State'] !== 'Removed');
    const childComments = await fetchComments(activeChildren.map((w) => w.id), 'order=desc&$top=' + LIMITS.childComments);
    const relatedWis = relatedIds.map((rid) => byId[rid]).filter(Boolean).filter((w) => w.fields['System.State'] !== 'Removed');

    const feature = buildFeature(item, featureComments.byId[id]);
    state.featureData = {
      feature,
      children: activeChildren.map((w) => buildItem(w, childComments.byId[w.id])),
      related: relatedWis.map((w) => {
        const r = buildItem(w, null);
        if (PARENT_TYPES.includes(r.type)) r.summaryOnly = true;
        return r;
      }),
      predecessors: links.predecessors.map((pid) => summaryOf(pid, byId)),
      successors: links.successors.map((sid) => summaryOf(sid, byId)),
      removedChildren: removed
    };
    state.featureContext = await resolveContext(feature.areaPath);
    await chrome.storage.local.set({ [projectKey('feature')]: id });
    renderFeature();
    if (contentRes.failed || depRes.failed) setStatus('Some linked work items could not be read.', 'info');
  } catch (e) {
    setStatus('Something went wrong: ' + errMsg(e));
  } finally {
    btn.disabled = !state.ctx;
    btn.textContent = 'Load';
    renderDetected();
  }
}

function renderFeature() {
  const d = state.featureData;
  const ft = d.feature;
  $('ft-id').textContent = '#' + ft.id;
  $('ft-title').textContent = ft.title;
  $('ft-meta').textContent = [ft.state, lastSegment(ft.areaPath), 'Owner: ' + (ft.assignedTo || 'Unassigned')].join(' · ');

  const chips = $('ft-chips');
  chips.textContent = '';
  const addChip = (text, warn) => {
    const c = document.createElement('span');
    c.className = 'chip' + (warn ? ' warn' : '');
    c.textContent = text;
    chips.appendChild(c);
  };
  const openPreds = d.predecessors.filter((p) => !FINISHED_STATES.includes(p.state)).length;
  if (!ft.ac.text) addChip('No acceptance criteria on the Feature', true);
  const diagrams = (ft.desc.images || 0) + (ft.ac.images || 0);
  if (diagrams) addChip(plural(diagrams, 'diagram', 'diagrams') + ' the AI can\'t read', true);
  if (openPreds) addChip(plural(openPreds, 'unfinished predecessor', 'unfinished predecessors'), true);
  if (d.related.length) addChip(d.related.length + ' related');

  $('ft-child-count').textContent = plural(d.children.length, 'story', 'stories') + ' under this Feature';
  const list = $('ft-children');
  list.textContent = '';
  if (!d.children.length) {
    const empty = document.createElement('div');
    empty.className = 'row static';
    empty.textContent = 'No stories yet. The check will show everything the Feature needs as missing.';
    list.appendChild(empty);
  }
  d.children.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'row static';
    const main = document.createElement('div');
    main.className = 'row-main';
    const top = document.createElement('div');
    top.className = 'row-top';
    const id = document.createElement('span');
    id.className = 'row-id';
    id.textContent = '#' + c.id;
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = c.title;
    title.title = c.title;
    const st = document.createElement('span');
    st.className = 'state';
    st.textContent = c.state;
    top.append(id, title, st);
    const who = document.createElement('div');
    who.className = 'row-who';
    who.textContent = [c.assignedTo || 'Unassigned', lastSegment(c.iteration)].filter(Boolean).join(' · ');
    main.append(top, who);
    row.appendChild(main);
    list.appendChild(row);
  });

  renderContext($('ctx-feature'), state.featureContext, async () => {
    state.featureContext = await resolveContext(ft.areaPath);
    renderFeature();
  });
  $('feature-result').hidden = false;
  $('btn-next-feature').disabled = false;
}

// ---------- step 2: ask the AI ----------

async function saveRun(run) {
  const all = await chrome.storage.local.get(null);
  const old = Object.keys(all).filter((k) => k.startsWith('run:')).sort();
  const remove = old.slice(0, Math.max(0, old.length - 9));   // keep the 10 most recent
  if (remove.length) await chrome.storage.local.remove(remove);
  await chrome.storage.local.set({ [run.key]: run, lastRunKey: run.key });
}

async function startAsk(mode) {
  setStatus('');
  const ctxInfo = mode === 'feature' ? state.featureContext : state.context;
  const prompt = mode === 'feature'
    ? buildFeaturePrompt(state.featureData, ctxInfo)
    : buildPrompt(state.stories, state.scope, ctxInfo);
  const run = {
    key: 'run:' + Date.now(),
    mode,
    prompt,
    ctx: { org: state.ctx.org, project: state.ctx.project, base: state.ctx.base, api: state.ctx.api, tabId: state.ctx.tabId },
    contextPath: ctxInfo && (ctxInfo.status === 'ok' || ctxInfo.status === 'empty') ? ctxInfo.path : null,
    contextLabel: ctxInfo && ctxInfo.status === 'ok' ? ctxInfo.label : null,
    createdAt: new Date().toISOString()
  };
  if (mode === 'feature') {
    const d = state.featureData;
    run.feature = { id: d.feature.id, title: d.feature.title };
    run.items = d.children.map((c) => ({ id: c.id, title: c.title, state: c.state, kind: 'child' }))
      .concat(d.related.map((c) => ({ id: c.id, title: c.title, state: c.state, kind: 'related' })));
    run.diagrams = (d.feature.desc.images || 0) + (d.feature.ac.images || 0);
  } else {
    run.scope = { area: state.scope.area, iteration: state.scope.iteration };
    run.items = state.stories.filter((s) => s.selected).map((s) => ({ id: s.id, title: s.title, assignee: s.assignedTo, kind: 'story' }));
  }
  await saveRun(run);
  state.run = run;
  showAskStep();
}

function showAskStep() {
  const run = state.run;
  $('ask-title').textContent = run.mode === 'feature' ? 'Ask your AI about Feature #' + run.feature.id : 'Ask your AI about the sprint';
  $('ask-sub').textContent = run.mode === 'feature'
    ? run.feature.title + ' · ' + plural((run.items || []).filter((i) => i.kind === 'child').length, 'story', 'stories')
    : lastSegment(run.scope.iteration) + ' · ' + plural((run.items || []).length, 'story', 'stories');
  $('copy-meta').textContent = 'Includes the review instructions' +
    (run.contextLabel ? ' and your team context (' + run.contextLabel + ')' : '') +
    ' · ' + kChars(run.prompt.length) + ' characters.';
  setStepDone('sc-copy', false);
  $('btn-copy').textContent = 'Copy prompt';
  $('btn-copy').className = 'primary';
  $('answer').value = '';
  $('paste-error').textContent = '';
  $('btn-show').disabled = true;
  renderAssistantPickers();
  show('ask');
}

function setStepDone(id, done) {
  const card = $(id);
  card.classList.toggle('done', done);
  const tag = card.querySelector('.sc-done');
  if (tag) tag.hidden = !done;
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(state.run.prompt);
  } catch (e) {
    setStatus('Could not copy to the clipboard: ' + errMsg(e));
    return;
  }
  setStepDone('sc-copy', true);
  $('btn-copy').textContent = 'Copied ✓ · Copy again';
  $('btn-copy').className = 'secondary';
}

async function showResult() {
  const obj = ANSWER.parse($('answer').value);
  if (!obj) {
    $('paste-error').textContent = 'No result found in what you pasted. Copy the AI\'s whole answer: it ends with a block that starts with "sprint-assistant-result". If the AI is still writing, wait for it to finish.';
    return;
  }
  if (obj.mode !== state.run.mode) {
    $('paste-error').textContent = 'This answer is for a ' + (obj.mode === 'feature' ? 'Feature Coverage' : 'Sprint Readiness') +
      ' check, but you\'re on a ' + (state.run.mode === 'feature' ? 'Feature Coverage' : 'Sprint Readiness') + ' check.';
    return;
  }
  $('paste-error').textContent = '';
  state.run.result = obj;
  state.run.pastedAt = new Date().toISOString();
  state.run.approved = [];
  await chrome.storage.local.set({ [state.run.key]: state.run });
  showResultStep();
}

// ---------- step 3: result ----------

function showResultStep() {
  const run = state.run;
  const r = run.result;
  const s = ANSWER.summary(r);
  $('res-title').textContent = run.mode === 'feature' ? 'Feature #' + run.feature.id + ' coverage' : 'Sprint readiness · ' + lastSegment(run.scope.iteration);
  const pills = $('res-pills');
  pills.textContent = '';
  const pill = (text, kind) => {
    const p = document.createElement('span');
    p.className = 'pill' + (kind ? ' ' + kind : '');
    p.textContent = text;
    pills.appendChild(p);
  };
  let fix = [];
  if (r.mode === 'feature') {
    pill(s.covered + ' of ' + s.total + ' covered', 'ok');
    if (s.partial) pill(s.partial + ' partly', 'warn');
    pill(s.missing + ' missing', s.missing ? 'err' : 'ok');
    if (s.extra) pill(s.extra + ' not in the Feature');
    fix = (Array.isArray(r.fixFirst) ? r.fixFirst : []).slice(0, 3);
  } else {
    pill(s.notReady + ' not ready', s.notReady ? 'err' : 'ok');
    pill(s.clarify + ' need clarification', s.clarify ? 'warn' : 'ok');
    pill(s.ready + ' ready', 'ok');
    fix = (Array.isArray(r.stories) ? r.stories : []).filter((x) => x.verdict === 'not_ready').slice(0, 3)
      .map((x) => '#' + x.id + ' ' + (x.title || '') + ': ' + (x.fix || ''));
  }
  const ol = $('res-fix-list');
  ol.textContent = '';
  fix.forEach((f) => { const li = document.createElement('li'); li.textContent = f; ol.appendChild(li); });
  $('res-fix').hidden = !fix.length;
  const learnings = (Array.isArray(r.learnings) ? r.learnings : []).filter((l) => l && l.rule).length;
  $('res-note').textContent = 'The full result shows every item with links to Azure DevOps' +
    (learnings ? ', and ' + plural(learnings, 'suggested learning', 'suggested learnings') + ' you can approve into the wiki.' : '.');
  show('result');
}

function openFullResult() {
  chrome.tabs.create({ url: chrome.runtime.getURL('result.html#' + state.run.key) });
}

// ---------- settings ----------

function openSettings(focusCustom) {
  setStatus('');
  renderAssistantPickers();
  if (focusCustom) $('assistant').value = 'custom';
  const id = $('assistant').value;
  $('custom-field').hidden = id !== 'custom';
  $('custom-url').value = state.assistant && state.assistant.id === 'custom' ? state.assistant.url : '';
  $('context-root').value = state.contextRoot;
  $('context-override').value = state.contextOverride;
  $('context-override').disabled = !state.ctx;
  show('settings');
  if (focusCustom) $('custom-url').focus();
}

async function saveSettings() {
  const id = $('assistant').value;
  if (id) {
    const url = id === 'custom' ? $('custom-url').value.trim() : ASSISTANTS[id].url;
    if (id === 'custom' && !/^https:\/\/\S+$/.test(url)) {
      setStatus('Enter the link to your assistant, starting with https://');
      return;
    }
    await setAssistant({ id, url });
  }
  state.contextRoot = $('context-root').value.trim() || DEFAULT_CONTEXT_ROOT;
  const toSave = { contextRoot: state.contextRoot };
  if (state.ctx) {
    state.contextOverride = $('context-override').value.trim();
    toSave[projectKey('ctxOverride')] = state.contextOverride;
  }
  await chrome.storage.local.set(toSave);
  clearContextCaches();
  setStatus('Settings saved.', 'ok');
  show(state.previousView);
  if (state.ctx && state.scopeLoaded) updateScopeContext();
}

// ---------- walkthrough ----------

// Opens the walkthrough at the chapter for the screen you're on.
function openGuide(chapter) {
  let ch = chapter;
  if (!ch) {
    const mode = state.run && state.run.mode;
    if (state.view === 'readiness' || ((state.view === 'ask' || state.view === 'result') && mode === 'readiness')) ch = 'readiness';
    else if (state.view === 'feature' || ((state.view === 'ask' || state.view === 'result') && mode === 'feature')) ch = 'feature';
    else ch = 'readiness';
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('guide/index.html#' + ch) });
}

// ---------- start ----------

function bindEvents() {
  $('btn-help').addEventListener('click', () => openGuide());
  $('btn-welcome-guide').addEventListener('click', () => openGuide('install'));
  $('btn-settings').addEventListener('click', () => openSettings(false));
  $('btn-welcome-done').addEventListener('click', finishWelcome);
  $('welcome-custom-url').addEventListener('input', updateWelcomeButton);

  $('card-readiness').addEventListener('click', () => { setStatus(''); show('readiness'); });
  $('card-feature').addEventListener('click', () => {
    setStatus('');
    if (state.detected && (!state.featureData || state.featureData.feature.id !== state.detected.id)) {
      $('feature-id').value = state.detected.id;
      show('feature');
      loadFeature();
      return;
    }
    show('feature');
  });
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { setStatus(''); show(b.dataset.back); }));

  $('area').addEventListener('change', () => { scopeChanged(); updateScopeContext(); });
  $('iteration').addEventListener('change', scopeChanged);
  $('sub-areas').addEventListener('change', scopeChanged);
  $('show-past').addEventListener('change', () => renderIterations());
  $('btn-fetch').addEventListener('click', fetchStories);
  $('select-all').addEventListener('change', toggleAll);
  $('btn-next-readiness').addEventListener('click', () => startAsk('readiness'));

  $('btn-load-feature').addEventListener('click', () => loadFeature());
  $('feature-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFeature(); });
  $('btn-next-feature').addEventListener('click', () => startAsk('feature'));

  $('btn-ask-back').addEventListener('click', () => {
    setStatus('');
    const mode = state.run && state.run.mode;
    const hasData = mode === 'feature' ? !!state.featureData : state.stories.length > 0;
    show(hasData ? (mode === 'feature' ? 'feature' : 'readiness') : 'home');
  });
  $('btn-copy').addEventListener('click', copyPrompt);
  $('assistant-pick').addEventListener('change', onPickAssistant);
  $('btn-open').addEventListener('click', openAssistant);
  $('answer').addEventListener('input', () => {
    $('btn-show').disabled = !$('answer').value.trim();
    $('paste-error').textContent = '';
  });
  $('btn-show').addEventListener('click', showResult);

  $('btn-open-result').addEventListener('click', openFullResult);
  $('btn-new-check').addEventListener('click', () => { setStatus(''); show('home'); });

  $('btn-settings-back').addEventListener('click', () => { setStatus(''); show(state.previousView); });
  $('btn-save-settings').addEventListener('click', saveSettings);
  $('assistant').addEventListener('change', () => { $('custom-field').hidden = $('assistant').value !== 'custom'; });

  // Follow the browser: connect to Azure DevOps and notice Features opened in any tab.
  chrome.tabs.onActivated.addListener(scheduleConnect);
  chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url || info.status === 'complete') scheduleConnect(); });
  chrome.tabs.onRemoved.addListener(scheduleConnect);
  if (chrome.windows && chrome.windows.onFocusChanged) chrome.windows.onFocusChanged.addListener(scheduleConnect);
}

async function init() {
  try {
    if (chrome.extension && chrome.extension.getViews && chrome.extension.getViews({ type: 'popup' }).includes(window)) {
      document.body.classList.add('as-popup');
    }
  } catch (e) { /* not a popup */ }

  bindEvents();
  const saved = await chrome.storage.local.get(['assistant', 'contextRoot', 'welcomed']);
  if (saved.assistant) state.assistant = saved.assistant;
  if (saved.contextRoot) state.contextRoot = saved.contextRoot;
  renderAssistantPickers();

  state.connecting = true;
  if (!saved.welcomed || !state.assistant) {
    renderWelcome();
    show('welcome');
  } else {
    show('home');
  }
  await connect();
  state.connecting = false;
  renderConnection();
  if (state.view === 'home') renderHome();
}

init();

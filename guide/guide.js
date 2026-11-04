// Sprint Assistant walkthrough: a slideshow player with chapters, play/pause and step controls.
(function () {
  const B = window.GUIDE_BOXES || {};
  const IN_EXTENSION = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

  const ICON = {
    logo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
    zip: '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M10 7h1M10 10h1M10 13h1"/><rect x="9" y="15" width="3" height="3" rx="0.5"/></svg>',
    folder: '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    arrow: '<svg width="36" height="20" viewBox="0 0 36 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10h30M24 3l8 7-8 7"/></svg>',
    puzzle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3h4v3a2 2 0 1 0 4 0V3h0a3 3 0 0 1 3 3v4h-3a2 2 0 1 0 0 4h3v4a3 3 0 0 1-3 3h-4v-3a2 2 0 1 0-4 0v3H6a3 3 0 0 1-3-3v-4h3a2 2 0 1 0 0-4H3V6a3 3 0 0 1 3-3z"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 6 4 4H6l4-4z"/></svg>',
    folderSm: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    reload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    prev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    replay: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/></svg>'
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- drawn install scenes ----------

  const browserBar = (addr) =>
    '<div class="mock-bar"><div class="dots"><i></i><i></i><i></i></div><div class="address">' + addr + '</div>' +
    '<div class="tb-icons"><span class="tb-icon">' + ICON.puzzle + '</span></div></div>';

  const SCENES = {
    before: () =>
      '<ul class="checklist" style="width:100%;max-width:480px">' +
      '<li><span class="ck">' + ICON.check + '</span><div><b>Chrome 114 or later, or Microsoft Edge</b><span>The side panel needs a recent browser.</span></div></li>' +
      '<li><span class="ck">' + ICON.check + '</span><div><b>The extension .zip file</b><span>From whoever shared this guide with you.</span></div></li>' +
      '<li><span class="ck">' + ICON.check + '</span><div><b>Access to your Azure DevOps project</b><span>The extension uses your normal sign-in.</span></div></li></ul>',
    unzip: () =>
      '<div class="mock"><div class="mock-body"><div class="files">' +
      '<div class="file">' + ICON.zip + '<span>sprint-assistant.zip</span></div>' +
      '<span class="arrow-move">' + ICON.arrow + '</span>' +
      '<div class="file popin">' + ICON.folder + '<span>sprint-readiness</span></div></div>' +
      '<div class="tip"><span>Right-click the zip and choose <b>Extract All…</b> (Windows) or double-click it (Mac).</span></div></div></div>',
    address: () =>
      '<div class="mock">' + browserBar('<span class="typed">chrome://extensions</span>') +
      '<div class="mock-body"><div class="page-fake"><i style="width:40%"></i><i style="width:75%"></i><i style="width:60%"></i></div>' +
      '<div class="tip"><span>On Microsoft Edge, type <span class="mono">edge://extensions</span> instead.</span></div></div></div>',
    devmode: () =>
      '<div class="mock">' + browserBar('chrome://extensions') +
      '<div class="mock-body"><div class="ext-head"><span class="ext-title">Extensions</span>' +
      '<span class="devmode hl">Developer mode <span class="toggle animate"></span></span></div>' +
      '<div class="ext-tools ghost"><span>Load unpacked</span><span>Pack extension</span><span>Update</span></div>' +
      '<div class="page-fake"><i style="width:70%"></i><i style="width:50%"></i></div></div></div>',
    load: () =>
      '<div class="mock">' + browserBar('chrome://extensions') +
      '<div class="mock-body"><div class="ext-head"><span class="ext-title">Extensions</span>' +
      '<span class="devmode">Developer mode <span class="toggle on"></span></span></div>' +
      '<div class="ext-tools"><span class="hl">Load unpacked</span><span>Pack extension</span><span>Update</span></div>' +
      '<div class="folder-pick"><div class="muted">Select the extension directory</div>' +
      '<div class="folder-row">' + ICON.folderSm + ' Downloads</div><div class="folder-row sel">' + ICON.folderSm + ' sprint-readiness</div></div></div></div>',
    card: () =>
      '<div class="mock">' + browserBar('chrome://extensions') +
      '<div class="mock-body"><div class="ext-card popin"><span class="ic">' + ICON.logo + '</span>' +
      '<div class="meta"><b>Sprint Assistant for Azure DevOps</b><span>Check sprint readiness and Feature coverage in Azure DevOps with any AI assistant.</span>' +
      '<div class="row-end"><span class="lnk">Details</span><span class="lnk">Remove</span><span style="flex:1"></span><span class="toggle on"></span></div></div></div></div></div>',
    pin: () =>
      '<div class="mock">' + browserBar('dev.azure.com/…') +
      '<div class="mock-body" style="min-height:260px"><div class="page-fake"><i style="width:55%"></i><i style="width:80%"></i><i style="width:65%"></i><i style="width:40%"></i></div>' +
      '<div class="picker"><div class="pk-row muted">Extensions</div>' +
      '<div class="pk-row"><span class="ic">' + ICON.logo + '</span><span class="grow">Sprint Assistant</span><span class="hl">' + ICON.pin + '</span></div></div></div></div>',
    open: () =>
      '<div class="mock">' + browserBar('dev.azure.com/…') +
      '<div class="browser-split"><div class="page-fake"><i style="width:55%"></i><i style="width:80%"></i><i style="width:65%"></i><i style="width:40%"></i><i style="width:70%"></i></div>' +
      '<div class="side-panel"><img src="img/welcome.png" alt="Sprint Assistant welcome screen in the side panel"></div></div></div>',
    update: () =>
      '<div class="mock">' + browserBar('chrome://extensions') +
      '<div class="mock-body"><div class="ext-card"><span class="ic">' + ICON.logo + '</span>' +
      '<div class="meta"><b>Sprint Assistant for Azure DevOps</b><span>Version shown here</span>' +
      '<div class="row-end"><span class="lnk">Details</span><span class="lnk">Remove</span><span class="reload hl" title="Reload">' + ICON.reload + '</span><span style="flex:1"></span><span class="toggle on"></span></div></div></div></div></div>'
  };

  // ---------- slides ----------

  const shot = (img, key, opts) => Object.assign({ kind: 'shot', img, box: (B[img] || {})[key] }, opts || {});
  const wide = (img, key, opts) => Object.assign({ kind: 'shot', img, box: (B[img] || {})[key], wide: true, zs: 1.18 }, opts || {});
  const scene = (name) => ({ kind: 'scene', name });

  const CHAPTERS = [
    {
      id: 'install', name: 'Install the extension', slides: [
        { card: true, num: '1', title: 'Install Sprint Assistant', text: 'A two-minute, one-time setup. You don\'t need to be an admin.', needs: ['Chrome or Edge', 'The .zip file', 'Azure DevOps access'] },
        { title: 'Before you start', text: 'Check you have these three things.', visual: scene('before') },
        { title: 'Unzip the file', text: 'Extract the zip into a folder you\'ll keep, such as Documents.', tip: 'Don\'t delete the folder later: the browser runs the extension from it.', visual: scene('unzip') },
        { title: 'Open the extensions page', text: 'Type chrome://extensions in the address bar and press Enter.', visual: scene('address') },
        { title: 'Turn on Developer mode', text: 'Use the switch at the top right of the extensions page.', tip: 'It\'s needed because the extension comes from a file rather than the Chrome Web Store.', visual: scene('devmode') },
        { title: 'Load the folder', text: 'Click Load unpacked and select the sprint-readiness folder you unzipped.', visual: scene('load') },
        { title: 'It\'s installed', text: 'Sprint Assistant now appears in your list of extensions, switched on.', visual: scene('card') },
        { title: 'Pin it to the toolbar', text: 'Click the puzzle-piece icon, then the pin next to Sprint Assistant.', visual: scene('pin') },
        { title: 'Open it and choose your AI', text: 'Click the Sprint Assistant icon. It opens in the side panel and asks which AI assistant you use.', tip: 'The side panel stays open while you switch tabs.', visual: scene('open') },
        { title: 'Getting a new version', text: 'Replace the folder with the new one, then click the reload arrow on the extension\'s card.', visual: scene('update') }
      ]
    },
    {
      id: 'readiness', name: 'Sprint Readiness', slides: [
        { card: true, num: '2', title: 'Sprint Readiness', text: 'Are the stories in a sprint ready for developers to pick up? Find out before planning.', needs: ['Azure DevOps open in a tab', 'Your AI assistant'] },
        { title: 'Connect to Azure DevOps', text: 'Open your project in any tab. The dot turns green when Sprint Assistant is connected.', visual: shot('home', 'conn') },
        { title: 'Choose Sprint Readiness', text: 'Pick it on the home screen.', visual: shot('home', 'readiness') },
        { title: 'Pick the area and sprint', text: 'The next sprint is selected for you. Tick Include sub-areas to cover every team under the area.', visual: shot('r-scope', 'fields') },
        { title: 'Your team\'s rules come along', text: 'If your team has a context page in the wiki, it\'s added to the review automatically.', visual: shot('r-scope', 'ctx') },
        { title: 'Find the stories', text: 'Click Find stories. Nothing is sent anywhere yet.', visual: shot('r-scope', 'find') },
        { title: 'Choose what to check', text: 'Untick any stories you don\'t want reviewed.', visual: shot('r-list', 'list') },
        { title: 'Move on to the AI', text: 'Click Next. The button shows how many stories will be checked.', visual: shot('r-list', 'next') },
        { title: 'Copy the prompt', text: 'One click copies everything the AI needs: the instructions, your team context and the stories.', visual: shot('r-ask', 'copy') },
        { title: 'Ask your AI', text: 'Open your assistant, start a new chat, paste and send.', tip: 'Any assistant works: ChatGPT, Gemini, Copilot, Claude or your own.', visual: shot('r-ask', 'open') },
        { title: 'Paste the answer back', text: 'When the AI has finished, copy its whole answer, paste it here and click Show result.', visual: shot('r-ask-done', 'paste') },
        { title: 'See the summary', text: 'How many stories aren\'t ready, and what to fix first.', visual: shot('r-result', 'fix') },
        { title: 'Open the full result', text: 'Every story with its owner, verdict and the one thing to fix. Story numbers link to Azure DevOps.', visual: wide('r-full', 'table') },
        { title: 'Teach it your team\'s rules', text: 'Approve a suggested learning to add it to your wiki page. Future reviews use it.', visual: wide('r-full', 'learn') }
      ]
    },
    {
      id: 'feature', name: 'Feature Coverage', slides: [
        { card: true, num: '3', title: 'Feature Coverage', text: 'Does a Feature have every story it needs, across firmware, CCU, portals and apps?', needs: ['The Feature open in Azure DevOps', 'Your AI assistant'] },
        { title: 'Open the Feature', text: 'Open it in Azure DevOps. Sprint Assistant notices it and shows it on the home screen.', visual: shot('f-home', 'badge') },
        { title: 'Choose Feature Coverage', text: 'The Feature loads straight away. You can also type a Feature ID.', visual: shot('f-home', 'feature') },
        { title: 'Check the stories under it', text: 'These are the stories linked to the Feature as children, in every state.', visual: shot('f-feature', 'children') },
        { title: 'Read the warnings', text: 'Yellow chips flag things like diagrams the AI can\'t read, or an unfinished predecessor.', visual: shot('f-feature', 'chips') },
        { title: 'No team context yet?', text: 'Create a page from a starter template in one click. Fill it in later.', tip: 'A list of your components and how data flows between them makes the check much sharper.', visual: shot('f-noctx', 'ctx') },
        { title: 'Copy and ask your AI', text: 'Same as before: copy the prompt, open your assistant, paste and send.', visual: shot('f-ask', 'open') },
        { title: 'Paste the answer back', text: 'Copy the AI\'s whole answer and click Show result.', visual: shot('f-ask', 'paste') },
        { title: 'See the summary', text: 'How much is covered, what\'s missing, and what to fix first.', visual: shot('f-result', 'fix') },
        { title: 'Spot what\'s missing', text: 'Red empty boxes are work with no story. Here, nothing covers the firmware.', visual: wide('f-full', 'missing') },
        { title: 'See what\'s covered', text: 'Ticks show which stories deliver each item. Click any item for the reason.', visual: wide('f-full', 'ccu') },
        { title: 'Stories the Feature doesn\'t ask for', text: 'Add them to the Feature, or confirm they belong.', visual: wide('f-full-bottom', 'extra') },
        { title: 'Approve learnings', text: 'Add what the review learned to your team\'s wiki page, so the next check is sharper.', visual: wide('f-full-bottom', 'learn') },
        { title: 'Come back any time', text: 'Recent checks stay on the home screen, so you can paste an answer later or reopen a result.', visual: shot('home-recent', 'recent') },
        { card: true, end: true, num: '✓', title: 'You\'re ready', text: 'Open the Sprint Assistant side panel and run your first check.' }
      ]
    }
  ];

  CHAPTERS.forEach((c) => c.slides.forEach((s) => {
    s.duration = s.card ? 4200 : Math.min(11000, 4600 + (s.text.length + (s.tip ? s.tip.length : 0)) * 38);
  }));
  CHAPTERS.forEach((c) => { c.seconds = Math.round(c.slides.reduce((t, s) => t + s.duration, 0) / 1000); });

  // ---------- player state ----------

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { ch: 0, i: 0, playing: false, elapsed: 0, last: 0, raf: 0 };
  const $ = (id) => document.getElementById(id);

  function slide() { return CHAPTERS[st.ch].slides[st.i]; }

  function renderChapters() {
    const nav = $('chapters');
    nav.textContent = '';
    CHAPTERS.forEach((c, ci) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chapter' + (ci < st.ch ? ' done' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(ci === st.ch));
      const mins = Math.max(1, Math.round(c.seconds / 60));
      b.innerHTML = '<span class="c-num">' + (ci + 1) + '</span><span class="c-text"><span class="c-name">' + esc(c.name) +
        '</span><span class="c-meta">' + c.slides.length + ' steps · about ' + mins + ' min</span></span>';
      b.addEventListener('click', () => go(ci, 0, true));
      nav.appendChild(b);
    });
  }

  function renderTrack() {
    const track = $('track');
    track.textContent = '';
    CHAPTERS[st.ch].slides.forEach((s, si) => {
      const seg = document.createElement('button');
      seg.type = 'button';
      seg.className = 'seg' + (si < st.i ? ' done' : '');
      seg.setAttribute('aria-label', 'Step ' + (si + 1) + ': ' + s.title);
      seg.innerHTML = '<span class="fill"></span>';
      seg.addEventListener('click', () => go(st.ch, si, true));
      track.appendChild(seg);
    });
    $('counter').textContent = (st.i + 1) + ' / ' + CHAPTERS[st.ch].slides.length;
  }

  function visualHtml(v, dur) {
    if (!v) return '';
    if (v.kind === 'scene') return SCENES[v.name]();
    const b = v.box || { x: 0, y: 0, w: 100, h: 100 };
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const zs = v.zs || 1.32;
    return '<div class="frame ' + (v.wide ? 'wide' : 'panel') + '">' +
      '<div class="zoom' + (reduce ? '' : ' play') + '" style="--ox:' + cx + '%;--oy:' + cy + '%;--zs:' + zs + ';--dur:' + dur + 'ms">' +
      '<img src="img/' + v.img + '.png" alt="">' +
      '<span class="spot" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%"></span></div>' +
      '<span class="example-tag">Example data</span></div>';
  }

  function slideHtml(s, ch) {
    if (s.card) {
      let extra = '';
      if (s.needs) extra = '<div class="needs">' + s.needs.map((n) => '<span>' + esc(n) + '</span>').join('') + '</div>';
      if (s.end) {
        extra = '<div class="end-actions"><button type="button" class="btn-primary" data-act="replay-all">Watch again from the start</button>' +
          (IN_EXTENSION ? '<button type="button" class="btn-secondary" data-act="close">Close the guide</button>' : '') + '</div>';
      }
      return '<div class="words"><span class="big-num" aria-hidden="true">' + esc(s.num) + '</span>' +
        '<h2>' + esc(s.title) + '</h2><p>' + esc(s.text) + '</p>' + extra + '</div>';
    }
    const n = CHAPTERS[ch].slides.filter((x) => !x.card);
    const idx = n.indexOf(s) + 1;
    return '<div class="words"><span class="eyebrow">' + esc(CHAPTERS[ch].name) + ' · Step ' + idx + ' of ' + n.length + '</span>' +
      '<h2>' + esc(s.title) + '</h2><p>' + esc(s.text) + '</p>' +
      (s.tip ? '<div class="tip"><span>' + esc(s.tip) + '</span></div>' : '') + '</div>' +
      '<div class="visual">' + visualHtml(s.visual, s.duration) + '</div>';
  }

  function renderSlide(dir) {
    const stage = $('stage');
    const s = slide();
    const el = document.createElement('section');
    el.className = 'slide' + (s.card ? ' card-slide' : '') + (dir < 0 ? ' back' : '');
    el.setAttribute('aria-label', s.title);
    el.innerHTML = slideHtml(s, st.ch);
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'replay-all') { go(0, 0, true); play(); }
      if (b.dataset.act === 'close') window.close();
    }));
    stage.querySelectorAll('.slide:not(.leaving)').forEach((old) => {
      old.classList.add('leaving');
      if (dir < 0) old.classList.add('back');
      setTimeout(() => old.remove(), reduce ? 0 : 460);
    });
    stage.appendChild(el);
  }

  function setFill(p) {
    const segs = $('track').children;
    const seg = segs[st.i];
    if (seg) seg.firstChild.style.width = Math.min(100, p * 100) + '%';
  }

  function go(ch, i, user) {
    const dir = ch > st.ch || (ch === st.ch && i >= st.i) ? 1 : -1;
    const chapterChanged = ch !== st.ch;
    st.ch = ch;
    st.i = i;
    st.elapsed = 0;
    if (chapterChanged || user) renderChapters();
    renderTrack();
    renderSlide(dir);
    setFill(0);
    try { history.replaceState(null, '', '#' + CHAPTERS[ch].id); } catch (e) { /* not allowed here */ }
    $('prev').disabled = ch === 0 && i === 0;
    const last = ch === CHAPTERS.length - 1 && i === CHAPTERS[ch].slides.length - 1;
    $('next').disabled = last;
    if (last) pause();
  }

  function next() {
    const c = CHAPTERS[st.ch];
    if (st.i < c.slides.length - 1) go(st.ch, st.i + 1);
    else if (st.ch < CHAPTERS.length - 1) go(st.ch + 1, 0);
  }

  function prev() {
    if (st.i > 0) go(st.ch, st.i - 1, true);
    else if (st.ch > 0) go(st.ch - 1, CHAPTERS[st.ch - 1].slides.length - 1, true);
  }

  function tick(t) {
    if (!st.playing) return;
    if (st.last) st.elapsed += t - st.last;
    st.last = t;
    const d = slide().duration;
    setFill(st.elapsed / d);
    if (st.elapsed >= d) {
      st.last = 0;
      next();
    }
    st.raf = requestAnimationFrame(tick);
  }

  function setZoomPaused(paused) {
    document.querySelectorAll('.zoom.play').forEach((z) => { z.style.animationPlayState = paused ? 'paused' : 'running'; });
  }

  function play() {
    const last = st.ch === CHAPTERS.length - 1 && st.i === CHAPTERS[st.ch].slides.length - 1;
    if (last) go(0, 0, true);
    st.playing = true;
    st.last = 0;
    $('play').innerHTML = ICON.pause;
    $('play').setAttribute('aria-label', 'Pause');
    setZoomPaused(false);
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(tick);
  }

  function pause() {
    st.playing = false;
    cancelAnimationFrame(st.raf);
    $('play').innerHTML = ICON.play;
    $('play').setAttribute('aria-label', 'Play');
    setZoomPaused(true);
  }

  function toggle() { if (st.playing) pause(); else play(); }

  function startChapterFromHash() {
    const id = (location.hash || '').replace('#', '');
    const ci = CHAPTERS.findIndex((c) => c.id === id);
    return ci >= 0 ? ci : 0;
  }

  function init() {
    $('logo').innerHTML = ICON.logo;
    $('prev').innerHTML = ICON.prev;
    $('next').innerHTML = ICON.next;
    $('replay').innerHTML = ICON.replay;
    $('prev').addEventListener('click', () => { prev(); });
    $('next').addEventListener('click', () => { next(); renderChapters(); });
    $('play').addEventListener('click', toggle);
    $('replay').addEventListener('click', () => { go(st.ch, 0, true); play(); });
    if (IN_EXTENSION) {
      $('close').hidden = false;
      $('close').addEventListener('click', () => window.close());
    }
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); renderChapters(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && st.playing) pause(); });
    window.addEventListener('hashchange', () => {
      const ci = startChapterFromHash();
      if (ci !== st.ch) go(ci, 0, true);
    });
    st.ch = startChapterFromHash();
    go(st.ch, 0, true);
    play();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

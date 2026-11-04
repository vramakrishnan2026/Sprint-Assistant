// Azure DevOps wiki access (read and write) for the team context pages.
// All calls run in the Azure DevOps tab with the signed-in session (see ADO.run).

const WIKI = {
  API: 'api-version=7.0',

  normalizePath(path) {
    return '/' + String(path || '').split('/').map((s) => s.trim()).filter(Boolean).join('/');
  },

  pageUrl(ctx, wiki, path, extra) {
    return ctx.api + '/_apis/wiki/wikis/' + encodeURIComponent(wiki.id) +
      '/pages?path=' + encodeURIComponent(path) + (extra || '') + '&' + WIKI.API;
  },

  async getWiki(ctx) {
    const [res] = await ADO.run(ctx, [{ url: ctx.api + '/_apis/wiki/wikis?' + WIKI.API }]);
    const list = (res && res.ok && res.data.value) || [];
    return list.find((w) => w.type === 'projectWiki') || list[0] || null;
  },

  // { status: 'ok' | 'missing' | 'error', content, etag, subPages, res }
  async getPage(ctx, wiki, path, opts) {
    const extra = (opts && opts.subPages) ? '&recursionLevel=oneLevel' : '&includeContent=true';
    const [res] = await ADO.run(ctx, [{ url: WIKI.pageUrl(ctx, wiki, path, extra) }]);
    if (res && res.ok) {
      return { status: 'ok', content: res.data.content || '', etag: res.etag, subPages: res.data.subPages || [], res };
    }
    return { status: res && res.status === 404 ? 'missing' : 'error', res };
  },

  async putPage(ctx, wiki, path, content, etag) {
    const [res] = await ADO.run(ctx, [{
      url: WIKI.pageUrl(ctx, wiki, path),
      method: 'PUT',
      headers: etag ? { 'If-Match': etag } : {},
      body: { content }
    }]);
    return res;
  },

  // Creates a page; creates its parent first when the parent does not exist yet.
  async createPage(ctx, wiki, path, content, parentContent) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 1) {
      const parent = '/' + parts.slice(0, -1).join('/');
      const p = await WIKI.getPage(ctx, wiki, parent);
      if (p.status === 'missing') {
        const pr = await WIKI.putPage(ctx, wiki, parent, parentContent || '', null);
        if (!pr || !pr.ok) return { ok: false, message: 'Could not create the parent page ' + parent + ': ' + ADO.explainError(pr) };
      } else if (p.status !== 'ok') {
        return { ok: false, message: 'Could not check the parent page ' + parent + ': ' + ADO.explainError(p.res) };
      }
    }
    const existing = await WIKI.getPage(ctx, wiki, path);
    if (existing.status === 'ok') return { ok: false, message: 'A page already exists at ' + path + '.' };
    const res = await WIKI.putPage(ctx, wiki, path, content, null);
    if (!res || !res.ok) return { ok: false, message: 'Could not create ' + path + ': ' + ADO.explainError(res) };
    return { ok: true };
  },

  // Adds one line under "## Approved learnings" (creating the heading if needed).
  insertLearning(content, line) {
    const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
    const head = lines.findIndex((l) => /^#{1,6}\s*approved learnings\s*$/i.test(l.trim()));
    if (head === -1) {
      return String(content || '').replace(/\s+$/, '') + '\n\n## Approved learnings\n' + line + '\n';
    }
    let end = lines.length;
    for (let j = head + 1; j < lines.length; j++) {
      if (/^#{1,6}\s/.test(lines[j])) { end = j; break; }
    }
    const section = lines.slice(head + 1, end).filter((l) => !/^\s*-\s*$/.test(l));
    while (section.length && !section[section.length - 1].trim()) section.pop();
    section.push(line);
    const rest = lines.slice(end);
    return lines.slice(0, head + 1).concat(section, rest.length ? [''].concat(rest) : ['']).join('\n');
  },

  // Reads the page, adds the line and saves; retries once if someone saved in between.
  async appendLearning(ctx, wiki, path, line) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const page = await WIKI.getPage(ctx, wiki, path);
      if (page.status !== 'ok') return { ok: false, message: 'Could not read ' + path + ': ' + ADO.explainError(page.res) };
      if (page.content.includes(line)) return { ok: true, already: true };
      const res = await WIKI.putPage(ctx, wiki, path, WIKI.insertLearning(page.content, line), page.etag);
      if (res && res.ok) return { ok: true };
      if (!res || (res.status !== 409 && res.status !== 412)) {
        return { ok: false, message: 'Could not save ' + path + ': ' + ADO.explainError(res) };
      }
    }
    return { ok: false, message: 'The page kept changing while saving. Try again.' };
  },

  learningLine(learning, date) {
    const ids = (learning.evidence || []).filter((n) => Number.isFinite(Number(n))).map((n) => '#' + n).join(', ');
    return '- ' + date + ' – ' + (learning.section ? '[' + learning.section + '] ' : '') +
      String(learning.rule || '').replace(/\s+/g, ' ').trim() + (ids ? ' – ' + ids : '');
  },

  parentTemplate() {
    return '# Sprint Assistant\n\nTeam context for Refiner, the gap finder for Azure DevOps. One sub-page per area or team.\n' +
      'Edited by Scrum Masters and PMs. The extension adds the matching sub-page to every review.\n';
  },

  starterTemplate(name) {
    return [
      '# Refiner – Team Context (' + name + ')',
      'Read by the Refiner extension and added to every Sprint Readiness and Feature Coverage review.',
      'Keep entries short: one rule per line. Full details belong in linked pages (the AI cannot open links).',
      '',
      '## Product components',
      '- [Component]: [one line: what it does]',
      '',
      '## How data flows',
      '- [e.g. Device → Firmware module → CCU → Portals and apps]',
      '',
      '## What a feature usually needs',
      '- [e.g. New device support: firmware, CCU configuration, portal display, QE]',
      '',
      '## Glossary',
      '- [Term]: [meaning]',
      '',
      '## Team rules (do not flag)',
      '- [e.g. TestRail test case IDs are added by QA during the sprint]',
      '',
      '## Always flag',
      '- [e.g. Any protocol change without the point / register mapping]',
      '',
      '## Approved learnings',
      'Added after Scrum Master approval. Format: date – [section] rule – source items.',
      ''
    ].join('\n');
  }
};

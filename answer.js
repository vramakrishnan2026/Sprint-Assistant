// Finds the sprint-assistant-result block in an AI answer (shared by the panel and the result page).

const ANSWER = {
  tryParse(text) {
    try {
      const o = JSON.parse(text);
      return o && typeof o === 'object' && (o.mode === 'feature' || o.mode === 'readiness') ? o : null;
    } catch (e) {
      return null;
    }
  },

  clean(t) {
    return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1').trim();
  },

  parse(text) {
    if (!text || !text.trim()) return null;
    const attempt = (s) => ANSWER.tryParse(s) || ANSWER.tryParse(ANSWER.clean(s));
    // 1. The fenced block we asked for.
    const fence = text.match(/```\s*sprint-assistant-result\s*\n([\s\S]*?)```/i);
    if (fence) {
      const o = attempt(fence[1]);
      if (o) return o;
    }
    // 2. Any fenced block that holds the result.
    const blocks = text.match(/```[a-z-]*\s*\n[\s\S]*?```/gi) || [];
    for (const b of blocks) {
      const o = attempt(b.replace(/^```[a-z-]*\s*\n/i, '').replace(/```$/, ''));
      if (o) return o;
    }
    // 3. Plain text (copied from the rendered chat): from the "mode" object to a closing brace.
    const at = text.search(/\{\s*"mode"\s*:/);
    if (at >= 0) {
      const tail = text.slice(at);
      for (let end = tail.lastIndexOf('}'); end > 0; end = tail.lastIndexOf('}', end - 1)) {
        const o = attempt(tail.slice(0, end + 1));
        if (o) return o;
      }
    }
    return null;
  },

  // Counts for the summary pills.
  summary(r) {
    if (r.mode === 'feature') {
      const items = (Array.isArray(r.components) ? r.components : []).flatMap((c) => Array.isArray(c.items) ? c.items : []);
      const st = (i) => (i.status === 'covered' || i.status === 'partial' ? i.status : 'missing');
      return {
        total: items.length,
        covered: items.filter((i) => st(i) === 'covered').length,
        partial: items.filter((i) => st(i) === 'partial').length,
        missing: items.filter((i) => st(i) === 'missing').length,
        extra: Array.isArray(r.extra) ? r.extra.length : 0
      };
    }
    const s = Array.isArray(r.stories) ? r.stories : [];
    return {
      total: s.length,
      ready: s.filter((x) => x.verdict === 'ready').length,
      clarify: s.filter((x) => x.verdict !== 'ready' && x.verdict !== 'not_ready').length,
      notReady: s.filter((x) => x.verdict === 'not_ready').length
    };
  }
};

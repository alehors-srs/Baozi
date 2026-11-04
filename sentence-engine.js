/* Чистый генератор и проверка. Не зависит от DOM, сети и внешних библиотек. */
'use strict';
(function (root) {
  const normalize = value => String(value).normalize('NFC').replace(/\s/g, '').replace(/[。！？.!?]+$/u, '');
  const unique = values => [...new Set(values)];

  function buildCatalog(words, names, lexicon, grammar) {
    const known = new Set(words.map(w => w.char));
    const has = items => items.every(word => known.has(word));
    const groups = {};
    for (const [group, entries] of Object.entries(lexicon)) {
      groups[group] = entries.filter(e => has(e.requires || [e.zh])).map(e => ({
        ...e, alternatives: (e.alternatives || []).filter(a => has(a.requires || [a.zh]))
      }));
    }
    groups.names = names.filter(n => n.char && n.translation).map(n => ({
      zh: n.char, ru: n.translation, person: 'third', want: 'хочет', can: 'умеет'
    }));
    groups.subjects = [...groups.pronouns, ...groups.names];
    const allowed = unique([...known, ...names.map(n => n.char), ...grammar.particles]).filter(Boolean);
    // Сегментация по словам, а не по отдельным иероглифам.
    const legal = text => {
      const reachable = new Set([0]);
      for (let i = 0; i < text.length; i++) {
        if (!reachable.has(i)) continue;
        for (const word of allowed) if (text.startsWith(word, i)) reachable.add(i + word.length);
      }
      return reachable.has(text.length);
    };
    const format = (template, values) => template.replace(/\{(\w+)\.(\w+)\}/g, (_, slot, field) => {
      const value = values[slot][field];
      if (field === 'owned') return values.o.adjective[values.n.gender] + ' ' + values.n.ru;
      return typeof value === 'object' ? value[values.s.person] : value;
    });
    const expand = values => {
      let variants = [{}];
      for (const [key, value] of Object.entries(values)) {
        variants = variants.flatMap(v => [value, ...(value.alternatives || []).map(a => ({ ...value, ...a }))]
          .map(item => ({ ...v, [key]: item })));
      }
      return variants;
    };
    const catalog = [];
    for (const rule of grammar.constructions) {
      if (!has(rule.requires)) continue;
      const slots = Object.entries(rule.slots);
      const questions = new Map();
      function visit(index, values) {
        if (index < slots.length) {
          const [slot, group] = slots[index];
          for (const entry of groups[group] || []) visit(index + 1, { ...values, [slot]: entry });
          return;
        }
        const variants = expand(values);
        const answers = unique(variants.flatMap(v => rule.answers.map(a => format(a, v)))).filter(legal);
        if (!answers.length) return;
        const prompt = format(rule.ru, values);
        const errors = variants.flatMap(v => (rule.mistakes || []).map(m => ({
          answer: format(m.pattern, v), message: m.message
        })));
        if (questions.has(prompt)) {
          const existing = questions.get(prompt);
          existing.answers = unique([...existing.answers, ...answers]);
          existing.errors.push(...errors);
        } else questions.set(prompt, { ruleId: rule.id, title: rule.title, prompt, answers, errors,
          explanation: rule.explanation });
      }
      visit(0, {});
      catalog.push(...questions.values());
    }
    return catalog;
  }

  function check(question, raw) {
    const answer = normalize(raw);
    if (!answer) return { status: 'empty', message: 'Введите перевод иероглифами.' };
    if (question.answers.some(a => normalize(a) === answer)) return { status: 'correct', message: 'Верно!' };
    const error = question.errors.find(e => normalize(e.answer) === answer);
    if (error) return { status: 'wrong', message: error.message };
    if (!/^[\p{Script=Han}]+$/u.test(answer)) return {
      status: 'invalid', message: 'Введите ответ иероглифами. Пробелы и конечные знаки . ! ? 。！？ допустимы.'
    };
    return { status: 'unknown', message: 'Этот вариант пока не распознан. Проверьте смысл и порядок слов. Можно исправить ответ или открыть образец; это не означает, что ваш вариант грамматически неверен.' };
  }

  function makeRound(catalog, count = 10, random = Math.random) {
    const shuffled = array => {
      const copy = [...array];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    const buckets = new Map();
    for (const q of shuffled(catalog)) {
      if (!buckets.has(q.ruleId)) buckets.set(q.ruleId, []);
      buckets.get(q.ruleId).push(q);
    }
    const result = [], seen = new Set();
    while (result.length < count && buckets.size) {
      for (const id of shuffled([...buckets.keys()])) {
        const bucket = buckets.get(id);
        let q;
        while (bucket.length && !q) {
          const item = bucket.pop();
          if (!seen.has(item.prompt)) q = item;
        }
        if (q) { result.push(q); seen.add(q.prompt); }
        if (!bucket.length) buckets.delete(id);
        if (result.length === count) break;
      }
    }
    return result;
  }
  root.SentenceEngine = { normalize, buildCatalog, check, makeRound };
})(typeof window !== 'undefined' ? window : globalThis);

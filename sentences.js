// Общий модуль Baozi и Chinese-quiz. Секретов и эталонных ответов до проверки здесь нет.
(() => {
  'use strict';
  const config = window.TRAINER_CONFIG;
  const byId = id => document.getElementById('sentences-' + id);
  const start = byId('start'), startBtn = byId('start-btn'), status = byId('status');
  const round = byId('round'), progress = byId('progress'), prompt = byId('prompt');
  const form = byId('form'), input = byId('answer'), checkBtn = byId('check-btn');
  const feedback = byId('feedback'), nextBtn = byId('next-btn'), prevBtn = byId('prev-btn');
  const result = byId('result'), score = byId('score'), list = byId('results-list'), resetBtn = byId('reset-btn');
  if (!startBtn) return;

  let session = null, index = 0, results = [], busy = false, epoch = 0, controller = null;
  let pendingJob = null, drafts = [], pendingChecks = [];
  function element(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function setStatus(message = '', error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }
  function setBusy(value) {
    busy = value;
    startBtn.disabled = value;
    checkBtn.disabled = value || !!results[index];
    nextBtn.disabled = value;
    prevBtn.disabled = value || index === 0;
    input.readOnly = value || !!results[index];
    document.getElementById('practice-testing').setAttribute('aria-busy', String(value));
  }
  async function request(path, data, timeout) {
    if (location.protocol === 'file:') throw new Error('Для работы DeepSeek откройте опубликованный сайт.');
    if (navigator.onLine === false) {
      const error = new Error('Для работы DeepSeek нужно подключение к интернету.');
      error.code = 'CONNECTION';
      throw error;
    }
    if (!config?.aiApiUrl || !config?.aiSiteId) throw new Error('В site-config.js не указаны настройки DeepSeek.');
    const endpoint = new URL(config.aiApiUrl);
    if (endpoint.protocol !== 'https:') throw new Error('Адрес API должен начинаться с https://.');
    const activeController = new AbortController();
    controller = activeController;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      activeController.abort();
    }, timeout);
    try {
      const url = new URL(path, endpoint);
      if (path === '/sentences/start' || path === '/sentences/status' || path.startsWith('/sentences/check')) {
        url.searchParams.set('probe', crypto.randomUUID());
      }
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        signal: activeController.signal, body: JSON.stringify({ ...data, site: config.aiSiteId })
      });
      let value;
      try { value = await response.json(); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error('Worker вернул непонятный ответ. Проверьте его установку.');
      }
      if (!response.ok) {
        const error = new Error(typeof value.error === 'string' ? value.error : 'Не удалось выполнить запрос.');
        error.code = value.code;
        error.terminal = value.terminal === true;
        throw error;
      }
      return value;
    } catch (error) {
      if (timedOut) {
        const problem = new Error('Истёк таймер сайта (' + timeout / 1000 + ' с).');
        problem.code = 'REQUEST_TIMEOUT';
        throw problem;
      }
      if (!activeController.signal.aborted && error instanceof TypeError) {
        const problem = new Error('Браузер сообщил об ошибке соединения' + (error.message ? ' (' + error.message + ').' : '.'));
        problem.code = 'CONNECTION';
        throw problem;
      }
      throw error;
    } finally { clearTimeout(timer); if (controller === activeController) controller = null; }
  }
  async function waitForRound(job, current) {
    const deadline = Date.now() + 180000;
    let delay = 0, lastProblem = '';
    while (current === epoch && Date.now() < deadline) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (current !== epoch || Date.now() >= deadline) break;
      delay = 5000;
      const stage = job.started ? 'Проверка готовности раунда' : 'Запуск раунда';
      try {
        const value = job.started
          ? await request('/sentences/status', { jobId: job.id }, 8000)
          : await request('/sentences/start', { jobId: job.id, words: job.words }, 20000);
        lastProblem = '';
        if (value.status === 'done') return value.round;
        if (value.status !== 'pending') throw new Error('Worker вернул неизвестный статус задания.');
        job.started = true;
      } catch (error) {
        if (error.code !== 'CONNECTION' && error.code !== 'REQUEST_TIMEOUT') throw error;
        lastProblem = stage + '. ' + error.message;
        if (current === epoch) setStatus(lastProblem + ' Повторяем запрос к тому же заданию…');
        continue;
      }
      if (current === epoch) setStatus('DeepSeek готовит раунд. Проверяем готовность…');
    }
    const error = new Error((lastProblem ? lastProblem + ' ' : '') + 'Раунд пока не получен. Нажмите «Начать раунд», чтобы продолжить ожидание.');
    error.code = 'WAIT_TIMEOUT';
    throw error;
  }
  function displayCardResult(target, item) {
    if (item.skipped) {
      target.append(element('p', 'sentences-verdict',
        item.answer.trim() ? '✗ Ответ не проверен — засчитан как неверный.' : '✗ Ответ не введён — засчитан как неверный.'));
    } else {
      displayVerdict(target, item.verdict);
    }
  }
  function showCard() {
    const saved = results[index];
    progress.textContent = 'Предложение ' + (index + 1) + ' из 10';
    prompt.textContent = session.cards[index].ru;
    input.value = saved ? saved.answer : (drafts[index] || '');
    checkBtn.hidden = !!saved;
    feedback.replaceChildren();
    feedback.hidden = !saved;
    feedback.className = 'sentences-feedback';
    if (saved) {
      feedback.classList.add(saved.verdict.correct ? 'is-correct' : 'is-wrong');
      displayCardResult(feedback, saved);
    }
    nextBtn.hidden = false;
    nextBtn.textContent = index === 9 ? 'Показать результат' : 'Следующее';
    setBusy(false);
    setStatus();
    // Просмотр восстанавливает сохранённый ответ, курсор устанавливается вручную.
  }
  function reset() {
    epoch++;
    controller?.abort(); controller = null;
    pendingJob = null; session = null; results = []; drafts = []; pendingChecks = []; index = 0;
    round.hidden = true; result.hidden = true; start.hidden = false; resetBtn.hidden = true;
    input.value = ''; list.replaceChildren(); feedback.replaceChildren();
    startBtn.textContent = 'Начать раунд'; setBusy(false); setStatus();
  }
  startBtn.addEventListener('click', async () => {
    if (busy) return;
    const current = ++epoch;
    setBusy(true); resetBtn.hidden = false;
    setStatus('DeepSeek составляет и проверяет 10 предложений. Это может занять до двух с половиной минут.');
    startBtn.textContent = 'Готовим раунд…';
    try {
      if (!pendingJob) {
        const words = window.TrainerDictionary?.snapshot();
        if (!Array.isArray(words)) throw new Error('Не удалось загрузить словарь words.');
        pendingJob = { id: crypto.randomUUID(), words, started: false };
      }
      const value = await waitForRound(pendingJob, current);
      if (current !== epoch) return;
      pendingJob = null;
      if (typeof value.token !== 'string' || !Number.isFinite(value.expiresAt) || !Array.isArray(value.cards) || value.cards.length !== 10 ||
          value.cards.some((card, id) => card.id !== id || typeof card.ru !== 'string')) throw new Error('Worker вернул неполный раунд. Попробуйте ещё раз.');
      session = value; results = []; drafts = []; pendingChecks = []; index = 0;
      start.hidden = true; result.hidden = true; round.hidden = false;
      resetBtn.textContent = 'Начать сначала'; showCard();
    } catch (error) {
      if (current === epoch) {
        if (!['CONNECTION', 'WAIT_TIMEOUT', 'RATE_LIMIT'].includes(error.code)) pendingJob = null;
        setStatus(error.message, true);
      }
    } finally {
      if (current === epoch) { setBusy(false); startBtn.textContent = 'Начать раунд'; }
    }
  });

  function displayVerdict(target, verdict) {
    target.append(element('p', 'sentences-verdict', verdict.correct ? '✓ Верно' : 'Нужно исправить'));
    const flags = [
      'Смысл: ' + (verdict.meaningCorrect ? 'верно' : 'есть неточности'),
      'Грамматика: ' + (verdict.grammarCorrect ? 'верно' : 'есть ошибки'),
      'Словарь: ' + (verdict.vocabularyAllowed ? 'соблюдён' : 'есть слова вне словаря')
    ];
    target.append(element('p', 'sentences-flags', flags.join(' · ')));
    if (verdict.outsideWords.length) target.append(element('p', '', 'Вне словаря: ' + verdict.outsideWords.join(', ')));
    target.append(element('p', '', verdict.feedback));
    target.append(element('p', 'sentences-reference', 'Пример перевода: ' + verdict.reference));
    target.append(element('p', 'sentences-grammar', verdict.grammar));
    const sound = element('button', 'speak-btn sentences-speak', '🔊');
    sound.type = 'button'; sound.setAttribute('aria-label', 'Прослушать пример перевода');
    sound.addEventListener('pointerdown', event => {
      if (document.activeElement === input && event.isPrimary && event.button === 0) event.preventDefault();
    });
    sound.addEventListener('click', () => {
      if (typeof speakChinese === 'function') speakChinese(verdict.reference);
    });
    target.append(sound);
  }
  function validVerdict(value) {
    return value && ['correct', 'meaningCorrect', 'grammarCorrect', 'vocabularyAllowed'].every(key => typeof value[key] === 'boolean') &&
      ['feedback', 'reference', 'grammar'].every(key => typeof value[key] === 'string') &&
      Array.isArray(value.outsideWords) && value.outsideWords.every(word => typeof word === 'string');
  }
  async function checkWithRetries(job, current) {
    const deadline = Date.now() + 90000;
    let failures = 0, delay = 0;
    const payload = { checkId: job.id, token: session.token, index: job.index, answer: job.answer };
    while (current === epoch) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (current !== epoch) return null;
      if (Date.now() >= deadline) {
        const error = new Error('Проверка пока не получена. Нажмите «Проверить», чтобы продолжить ожидание той же проверки.');
        error.code = 'CHECK_WAIT_TIMEOUT';
        throw error;
      }
      try {
        const value = await request(job.started ? '/sentences/check/status' : '/sentences/check/start', payload, 8000);
        if (current !== epoch) return null;
        if (value.status === 'done') return value.verdict;
        if (value.status === 'failed') {
          const error = new Error(typeof value.error === 'string' ? value.error : 'Worker не смог выполнить проверку.');
          error.code = value.code;
          error.terminal = true;
          throw error;
        }
        if (value.status !== 'pending') throw new Error('Worker вернул неизвестный статус проверки.');
        job.started = true;
        setStatus('DeepSeek проверяет перевод. Ожидаем результат той же проверки…');
        delay = 3000;
      } catch (error) {
        if (current !== epoch) return null;
        const interrupted = error.code === 'CONNECTION' || error.code === 'REQUEST_TIMEOUT';
        if (!interrupted || failures === 2) throw error;
        failures++;
        setStatus('Связь прервалась. Повторный запрос ' + failures + ' из 2 к той же проверке…');
        delay = 1000;
      }
    }
    return null;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !session || results[index]) return;
    const answer = input.value.trim();
    if (!answer) { setStatus('Введите перевод иероглифами.', true); return; }
    if (Date.now() >= session.expiresAt) { setStatus('Раунд истёк. Начните новый раунд.', true); return; }
    const current = epoch, cardIndex = index;
    drafts[cardIndex] = input.value;
    setBusy(true); setStatus('DeepSeek проверяет смысл, грамматику и словарь…');
    try {
      let job = pendingChecks[cardIndex];
      if (!job || job.answer !== answer) {
        job = { id: crypto.randomUUID(), index: cardIndex, answer, started: false };
        pendingChecks[cardIndex] = job;
      }
      const verdict = await checkWithRetries(job, current);
      if (current !== epoch) return;
      if (!validVerdict(verdict)) throw new Error('Получен неполный результат. Повторите проверку.');
      results[cardIndex] = { answer, verdict };
      pendingChecks[cardIndex] = null;
      feedback.replaceChildren(); feedback.hidden = false;
      feedback.className = 'sentences-feedback ' + (verdict.correct ? 'is-correct' : 'is-wrong');
      displayVerdict(feedback, verdict);
      checkBtn.hidden = true; nextBtn.hidden = false;
      nextBtn.textContent = cardIndex === 9 ? 'Показать результат' : 'Следующее';
      setStatus();
    } catch (error) {
      if (current === epoch) {
        if (error.terminal) pendingChecks[cardIndex] = null;
        const interrupted = error.code === 'CONNECTION' || error.code === 'REQUEST_TIMEOUT';
        setStatus(error.message + (interrupted
          ? ' Три попытки связи завершились без результата. Нажмите «Проверить», чтобы продолжить получение той же проверки.' : ''), true);
      }
    } finally { if (current === epoch) setBusy(false); }
  });
  // Do not submit unfinished Chinese IME composition with Enter.
  // A textarea keeps Enter for newlines; checking is an explicit button action.
  prevBtn.addEventListener('click', () => {
    if (busy || !session || index === 0) return;
    if (!results[index]) drafts[index] = input.value;
    index--;
    showCard();
  });
  nextBtn.addEventListener('click', () => {
    if (busy || !session) return;
    if (!results[index]) {
      results[index] = { answer: input.value, skipped: true, verdict: { correct: false } };
      pendingChecks[index] = null;
    }
    if (index < 9) { index++; showCard(); return; }
    round.hidden = true; result.hidden = false;
    score.textContent = 'Результат: ' + results.filter(item => item.verdict.correct).length + ' из 10';
    list.replaceChildren();
    results.forEach((item, id) => {
      const row = element('article', 'sentences-review');
      row.append(element('h3', '', (id + 1) + '. ' + session.cards[id].ru), element('p', '', 'Ваш ответ: ' + item.answer));
      displayCardResult(row, item); list.append(row);
    });
    resetBtn.textContent = 'Новый раунд'; setStatus();
  });
  resetBtn.addEventListener('click', reset);
})();


// Free analysis has its own request state and never reads TrainerDictionary.
(() => {
  'use strict';
  const buttons = [...document.querySelectorAll('[data-practice-panel]')];
  const form = document.getElementById('analysis-form');
  if (!form) return;
  const input = document.getElementById('analysis-input');
  const submit = document.getElementById('analysis-submit');
  const clear = document.getElementById('analysis-clear');
  const status = document.getElementById('analysis-status');
  const result = document.getElementById('analysis-result');
  const panel = document.getElementById('practice-analysis');
  let busy = false, pending = null;
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => {
      const active = item === button;
      item.setAttribute('aria-pressed', String(active));
      document.getElementById('practice-' + item.dataset.practicePanel).hidden = !active;
    });
    resizeAnalysisInput();
  }));
  function resizeAnalysisInput() {
    if (!input.getClientRects().length) return;
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight + input.offsetHeight - input.clientHeight) + 'px';
  }
  // Also resize after opening the main section or changing the available width.
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = 0;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
        resizeAnalysisInput();
      }
    });
    observer.observe(input);
  }
  window.addEventListener('resize', resizeAnalysisInput);
  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }
  function paragraph(target, value, className = '') {
    const node = document.createElement('p');
    node.className = className;
    node.textContent = value;
    target.append(node);
  }
  function block(title, value) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    result.append(heading);
    paragraph(result, value);
  }
  function display(value) {
    if (!value || !['correct', 'incorrect', 'needs_context'].includes(value.verdict) ||
        ['translation', 'grammar', 'naturalness', 'corrected', 'pinyin'].some(key => typeof value[key] !== 'string') ||
        !Array.isArray(value.issues) || value.issues.length > 15 || value.issues.some(issue =>
          !issue || !['error', 'style', 'context'].includes(issue.type) ||
          ['fragment', 'correction', 'explanation'].some(key => typeof issue[key] !== 'string'))) {
      throw new Error('Worker вернул неполный анализ. Обновите Worker и повторите запрос.');
    }
    result.replaceChildren();
    result.className = 'sentences-feedback ' + ({ correct: 'is-correct', incorrect: 'is-wrong', needs_context: 'needs-context' })[value.verdict];
    block(({ correct: '✓ Предложение составлено верно', incorrect: 'Нужно исправить', needs_context: 'Требуется контекст' })[value.verdict], value.translation);
    block('Грамматика', value.grammar);
    block('Естественность', value.naturalness);
    if (value.issues.length) {
      const heading = document.createElement('h3'); heading.textContent = 'Разбор фрагментов'; result.append(heading);
      for (const issue of value.issues) {
        const row = document.createElement('div'); row.className = 'analysis-issue';
        paragraph(row, ({ error: 'Ошибка', style: 'Можно сказать естественнее', context: 'Нужен контекст' })[issue.type], 'sentences-verdict');
        paragraph(row, issue.fragment + (issue.correction ? ' → ' + issue.correction : ''));
        paragraph(row, issue.explanation); result.append(row);
      }
    }
    block(value.verdict === 'needs_context' ? 'Вариант с учётом замечаний' : 'Итоговый вариант', value.corrected);
    paragraph(result, value.pinyin);
    result.hidden = false;
  }
  async function request(path, job) {
    const config = window.TRAINER_CONFIG;
    if (location.protocol === 'file:') throw new Error('Для работы DeepSeek откройте опубликованный сайт.');
    if (navigator.onLine === false) {
      const error = new Error('Нет подключения к интернету.'); error.code = 'CONNECTION'; throw error;
    }
    if (!config?.aiApiUrl || !config?.aiSiteId) throw new Error('В site-config.js не указаны настройки DeepSeek.');
    const endpoint = new URL(config.aiApiUrl);
    if (endpoint.protocol !== 'https:') throw new Error('Адрес API должен начинаться с https://.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL(path, endpoint); url.searchParams.set('probe', crypto.randomUUID());
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal,
        body: JSON.stringify({ site: config.aiSiteId, checkId: job.id, text: job.text })
      });
      let value;
      try { value = await response.json(); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error('Worker вернул непонятный ответ. Проверьте его установку.');
      }
      if (!response.ok) {
        const error = new Error(typeof value?.error === 'string' ? value.error : 'Не удалось выполнить анализ.');
        error.code = value?.code; error.terminal = value?.terminal === true; throw error;
      }
      return value;
    } catch (error) {
      if (controller.signal.aborted || error instanceof TypeError) {
        const problem = new Error('Не удалось получить ответ сервера.'); problem.code = 'CONNECTION'; throw problem;
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function waitForAnalysis(job) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const value = await request(job.started ? '/analysis/status' : '/analysis/start', job);
        if (value.status === 'done') return value.verdict;
        if (value.status === 'failed') {
          const error = new Error(value.error || 'Анализ не выполнен. Повторите запрос.');
          error.code = value.code; error.terminal = true; throw error;
        }
        if (value.status !== 'pending') throw new Error('Worker вернул неизвестный статус анализа.');
        job.started = true;
        setStatus('DeepSeek анализирует текст. Ожидаем результат…');
      } catch (error) {
        if (error.code !== 'CONNECTION') throw error;
        setStatus('Проверяем соединение и ожидаем результат того же анализа…');
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    const error = new Error('Результат пока не получен. Нажмите «Продолжить ожидание» — повторный анализ не запустится.');
    error.code = 'WAIT_TIMEOUT'; throw error;
  }
  input.addEventListener('input', () => {
    resizeAnalysisInput();
    if (busy) return;
    if (pending && pending.text !== input.value.trim()) pending = null;
    result.hidden = true;
    submit.textContent = pending ? 'Продолжить ожидание' : 'Проанализировать';
    setStatus('');
  });
  clear.addEventListener('click', () => {
    if (busy) return;
    input.value = '';
    pending = null;
    result.replaceChildren();
    result.hidden = true;
    setStatus('');
    submit.textContent = 'Проанализировать';
    resizeAnalysisInput();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    if (!text || text.length > 1000 || !/\p{Script=Han}/u.test(text)) {
      setStatus('Введите китайский текст длиной не более 1000 символов.', true); return;
    }
    if (!pending || pending.text !== text) pending = { id: crypto.randomUUID(), text, started: false };
    busy = true; submit.disabled = true; clear.disabled = true; input.readOnly = true; panel.setAttribute('aria-busy', 'true');
    result.hidden = true; setStatus('DeepSeek анализирует текст…');
    try {
      const verdict = await waitForAnalysis(pending);
      display(verdict); pending = null; setStatus('Анализ завершён.');
    } catch (error) {
      if (!['WAIT_TIMEOUT', 'CONNECTION', 'RATE_LIMIT'].includes(error.code)) pending = null;
      setStatus(error.message || 'Не удалось выполнить анализ. Попробуйте ещё раз.', true);
    } finally {
      busy = false; submit.disabled = false; clear.disabled = false; input.readOnly = false; panel.setAttribute('aria-busy', 'false');
      submit.textContent = pending ? 'Продолжить ожидание' : 'Проанализировать';
    }
  });
})();

// Подгонка названий переключателей: до двух строк.
(() => {
  const menu = document.querySelector('.ai-practice-switch');
  if (!menu) return;

  const labels = [...menu.querySelectorAll('button')].map(button => {
    const label = document.createElement('span');
    label.className = 'ai-practice-label';
    label.textContent = button.textContent.trim();
    button.replaceChildren(label);
    return label;
  });

  function fitLabels() {
    if (!menu.getClientRects().length) return;

    labels.forEach(label => {
      // Сначала возвращаем исходный размер из CSS.
      label.style.fontSize = '';

      let size = parseFloat(getComputedStyle(label).fontSize);

      while (size > 12) {
        const lineHeight =
          parseFloat(getComputedStyle(label).lineHeight);

        const fitsWidth =
          label.scrollWidth <= label.clientWidth + 1;

        const fitsTwoLines =
          label.getBoundingClientRect().height <= lineHeight * 2 + 1;

        if (fitsWidth && fitsTwoLines) break;

        size = Math.max(12, size - 1);
        label.style.fontSize = size + 'px';
      }
    });
  }

  let frame;
  function scheduleFit() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitLabels);
  }

  if ('ResizeObserver' in window) {
    let previousWidth = -1;

    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === previousWidth) return;
      previousWidth = width;
      scheduleFit();
    }).observe(menu);
  }

  window.addEventListener('resize', scheduleFit);

  if (document.fonts) {
    document.fonts.ready.then(scheduleFit);
    document.fonts.addEventListener('loadingdone', scheduleFit);
  }

  scheduleFit();
})();

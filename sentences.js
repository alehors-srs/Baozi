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
    document.getElementById('tab9').setAttribute('aria-busy', String(value));
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
      resetBtn.textContent = 'К началу раунда'; showCard();
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

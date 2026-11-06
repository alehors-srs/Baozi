// Общий модуль Baozi и Chinese-quiz. Секретов и эталонных ответов до проверки здесь нет.
(() => {
  'use strict';
  const config = window.TRAINER_CONFIG;
  const byId = id => document.getElementById('sentences-' + id);
  const start = byId('start'), startBtn = byId('start-btn'), status = byId('status');
  const round = byId('round'), progress = byId('progress'), prompt = byId('prompt');
  const form = byId('form'), input = byId('answer'), checkBtn = byId('check-btn');
  const feedback = byId('feedback'), nextBtn = byId('next-btn');
  const result = byId('result'), score = byId('score'), list = byId('results-list'), resetBtn = byId('reset-btn');
  if (!startBtn) return;

  let session = null, index = 0, results = [], busy = false, epoch = 0, controller = null;
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
    busy = value; startBtn.disabled = value; checkBtn.disabled = value;
    input.readOnly = value || !!results[index];
    document.getElementById('tab9').setAttribute('aria-busy', String(value));
  }
  async function request(path, data, timeout) {
    if (location.protocol === 'file:') throw new Error('Для работы DeepSeek откройте опубликованный сайт.');
    if (navigator.onLine === false) throw new Error('Для работы DeepSeek нужно подключение к интернету.');
    if (!config?.aiApiUrl || !config?.aiSiteId) throw new Error('В site-config.js не указаны настройки DeepSeek.');
    const endpoint = new URL(config.aiApiUrl);
    if (endpoint.protocol !== 'https:') throw new Error('Адрес API должен начинаться с https://.');
    const activeController = new AbortController();
    controller = activeController;
    const timer = setTimeout(() => activeController.abort(), timeout);
    try {
      const response = await fetch(new URL(path, endpoint), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        signal: activeController.signal, body: JSON.stringify({ ...data, site: config.aiSiteId })
      });
      let value;
      try { value = await response.json(); } catch { throw new Error('Worker вернул непонятный ответ. Проверьте его установку.'); }
      if (!response.ok) {
        const error = new Error(typeof value.error === 'string' ? value.error : 'Не удалось выполнить запрос.');
        error.code = value.code;
        throw error;
      }
      return value;
    } catch (error) {
      if (activeController.signal.aborted) throw new Error('Запрос прерван или занял слишком много времени. Попробуйте ещё раз.');
      if (error instanceof TypeError) throw new Error('Не удалось подключиться к Worker. Проверьте интернет, адрес API и настройки доступа.');
      throw error;
    } finally { clearTimeout(timer); if (controller === activeController) controller = null; }
  }
  function showCard() {
    progress.textContent = 'Предложение ' + (index + 1) + ' из 10';
    prompt.textContent = session.cards[index].ru;
    input.value = ''; input.readOnly = false; checkBtn.hidden = false; checkBtn.disabled = false;
    feedback.replaceChildren(); feedback.hidden = true; nextBtn.hidden = true;
    setStatus();
    // The user places the cursor manually, including after advancing a card.
  }
  function reset() {
    epoch++;
    controller?.abort(); controller = null;
    session = null; results = []; index = 0;
    round.hidden = true; result.hidden = true; start.hidden = false; resetBtn.hidden = true;
    input.value = ''; list.replaceChildren(); feedback.replaceChildren();
    startBtn.textContent = 'Начать раунд'; setBusy(false); setStatus();
  }
  startBtn.addEventListener('click', async () => {
    if (busy) return;
    const current = ++epoch;
    setBusy(true); resetBtn.hidden = false;
    setStatus('DeepSeek составляет и проверяет 10 предложений. Это может занять некоторое время.');
    startBtn.textContent = 'Готовим раунд…';
    try {
      const words = window.TrainerDictionary?.snapshot();
      if (!Array.isArray(words)) throw new Error('Не удалось загрузить словарь words.');
      const value = await request('/sentences/generate', { words }, 165000);
      if (current !== epoch) return;
      if (typeof value.token !== 'string' || !Number.isFinite(value.expiresAt) || !Array.isArray(value.cards) || value.cards.length !== 10 ||
          value.cards.some((card, id) => card.id !== id || typeof card.ru !== 'string')) throw new Error('Worker вернул неполный раунд. Попробуйте ещё раз.');
      session = value; results = []; index = 0;
      start.hidden = true; result.hidden = true; round.hidden = false;
      resetBtn.textContent = 'К началу раунда'; showCard();
    } catch (error) {
      if (current === epoch) setStatus(error.message, true);
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !session || results[index]) return;
    const answer = input.value.trim();
    if (!answer) { setStatus('Введите перевод иероглифами.', true); return; }
    if (Date.now() >= session.expiresAt) { setStatus('Раунд истёк. Начните новый раунд.', true); return; }
    const current = epoch, cardIndex = index;
    setBusy(true); setStatus('DeepSeek проверяет смысл, грамматику и словарь…');
    try {
      const verdict = await request('/sentences/check', { token: session.token, index: cardIndex, answer }, 35000);
      if (current !== epoch) return;
      if (!validVerdict(verdict)) throw new Error('Получен неполный результат. Повторите проверку.');
      results[cardIndex] = { answer, verdict };
      feedback.replaceChildren(); feedback.hidden = false;
      feedback.className = 'sentences-feedback ' + (verdict.correct ? 'is-correct' : 'is-wrong');
      displayVerdict(feedback, verdict);
      checkBtn.hidden = true; nextBtn.hidden = false;
      nextBtn.textContent = cardIndex === 9 ? 'Показать результат' : 'Следующая';
      setStatus();
    } catch (error) {
      if (current === epoch) setStatus(error.message, true);
    } finally { if (current === epoch) setBusy(false); }
  });
  // Do not submit unfinished Chinese IME composition with Enter.
  // A textarea keeps Enter for newlines; checking is an explicit button action.
  nextBtn.addEventListener('click', () => {
    if (busy || !session || !results[index]) return;
    if (index < 9) { index++; showCard(); return; }
    round.hidden = true; result.hidden = false;
    score.textContent = 'Результат: ' + results.filter(item => item.verdict.correct).length + ' из 10';
    list.replaceChildren();
    results.forEach((item, id) => {
      const row = element('article', 'sentences-review');
      row.append(element('h3', '', (id + 1) + '. ' + session.cards[id].ru), element('p', '', 'Ваш ответ: ' + item.answer));
      displayVerdict(row, item.verdict); list.append(row);
    });
    resetBtn.textContent = 'Новый раунд'; setStatus();
  });
  resetBtn.addEventListener('click', reset);
})();

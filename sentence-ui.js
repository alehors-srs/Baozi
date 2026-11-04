/* Раздел «Предложения». Подключается после app.js. */
'use strict';
(function () {
  const byId = id => document.getElementById('sentence-' + id);
  const engine = window.SentenceEngine;
  if (!engine || !window.SENTENCE_GRAMMAR_HSK1 || !window.SENTENCE_LEXICON) {
    byId('status').textContent = 'Не загрузились файлы раздела. Проверьте комплект и обновите страницу.';
    byId('start').disabled = true;
    return;
  }
  const ROUND_SIZE = 10;
  let round = [], index = 0, main = [], reinforcement = false, locked = false;
  const node = (tag, content, className) => {
    const el = document.createElement(tag);
    el.textContent = content;
    if (className) el.className = className;
    return el;
  };
  const cancelSpeech = () => {
    if (typeof responsiveVoice !== 'undefined') responsiveVoice.cancel();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };
  function start() {
    // Снимок актуального словаря при каждом новом раунде, без изменения активных карточек.
    const catalog = engine.buildCatalog(window.dictionary || [], window.names || [],
      window.SENTENCE_LEXICON, window.SENTENCE_GRAMMAR_HSK1);
    const questions = engine.makeRound(catalog, ROUND_SIZE);
    if (questions.length !== ROUND_SIZE) {
      byId('status').textContent = 'В словарях пока недостаточно слов для 10 разных заданий.';
      return;
    }
    cancelSpeech();
    round = questions.map(q => ({ ...q, userAnswer: '', outcome: null }));
    main = round;
    index = 0;
    reinforcement = false;
    byId('status').textContent = '';
    byId('settings').hidden = true;
    byId('results').hidden = true;
    byId('quiz').hidden = false;
    render();
  }
  function render() {
    cancelSpeech();
    locked = false;
    byId('progress').textContent = (reinforcement ? 'Закрепление: ' : '') +
      'Карточка ' + (index + 1) + ' из ' + round.length;
    byId('bar').value = index;
    byId('bar').max = round.length;
    byId('prompt').textContent = round[index].prompt;
    byId('answer').value = '';
    byId('answer').disabled = false;
    byId('feedback').replaceChildren();
    byId('check').hidden = false;
    byId('reveal').hidden = true;
    byId('next').hidden = true;
    byId('answer').focus();
  }
  function reveal(outcome, message) {
    if (locked) return;
    locked = true;
    const q = round[index];
    q.userAnswer = byId('answer').value;
    q.outcome = outcome;
    byId('answer').disabled = true;
    byId('check').hidden = true;
    byId('reveal').hidden = true;
    byId('next').hidden = false;
    const feedback = byId('feedback');
    feedback.replaceChildren(node('p', message, outcome === 'correct' ? 'score-green' : 'score-orange'));
    feedback.append(node('p', 'Образец: ' + q.answers[0], 'sentence-model'));
    if (typeof pinyinPro !== 'undefined') {
      feedback.append(node('p', pinyinPro.pinyin(q.answers[0]), 'test-pinyin'));
    }
    feedback.append(node('p', q.title), node('p', q.explanation));
    const speak = node('button', '🔊 Прослушать');
    speak.type = 'button';
    speak.addEventListener('click', () => speakChinese(q.answers[0]));
    feedback.append(speak);
    byId('next').focus();
  }
  byId('form').addEventListener('submit', event => {
    event.preventDefault();
    if (locked) return;
    const result = engine.check(round[index], byId('answer').value);
    if (result.status === 'correct' || result.status === 'wrong') reveal(result.status, result.message);
    else {
      byId('feedback').replaceChildren(node('p', result.message));
      byId('reveal').hidden = result.status !== 'unknown';
    }
  });
  byId('answer').addEventListener('input', () => {
    byId('feedback').replaceChildren();
    byId('reveal').hidden = true;
  });
  byId('reveal').addEventListener('click', () => {
    if (engine.check(round[index], byId('answer').value).status === 'unknown') {
      reveal('unknown', 'Ответ открыт. Вариант не распознан и не засчитан; его грамматическая правильность не установлена.');
    }
  });
  function finish() {
    cancelSpeech();
    byId('quiz').hidden = true;
    byId('results').hidden = false;
    const correct = main.filter(q => q.outcome === 'correct').length;
    const unknown = main.filter(q => q.outcome === 'unknown').length;
    byId('score').textContent = 'Первая попытка: ' + correct + ' из ' + main.length +
      '. Не распознано: ' + unknown + '.' + (reinforcement ? ' Раунд закрепления завершен.' : '');
    const list = byId('list');
    list.replaceChildren();
    for (const q of main) {
      const item = node('li', '', 'sentence-result-item');
      item.append(node('p', (q.outcome === 'correct' ? '✓ ' : q.outcome === 'unknown' ? '? ' : '✗ ') + q.prompt),
        node('p', 'Ваш ответ: ' + q.userAnswer), node('p', 'Образец: ' + q.answers[0]));
      list.append(item);
    }
    byId('repeat').hidden = !round.some(q => q.outcome !== 'correct');
  }
  byId('next').addEventListener('click', () => {
    if (!locked) return;
    if (++index < round.length) render(); else finish();
  });
  byId('repeat').addEventListener('click', () => {
    round = round.filter(q => q.outcome !== 'correct').map(q => ({ ...q, outcome: null, userAnswer: '' }));
    if (!round.length) return;
    reinforcement = true;
    index = 0;
    byId('results').hidden = true;
    byId('quiz').hidden = false;
    render();
  });
  function reset() {
    cancelSpeech();
    round = [];
    main = [];
    byId('settings').hidden = false;
    byId('quiz').hidden = true;
    byId('results').hidden = true;
    byId('status').textContent = '';
  }
  byId('start').addEventListener('click', start);
  byId('reset').addEventListener('click', reset);
  byId('new').addEventListener('click', reset);
  document.getElementById('back-to-sections').addEventListener('click', cancelSpeech);
})();

// Общий код Baozi и Chinese-quiz. Настройки хранятся в site-config.js.
'use strict';
const SITE_CONFIG = window.TRAINER_CONFIG;
if (!SITE_CONFIG || !SITE_CONFIG.title || !SITE_CONFIG.customWordsKey || !SITE_CONFIG.sharedCacheKey) {
  document.body.textContent = 'Не удалось загрузить настройки сайта. Проверьте site-config.js.';
  throw new Error('Missing site-config.js');
}
document.title = SITE_CONFIG.title;

// Check if dictionary loaded
if (!window.dictionary) {
  document.body.innerHTML = '<div class="loading">Ошибка: файл words.js не найден. Убедитесь, что words.js лежит рядом с index.html.</div>';
}

const dictionary = window.dictionary;

// Сравниваем записи независимо от регистра, лишних пробелов и формы Unicode.
function normalizeWordField(value) {
  return String(value ?? '')
    .normalize('NFC')
    // Удаляем невидимые символы Unicode
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    // Приводим пробелы к единому виду
    .replace(/\s+/g, ' ')
    .trim()
    // Игнорируем регистр
    .toLowerCase();
}

// В словаре встречается старое написание тона breve (nĭ),
// а pinyin-pro может вернуть caron (nǐ). Для сравнения это один тон.
function normalizeWordPinyin(value) {
  return normalizeWordField(value)
    .replace(/ă/g, 'ǎ')
    .replace(/ĕ/g, 'ě')
    .replace(/ĭ/g, 'ǐ')
    .replace(/ŏ/g, 'ǒ')
    .replace(/ŭ/g, 'ǔ')
    .normalize('NFC');
}

function isExactWordMatch(a, b) {
  return !!a && !!b &&
    normalizeWordField(a.char) === normalizeWordField(b.char) &&
    normalizeWordPinyin(a.pinyin) === normalizeWordPinyin(b.pinyin) &&
    normalizeWordField(a.translation) === normalizeWordField(b.translation);
}

// === RESPONSIVEVOICE TTS ===
function speakChinese(text) {
  if (typeof responsiveVoice !== 'undefined') {
    responsiveVoice.cancel();
    responsiveVoice.speak(text, 'Chinese Female', {rate: 0.72});
  } else if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.72;
    speechSynthesis.speak(u);
  }
}

// === UTILITIES ===
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(s) {
  return s.trim().toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s,.!?;:。！？，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkAnswer(user, correct) {
  const u = normalize(user);
  if (!u) return false;
  const variants = correct.split(/[;,]/).map(v => normalize(v));
  return variants.some(v => v === u);
}

function normalizePinyin(s) {
  return s.trim().toLowerCase()
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔù]/g, 'u')
    .replace(/[ǖǘǚǜü]/g, 'u')
    .replace(/[12345]/g, '')
    .replace(/[\s,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkPinyin(user, correct) {
  const u = normalizePinyin(user);
  if (!u) return false;
  const variants = correct.split(/[;,]/).map(v => normalizePinyin(v));
  return variants.some(v => v === u);
}

// Подгоняем названия по ширине после загрузки шрифта и изменения экрана.
const sectionMenu = document.querySelector('.tabs');
let sectionLabelFrame = null;

function fitSectionLabels() {
  if (sectionMenu.hidden) return;
  sectionMenu.querySelectorAll('.tab').forEach(button => {
    const label = button.querySelector('.tab-label');
    if (!label) return;
    label.style.fontSize = '';
    const style = getComputedStyle(button);
    const available = button.clientWidth
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1;
    const width = label.getBoundingClientRect().width;
    if (available > 0 && width > available) {
      const baseSize = parseFloat(getComputedStyle(label).fontSize);
      label.style.fontSize = (Math.floor(baseSize * available / width * 100) / 100) + 'px';
    }
  });
}

function scheduleSectionLabelFit() {
  if (sectionLabelFrame !== null) cancelAnimationFrame(sectionLabelFrame);
  sectionLabelFrame = requestAnimationFrame(() => {
    sectionLabelFrame = null;
    fitSectionLabels();
  });
}

scheduleSectionLabelFit();
if ('ResizeObserver' in window) {
  const sectionMenuObserver = new ResizeObserver(scheduleSectionLabelFit);
  sectionMenuObserver.observe(sectionMenu);
}
window.addEventListener('resize', scheduleSectionLabelFit);
if (document.fonts) {
  document.fonts.ready.then(scheduleSectionLabelFit);
  document.fonts.addEventListener('loadingdone', scheduleSectionLabelFit);
}

// === TAB SWITCHING ===
const initializedSections = new Set();
const sectionNavigation = document.getElementById('section-navigation');
const backToSectionsButton = document.getElementById('back-to-sections');
let lastSectionButton = null;

backToSectionsButton.addEventListener('click', () => {
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.remove('active');
  });
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  });
  sectionNavigation.hidden = true;
  sectionMenu.hidden = false;
  scheduleSectionLabelFit();
  if (lastSectionButton) lastSectionButton.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const sectionId = tab.dataset.tab;

    document.querySelectorAll('.tab').forEach(button => {
      const selected = button === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-expanded', String(selected));
    });

    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.toggle('active', section.id === sectionId);
    });

    lastSectionButton = tab;
    sectionMenu.hidden = true;
    sectionNavigation.hidden = false;
    backToSectionsButton.focus({ preventScroll: true });
    window.scrollTo(0, 0);

    if (!initializedSections.has(sectionId)) {
      if (sectionId === 'tab1') showQuizStart();
      if (sectionId === 'tab2') showQuizStart('2');

      initializedSections.add(sectionId);
    }
  });
});

// Текст словаря не интерпретируется как HTML или JavaScript.
// Сохраняем фокус в поле при нажатии подсказки или озвучки.
document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  if (!(event.target instanceof Element)) return;

  const control = event.target.closest('.hint-link, .speak-btn');
  if (!control) return;

  const card = control.closest('#quiz .card, #quiz2 .card');
  if (!card) return;

  const input = card.querySelector('input');
  if (!input || document.activeElement !== input) return;

  // Не переключаем фокус; действие выполняет существующий обработчик click.
  event.preventDefault();
}, { passive: false });

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSpeakButton(text, className) {
  const button = makeElement('button', className, '🔊');
  button.type = 'button';
  button.setAttribute('aria-label', 'Прослушать слово');
  button.addEventListener('click', () => speakChinese(text));
  return button;
}

function resetQuizTransition(state, buttonId) {
  clearTimeout(state.timer);
  state.timer = null;
  state.transitioning = false;
  state.round = (state.round || 0) + 1;
  document.getElementById(buttonId).disabled = false;
}

// Обновляем существующую карточку, не удаляя поле ввода из документа.
function updateQuizCardInPlace(quiz, state, focusInput, reverse = false) {
  const card = quiz.querySelector('.card');
  if (!card || state.idx >= state.items.length) return false;
  const item = state.items[state.idx];
  quiz.querySelector('.quiz-progress-text').textContent =
    'Слово ' + (state.idx + 1) + ' из ' + state.items.length;
  card.classList.remove('correct', 'wrong');
  card.querySelector('.char').textContent = reverse ? item.translation : item.char;
  const speaker = card.querySelector('.speak-btn');
  speaker.replaceWith(makeSpeakButton(item.char, 'speak-btn'));
  const input = card.querySelector('input');
  input.value = '';
  if (reverse) {
    input.dataset.pinyin = item.pinyin;
    input.dataset.char = item.char;
  } else {
    input.dataset.correct = item.translation;
    input.dataset.pinyin = item.pinyin || '';
  }
  const hint = card.querySelector('.hint');
  hint.classList.remove('show');
  hint.textContent = reverse
    ? 'Пиньинь: ' + item.pinyin + ' | Иероглиф: ' + item.char
    : 'Пиньинь: ' + (item.pinyin || '—') + ' | Перевод: ' + item.translation;
  card.querySelector('.hint-link').textContent = 'показать ответ';
  state.answered = false;
  if (focusInput && quiz.closest('.tab-content').classList.contains('active')) {
    input.focus({ preventScroll: true });
  }
  return true;
}

function moveQuizNext(state, render, buttonId, delay = 0) {
  if (state.transitioning || state.idx >= state.items.length) return;
  const section = document.getElementById(buttonId).closest('.tab-content');
  if (section.classList.contains('active')) {
    const input = section.querySelector('.card input');
    if (input) input.focus({ preventScroll: true });
  }
  const round = state.round;
  state.transitioning = true;
  document.getElementById(buttonId).disabled = true;
  state.timer = setTimeout(() => {
    if (round !== state.round) return;
    state.timer = null;
    state.idx++;
    state.transitioning = false;
    document.getElementById(buttonId).disabled = state.idx >= state.items.length;
    render(true);
  }, delay);
}

// Настройки показываем до запуска раунда; отменяем отложенный переход карточки.
function showQuizStart(suffix = '') {
  resetQuizTransition(suffix === '2' ? quiz2State : quiz1State, 'next-btn' + suffix);
  document.getElementById('quiz-start' + suffix).hidden = false;
  document.getElementById('quiz-round' + suffix).hidden = true;
}

function startQuizRound(suffix = '') {
  document.getElementById('quiz-start' + suffix).hidden = true;
  document.getElementById('quiz-round' + suffix).hidden = false;
  if (suffix === '2') renderQuiz2();
  else renderQuiz();
}

document.getElementById('quiz-start-btn')
  .addEventListener('click', () => startQuizRound());
document.getElementById('quiz-start-btn2')
  .addEventListener('click', () => startQuizRound('2'));

// === TAB 1: 字 - АБВ ===

let quiz1State = { items: [], idx: 0, results: [], answered: false, transitioning: false, timer: null, round: 0 };

function renderQuiz(focusInput = false) {
  resetQuizTransition(quiz1State, 'next-btn');
  document.getElementById('next-btn').style.display = '';
  const selectedPool = document.getElementById('quiz-pool').value;
  const pool = selectedPool === 'all'
    ? dictionary
    : dictionary.slice(-Number(selectedPool));
  quiz1State.items = shuffle(pool).slice(0, Math.min(10, pool.length));
  quiz1State.idx = 0;
  quiz1State.results = [];
  quiz1State.answered = false;
  document.getElementById('result-banner').textContent = '';
  document.getElementById('result-banner').className = '';
  const tab1 = document.getElementById('tab1');
  const rl1 = tab1.querySelector('.results-list');
  if (rl1) rl1.remove();
  renderQuizCard(focusInput === true);
}

function renderQuizCard(focusInput = false) {
  const quiz = document.getElementById('quiz');
  if (updateQuizCardInPlace(quiz, quiz1State, focusInput, false)) return;
  quiz.innerHTML = '';
  if (quiz1State.idx >= quiz1State.items.length) {
    document.getElementById('next-btn').disabled = true;
    document.getElementById('next-btn').style.display = 'none';
    showQuizResults(quiz1State.results, document.getElementById('result-banner'));
    return;
  }
  const item = quiz1State.items[quiz1State.idx];
  const progress = document.createElement('div');
  progress.className = 'quiz-progress-text';
  progress.textContent = 'Слово ' + (quiz1State.idx + 1) + ' из ' + quiz1State.items.length;
  quiz.appendChild(progress);

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'quiz-card-current';
  const top = makeElement('div', 'card-top');
  const char = makeElement('div', 'char', item.char);
  top.append(char, makeSpeakButton(item.char, 'speak-btn'));

  const body = makeElement('div', 'card-body');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Перевод на русский…';
  input.id = 'quiz-input';
  input.dataset.correct = item.translation;
  input.dataset.pinyin = item.pinyin || '';
  const hintLink = makeElement('span', 'hint-link', 'показать ответ');
  hintLink.addEventListener('click', () => toggleHint(hintLink));
  const hint = makeElement('div', 'hint', 'Пиньинь: ' + (item.pinyin || '—') + ' | Перевод: ' + item.translation);
  body.append(input, hintLink, hint);
  card.append(top, body);
  quiz.appendChild(card);
  quiz1State.answered = false;
  const inp = card.querySelector('input');
  // Вход в раздел — без курсора; следующая видимая карточка — с курсором.
  if (focusInput && inp.closest('.tab-content').classList.contains('active')) {
    inp.focus({ preventScroll: true });
  }
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuiz1Next();
    }
  });
}

function handleQuiz1Next() {
  if (quiz1State.transitioning || quiz1State.idx >= quiz1State.items.length) return;
  const card = document.getElementById('quiz-card-current');
  if (!card) return;

  if (quiz1State.answered) {
    moveQuizNext(quiz1State, renderQuizCard, 'next-btn');
    return;
  }

  const inp = card.querySelector('input');
  const item = quiz1State.items[quiz1State.idx];
  const empty = !inp.value.trim();
  const ok = !empty && (checkAnswer(inp.value, inp.dataset.correct));
  quiz1State.results.push({
    char: item.char,
    pinyin: item.pinyin || '—',
    translation: item.translation,
    userAnswer: empty ? '(пусто)' : inp.value,
    correct: ok
  });
  card.classList.remove('correct', 'wrong');
  card.classList.add(ok ? 'correct' : 'wrong');
  quiz1State.answered = true;
  if (ok || empty) {
    moveQuizNext(quiz1State, renderQuizCard, 'next-btn', 500);
  }
}

function toggleHint(link) {
  const hint = link.nextElementSibling;
  hint.classList.toggle('show');
  link.textContent = hint.classList.contains('show') ? 'скрыть ответ' : 'показать ответ';
}

document.getElementById('next-btn').addEventListener('click', handleQuiz1Next);
document.getElementById('new-btn').addEventListener('click', () => showQuizStart());


// === TAB 2: АБВ - 字 ===

let quiz2State = { items: [], idx: 0, results: [], answered: false, transitioning: false, timer: null, round: 0 };

function renderQuiz2(focusInput = false) {
  resetQuizTransition(quiz2State, 'next-btn2');
  document.getElementById('next-btn2').style.display = '';
  const selectedPool = document.getElementById('quiz-pool2').value;
  const pool = selectedPool === 'all'
    ? dictionary
    : dictionary.slice(-Number(selectedPool));
  quiz2State.items = shuffle(pool).slice(0, Math.min(10, pool.length));
  quiz2State.idx = 0;
  quiz2State.results = [];
  quiz2State.answered = false;
  document.getElementById('result-banner2').textContent = '';
  document.getElementById('result-banner2').className = '';
  const tab2 = document.getElementById('tab2');
  const rl2 = tab2.querySelector('.results-list');
  if (rl2) rl2.remove();
  renderQuiz2Card(focusInput === true);
}

function renderQuiz2Card(focusInput = false) {
  const quiz = document.getElementById('quiz2');
  if (updateQuizCardInPlace(quiz, quiz2State, focusInput, true)) return;
  quiz.innerHTML = '';
  if (quiz2State.idx >= quiz2State.items.length) {
    document.getElementById('next-btn2').disabled = true;
    document.getElementById('next-btn2').style.display = 'none';
    showQuizResults(quiz2State.results, document.getElementById('result-banner2'));
    return;
  }
  const item = quiz2State.items[quiz2State.idx];
  const progress = document.createElement('div');
  progress.className = 'quiz-progress-text';
  progress.textContent = 'Слово ' + (quiz2State.idx + 1) + ' из ' + quiz2State.items.length;
  quiz.appendChild(progress);

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'quiz2-card-current';
  const top = makeElement('div', 'card-top');
  const char = makeElement('div', 'char', item.translation);
  char.style.fontSize = '16px';
  top.append(char, makeSpeakButton(item.char, 'speak-btn'));

  const body = makeElement('div', 'card-body');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Введите пиньинь или иероглиф…';
  input.id = 'quiz2-input';
  input.dataset.pinyin = item.pinyin;
  input.dataset.char = item.char;
  const hintLink = makeElement('span', 'hint-link', 'показать ответ');
  hintLink.addEventListener('click', () => toggleHint2(hintLink));
  const hint = makeElement('div', 'hint', 'Пиньинь: ' + item.pinyin + ' | Иероглиф: ' + item.char);
  body.append(input, hintLink, hint);
  card.append(top, body);
  quiz.appendChild(card);
  quiz2State.answered = false;
  const inp = card.querySelector('input');
  // Вход в раздел — без курсора; следующая видимая карточка — с курсором.
  if (focusInput && inp.closest('.tab-content').classList.contains('active')) {
    inp.focus({ preventScroll: true });
  }
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuiz2Next();
    }
  });
}

function handleQuiz2Next() {
  if (quiz2State.transitioning || quiz2State.idx >= quiz2State.items.length) return;
  const card = document.getElementById('quiz2-card-current');
  if (!card) return;

  if (quiz2State.answered) {
    moveQuizNext(quiz2State, renderQuiz2Card, 'next-btn2');
    return;
  }

  const inp = card.querySelector('input');
  const item = quiz2State.items[quiz2State.idx];
  const empty = !inp.value.trim();
  const ok = !empty && (checkPinyin(inp.value, inp.dataset.pinyin) || inp.value.trim() === item.char);
  quiz2State.results.push({
    char: item.char,
    pinyin: item.pinyin,
    translation: item.translation,
    userAnswer: empty ? '(пусто)' : inp.value,
    correct: ok
  });
  card.classList.remove('correct', 'wrong');
  card.classList.add(ok ? 'correct' : 'wrong');
  quiz2State.answered = true;
  if (ok || empty) {
    moveQuizNext(quiz2State, renderQuiz2Card, 'next-btn2', 500);
  }
}

function toggleHint2(link) {
  const hint = link.nextElementSibling;
  hint.classList.toggle('show');
  link.textContent = hint.classList.contains('show') ? 'скрыть ответ' : 'показать ответ';
}

document.getElementById('next-btn2').addEventListener('click', handleQuiz2Next);
document.getElementById('new-btn2').addEventListener('click', () => showQuizStart('2'));


// === SHARED: Results list ===

function showQuizResults(results, banner) {
  const container = banner.parentElement;
  let existing = container.querySelector('.results-list');
  if (existing) existing.remove();

  const correctCount = results.filter(r => r.correct).length;
  const total = results.length;
  if (correctCount === total) { banner.textContent = 'Идеально! ' + correctCount + ' из ' + total + '! 🎉'; banner.className = 'score-green'; }
  else if (correctCount >= Math.ceil(total * 0.7)) { banner.textContent = 'Хорошо! ' + correctCount + ' из ' + total; banner.className = 'score-orange'; }
  else { banner.textContent = 'Нужно больше практики — ' + correctCount + ' из ' + total; banner.className = 'score-red'; }

  const list = document.createElement('div');
  list.className = 'results-list';
  results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'result-row ' + (r.correct ? 'ok' : 'err');
    const charPinyin = makeElement('div', 'result-char-pinyin');
    charPinyin.append(
      makeElement('div', 'result-char', r.char),
      makeElement('div', 'result-pinyin', r.pinyin)
    );
    row.append(
      makeElement('div', 'result-mark', r.correct ? '✓' : '✗'),
      charPinyin,
      makeElement('div', 'result-translation', r.translation)
    );
    list.appendChild(row);
  });
  container.appendChild(list);
}

// === TAB 6: Словарь ===

function isChinese(str) {
  return /[\u4e00-\u9fff]/.test(str);
}

function searchDictionary(query) {
  const q = query.trim().toLowerCase();
  if (!q) return dictionary;
  
  const results = [];
  const seen = new Set();
  
  dictionary.forEach(item => {
    let match = false;
    
    // Search by Chinese character
    if (item.char && item.char.includes(query.trim())) {
      match = true;
    }
    
    // Search by pinyin (with and without tones)
    if (item.pinyin) {
      const pinyinNorm = normalizePinyin(item.pinyin);
      const qNorm = normalizePinyin(q);
      if (pinyinNorm.includes(qNorm) || item.pinyin.toLowerCase().includes(q)) {
        match = true;
      }
    }
    
    // Search by Russian translation
    if (item.translation) {
      const transNorm = normalize(item.translation);
      const qTransNorm = normalize(q);
      if (transNorm.includes(qTransNorm)) {
        match = true;
      }
    }
    
    if (match) {
      const key = item.char + '|' + item.pinyin + '|' + item.translation;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    }
  });
  
  return results;
}

function renderDictResults(results) {
  const container = document.getElementById('dict-results');
  if (results.length === 0) {
    container.innerHTML = '<div class="dict-empty">Ничего не найдено. Попробуйте другой запрос.</div>';
    return;
  }
  container.innerHTML = '';
  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'dict-item';
    const info = makeElement('div', 'dict-info');
    info.append(
      makeElement('div', 'dict-pinyin', item.pinyin || '—'),
      makeElement('div', 'dict-translation', item.translation)
    );
    div.append(
      makeElement('div', 'dict-char', item.char),
      makeSpeakButton(item.char, 'speak-btn-sm'),
      info
    );
    container.appendChild(div);
  });
}

document.getElementById('dict-search').addEventListener('input', (e) => {
  const results = searchDictionary(e.target.value);
  renderDictResults(results);
});



// === ADD WORD TO DICTIONARY ===

const addCharInput = document.getElementById('add-char');
const addLookupBtn = document.getElementById('add-lookup-btn');
const addPreview = document.getElementById('add-word-preview');
const addCharOptions = document.getElementById('add-char-options');
const addPinyinInput = document.getElementById('add-pinyin');
const addTranslationInput = document.getElementById('add-translation');
const addConfirmBtn = document.getElementById('add-confirm-btn');
const addCancelBtn = document.getElementById('add-cancel-btn');
const addStatus = document.getElementById('add-status');

addLookupBtn.addEventListener('click', lookupWord);
addCharInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); lookupWord(); }
});

addCancelBtn.addEventListener('click', () => {
  addPreview.style.display = 'none';
  addCharOptions.style.display = 'none';
  addCharOptions.innerHTML = '';
  addCharInput.value = '';
  addPinyinInput.value = '';
  addTranslationInput.value = '';
  addStatus.textContent = '';
  addStatus.className = 'add-status';
});

addConfirmBtn.addEventListener('click', confirmAddWord);

async function lookupWord() {
  const charVal = addCharInput.value.trim();
  if (!charVal) {
    addStatus.textContent = 'Введите иероглиф или русское слово';
    addStatus.className = 'add-status error';
    addPreview.style.display = 'none';
    addCharOptions.style.display = 'none';
    addCharOptions.innerHTML = '';
    return;
  }

  const isChineseInput = /[\u4e00-\u9fff]/.test(charVal);

  // Hide options from previous search
  addCharOptions.style.display = 'none';
  addCharOptions.innerHTML = '';

  if (isChineseInput) {
    // Проверяем полное совпадение только после заполнения пиньиня и перевода.

    addLookupBtn.disabled = true;
    addLookupBtn.textContent = 'Определяю…';
    addStatus.textContent = '';
    addStatus.className = 'add-status';

    try {
      let pinyinVal = '';
      if (typeof pinyinPro !== 'undefined') {
        pinyinVal = pinyinPro.pinyin(charVal, { toneType: 'symbol', type: 'array' }).join('');
      }

      let translationVal = '';
      try {
        const apiUrl = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(charVal) + '&langpair=zh-CN|ru';
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        if (data && data.responseData && data.responseData.translatedText) {
          translationVal = data.responseData.translatedText;
        }
      } catch (e) {
        console.log('Translation API error:', e);
      }

      addPinyinInput.value = pinyinVal || '';
      addTranslationInput.value = translationVal || '';
      addPreview.style.display = 'flex';

      if (!pinyinVal && !translationVal) {
        addStatus.textContent = 'Не удалось определить автоматически — заполните поля вручную.';
        addStatus.className = 'add-status error';
      } else if (!pinyinVal) {
        addStatus.textContent = 'Пиньинь не определён — заполните вручную.';
        addStatus.className = 'add-status error';
      } else if (!translationVal) {
        addStatus.textContent = 'Перевод не получен — заполните вручную.';
        addStatus.className = 'add-status error';
      } else {
        addStatus.textContent = 'Проверьте и при необходимости отредактируйте поля.';
        addStatus.className = 'add-status loading';
      }
      addPinyinInput.focus();
    } catch (e) {
      addStatus.textContent = 'Ошибка: ' + e.message;
      addStatus.className = 'add-status error';
      addPreview.style.display = 'none';
    } finally {
      addLookupBtn.disabled = false;
      addLookupBtn.textContent = 'Определить';
    }
    return;
  }

  // Russian (or non-Chinese) input — translate ru -> zh and show options
  addLookupBtn.disabled = true;
  addLookupBtn.textContent = 'Определяю…';
  addStatus.textContent = '';
  addStatus.className = 'add-status';
  addPreview.style.display = 'none';

  try {
    // Translate Russian -> Chinese via MyMemory API
    const apiUrl = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(charVal) + '&langpair=ru|zh-CN';
    const resp = await fetch(apiUrl);
    const data = await resp.json();

    // Collect unique Chinese translations
    const candidates = [];
    const seen = new Set();

    // Main translation
    if (data && data.responseData && data.responseData.translatedText) {
      const mainText = data.responseData.translatedText;
      // Split on common separators to get individual words
      const parts = mainText.split(/[\u4e00-\u9fff]+|[^\u4e00-\u9fff]+/).filter(p => /[\u4e00-\u9fff]/.test(p));
      // Actually let's use a simpler approach: extract Chinese character sequences
      const chineseParts = mainText.match(/[\u4e00-\u9fff]+/g) || [];
      for (const p of chineseParts) {
        if (!seen.has(p)) { seen.add(p); candidates.push(p); }
      }
    }

    // Alternative matches from the API
    if (data && data.matches) {
      for (const m of data.matches) {
        if (m && m.translation) {
          const chineseParts = m.translation.match(/[\u4e00-\u9fff]+/g) || [];
          for (const p of chineseParts) {
            if (!seen.has(p)) { seen.add(p); candidates.push(p); }
          }
        }
      }
    }

    // Сохраняем варианты с существующим иероглифом: перевод может отличаться.
    const newCandidates = candidates;

    if (newCandidates.length === 0) {
      if (candidates.length > 0) {
        addStatus.textContent = 'Все найденные варианты уже есть в словаре.';
      } else {
        addStatus.textContent = 'Не удалось найти китайский перевод. Попробуйте ввести иероглиф вручную.';
      }
      addStatus.className = 'add-status error';
      return;
    }

    // Get pinyin for each candidate
    const optionsData = [];
    for (const c of newCandidates) {
      let py = '';
      if (typeof pinyinPro !== 'undefined') {
        py = pinyinPro.pinyin(c, { toneType: 'symbol', type: 'array' }).join('');
      }
      optionsData.push({ char: c, pinyin: py });
    }

    // Build options UI
    addCharOptions.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'opt-header';
    header.textContent = optionsData.length === 1
      ? 'Найден 1 вариант. Нажмите, чтобы выбрать:'
      : 'Найдено ' + optionsData.length + ' вариантов. Выберите нужный:';
    addCharOptions.appendChild(header);

    optionsData.forEach((opt) => {
      const div = document.createElement('div');
      div.className = 'add-char-option';
      div.append(
        makeElement('div', 'opt-char', opt.char),
        makeElement('div', 'opt-pinyin', opt.pinyin || '—'),
        makeElement('div', 'opt-translation', charVal)
      );
      div.addEventListener('click', function() { selectCharOption(opt.char, opt.pinyin, charVal); });
      addCharOptions.appendChild(div);
    });

    addCharOptions.style.display = 'flex';
    addStatus.textContent = '';
    addStatus.className = 'add-status';

    // If only one option, auto-select it
    if (optionsData.length === 1) {
      selectCharOption(optionsData[0].char, optionsData[0].pinyin, charVal);
    }
  } catch (e) {
    addStatus.textContent = 'Ошибка: ' + e.message;
    addStatus.className = 'add-status error';
    addPreview.style.display = 'none';
  } finally {
    addLookupBtn.disabled = false;
    addLookupBtn.textContent = 'Определить';
  }
}

function selectCharOption(charVal, pinyinVal, russianVal) {
  // Mark selected option
  document.querySelectorAll('.add-char-option').forEach(function(el) { el.classList.remove('selected'); });

  // Set the char input to the selected Chinese character
  addCharInput.value = charVal;

  // Fill pinyin and translation
  addPinyinInput.value = pinyinVal || '';
  addTranslationInput.value = russianVal || '';

  // Show the preview form
  addPreview.style.display = 'flex';
  addCharOptions.style.display = 'none';

  addStatus.textContent = 'Проверьте и при необходимости отредактируйте поля.';
  addStatus.className = 'add-status loading';
  addPinyinInput.focus();
}

const GOOGLE_SHEETS_WEB_APP_URL = SITE_CONFIG.sheetsWebAppUrl;

function sendWordToSheets(word) {
  return requestSheets('addWord', word);
}

function requestSheets(action, word) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try { endpoint = new URL(GOOGLE_SHEETS_WEB_APP_URL); } catch (_) {
      reject(new Error('Подключение к Google Sheets ещё не настроено.'));
      return;
    }
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
      reject(new Error('Нужен URL опубликованного Apps Script вида https://script.google.com/macros/s/…/exec.'));
      return;
    }
    if (navigator.onLine === false) {
      reject(new Error('Для добавления в Google Sheets требуется интернет.'));
      return;
    }
    if (location.origin !== new URL(SITE_CONFIG.siteUrl).origin) {
      reject(new Error('Добавление доступно на опубликованном сайте ' + SITE_CONFIG.siteUrl));
      return;
    }

    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.name = 'baozi_sheets_' + requestId;
    frame.hidden = true;
    frame.title = 'Подтверждение сохранения слова';
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = endpoint.href;
    form.target = frame.name;
    form.hidden = true;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify({ action, requestId, word });
    form.appendChild(input);
    let timer;
    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      form.remove();
      frame.remove();
    };
    const fail = error => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const onMessage = event => {
      // Apps Script renders its HTML response in a nested Google sandbox frame.
      // Match both its HTTPS origin and a fresh unpredictable request nonce.
      let origin;
      try { origin = new URL(event.origin); } catch (_) { return; }
      if (origin.protocol !== 'https:' ||
          !(origin.hostname === 'script.google.com' || origin.hostname === 'script.googleusercontent.com' ||
            origin.hostname.endsWith('-script.googleusercontent.com'))) return;
      const result = event.data;
      if (finished || !result || typeof result !== 'object' ||
          result.type !== 'baozi-sheets-result' || result.requestId !== requestId) return;
      if (result.status === 'error') {
        fail(new Error(typeof result.message === 'string' ? result.message : 'Ошибка сохранения в Google Sheets.'));
        return;
      }
      if (action === 'getDictionary') {
        if (result.status !== 'dictionary' || !/^[a-f0-9]{64}$/.test(result.version) ||
            !Array.isArray(result.words) || !result.words.every(validDictionaryWord)) {
          fail(new Error('Получен некорректный словарь. Сохранена предыдущая версия.'));
          return;
        }
        finished = true;
        cleanup();
        resolve(result);
        return;
      }
      if (!['added', 'duplicate'].includes(result.status) || !result.word ||
          !['char', 'pinyin', 'translation'].every(key =>
            typeof result.word[key] === 'string' && result.word[key].trim()) ||
          !isExactWordMatch(result.word, word)) {
        fail(new Error('Получен некорректный ответ сервера. Проверьте таблицу перед повторной отправкой.'));
        return;
      }
      finished = true;
      cleanup();
      resolve(result);
    };
    window.addEventListener('message', onMessage);
    timer = setTimeout(() => fail(new Error(
      'Подтверждение не получено. Запись могла сохраниться — проверьте таблицу или повторите отправку: дубль будет проверен.'
    )), 45000);
    try {
      document.body.append(frame, form);
      form.submit();
    } catch (error) { fail(error); }
  });
}

function saveWordLocally(word) {
  return rememberConfirmedSharedWord(word);
}

let addWordRequestPending = false;
async function confirmAddWord() {
  if (addWordRequestPending) return;
  const candidateWord = {
    char: addCharInput.value.trim(),
    pinyin: addPinyinInput.value.trim(),
    translation: addTranslationInput.value.trim()
  };
  if (!candidateWord.char || !candidateWord.pinyin || !candidateWord.translation) {
    addStatus.textContent = 'Заполните иероглиф, пиньинь и перевод';
    addStatus.className = 'add-status error';
    return;
  }
  if (candidateWord.char.length > 100 || candidateWord.pinyin.length > 300 || candidateWord.translation.length > 2000) {
    addStatus.textContent = 'Слишком длинное поле: максимум 100 символов для слова, 300 для пиньиня и 2000 для перевода.';
    addStatus.className = 'add-status error';
    return;
  }

  addWordRequestPending = true;
  dictionaryMutationEpoch++;
  const controls = [addConfirmBtn, addCancelBtn, addLookupBtn, addCharInput, addPinyinInput, addTranslationInput];
  const disabledBefore = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  addConfirmBtn.textContent = 'Проверяю и сохраняю…';
  addStatus.textContent = 'Проверяю наличие слова в Google Sheets…';
  addStatus.className = 'add-status loading';
  try {
    // Always check the live sheet, even if a matching local word already exists.
    const result = await sendWordToSheets(candidateWord);
    const localSaved = saveWordLocally(result.word);
    if (result.status === 'duplicate') {
      addStatus.textContent = 'Это слово уже есть в Google Sheets: ' + result.word.pinyin + ' — ' + result.word.translation;
      addStatus.className = 'add-status error';
      return;
    }
    addStatus.textContent = localSaved
      ? 'Слово сохранено в Google Sheets и локально'
      : 'Слово сохранено в Google Sheets. Локальную копию сохранить не удалось.';
    addStatus.className = 'add-status success';
    // Keep the confirmation visible. Do not erase a new entry with a delayed timer.
    addPreview.style.display = 'none';
    addCharOptions.style.display = 'none';
    addCharOptions.innerHTML = '';
    addCharInput.value = '';
    addPinyinInput.value = '';
    addTranslationInput.value = '';
  } catch (error) {
    addStatus.textContent = error.message || 'Не удалось подтвердить сохранение в Google Sheets.';
    addStatus.className = 'add-status error';
    // Preserve every field; neither a failed request nor an opaque response means success.
  } finally {
    addWordRequestPending = false;
    controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    addConfirmBtn.textContent = 'Добавить в Google Sheets';
    dictionaryMutationEpoch++;
    void refreshDictionaryFromSheets(true);
  }
}

// Live shared dictionary; old custom entries stay separate from the shared snapshot.
const SHARED_DICTIONARY_CACHE_KEY = SITE_CONFIG.sharedCacheKey;
const CUSTOM_WORDS_KEY = SITE_CONFIG.customWordsKey;
let sharedDictionaryWords = dictionary.map(word => ({ ...word }));
let sharedDictionaryVersion = null;
let dictionaryMutationEpoch = 0;
let dictionaryRefreshPromise = null;
let dictionaryRefreshAgain = false;

function validDictionaryWord(word) {
  return !!word && typeof word === 'object' && !Array.isArray(word) &&
    ['char', 'pinyin', 'translation'].every(field =>
      typeof word[field] === 'string' && normalizeWordField(word[field]).length > 0);
}

function uniqueDictionaryWords(words) {
  const keys = new Set();
  return words.filter(word => {
    const key = JSON.stringify([normalizeWordField(word.char), normalizeWordPinyin(word.pinyin), normalizeWordField(word.translation)]);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function readCustomDictionaryWords() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_WORDS_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return uniqueDictionaryWords(stored.filter(validDictionaryWord));
  } catch (error) {
    console.warn('Не удалось прочитать локальные слова:', error);
    return [];
  }
}

function storeSharedDictionarySnapshot() {
  try {
    localStorage.setItem(SHARED_DICTIONARY_CACHE_KEY, JSON.stringify({
      words: sharedDictionaryWords, version: sharedDictionaryVersion, savedAt: Date.now()
    }));
    return true;
  } catch (error) {
    console.warn('Не удалось сохранить офлайн-копию общего словаря:', error);
    return false;
  }
}

function rebuildWorkingDictionary() {
  const sharedKeys = new Set(sharedDictionaryWords.map(word => JSON.stringify([
    normalizeWordField(word.char), normalizeWordPinyin(word.pinyin), normalizeWordField(word.translation)
  ])));
  const local = readCustomDictionaryWords().filter(word => !sharedKeys.has(JSON.stringify([
    normalizeWordField(word.char), normalizeWordPinyin(word.pinyin), normalizeWordField(word.translation)
  ])));
  try { localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(local)); } catch (_) {}
  // Preserve the array reference and every active round; only the dictionary view is rendered.
  const merged = uniqueDictionaryWords([...sharedDictionaryWords, ...local]);
  dictionary.splice(0, dictionary.length, ...merged);
  const query = document.getElementById('dict-search').value;
  renderDictResults(searchDictionary(query));
}

function rememberConfirmedSharedWord(word) {
  if (!sharedDictionaryWords.some(existing => isExactWordMatch(existing, word))) {
    sharedDictionaryWords.push({ ...word });
  }
  sharedDictionaryVersion = null;
  const cached = storeSharedDictionarySnapshot();
  rebuildWorkingDictionary();
  return cached;
}

async function refreshDictionaryFromSheets(force = false) {
  if (document.hidden || navigator.onLine === false) return;
  if (addWordRequestPending || dictionaryRefreshPromise) {
    if (force) dictionaryRefreshAgain = true;
    return dictionaryRefreshPromise;
  }
  dictionaryRefreshAgain = false;
  const epoch = dictionaryMutationEpoch;
  dictionaryRefreshPromise = (async () => {
    try {
      const result = await requestSheets('getDictionary');
      // A read started before a write must never overwrite its confirmed word.
      if (epoch !== dictionaryMutationEpoch || addWordRequestPending) {
        dictionaryRefreshAgain = true;
        return;
      }
      if (result.version === sharedDictionaryVersion) return;
      sharedDictionaryWords = uniqueDictionaryWords(result.words.map(word => ({ ...word })));
      sharedDictionaryVersion = result.version;
      storeSharedDictionarySnapshot();
      rebuildWorkingDictionary();
    } catch (error) {
      // Failed/invalid reads leave the last good dictionary and the form untouched.
      console.warn('Синхронизация словаря отложена:', error.message || error);
    }
  })();
  try { await dictionaryRefreshPromise; } finally {
    dictionaryRefreshPromise = null;
    if (dictionaryRefreshAgain && !addWordRequestPending) {
      dictionaryRefreshAgain = false;
      if (!document.hidden && navigator.onLine !== false) {
        setTimeout(() => { void refreshDictionaryFromSheets(); }, 0);
      }
    }
  }
}

// On page load, remove exact duplicates from localStorage and merge remaining custom words.
(function initializeSharedDictionary() {
  try {
    const raw = localStorage.getItem(SHARED_DICTIONARY_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.words) && cached.words.every(validDictionaryWord) &&
          (cached.version === null || typeof cached.version === 'string')) {
        sharedDictionaryWords = uniqueDictionaryWords(cached.words);
        sharedDictionaryVersion = cached.version;
      }
    }
  } catch (error) { console.warn('Офлайн-копия словаря недоступна:', error); }
  rebuildWorkingDictionary();
  void refreshDictionaryFromSheets();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshDictionaryFromSheets(true);
  });
  window.addEventListener('online', () => { void refreshDictionaryFromSheets(true); });
})();


// Тренировочные раунды создаются при первом открытии раздела.
renderDictResults(dictionary);

// === TAB 8: Имена ===

const namesData = window.names || [];

function searchNames(query) {
  const q = query.trim().toLowerCase();
  if (!q) return namesData;

  const results = [];
  const seen = new Set();

  namesData.forEach(item => {
    let match = false;

    // Search by Chinese character
    if (item.char && item.char.includes(query.trim())) {
      match = true;
    }

    // Search by pinyin (with and without tones)
    if (item.pinyin) {
      const pinyinNorm = normalizePinyin(item.pinyin);
      const qNorm = normalizePinyin(q);
      if (pinyinNorm.includes(qNorm) || item.pinyin.toLowerCase().includes(q)) {
        match = true;
      }
    }

    // Search by Russian translation
    if (item.translation) {
      const transNorm = normalize(item.translation);
      const qTransNorm = normalize(q);
      if (transNorm.includes(qTransNorm)) {
        match = true;
      }
    }

    if (match) {
      const key = item.char + '|' + item.pinyin + '|' + item.translation;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    }
  });

  return results;
}

function renderNamesResults(results) {
  const container = document.getElementById('names-results');
  if (!container) return;
  if (results.length === 0) {
    container.innerHTML = '<div class="dict-empty">Ничего не найдено. Попробуйте другой запрос.</div>';
    return;
  }
  container.innerHTML = '';
  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'dict-item';
    const info = makeElement('div', 'dict-info');
    info.append(
      makeElement('div', 'dict-pinyin', item.pinyin || '—'),
      makeElement('div', 'dict-translation', item.translation)
    );
    div.append(
      makeElement('div', 'dict-char', item.char),
      makeSpeakButton(item.char, 'speak-btn-sm'),
      info
    );
    container.appendChild(div);
  });
}

const namesSearchInput = document.getElementById('names-search');
if (namesSearchInput) {
  namesSearchInput.addEventListener('input', (e) => {
    const results = searchNames(e.target.value);
    renderNamesResults(results);
  });
  // Show all names initially
  renderNamesResults(namesData);
}

// === TAB 7: Тест ===

let testQuestions = [];
let testCurrentIdx = 0;
let testScore = 0;
let testCount = 10;
let testPool = 'all';
let testMainQuestions = [];
let testIsReinforcement = false;
let testSoundEnabled = true;
let testVersion = 0;
const testTimers = new Set();

function cancelTestPending() {
  testVersion++;
  for (const timer of testTimers) clearTimeout(timer);
  testTimers.clear();
  if (typeof responsiveVoice !== 'undefined') responsiveVoice.cancel();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function setTestTimer(callback, delay, version) {
  const timer = setTimeout(() => {
    testTimers.delete(timer);
    if (version === testVersion) callback();
  }, delay);
  testTimers.add(timer);
  return timer;
}

// Keep both settings panels aligned; 25 recent words support tests of 10 or 25.
function syncTestSettings(count, pool) {
  count = [10, 25, 50].includes(Number(count)) ? Number(count) : 10;
  pool = ['all', '25', '50', '100'].includes(pool) ? pool : 'all';
  if (count > 25 && pool === '25') pool = 'all';
  for (const suffix of ['', '2']) {
    document.getElementById('test-count' + suffix).value = String(count);
    const poolSelect = document.getElementById('test-pool' + suffix);
    poolSelect.querySelector('option[value="25"]').disabled = count > 25;
    poolSelect.value = pool;
  }
  return { count, pool };
}

function startTest(settingsSuffix = '') {
  cancelTestPending();
  const settings = syncTestSettings(
    document.getElementById('test-count' + settingsSuffix).value,
    document.getElementById('test-pool' + settingsSuffix).value
  );
  testCount = settings.count;
  testPool = settings.pool;
  const pool = testPool === 'all' ? dictionary : dictionary.slice(-Number(testPool));
  if (pool.length === 0) {
    restartTest();
    document.getElementById('test-start-status').textContent = 'В словаре пока нет слов для теста.';
    return;
  }
  testQuestions = shuffle(pool).slice(0, Math.min(testCount, pool.length)).map(item => {
    const distractors = shuffle(dictionary.filter(d => d.translation !== item.translation)).slice(0, 3);
    const options = shuffle([item, ...distractors]).map(d => d.translation);
    return { char: item.char, pinyin: item.pinyin || '—', correct: item.translation, options: options, userAnswer: null, isCorrect: false };
  });
  testCurrentIdx = 0;
  testScore = 0;
  testMainQuestions = [];
  testIsReinforcement = false;
  document.getElementById('test-start-status').textContent = '';
  document.getElementById('test-results-list').innerHTML = '';
  document.getElementById('test-start').style.display = 'none';
  document.getElementById('test-result').style.display = 'none';
  document.getElementById('test-quiz').style.display = 'block';
  renderTestQuestion(false);
}

function restartTest() {
  cancelTestPending();
  testQuestions = [];
  testMainQuestions = [];
  testCurrentIdx = 0;
  testScore = 0;
  testIsReinforcement = false;
  document.getElementById('test-quiz').style.display = 'none';
  document.getElementById('test-result').style.display = 'none';
  document.getElementById('test-start').style.display = 'block';
  document.getElementById('test-start-status').textContent = '';
  document.getElementById('test-results-list').innerHTML = '';
}

function updateTestPrevButton() {
  const prevBtn = document.getElementById('test-prev-btn');
  if (prevBtn) {
    prevBtn.disabled = testCurrentIdx <= 0;
  }
}

function renderTestQuestion(isReview) {
  cancelTestPending();
  const q = testQuestions[testCurrentIdx];
  const container = document.getElementById('test-card-container');
  container.innerHTML = '';

  const fill = document.getElementById('test-progress-fill');
  const text = document.getElementById('test-progress-text');
  fill.style.width = ((testCurrentIdx) / testQuestions.length * 100) + '%';
  text.textContent = (testIsReinforcement ? 'Закрепление: вопрос ' : 'Вопрос ') +
    (testCurrentIdx + 1) + ' из ' + testQuestions.length;

  updateTestPrevButton();

  const card = document.createElement('div');
  card.className = 'test-card';

  const charDiv = document.createElement('div');
  charDiv.className = 'test-char';
  charDiv.textContent = q.char;

  // If reviewing or already answered, show pinyin and make char clickable
  if (isReview || q.userAnswer !== null) {
    charDiv.classList.add('test-char-clickable');
    charDiv.title = 'Нажмите, чтобы прослушать';
    charDiv.addEventListener('click', () => speakChinese(q.char));
  }
  card.appendChild(charDiv);

  if (isReview || q.userAnswer !== null) {
    const pinyinDiv = document.createElement('div');
    pinyinDiv.className = 'test-pinyin';
    pinyinDiv.textContent = q.pinyin;
    card.appendChild(pinyinDiv);
  }

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'test-options';

  q.options.forEach(opt => {
    const btn = document.createElement('div');
    btn.className = 'test-option';
    btn.textContent = opt;

    if (q.userAnswer !== null) {
      // Already answered — show result state
      btn.classList.add('disabled');
      if (opt === q.correct) {
        btn.classList.add('correct');
      } else if (opt === q.userAnswer) {
        btn.classList.add('wrong');
      }
    } else {
      btn.addEventListener('click', () => handleTestAnswer(btn, opt, q));
    }
    optionsDiv.appendChild(btn);
  });

  card.appendChild(optionsDiv);

  // If reviewing a previous card, add a "Next" button to go forward
  if (isReview || q.userAnswer !== null) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'test-next-btn';
    nextBtn.textContent = 'Следующая →';
    nextBtn.addEventListener('click', () => {
      if (testQuestions[testCurrentIdx] !== q) return;
      cancelTestPending();
      testCurrentIdx++;
      if (testCurrentIdx < testQuestions.length) {
        renderTestQuestion(testQuestions[testCurrentIdx].userAnswer !== null);
      } else {
        showTestResult();
      }
    });
    card.appendChild(nextBtn);
  }

  container.appendChild(card);
}

function speakChineseWithCallback(text, onEnd) {
  if (typeof responsiveVoice !== 'undefined') {
    responsiveVoice.cancel();
    responsiveVoice.speak(text, 'Chinese Female', {rate: 0.72, onend: onEnd});
  } else if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.72;
    u.onend = onEnd;
    u.onerror = onEnd;
    speechSynthesis.speak(u);
  } else {
    onEnd();
  }
}

function handleTestAnswer(btn, selected, q) {
  if (q.userAnswer !== null || testQuestions[testCurrentIdx] !== q) return;
  const version = testVersion;
  const allOptions = btn.parentElement.querySelectorAll('.test-option');
  allOptions.forEach(o => o.classList.add('disabled'));

  q.userAnswer = selected;
  if (selected === q.correct) {
    btn.classList.add('correct');
    q.isCorrect = true;
    if (!testIsReinforcement) testScore++;
  } else {
    btn.classList.add('wrong');
    q.isCorrect = false;
    allOptions.forEach(o => { if (o.textContent === q.correct) o.classList.add('correct'); });
  }

  // Show pinyin below the character
  const card = btn.closest('.test-card');
  const charDiv = card.querySelector('.test-char');
  const pinyinDiv = document.createElement('div');
  pinyinDiv.className = 'test-pinyin';
  pinyinDiv.textContent = q.pinyin;
  charDiv.insertAdjacentElement('afterend', pinyinDiv);

  // Make character clickable for audio
  charDiv.classList.add('test-char-clickable');
  charDiv.title = 'Нажмите, чтобы прослушать';
  charDiv.addEventListener('click', () => speakChinese(q.char));

  function advance() {
    if (version !== testVersion || testQuestions[testCurrentIdx] !== q) return;
    testCurrentIdx++;
    if (testCurrentIdx < testQuestions.length) {
      renderTestQuestion(testQuestions[testCurrentIdx].userAnswer !== null);
    } else {
      showTestResult();
    }
  }

  if (testSoundEnabled) {
    let advanced = false;
    let fallbackTimer = null;
    function doAdvance() {
      if (advanced || version !== testVersion) return;
      advanced = true;
      clearTimeout(fallbackTimer);
      testTimers.delete(fallbackTimer);
      setTestTimer(advance, 500, version);
    }
    fallbackTimer = setTestTimer(doAdvance, 8000, version);
    speakChineseWithCallback(q.char, doAdvance);
  } else {
    setTestTimer(advance, 1000, version);
  }
}

function showTestResult() {
  cancelTestPending();
  // Keep the first attempt intact, even across several reinforcement rounds.
  if (!testIsReinforcement) testMainQuestions = testQuestions.slice();
  const mistakes = testQuestions.filter(q => !q.isCorrect);
  if (mistakes.length > 0) {
    testQuestions = shuffle(mistakes).map(q => ({
      ...q,
      options: shuffle(q.options),
      userAnswer: null,
      isCorrect: false
    }));
    testCurrentIdx = 0;
    testIsReinforcement = true;
    renderTestQuestion(false);
    return;
  }
  document.getElementById('test-quiz').style.display = 'none';
  const resultDiv = document.getElementById('test-result');
  const scoreDiv = document.getElementById('test-score');
  const msgDiv = document.getElementById('test-msg');
  const listDiv = document.getElementById('test-results-list');
  const total = testMainQuestions.length;

  scoreDiv.textContent = 'Основной тест: ' + testScore + ' / ' + total;
  if (testScore === total) { scoreDiv.className = 'test-result-score score-green'; msgDiv.textContent = 'Идеально! 🎉'; }
  else if (testScore >= Math.ceil(total * 0.7)) { scoreDiv.className = 'test-result-score score-orange'; msgDiv.textContent = 'Хороший результат!'; }
  else { scoreDiv.className = 'test-result-score score-red'; msgDiv.textContent = 'Нужно больше практики'; }

  if (testIsReinforcement) msgDiv.textContent += ' Закрепление завершено ✓';

  listDiv.innerHTML = '';
  testMainQuestions.forEach(q => {
    const row = document.createElement('div');
    row.className = 'result-row ' + (q.isCorrect ? 'ok' : 'err');
    const charPinyin = makeElement('div', 'result-char-pinyin');
    charPinyin.append(
      makeElement('div', 'result-char', q.char),
      makeElement('div', 'result-pinyin', q.pinyin)
    );
    row.append(
      makeElement('div', 'result-mark', q.isCorrect ? '✓' : '✗'),
      charPinyin,
      makeElement('div', 'result-translation', q.correct)
    );
    listDiv.appendChild(row);
  });

  syncTestSettings(testCount, testPool);

  resultDiv.style.display = 'block';
}

for (const suffix of ['', '2']) {
  for (const field of ['test-count', 'test-pool']) {
    document.getElementById(field + suffix).addEventListener('change', () => {
      syncTestSettings(
        document.getElementById('test-count' + suffix).value,
        document.getElementById('test-pool' + suffix).value
      );
    });
  }
}
syncTestSettings(testCount, testPool);

document.getElementById('test-start-btn').addEventListener('click', () => startTest());
document.getElementById('test-restart-btn').addEventListener('click', () => startTest('2'));
document.getElementById('test-restart-during-btn').addEventListener('click', restartTest);

// Sound toggle button
document.getElementById('test-sound-toggle').addEventListener('click', function() {
  testSoundEnabled = !testSoundEnabled;
  this.textContent = testSoundEnabled ? '🔊' : '🔇';
  if (!testSoundEnabled) {
    this.classList.add('muted');
  } else {
    this.classList.remove('muted');
  }
});

// Previous card button
document.getElementById('test-prev-btn').addEventListener('click', function() {
  if (testCurrentIdx > 0) {
    cancelTestPending();
    testCurrentIdx--;
    renderTestQuestion(testQuestions[testCurrentIdx].userAnswer !== null);
  }
});


// После установки новой версии SW один раз загружаем актуальный комплект файлов.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch(error => console.warn('Не удалось включить офлайн-режим:', error));
  });
}

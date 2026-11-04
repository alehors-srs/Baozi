/* Run: node --test tests/test_sentences.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['words.js', 'names.js', 'sentence-grammar-hsk1.js', 'sentence-lexicon.js', 'sentence-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const w = context.window;
const engine = w.SentenceEngine;
const catalog = engine.buildCatalog(w.dictionary, w.names, w.SENTENCE_LEXICON, w.SENTENCE_GRAMMAR_HSK1);
const find = (id, prompt) => {
  const q = catalog.find(q => q.ruleId === id && q.prompt === prompt);
  assert.ok(q, `${id}: ${prompt}`);
  return q;
};

test('all twelve constructions available and all generated answers pass', () => {
  assert.equal(new Set(catalog.map(q => q.ruleId)).size, 12);
  for (const q of catalog) {
    assert.ok(!q.prompt.includes('undefined'));
    for (const a of q.answers) {
      assert.equal(engine.check(q, a).status, 'correct');
      assert.equal(engine.check(q, a.split('').join(' ') + '。').status, 'correct');
    }
  }
});

test('time variants and synonyms accepted, known bad order explained', () => {
  const q = find('time', 'Я сегодня читаю книгу.');
  for (const a of ['我今天看书', '今天我看书', '我今天读书', '今天我读书']) {
    assert.equal(engine.check(q, a).status, 'correct');
  }
  assert.equal(engine.check(q, '我读书今天').status, 'wrong');
});

test('meaning and negation retained; unrecognized translations not called grammar errors', () => {
  const q = find('shi', 'Я — учитель.');
  for (const a of ['他是老师', '我不是老师', '我是学生']) assert.notEqual(engine.check(q, a).status, 'correct');
  assert.equal(engine.check(q, '我是学生').status, 'unknown');
  assert.equal(engine.check(q, '我老师').status, 'wrong');
  assert.equal(engine.check(q, '').status, 'empty');
  assert.equal(engine.check(q, 'wo shi laoshi').status, 'invalid');
  assert.equal(engine.check(q, '我是，老师').status, 'invalid');
});

test('questions, possessives, counters and Russian inflections', () => {
  const q = find('shi-question', 'Ты — учитель?');
  assert.equal(engine.check(q, '你是老师吗？').status, 'correct');
  assert.equal(engine.check(q, '你是不是老师').status, 'correct');
  assert.equal(engine.check(q, '你是老师').status, 'wrong');
  assert.equal(engine.check(find('whose', 'Это моя книга.'), '这是我的书').status, 'correct');
  assert.equal(engine.check(find('count-books', 'У меня есть две книги.'), '我有两书').status, 'wrong');
  find('want', 'Ты хочешь пить чай.');
  find('ability', 'Она умеет говорить по-китайски.');
});

test('current dictionary and names are authoritative; no absent content words generated', () => {
  const without = (...chars) => w.dictionary.filter(x => !chars.includes(x.char));
  const build = (words, names = []) => engine.buildCatalog(words, names, w.SENTENCE_LEXICON, w.SENTENCE_GRAMMAR_HSK1);
  assert.equal(build([]).length, 0);
  assert.equal(build(without('喝')).some(q => q.answers.some(a => a.includes('喝'))), false);
  assert.equal(build(without('想')).some(q => q.ruleId === 'want'), false);
  assert.equal(build(without('不')).some(q => q.answers.some(a => a.includes('不'))), false);
  assert.equal(build(without('的', '吗')).some(q => q.answers.some(a => a.includes('吗'))), true);
  assert.equal(build(w.dictionary).some(q => q.answers.some(a => a.includes('李月'))), false);
  assert.equal(catalog.some(q => q.answers.some(a => a.includes('李月'))), true);
  const noRead = build(without('读'));
  assert.equal(noRead.some(q => q.answers.some(a => a.includes('读书'))), false);
});

test('rounds are diverse, unique, bounded, and do not mutate catalog', () => {
  const length = catalog.length;
  for (const count of [10, 25]) {
    const round = engine.makeRound(catalog, count);
    assert.equal(round.length, count);
    assert.equal(new Set(round.map(q => q.prompt)).size, count);
    assert.ok(new Set(round.map(q => q.ruleId)).size >= Math.min(count, 12));
  }
  assert.equal(catalog.length, length);
  assert.equal(engine.makeRound([], 10).length, 0);
  assert.equal(engine.makeRound(catalog.slice(0, 2), 10).length, 2);
});

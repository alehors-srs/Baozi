import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RoundJob, CheckJob, MODEL, prepareDictionary, validCard, sealSession, openSession, generateRound, checkTranslation } from '../src/trainer.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const source = [
  ['我', 'wǒ', 'я'], ['你', 'nǐ', 'ты'], ['他', 'tā', 'он'],
  ['喝', 'hē', 'пить'], ['喜欢', 'xǐhuan', 'любить'], ['茶', 'chá', 'чай'], ['水', 'shuǐ', 'вода']
].map(([char, pinyin, translation]) => ({ char, pinyin, translation }));
const words = prepareDictionary(source);
const cards = [];
for (let subject = 0; subject < 3; subject++) {
  for (let verb = 3; verb < 5; verb++) {
    for (let noun = 5; noun < 7; noun++) {
      const tokens = [subject, verb, noun];
      cards.push({ ru: `${source[subject].translation} ${source[verb].translation} ${source[noun].translation}.`,
        zh: tokens.map(id => source[id].char).join('') + '。', tokens: tokens.map(id => 'w' + id), grammar: 'Подлежащее, сказуемое, дополнение.' });
    }
  }
}
cards.splice(10);
const env = { DEEPSEEK_API_KEY: 'test-secret-not-real', REQUEST_LIMITER: { limit: async () => ({ success: true }) },
  GENERATION_LIMITER: { limit: async () => ({ success: true }) } };
const signal = () => new AbortController().signal;
function response(value) { return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }); }
function mockQueue(values) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.thinking.type, 'disabled');
    assert.equal(body.response_format.type, 'json_object');
    const value = values.shift();
    if (value === undefined) throw new Error('Unexpected upstream call');
    return value instanceof Response ? value : response(value);
  };
  return calls;
}
function api(path, body, origin = 'https://alehors-srs.github.io') {
  return new Request('https://test.workers.dev' + path, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) });
}
const session = () => ({ v: 1, site: 'baozi', exp: Date.now() + 600000, words, cards });
const verdict = () => ({ meaningCorrect: true, grammarCorrect: true, vocabularyAllowed: true,
  tokens: cards[0].tokens, outsideWords: [], feedback: 'Правильный перевод.' });

test('whole dictionary entries only: known compound does not permit its individual characters', () => {
  const compoundWords = prepareDictionary([
    { char: '你好', pinyin: 'nǐhǎo', translation: 'привет' }, ...source.slice(3)
  ]);
  assert.equal(validCard({ ru: 'Привет, чай.', zh: '你茶', tokens: ['w0', 'w3'], grammar: 'Описание' }, compoundWords), false);
  assert.equal(validCard({ ...cards[0], zh: '我喝茶吗。' }, words), false);
  assert.equal(validCard({ ...cards[0], tokens: ['w0', 'w3', 'invented'] }, words), false);
  assert.equal(validCard({ ...cards[0], zh: '我 喝，茶！' }, words), true);
  assert.equal(validCard({ ...cards[0], zh: '我喝茶abc。' }, words), false);
});
test('dictionary validation rejects oversized and malformed data', () => {
  assert.throws(() => prepareDictionary([...source, { char: '新', pinyin: '', translation: '' }]), /словаре/);
  assert.throws(() => prepareDictionary([...source, { char: '电 脑', pinyin: '', translation: 'компьютер' }]), /пробелов/);
  assert.throws(() => prepareDictionary(Array(1001).fill(source[0])), /1000/);
  assert.equal(prepareDictionary([...source, source[0]]).length, source.length);
});
test('AES-GCM round cannot be read, altered, used by another site, or used after expiry', async () => {
  const payload = session();
  const token = await sealSession(payload, env.DEEPSEEK_API_KEY);
  assert.equal(token.includes('我'), false);
  assert.deepEqual(await openSession(token, env.DEEPSEEK_API_KEY, 'baozi'), payload);
  await assert.rejects(openSession(token, env.DEEPSEEK_API_KEY, 'chinese-quiz'), /недействителен/);
  await assert.rejects(openSession(token, 'different-secret', 'baozi'), /недействителен/);
  const [iv, ciphertext] = token.split('.');
  const tampered = iv + '.' + (ciphertext[0] === 'a' ? 'b' : 'a') + ciphertext.slice(1);
  await assert.rejects(openSession(tampered, env.DEEPSEEK_API_KEY, 'baozi'), /недействителен/);
  await assert.rejects(openSession(await sealSession({ ...payload, exp: 0 }, env.DEEPSEEK_API_KEY), env.DEEPSEEK_API_KEY, 'baozi'), /истёк/);
});
test('generation audits every card, returns ten exercises and fixes the model', async () => {
  const calls = mockQueue([{ cards }, { reviews: cards.map((_, index) => ({ index, valid: true, level: 'easy', reason: 'Верно' })) }, { cards: [] }]);
  assert.equal((await generateRound(words, env, signal())).length, 10);
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(calls[0].messages[1].content).mix, { easy: 3, medium: 4, hard: 3 });
  assert.deepEqual(JSON.parse(calls[2].messages[1].content).mix, { easy: 0, medium: 4, hard: 3 });
  assert.equal(MODEL, 'deepseek-flash');
  assert.match(calls[1].messages[0].content, /artificial segmentation/);
  assert.match(calls[0].messages[0].content, /NO fixed grammar catalogue/);
});
test('unknown particle and duplicated prompts are removed before audit', async () => {
  const calls = mockQueue([{ cards: [{ ...cards[0], zh: cards[0].zh + '吗' }, cards[0], cards[0], ...cards.slice(1)] },
    { reviews: cards.map((_, index) => ({ index, valid: true, level: 'easy', reason: 'Верно' })) }, { cards: [] }]);
  const generated = await generateRound(words, env, signal());
  assert.equal(generated.length, 10);
  assert.equal(JSON.parse(calls[1].messages[1].content).cards.length, 10);
});
test('AI rejects an artificial compound even when low-level token matching passes', async () => {
  mockQueue(Array.from({ length: 3 }, () => [{ cards },
    { reviews: cards.map((_, index) => ({ index, valid: false, reason: 'Искусственное деление слова' })) }]).flat());
  await assert.rejects(generateRound(words, env, signal()), error => error.status === 422);
});
test('missing or duplicate audit approvals are never accepted; retries are bounded', async () => {
  const invalid = { reviews: [{ index: 0, valid: true, level: 'easy', reason: 'Верно' }, { index: 0, valid: true, level: 'easy', reason: 'Верно' }] };
  const calls = mockQueue([{ cards }, invalid, { cards }, invalid, { cards }, invalid]);
  await assert.rejects(generateRound(words, env, signal()), error => error.code === 'INSUFFICIENT_EXERCISES');
  assert.equal(calls.length, 6);
});
test('alternate valid translation and punctuation accepted by AI and whole-token validation', async () => {
  mockQueue([verdict()]);
  const checked = await checkTranslation(session(), 0, '我 喝，茶！', env, signal());
  assert.equal(checked.correct, true); assert.equal(checked.reference, cards[0].zh);
});
test('words outside dictionary are reported separately, even if meaning and grammar are correct', async () => {
  mockQueue([{ ...verdict(), vocabularyAllowed: false, outsideWords: ['咖啡'], tokens: ['w0', 'w3'] }]);
  const checked = await checkTranslation(session(), 0, '我喝咖啡', env, signal());
  assert.equal(checked.correct, false); assert.equal(checked.grammarCorrect, true);
  assert.deepEqual(checked.outsideWords, ['咖啡']);
});
test('contradictory vocabulary verdict is a retryable service failure', async () => {
  mockQueue([verdict()]);
  await assert.rejects(checkTranslation(session(), 0, '我喝茶吗', env, signal()), error => error.code === 'MODEL_FORMAT');
});
test('grammar errors produce an incorrect grade without requiring a grammar catalogue', async () => {
  mockQueue([{ ...verdict(), grammarCorrect: false, tokens: ['w3', 'w0', 'w5'], feedback: 'Поменяйте порядок слов.' }]);
  const checked = await checkTranslation(session(), 0, '喝我茶', env, signal());
  assert.equal(checked.correct, false); assert.equal(checked.vocabularyAllowed, true);
});
test('unavailable service, invalid JSON and truncated responses are not student mistakes', async () => {
  for (const value of [new Response('', { status: 402 }), new Response('', { status: 429 }),
    Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'broken' } }] }), response(null)]) {
    mockQueue([value]);
    await assert.rejects(checkTranslation(session(), 0, cards[0].zh, env, signal()), error => error.status >= 500);
  }
});
test('GET health, OPTIONS and bad origin do not call DeepSeek', async () => {
  const calls = mockQueue([]);
  const health = await worker.fetch(new Request('https://test.workers.dev/'), env);
  assert.equal((await health.json()).model, MODEL);
  const options = await worker.fetch(new Request('https://test.workers.dev/sentences/generate', { method: 'OPTIONS', headers: { Origin: 'https://alehors-srs.github.io' } }), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), 'https://alehors-srs.github.io');
  assert.equal((await worker.fetch(api('/sentences/generate', {}, 'https://bad.test'), env)).status, 403);
  assert.equal(calls.length, 0);
});
test('unconfigured limiter fails closed and denied IP never calls model', async () => {
  const calls = mockQueue([]);
  assert.equal((await worker.fetch(api('/sentences/generate', { site: 'baozi', words: source }), { DEEPSEEK_API_KEY: 'x' })).status, 503);
  const limitedEnv = { ...env, REQUEST_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await worker.fetch(api('/sentences/generate', { site: 'baozi', words: source }), limitedEnv);
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(calls.length, 0);
});
test('API generation hides references; session cannot be supplied to other site', async () => {
  mockQueue([{ cards }, { reviews: cards.map((_, index) => ({ index, valid: true, level: 'easy', reason: 'Верно' })) }, { cards: [] }, verdict()]);
  const generated = await worker.fetch(api('/sentences/generate', { site: 'baozi', words: source }), env);
  assert.equal(generated.status, 200);
  const round = await generated.json();
  assert.deepEqual(Object.keys(round.cards[0]).sort(), ['id', 'ru']);
  const rejected = await worker.fetch(api('/sentences/check', { site: 'chinese-quiz', token: round.token, index: 0, answer: cards[0].zh }), env);
  assert.equal(rejected.status, 400);
  const checked = await worker.fetch(api('/sentences/check', { site: 'baozi', token: round.token, index: 0, answer: cards[0].zh }), env);
  assert.equal(checked.status, 200); assert.equal((await checked.json()).correct, true);
});
test('malformed, oversized and unknown-site requests never reach the model', async () => {
  const calls = mockQueue([]);
  assert.equal((await worker.fetch(api('/sentences/generate', { site: 'other', words: source }), env)).status, 400);
  assert.equal((await worker.fetch(api('/sentences/generate', { site: 'baozi', words: source, junk: 'x'.repeat(310000) }), env)).status, 413);
  assert.equal((await worker.fetch(api('/sentences/generate', null), env)).status, 400);
  assert.equal(calls.length, 0);
});

test('mixed round fills verified quotas and uses medium cards before surplus easy ones', async () => {
  const longer = (card, length) => {
    const tokens = Array.from({ length }, (_, index) => card.tokens[index % card.tokens.length]);
    const zh = tokens.map(id => words.find(word => word.id === id).char).join('');
    return { ...card, tokens, zh };
  };
  const candidates = cards.map((card, index) => index < 3 ? card : longer(card, index < 7 ? 6 : 9));
  const reviews = levels => ({ reviews: levels.map((level, index) => ({ index, valid: true, level, reason: 'Верно' })) });
  const levels = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];
  const calls = mockQueue([{ cards: candidates }, reviews(levels)]);
  assert.deepEqual((await generateRound(words, env, signal())).map(card => card.tokens.length), [3, 3, 3, 6, 6, 6, 6, 9, 9, 9]);
  assert.equal(calls.length, 2);

  // A long list rated medium cannot satisfy a hard quota, but can be used as a fallback.
  const fallbackCalls = mockQueue([{ cards: candidates }, reviews(levels.map(level => level === 'hard' ? 'medium' : level)),
    { cards: [] }]);
  assert.equal((await generateRound(words, env, signal())).length, 10);
  assert.deepEqual(JSON.parse(fallbackCalls[2].messages[1].content).mix, { easy: 0, medium: 0, hard: 3 });
});

test('last attempt fills missing cards without a difficulty quota and still audits every candidate', async () => {
  const approve = cards => ({ reviews: cards.map((_, index) => ({ index, valid: true, level: 'easy', reason: 'Верно' })) });
  const first = cards.slice(0, 8);
  const final = cards.slice(8);
  const calls = mockQueue([{ cards: first }, approve(first), { cards: [] },
    { cards: [first[0], ...final] }, approve(final)]);
  const selected = await generateRound(words, env, signal());
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map(card => card.zh)).size, 10);
  const mixed = JSON.parse(calls[0].messages[1].content);
  assert.equal(mixed.count, 13);
  const fill = JSON.parse(calls[3].messages[1].content);
  assert.equal(fill.mode, 'fill');
  assert.equal(fill.count, 7);
  assert.equal(fill.mix, undefined);
  assert.equal(fill.excluded.length, 8);
  assert.deepEqual(JSON.parse(calls[4].messages[1].content).cards, final);
});

test('background job starts without calling DeepSeek and survives repeated starts and polls', async () => {
  const instances = new Map();
  let generationLimits = 0;
  const jobEnv = { ...env, GENERATION_LIMITER: { limit: async () => {
    generationLimits++;
    return { success: true };
  } } };
  jobEnv.ROUND_JOBS = {
    idFromName: name => name,
    get(name) {
      if (!instances.has(name)) {
        const values = new Map();
        let alarm = null;
        const storage = {
          get: async key => values.get(key),
          put: async (key, value) => values.set(key, value),
          setAlarm: async time => { alarm = time; },
          transaction: callback => callback(storage)
        };
        const job = new RoundJob({ storage, blockConcurrencyWhile: callback => callback() }, jobEnv);
        instances.set(name, { job, alarm: () => alarm, fetch: (url, init) => job.fetch(new Request(url, init)) });
      }
      return instances.get(name);
    }
  };
  const jobId = crypto.randomUUID();
  const body = { site: 'baozi', jobId, words: source };
  const reviews = cards.map((_, index) => ({ index, valid: true, level: 'easy', reason: 'Верно' }));
  const calls = mockQueue([{ cards }, { reviews }, { cards: [] }]);
  const send = (path, data = body) => worker.fetch(api('/sentences/' + path, data), jobEnv);
  assert.equal((await send('start')).status, 202);
  assert.equal((await send('start')).status, 202);
  assert.equal((await send('status', { site: 'baozi', jobId })).status, 202);
  assert.equal((await send('status', { site: 'chinese-quiz', jobId })).status, 404);
  assert.equal(calls.length, 0);
  assert.equal(generationLimits, 1);
  const instance = instances.get('baozi:' + jobId);
  assert.ok(instance.alarm());
  await instance.job.alarm();
  const response = await send('status', { site: 'baozi', jobId });
  assert.equal(response.status, 200);
  const { status, round } = await response.json();
  assert.equal(status, 'done');
  assert.equal(round.cards.length, 10);
  assert.deepEqual(Object.keys(round.cards[0]).sort(), ['id', 'ru']);
  assert.equal((await send('start')).status, 200);
  assert.equal(calls.length, 3);
  assert.equal(generationLimits, 1);
});

function checkHarness() {
  const instances = new Map();
  const jobEnv = { ...env };
  jobEnv.CHECK_JOBS = {
    idFromName: name => name,
    get(name) {
      if (!instances.has(name)) {
        const values = new Map();
        let alarm = null, lock = Promise.resolve(), rejectResult = false;
        const storage = {
          get: async key => structuredClone(values.get(key)),
          put: async (key, value) => {
            if (rejectResult && value.status === 'done') throw new Error('storage interrupted');
            values.set(key, structuredClone(value));
          },
          setAlarm: async time => { alarm = time; },
          deleteAll: async () => { values.clear(); alarm = null; },
          transaction: callback => callback(storage)
        };
        const ctx = { storage, blockConcurrencyWhile(callback) {
          const next = lock.then(callback); lock = next.catch(() => {}); return next;
        } };
        const item = { job: new CheckJob(ctx, jobEnv), storage, alarm: () => alarm,
          interruptWrite: () => { rejectResult = true; },
          revive: () => { item.job = new CheckJob(ctx, jobEnv); },
          fetch: (url, init) => item.job.fetch(new Request(url, init)) };
        instances.set(name, item);
      }
      return instances.get(name);
    }
  };
  return { instances, env: jobEnv, send: (route, body) => worker.fetch(api('/sentences/check/' + route, body), jobEnv) };
}
async function checkBody(overrides = {}) {
  return { site: 'baozi', token: await sealSession(session(), env.DEEPSEEK_API_KEY),
    checkId: crypto.randomUUID(), index: 0, answer: cards[0].zh, ...overrides };
}
test('check has one durable identity: repeated/concurrent starts and lost results call DeepSeek once', async () => {
  const h = checkHarness(), body = await checkBody();
  const calls = mockQueue([verdict()]);
  const starts = await Promise.all(Array.from({ length: 5 }, () => h.send('start', body)));
  assert.ok(starts.every(r => r.status === 202)); assert.equal(calls.length, 0);
  const item = h.instances.get('baozi:' + body.checkId);
  assert.ok(item.alarm());
  let release;
  const upstream = globalThis.fetch;
  globalThis.fetch = async (...args) => { await new Promise(resolve => { release = resolve; }); return upstream(...args); };
  const running = item.job.alarm();
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await h.send('start', body)).status, 202);
  assert.equal((await h.send('status', body)).status, 202);
  assert.equal((await item.storage.get('job')).status, 'running');
  release(); await running;
  // Simulate losing the first result and recreating the DO instance from persisted storage.
  await h.send('status', body); item.revive();
  for (const route of ['status', 'start', 'status']) {
    const response = await h.send(route, body);
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.status, 'done'); assert.equal(result.verdict.correct, true);
  }
  await item.job.alarm(); assert.equal(calls.length, 1);
  const saved = await item.storage.get('job');
  assert.equal(saved.session, undefined); assert.equal(saved.answer, undefined);
});
test('check IDs are bound to round, answer, card and site; status never creates a job', async () => {
  const h = checkHarness(), body = await checkBody(); const calls = mockQueue([]);
  assert.equal((await h.send('status', body)).status, 404);
  assert.equal(await h.instances.get('baozi:' + body.checkId).storage.get('job'), undefined);
  assert.equal((await h.send('start', body)).status, 202);
  for (const changed of [{ answer: '你喝茶' }, { index: 1 }, { token: await sealSession(session(), env.DEEPSEEK_API_KEY) }]) {
    assert.equal((await h.send('start', { ...body, ...changed })).status, 409);
    assert.equal((await h.send('status', { ...body, ...changed })).status, 409);
  }
  assert.equal((await h.send('status', { ...body, site: 'chinese-quiz' })).status, 400);
  const token = await sealSession({ ...session(), site: 'chinese-quiz' }, env.DEEPSEEK_API_KEY);
  assert.equal((await h.send('status', { ...body, site: 'chinese-quiz', token })).status, 404);
  assert.equal((await h.send('start', { ...body, checkId: 'bad' })).status, 400);
  assert.equal(calls.length, 0);
});
test('terminal upstream error is cached; only an explicit new checkId starts another model call', async () => {
  const h = checkHarness(), body = await checkBody();
  const calls = mockQueue([new Response('', { status: 503 }), verdict()]);
  await h.send('start', body); await h.instances.get('baozi:' + body.checkId).job.alarm();
  for (const route of ['status', 'start', 'status']) {
    const result = await (await h.send(route, body)).json();
    assert.equal(result.status, 'failed'); assert.equal(result.code, 'UPSTREAM');
  }
  assert.equal(calls.length, 1);
  const next = { ...body, checkId: crypto.randomUUID() };
  await h.send('start', next); await h.instances.get('baozi:' + next.checkId).job.alarm();
  assert.equal((await (await h.send('status', next)).json()).status, 'done'); assert.equal(calls.length, 2);
});
test('interrupted storage commit/alarm replay never silently repeats a paid check', async () => {
  const h = checkHarness(), body = await checkBody(); const calls = mockQueue([verdict()]);
  await h.send('start', body); const item = h.instances.get('baozi:' + body.checkId);
  item.interruptWrite(); await assert.rejects(item.job.alarm(), /storage interrupted/);
  assert.equal((await item.storage.get('job')).status, 'running'); assert.equal(calls.length, 1);
  item.revive(); await item.job.alarm();
  const result = await (await h.send('status', body)).json();
  assert.equal(result.status, 'failed'); assert.equal(result.code, 'CHECK_INTERRUPTED'); assert.equal(calls.length, 1);
});
test('expired checks are removed without another model call', async () => {
  const h = checkHarness(), body = await checkBody(); const calls = mockQueue([]);
  await h.send('start', body); const item = h.instances.get('baozi:' + body.checkId);
  const stored = await item.storage.get('job'); await item.storage.put('job', { ...stored, expires: Date.now() - 1 });
  const response = await h.send('status', body); assert.equal(response.status, 404); assert.equal((await response.json()).terminal, true);
  await item.job.alarm(); assert.equal(await item.storage.get('job'), undefined); assert.equal(calls.length, 0);
});

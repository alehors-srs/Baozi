import importlib.util
import json
import subprocess
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


common = module('sync_common')
prepare = module('prepare_site')
dictionary = module('sync_dictionary')


class CommonCodeTests(unittest.TestCase):
    def test_sync_preserves_site_identity_and_data(self):
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / 'source', Path(temp) / 'target'
            for name in common.COMMON_FILES:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('shared ' + name)
            preserved = ('site-config.js', 'words.js', 'names.js', 'manifest.json',
                         'images/background.jpg', '.github/workflows/sync-dictionaries.yml')
            for name in preserved:
                path = target / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('own ' + name)
            common.synchronize(source, target, 'a' * 40)
            for name in preserved:
                self.assertEqual((target / name).read_text(), 'own ' + name)
            self.assertEqual((target / 'app.js').read_text(), 'shared app.js')
            self.assertEqual(json.loads((target / 'common-version.json').read_text())['sourceCommit'], 'a' * 40)

    def test_incomplete_source_does_not_change_target(self):
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / 'source', Path(temp) / 'target'
            source.mkdir(); target.mkdir()
            (source / 'index.html').write_text('new')
            (target / 'index.html').write_text('old')
            with self.assertRaises(ValueError):
                common.synchronize(source, target, 'a' * 40)
            self.assertEqual((target / 'index.html').read_text(), 'old')

    def test_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / 'source', Path(temp) / 'target'
            for name in common.COMMON_FILES:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('new')
            target.mkdir()
            outside = Path(temp) / 'outside'
            outside.write_text('keep')
            (target / 'index.html').symlink_to(outside)
            with self.assertRaises(ValueError):
                common.synchronize(source, target, 'a' * 40)
            self.assertEqual(outside.read_text(), 'keep')

    def test_build_versions_change_with_settings_and_do_not_publish_scripts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'root'
            root.mkdir()
            for name in prepare.PUBLIC_FILES:
                (root / name).write_text('<script src="site-config.js"></script>' if name == 'index.html'
                                         else '__SITE_BUILD__' if name == 'sw.js' else name)
            for folder in ('images', 'fonts', 'scripts'):
                (root / folder).mkdir()
                (root / folder / 'sample').write_text('sample')
            first, second = Path(temp) / 'first', Path(temp) / 'second'
            version = prepare.prepare(root, first)
            self.assertIn('?v=' + version, (first / 'index.html').read_text())
            self.assertNotIn('__SITE_BUILD__', (first / 'sw.js').read_text())
            self.assertFalse((first / 'scripts').exists())
            (root / 'site-config.js').write_text('different site')
            self.assertNotEqual(version, prepare.prepare(root, second))

    def test_local_configuration_has_two_csv_sources_and_separate_keys(self):
        urls = dictionary.load_sources(ROOT / 'site-config.js')
        self.assertNotEqual(urls['words'], urls['names'])

    def test_other_csv_hosts_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'site-config.js'
            path.write_text('window.TRAINER_CONFIG = Object.freeze(' + json.dumps({
                'csv': {'words': 'https://example.com/data.csv', 'names': 'https://example.com/data.csv'}
            }) + ');')
            with self.assertRaises(ValueError):
                dictionary.load_sources(path)



    def test_hanzi_practice_input_pool_reinforcement_and_ime(self):
        # Execute the real logic without a DOM, network, or pinyin dependency.
        script = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { window: {} };
vm.createContext(context);
const source = fs.readFileSync('app.js', 'utf8');
const logic = source.split('// === HANZI PRACTICE:')[1].split('\nfunction initializeHanziPractice()')[0];
vm.runInContext('// === HANZI PRACTICE:' + logic + '\nthis.practice = HanziPractice;', context);
const p = context.practice;
assert(p.check('你', '你'));
assert(p.check(' \n你\u3000', '你'));
for (const input of ['妳', '他', '你你', '你好', 'ni3', 'nǐ', 'Ты', '', ' ', '😀', '<script>']) {
 assert(!p.check(input, '你'), input);
}
assert(!p.check('國', '国')); // no automatic simplified/traditional substitution
assert(p.check('𠮷', '𠮷')); // supplementary-plane ideographs remain intact
vm.runInContext(fs.readFileSync('words.js', 'utf8') + fs.readFileSync('names.js', 'utf8'), context);
const pool = p.buildPool(context.window.dictionary, context.window.names);
assert.equal(new Set(pool.cards.map(card => card.char)).size, pool.total);
assert(pool.cards.some(card => card.char === '李'));
const filtered = p.buildPool([{char:'你你，好 123😀'}], [{char:'好你𠮷'}]);
assert.equal(filtered.total, 3);
assert.equal(filtered.cards.length, 3);
const extended = p.buildPool([{char:'龘'}], []);
assert.equal(extended.cards[0].char, '龘'); // new characters need no readings/API
for (const count of [10, 25]) {
 const round = p.begin(p.createRound(pool.cards, count, a => [...a]));
 assert.equal(round.current.length, count);
 assert.equal(new Set(round.current.map(c => c.char)).size, count);
 const original = round.current[0].char;
 pool.cards[0].char = '改';
 assert.equal(round.current[0].char, original); // independent snapshot
 pool.cards.splice(0, pool.cards.length, ...p.buildPool(context.window.dictionary, context.window.names).cards);
}
const round = p.begin(p.createRound(pool.cards, 10, a => [...a]));
assert.equal(p.advance(round, a => [...a]), 'unanswered');
assert.equal(p.answer(round, '').correct, false);
assert.equal(p.answer(round, '你'), null); // no double submission
for (let i=0; i<9; i++) {
 assert.equal(p.advance(round, a => [...a]), 'next');
 p.answer(round, round.current[round.index].char);
}
assert.equal(p.advance(round, a => [...a]), 'reinforcement');
assert.equal(round.current.length, 1);
assert.equal(round.mainResults.filter(r => r.correct).length, 9);
p.answer(round, 'wrong');
assert.equal(p.advance(round, a => [...a]), 'reinforcement');
p.answer(round, round.current[0].char);
assert.equal(p.advance(round, a => [...a]), 'complete');
assert.equal(round.mainResults[0].correct, false);
assert.equal(round.mainResults.filter(r => r.correct).length, 9);
const perfect = p.begin(p.createRound(pool.cards, 25, a => [...a]));
for (let i=0; i<25; i++) {
 p.answer(perfect, perfect.current[i].char);
 assert.equal(p.advance(perfect, a => [...a]), i===24 ? 'complete' : 'next');
}
assert.equal(perfect.mainResults.filter(r => r.correct).length, 25);
assert.throws(() => p.createRound([], 10, a=>a));
assert.throws(() => p.createRound(pool.cards, 50, a=>a));
assert(!p.canSubmit(true, -Infinity, 100));
assert(!p.canSubmit(false, -Infinity, 100, {isComposing:true}));
assert(!p.canSubmit(false, -Infinity, 100, {keyCode:229}));
assert(!p.canSubmit(false, 100, 105)); // Enter used to commit an IME candidate
assert(p.canSubmit(false, 100, 200)); // deliberate later Enter submits
assert(p.canSubmit(false, -Infinity, 0));
console.log('Hanzi input: exact matches, unique pool, new characters, snapshots, 10/25 cards, repeated reinforcement and IME OK');
"""
        result = subprocess.run(['node', '-e', script], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)



    def test_hanzi_history_and_audio_cancellation(self):
        script = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const context = {};
vm.createContext(context);
const logic = fs.readFileSync('app.js', 'utf8').split('// === HANZI PRACTICE:')[1].split('\nfunction initializeHanziPractice()')[0];
vm.runInContext('// === HANZI PRACTICE:' + logic + '\nthis.practice = HanziPractice;', context);
const p = context.practice;
const cards = Array.from('你好我他她国人天大中', char => ({ char }));
const round = p.begin(p.createRound(cards, 10, a => [...a]));
assert.equal(p.previous(round, ''), false);
p.answer(round, '错');
p.advance(round, a => [...a]);
assert.equal(p.previous(round, 'unfinished draft'), true);
assert.equal(round.index, 0);
assert.equal(round.attempts[0].user, '错');
assert.equal(round.attempts[0].correct, false);
assert.equal(p.answer(round, '你'), null);
p.advance(round, a => [...a]);
assert.equal(round.index, 1);
assert.equal(round.drafts[1], 'unfinished draft');
assert.equal(round.attempts[1], undefined);
p.answer(round, '好');
p.previous(round, '');
p.advance(round, a => [...a]);
assert.equal(round.attempts[1].user, '好');
assert.equal(round.mistakes.length, 1); // review does not add mistakes
for(let i=2; i<10; i++) {
 p.advance(round, a => [...a]);
 p.answer(round, round.current[i].char);
}
p.advance(round, a => [...a]);
assert.equal(round.reinforcement, true);
assert.equal(round.index, 0);
assert.equal(round.drafts.length, 0);
assert.equal(p.previous(round, ''), false);
assert.equal(round.mainResults.filter(a => a.correct).length, 9);
let serial=0, advances=0, stops=0, active=true;
const timers = new Map(), spoken=[];
const playback = p.createPlayback({
 speak(char, end) { spoken.push({char,end}); }, stop() { stops++; },
 setTimer(fn,ms) { const id=++serial; timers.set(id,{fn,ms}); return id; },
 clearTimer(id) { timers.delete(id); }, onAdvance() { advances++; }, isActive() { return active; }
});
function run(ms) {
 const entry = [...timers].find(([,t])=>t.ms===ms);
 assert(entry, 'missing timer '+ms);
 timers.delete(entry[0]); entry[1].fn();
}
playback.schedule(true,'你');
assert.equal(spoken[0].char,'你');
assert(playback.isPending());
spoken[0].end(); spoken[0].end();
assert.equal(timers.size,1);
run(500);
assert.equal(advances,1);
assert(!playback.isPending());
playback.schedule(false,'好');
assert.equal(spoken.length,1);
run(1000);
assert.equal(advances,2);
playback.schedule(true,'我');
const staleEnd=spoken.at(-1).end;
const staleTimeout=[...timers.values()][0].fn;
playback.cancel(); // previous/reset/section exit invalidates both callbacks
staleEnd(); staleTimeout();
assert.equal(timers.size,0);
assert.equal(advances,2);
playback.schedule(true,'他');
const earlierEnd=spoken.at(-1).end;
playback.schedule(false,'他'); // mute while sound is playing
assert(stops>0);
earlierEnd(); run(1000);
assert.equal(advances,3);
playback.schedule(true,'国');
playback.play('国'); // manual replay pauses automatic advance
assert(!playback.isPending());
spoken.at(-1).end();
assert.equal(timers.size,0);
assert.equal(advances,3);
playback.schedule(true,'人');
run(8000); // speech API without an onend callback cannot stall the round
run(500);
assert.equal(advances,4);
playback.schedule(true,'天');
active=false;
spoken.at(-1).end(); run(500);
assert.equal(advances,4); // a hidden section never advances
let syncAdvances=0;
const sync=p.createPlayback({
 speak(c,end){ end(); },stop(){},setTimer(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},
 clearTimer(id){timers.delete(id);},onAdvance(){syncAdvances++;},isActive(){return true;}
});
sync.schedule(true,'大');run(500);assert.equal(syncAdvances,1);
sync.cancel();playback.cancel();
console.log('Hanzi: immutable history, drafts, reinforcement, audio end/timeout/mute/replay/cancel races OK');
"""
        result = subprocess.run(['node', '-e', script], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()


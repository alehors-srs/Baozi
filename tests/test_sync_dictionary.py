import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sync_dictionary', Path(__file__).resolve().parents[1] / 'scripts/sync_dictionary.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class DictionarySyncTests(unittest.TestCase):
    def test_csv_quotes_commas_newlines_bom_and_header_order(self):
        data = '\ufefftranslation,char,pinyin\r\n"привет,\nдруг",你好,nǐ hǎo\r\n'
        self.assertEqual(sync.parse_csv(data, 'words'), [
            {'char': '你好', 'pinyin': 'nǐ hǎo', 'translation': 'привет,\nдруг'}])

    def test_invisible_characters_are_removed_and_reported(self):
        with contextlib.redirect_stderr(io.StringIO()) as log:
            records = sync.parse_csv('char,pinyin,translation\n\u200b知\u200b道,zhīdào,знать\n', 'words')
        self.assertEqual(records[0]['char'], '知道')
        self.assertIn('removed invisible', log.getvalue())
        with self.assertRaises(ValueError), contextlib.redirect_stderr(io.StringIO()):
            sync.parse_csv('char,pinyin,translation\n\u200b,nǐ,ты\n', 'words')

    def test_invalid_data_rejected(self):
        for data in ('', 'char,pinyin,translation\n',
                     'char,pinyin,translation\n你,nǐ,\n',
                     '<html>server error</html>',
                     'char,char,translation\n你,nǐ,ты\n',
                     'char,pinyin,translation\n你,nǐ,ты,extra\n',
                     'char,pinyin,translation\n"unterminated'):
            with self.subTest(data=data), self.assertRaises((ValueError, sync.csv.Error)):
                sync.parse_csv(data, 'words')

    def test_exact_duplicates_removed_but_distinct_meanings_preserved(self):
        data = 'char,pinyin,translation\n你,nǐ,ты\n\n你,nǐ,ты\n你,nǐ,Вы\n'
        with contextlib.redirect_stderr(io.StringIO()) as log:
            result = sync.parse_csv(data, 'words')
        self.assertEqual(len(result), 2)
        self.assertIn('duplicate', log.getvalue())

    def test_second_sheet_failure_preserves_both_existing_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ('words.js', 'names.js'):
                (root / name).write_bytes(b'original')
            for failure in ('invalid', 'network'):
                def fetch(gid):
                    if gid == '0':
                        return 'char,pinyin,translation\n你,nǐ,ты\n'
                    if failure == 'network':
                        raise sync.urllib.error.URLError('offline')
                    return 'char,pinyin,translation\n李,Lǐ,\n'
                with self.assertRaises((ValueError, sync.urllib.error.URLError)):
                    sync.synchronize(root, fetch)
                self.assertEqual([(root / name).read_bytes() for name in ('words.js', 'names.js')],
                                 [b'original', b'original'])

    def test_repeat_sync_is_idempotent_and_unicode_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp, contextlib.redirect_stdout(io.StringIO()):
            fetch = lambda gid: 'char,pinyin,translation\n你,nǐ,ты\n'
            self.assertEqual(sync.synchronize(temp, fetch), ['words.js', 'names.js'])
            root = Path(temp)
            mtime = (root / 'words.js').stat().st_mtime_ns
            self.assertEqual(sync.synchronize(temp, fetch), [])
            self.assertEqual(mtime, (root / 'words.js').stat().st_mtime_ns)
            self.assertIn('window.dictionary', (root / 'words.js').read_text())
            self.assertIn('window.names', (root / 'names.js').read_text())
            self.assertIn('nǐ', (root / 'words.js').read_text())


if __name__ == '__main__':
    unittest.main()

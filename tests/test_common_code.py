import importlib.util
import json
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


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Copy only shared files from a checked-out Baozi version; keep site data intact."""
import argparse
import json
from pathlib import Path
import re
import shutil

# Workflows, settings, dictionaries, manifest and media are deliberately absent.
COMMON_FILES = (
    'index.html', 'app.css', 'app.js', 'sentences.js', 'sw.js',
    'scripts/prepare_site.py', 'scripts/sync_dictionary.py', 'scripts/sync_common.py',
    'tests/test_sync_dictionary.py', 'tests/test_common_code.py',
)


def synchronize(source, target, source_sha):
    source, target = Path(source).resolve(), Path(target).resolve()
    if source == target or not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('Use a separate source checkout and its full commit SHA')
    # Validate the ENTIRE input before replacing any target file.
    for name in COMMON_FILES:
        path = source / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source):
            raise ValueError(f'Missing or unsafe common file: {name}')
        dest = target / name
        if dest.is_symlink() or not dest.resolve().is_relative_to(target):
            raise ValueError(f'Unsafe destination: {name}')
    for name in COMMON_FILES:
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, dest)
    (target / 'common-version.json').write_text(json.dumps({
        'sourceRepository': 'alehors-srs/Baozi', 'sourceCommit': source_sha
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Common code copied from alehors-srs/Baozi@{source_sha}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    synchronize(args.source, args.target, args.source_sha)


if __name__ == '__main__':
    main()


#!/usr/bin/env python3
"""Build only public website assets; version the complete site bundle."""
import argparse
import hashlib
from pathlib import Path
import shutil

PUBLIC_FILES = ('index.html', 'site-config.js', 'app.js', 'sentences.js', 'app.css',
                'words.js', 'names.js', 'manifest.json', 'sw.js')
VERSIONED = ('site-config.js', 'app.js', 'sentences.js', 'app.css', 'words.js', 'names.js', 'manifest.json')


def prepare(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or root.is_relative_to(output):
        raise ValueError('Output must not contain the source directory')
    if output.exists():
        raise ValueError('Output already exists; choose a new output directory')
    required = [root / name for name in PUBLIC_FILES] + [root / 'images', root / 'fonts']
    for path in required:
        if not path.exists() or path.is_symlink():
            raise ValueError(f'Missing asset or symbolic link: {path.name}')
    assets = sorted([root / name for name in PUBLIC_FILES] +
                    [p for folder in ('images', 'fonts') for p in (root / folder).rglob('*') if p.is_file()])
    digest = hashlib.sha256()
    for path in assets:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError('Symbolic links are not supported')
        digest.update(path.relative_to(root).as_posix().encode() + b'\0' + path.read_bytes() + b'\0')
    version = digest.hexdigest()[:20]
    output.mkdir(parents=True)
    for name in PUBLIC_FILES:
        shutil.copyfile(root / name, output / name)
    for folder in ('images', 'fonts'):
        shutil.copytree(root / folder, output / folder)
    for name in ('CNAME', 'robots.txt', '404.html'):
        if (root / name).is_file():
            shutil.copyfile(root / name, output / name)
    html = (output / 'index.html').read_text(encoding='utf-8')
    for name in VERSIONED:
        html = html.replace(f'"{name}"', f'"{name}?v={version}"')
    (output / 'index.html').write_text(html, encoding='utf-8')
    worker = (output / 'sw.js').read_text(encoding='utf-8')
    if worker.count('__SITE_BUILD__') != 1:
        raise ValueError('Expected exactly one SW build marker')
    (output / 'sw.js').write_text(worker.replace('__SITE_BUILD__', version), encoding='utf-8')
    (output / '.nojekyll').touch()
    print(f'Prepared {output.name}; bundle {version}')
    return version


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output-dir', type=Path, default=Path('_site'))
    args = parser.parse_args()
    prepare(args.root, args.output_dir)


if __name__ == '__main__':
    main()


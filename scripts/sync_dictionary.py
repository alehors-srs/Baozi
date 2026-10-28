#!/usr/bin/env python3
"""Generate Baozi dictionaries from the two published Google Sheets CSVs."""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.request

BASE_URL = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vThqLMZa5zXTaQZws0fdPuFirZ_H9TvyWTR50cp6yjYYG7riAYCnfqkOZBdT1M-fQE2yG4QKM7qgSJL/pub'
)
SOURCES = (
    ('words', '0', 'words.js', 'dictionary'),
    ('names', '753580976', 'names.js', 'names'),
)
FIELDS = ('char', 'pinyin', 'translation')
MAX_BYTES = 5 * 1024 * 1024
INVISIBLE = str.maketrans('', '', '\u200b\u200c\u200d\u2060\ufeff\u00ad')


def download_csv(gid):
    url = f'{BASE_URL}?gid={gid}&single=true&output=csv'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Baozi-Dictionary-Sync/1.0',
        'Cache-Control': 'no-cache',
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.headers.get_content_type() not in (
                    'text/csv', 'text/plain', 'application/octet-stream',
                    'application/csv', 'application/vnd.ms-excel',
                ):
                    raise ValueError('Expected CSV; server returned a different content type')
                data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError('CSV exceeds the 5 MiB size limit')
                return data.decode('utf-8-sig')
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError('Download failed')


def parse_csv(text, sheet):
    reader = csv.reader(io.StringIO(text, newline=''), strict=True)
    header = next(reader, None)
    if header is None:
        raise ValueError(f'{sheet}: empty CSV')
    header = [cell.strip().lstrip('\ufeff') for cell in header]
    if len(header) != 3 or set(header) != set(FIELDS):
        raise ValueError(f'{sheet}: expected headers char,pinyin,translation; got {header!r}')
    records, seen = [], set()
    for row in reader:
        line = reader.line_num
        if not any(cell.strip() for cell in row):
            continue
        if len(row) != len(header):
            raise ValueError(f'{sheet}: CSV line {line}: expected 3 cells, got {len(row)}')
        source = dict(zip(header, (cell.strip() for cell in row)))
        for field in FIELDS:
            cleaned = source[field].translate(INVISIBLE).strip()
            if cleaned != source[field]:
                print(f'WARNING: {sheet}: CSV line {line}: removed invisible characters in {field}', file=sys.stderr)
            source[field] = cleaned
        missing = [key for key in FIELDS if not source[key]]
        if missing:
            raise ValueError(f'{sheet}: CSV line {line}: empty fields {", ".join(missing)}')
        record = {key: source[key] for key in FIELDS}
        key = tuple(record.values())
        if key in seen:
            print(f'WARNING: {sheet}: CSV line {line}: exact duplicate omitted', file=sys.stderr)
            continue
        seen.add(key)
        records.append(record)
    if not records:
        raise ValueError(f'{sheet}: no complete records; refusing to erase dictionary')
    return records


def generate(variable, records):
    return (
        '// Generated from Google Sheets. Edit the spreadsheet, not this file.\n'
        f'window.{variable} = '
        + json.dumps(records, ensure_ascii=False, indent=2) + ';\n'
    )


def synchronize(output_dir, fetch=download_csv):
    # Validate BOTH sheets before opening any output file for writing.
    outputs = {}
    counts = {}
    for sheet, gid, filename, variable in SOURCES:
        records = parse_csv(fetch(gid), sheet)
        outputs[filename] = generate(variable, records)
        counts[sheet] = len(records)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    changed = [name for name, content in outputs.items()
               if not (output_dir / name).exists()
               or (output_dir / name).read_bytes() != content.encode('utf-8')]
    # Prepare both complete outputs before replacing either destination.
    staged = []
    try:
        for name in changed:
            fd, temp = tempfile.mkstemp(prefix=f'.{name}.', dir=output_dir)
            staged.append((Path(temp), output_dir / name))
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
                stream.write(outputs[name])
            os.chmod(temp, 0o644)
        for temp, destination in staged:
            os.replace(temp, destination)
    finally:
        for temp, _ in staged:
            temp.unlink(missing_ok=True)
    for sheet, count in counts.items():
        print(f'{sheet}: {count} records')
    print('Changed: ' + (', '.join(changed) or 'none'))
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        synchronize(args.output_dir)
    except (ValueError, csv.Error, OSError, UnicodeError, urllib.error.URLError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

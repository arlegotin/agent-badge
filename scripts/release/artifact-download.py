"""Validate GitHub artifact ZIP members/manifest before extracting only expected files.
The workflow verifies repository, CI workflow, run, event and SHA before download.
"""
import json, os, pathlib, re, sys, zipfile
archive, destination = sys.argv[1:]
with zipfile.ZipFile(archive) as bundle:
    members = bundle.infolist()
    names = [member.filename for member in members]
    if len(names) != 4 or len(set(names)) != 4 or any(not re.fullmatch(r'[A-Za-z0-9_.-]+', name) for name in names):
        raise SystemExit('Unexpected artifact ZIP inventory')
    if 'candidate.json' not in names or any(member.file_size > 20 * 1024 * 1024 or member.compress_size > 20 * 1024 * 1024 or member.external_attr >> 16 & 0o170000 == 0o120000 for member in members):
        raise SystemExit('Invalid artifact size/type')
    candidate = json.loads(bundle.read('candidate.json'))
    if candidate.get('schemaVersion') != 1 or candidate.get('sha') != os.environ['RELEASE_SHA'] or candidate.get('tag') != os.environ['RELEASE_TAG']:
        raise SystemExit('Artifact source mismatch')
    artifacts = candidate.get('artifacts', [])
    if [a.get('name') for a in artifacts] != ['@legotin/agent-badge-core', '@legotin/agent-badge', 'create-agent-badge']:
        raise SystemExit('Artifact package inventory mismatch')
    if sorted(names) != sorted(['candidate.json'] + [a['filename'] for a in artifacts]):
        raise SystemExit('Artifact filename inventory mismatch')
    target = pathlib.Path(destination)
    target.mkdir(parents=True, exist_ok=False)
    for name in names:
        (target / name).write_bytes(bundle.read(name))

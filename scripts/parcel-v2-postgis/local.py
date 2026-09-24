"""Restrict all database operations to the newly created disposable Unix-socket cluster."""
import json
import os
import pathlib
import subprocess

PSQL = '/opt/homebrew/bin/psql'
ENV = {k: os.environ[k] for k in ('PATH', 'LANG', 'LC_ALL', 'TMPDIR') if k in os.environ}


def connection(boundary_file):
    b = json.loads(pathlib.Path(boundary_file).read_text())
    directory = pathlib.Path(b['directory']).resolve()
    if directory.parent != pathlib.Path('/private/tmp') or not directory.name.startswith('trulot-packet7-'):
        raise ValueError('Only dedicated Packet 7 temporary clusters allowed')
    if b['socket'] != str(directory / 'socket') or b['database'] != 'trulot_packet7' or b['port'] != 55477 or b['user'] != 'ops':
        raise ValueError('Unexpected local connection boundary')
    if b['createdFor'] != 'TruLot Packet 7 disposable isolated rehearsal':
        raise ValueError('Missing disposable cluster marker')
    if json.loads((directory / 'boundary.json').read_text()) != b:
        raise ValueError('Cluster marker mismatch')
    args = [PSQL, '-X', '-h', b['socket'], '-p', str(b['port']), '-U', b['user'], '-d', b['database'], '-v', 'ON_ERROR_STOP=1']
    actual = subprocess.check_output(args + ['-Atc', "SELECT current_database(),current_setting('data_directory'),current_setting('listen_addresses'),inet_server_addr() IS NULL"], env=ENV, text=True).strip()
    if actual != f"trulot_packet7|{directory}/pgdata||t":
        raise ValueError('Not the intended Unix-only disposable cluster')
    return args


def sql(args, command):
    return subprocess.check_output(args + ['-Atc', command], env=ENV, text=True).strip()

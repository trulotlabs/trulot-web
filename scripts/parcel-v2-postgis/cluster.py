"""Create or stop a dedicated Unix-only local rehearsal cluster; never discover/connect to shared databases.
Usage: python3 scripts/parcel-v2-postgis/cluster.py create
       python3 scripts/parcel-v2-postgis/cluster.py stop BOUNDARY_JSON
Stop retains disposable files/evidence for inspection. No production credentials are read.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
from local import connection, ENV

BIN=pathlib.Path('/opt/homebrew/bin')


def create():
    directory=pathlib.Path(tempfile.mkdtemp(prefix='trulot-packet7-',dir='/private/tmp'))
    (directory/'socket').mkdir(mode=0o700)
    subprocess.run([str(BIN/'initdb'),'-D',str(directory/'pgdata'),'-A','trust','--no-locale','--encoding=UTF8'],check=True,env=ENV,stdout=subprocess.DEVNULL)
    with (directory/'pgdata/postgresql.conf').open('a') as file:
        file.write("\nlisten_addresses = ''\nunix_socket_directories = '"+str(directory/'socket')+"'\nunix_socket_permissions = 0700\nport = 55477\nshared_buffers = '256MB'\nmax_connections = 10\n")
    subprocess.run([str(BIN/'pg_ctl'),'-D',str(directory/'pgdata'),'-l',str(directory/'postgres.log'),'start'],check=True,env=ENV)
    subprocess.run([str(BIN/'createdb'),'-h',str(directory/'socket'),'-p','55477','-U','ops','trulot_packet7'],check=True,env=ENV)
    versions=subprocess.check_output([str(BIN/'psql'),'-X','-h',str(directory/'socket'),'-p','55477','-U','ops','-d','trulot_packet7','-v','ON_ERROR_STOP=1','-Atc','CREATE EXTENSION postgis; SELECT version(); SELECT postgis_full_version(); SHOW listen_addresses;'],text=True,env=ENV)
    boundary={'directory':str(directory),'socket':str(directory/'socket'),'port':55477,'database':'trulot_packet7','user':'ops','schema':'parcel_v2_rehearsal','versions':versions,'createdFor':'TruLot Packet 7 disposable isolated rehearsal'}
    target=directory/'boundary.json';target.write_text(json.dumps(boundary,indent=2)+'\n');connection(target)
    print('Boundary:',target)


def stop(boundary_file):
    connection(boundary_file)
    boundary=json.loads(pathlib.Path(boundary_file).read_text())
    subprocess.run([str(BIN/'pg_ctl'),'-D',str(pathlib.Path(boundary['directory'])/'pgdata'),'stop','-m','fast'],check=True,env=ENV)
    print('Stopped disposable cluster; retained files:',boundary['directory'])


if __name__=='__main__':
    if sys.argv[1:]==['create']:create()
    elif len(sys.argv)==3 and sys.argv[1]=='stop':stop(sys.argv[2])
    else:raise SystemExit(__doc__)

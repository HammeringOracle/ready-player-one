// Read-only diagnostics for the selected, saved Batocera machine. Never prints credentials.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('ssh2');
const name = process.argv[2] || 'Batocera';
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../device-settings.json'), 'utf8'));
const device = settings[name];
if (!device?.sshPasswordProtected) throw new Error('Saved SSH credentials are required.');
const code = String.raw`
import datetime, json, os, socket, subprocess
p='/boot/ready-player-one/library.json'
custom='/userdata/system/custom.sh'
text=open(custom).read() if os.path.exists(custom) else ''
data=json.load(open(p)) if os.path.exists(p) else None
result={
  'utcNow':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'hostname':socket.gethostname(),
  'controllerVersion':None if data is None else data.get('controllerVersion'),
  'bootHookInstalled':'READY PLAYER ONE USB BOOT V3 BEGIN' in open('/boot/postshare.sh').read() if os.path.exists('/boot/postshare.sh') else False,
  'bootMount':[line.strip() for line in open('/proc/mounts') if line.split()[1]=='/boot'],
  'processes':subprocess.getoutput("ps -ef | grep '[p]ython3 /userdata/system/ready-player-one/usb-controller.py'"),
  'hookLine':next((i+1 for i,line in enumerate(text.splitlines()) if '# READY PLAYER ONE USB CONTROLLER' in line),None),
  'exitLines':[i+1 for i,line in enumerate(text.splitlines()) if line.strip()=='exit 0'],
  'manifest':None if data is None else {'machine':data.get('machine'),'updatedAt':data.get('updatedAt'),'systems':len(data['systems']),'games':sum(map(len,data['systems'].values())),'bytes':os.path.getsize(p),'ps1Games':len(data['systems'].get('psx',[]))},
}
log='/userdata/system/ready-player-one/usb-controller.log'
result['recentErrors']=open(log).read().splitlines()[-5:] if os.path.exists(log) else []
print(json.dumps(result,indent=2))
`;
const command = `printf %s '${Buffer.from(code).toString('base64')}' | base64 -d | python3`;
const client = new Client();
client.on('ready', () => client.exec(command, (error, stream) => {
  if (error) { console.error(error.message); client.end(); process.exitCode = 1; return; }
  stream.pipe(process.stdout);
  stream.stderr.pipe(process.stderr);
  stream.on('close', code => { client.end(); process.exitCode = code; });
})).on('error', error => { console.error(error.message); process.exitCode = 1; });
client.connect({host: device.discoveredHost || device.host, username: device.sshUsername,
  password: require('./machine-secret')('Unprotect', device.sshPasswordProtected), readyTimeout: 8000});

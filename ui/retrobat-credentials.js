const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
module.exports=async function connect({host,username,password,remember}) {
  if (typeof host!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(host) || typeof username!=='string' || !username.trim() || username.length>256 || typeof password!=='string' || password.length>2560) throw new Error('Enter a valid machine address and username.');
  const source=fs.readFileSync(path.join(__dirname,'retrobat-credentials.ps1'),'utf8');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(new Error('Connection timed out. Check that the machine is awake and sharing is enabled.'));},30000);
    child.on('error',()=>finish(new Error('Unable to start the Windows login helper.')));
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>32768){child.kill();finish(new Error('Unexpected response from Windows.'));}});
    child.stderr.on('data',()=>{}); // Never expose raw diagnostics containing request data.
    child.on('close',()=>{try{finish(null,JSON.parse(output.replace(/^\uFEFF/,'')));}catch{finish(new Error('Windows could not complete the login.'));}});
    child.stdin.on('error',()=>{});
    // Secrets are sent through stdin, never command arguments, logs, or app files.
    child.stdin.end(JSON.stringify({host,username:username.trim(),password,remember:remember===true}));
  });
};

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
module.exports=({getRuntimeDevice,execSsh})=>{
  const source=fs.readFileSync(path.join(__dirname,'volume.py'),'utf8'),busy=new Set();
  return async body=>{
    if(!['volume-status','volume-install','volume-disable'].includes(body.action)||typeof body.device!=='string')throw Error('Choose a Music over Games action and machine.');
    const device=await getRuntimeDevice(body.device);
    if(!device||device.access!=='ssh'||(device.platform&&device.platform!=='batocera'))throw Error('Choose a Batocera machine with SSH credentials.');
    if(busy.has(device.host))throw Error('Music over Games setup is already running on this machine.');
    const input={action:body.action,playDuringGames:body.playDuringGames===true};
    const data=zlib.deflateSync(Buffer.from(JSON.stringify(input))).toString('base64'),code=zlib.deflateSync(Buffer.from(source)).toString('base64');
    const command=`exec python3 -c 'import sys,base64,zlib,json;source=zlib.decompress(base64.b64decode("${code}")).decode();request=json.loads(zlib.decompress(base64.b64decode("${data}")));request["source"]=source;sys.argv=["volume",json.dumps(request)];exec(source)'`;
    busy.add(device.host);
    try{return {ok:true,...JSON.parse((await execSsh(device,command,25000)).trim())};}
    catch(e){throw Error(String(e.message||e).trim().split('\n').at(-1));}
    finally{busy.delete(device.host);}
  };
};

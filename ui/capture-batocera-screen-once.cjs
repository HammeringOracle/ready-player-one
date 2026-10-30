const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "device-settings.json"), "utf8")).Batocera;
const password = require("./machine-secret")("Unprotect", settings.sshPasswordProtected);
const output = path.join(__dirname, "..", "batocera-video-output.png");
const remote = "/tmp/rp1-video-output.png";
const client = new Client();

client.on("ready", () => {
  const command = `rm -f ${remote}; batocera-screenshot ${remote} </dev/null >/tmp/rp1-screenshot.log 2>&1 & p=$!; i=0; while [ $i -lt 20 ]; do [ -s ${remote} ] && { kill $p 2>/dev/null; exit 0; }; sleep 1; i=$((i+1)); done; kill $p 2>/dev/null; cat /tmp/rp1-screenshot.log >&2; exit 1`;
  client.exec(command, (error, stream) => {
    if (error) throw error;
    let stderr = "";
    stream.stderr.on("data", chunk => { stderr += chunk; });
    stream.on("close", code => {
      if (code !== 0) throw new Error(stderr || `Screenshot command exited with ${code}`);
      client.sftp((sftpError, sftp) => {
        if (sftpError) throw sftpError;
        sftp.fastGet(remote, output, getError => {
          if (getError) throw getError;
          sftp.unlink(remote, () => {
            console.log(output);
            client.end();
          });
        });
      });
    });
  });
}).connect({
  host: settings.discoveredHost,
  username: settings.sshUsername,
  password,
  readyTimeout: 8000,
});

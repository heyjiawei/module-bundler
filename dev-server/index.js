const express = require("express");
const app = express();
const webserverPort = 3000;
const websocketPort = 3001;

/* TODO:
1. Build a file watcher
2. Use watcher to highlight which modules have changed and needs to be replaced. Write into in memory file
3. use websocket to replace file
*/

// Websocket server
const websocketServer = require("./websocket");
const clientSockets = websocketServer(websocketPort);

// bundle
const path = require("path");
const moduleBundler = require("../index.js");
const entryFile = path.resolve(process.cwd(), process.argv[2]);
const outputFolder = path.resolve(process.cwd(), process.argv[3]);
const { folder, main } = moduleBundler(entryFile, outputFolder);

// File watcher
const uniqid = require("uniqid");
const watcher = require("./watcher");
const devServerBundle = require("../index.js").devServerBundle;
// TODO: add debounce
watcher(path.dirname(entryFile), (eventType, filename) => {
  const modifiedFilepath = path.resolve(path.dirname(entryFile), filename);
  const patchFilename = `${uniqid()}.js`;
  devServerBundle(
    [modifiedFilepath],
    path.join(outputFolder, patchFilename),
    entryFile
  );

  clientSockets().forEach((socket) => {
    socket.send(patchFilename);
  });
});

app.get("/", (req, res) => {
  res.send(
    `<html>
      <head>
        <meta charset="utf-8">
        <title>Dev-server</title>
        <script type="text/javascript">
          const socket = new WebSocket('ws://localhost:${websocketPort}');
          socket.addEventListener('open', function (event) {
            socket.send('Hello Server!');
          });

          socket.addEventListener('message', function (event) {
            console.log('Message from server ', event.data);
            
            const script = document.createElement('script');
            script.src = './' + event.data;
            document.head.append(script);
          });

          function refreshDOM() {
            document.body.innerHTML = "<script src='/index.js' />";
          }
        </script>
      </head>
      <body>
        <script src="/index.js"></script>
      </body>
    </html>`
  );
});

app.use(express.static(folder));

app.listen(webserverPort, () => {
  console.log(`Page served at http://localhost:${webserverPort}`);
});

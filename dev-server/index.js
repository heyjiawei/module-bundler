const express = require("express");
const app = express();
const port = 3000;

// bundle
const path = require("path");
const moduleBundler = require("../index.js");
const entryFile = process.argv[2];
const outputFolder = process.argv[3];

const { folder, main } = moduleBundler(
  path.resolve(process.cwd(), entryFile),
  path.resolve(process.cwd(), outputFolder)
);

app.get("/", (req, res) => {
  res.send(
    `<html>
      <head>
        <meta charset="utf-8">
        <title>Dev-server</title>
      </head>
      <body>
        <script src="/index.js"></script>
      </body>
    </html>`
  );
});

app.use(express.static(folder));

app.listen(port, () => {
  console.log(`Page served at http://localhost:${port}`);
});

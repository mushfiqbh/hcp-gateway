const express = require("express");

let serverInstance;
let isServerStarted = false;

function startServer() {
  if (isServerStarted) return serverInstance;
  isServerStarted = true;

  const app = express();
  app.use(express.json());

  serverInstance = app.listen(0, () => {
    const port = serverInstance.address().port;
    console.log(`Server running on port ${port}`);
  });

  return serverInstance;
}

module.exports = { startServer };

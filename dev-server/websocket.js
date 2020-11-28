const WebSocket = require("ws");

module.exports = function websocketServer(port) {
  const server = new WebSocket.Server({
    port,
  });
  let sockets = [];
  server.on("connection", function (socket) {
    sockets.push(socket);
    console.log(
      `Websocket connected! There are currently ${sockets.length} websocket`
    );

    // When you receive a message, send that message to every socket.
    socket.on("message", function (msg) {
      console.log("Message received!");
      sockets.forEach((s) => s.send(msg));
    });

    // When a socket closes, or disconnects, remove it from the array.
    socket.on("close", function () {
      sockets = sockets.filter((s) => s !== socket);
    });
  });

  return () => sockets;
};

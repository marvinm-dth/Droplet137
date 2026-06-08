const { debugLog } = require('../../helpers/debug.helper');
const {
  Notification,
} = require('../../models/table.model');

const subscribeClients = [];

exports.subscribe = async (req, res) => {
  console.log("Client Connected");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  subscribeClients.push(res);

  const notifications = await Notification.getAll("id, type, message, created_at");
  res.write(`data: ${JSON.stringify(notifications)}\n\n`);

  req.on('close', () => {
    console.log("Client Disconnected");
    subscribeClients.splice(subscribeClients.indexOf(res), 1);
  });
}


exports.createNotification = async (type, message) => {
  try {
    await Notification.insert({ type, message });
    await broadcast()
  } catch (error) {
    debugLog("error", error.message);
  }
}


async function broadcast() {
  const notifications = await Notification.getAll("id, type, message, created_at");
  subscribeClients.forEach((client) => {
    try {
      client.write(`data: ${JSON.stringify(notifications)}\n\n`);
    } catch (err) {
      console.error(`Error sending to client ${client.id}:`, err);
    }
  });
}
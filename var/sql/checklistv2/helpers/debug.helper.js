const typeColor = {
  "reset": "\x1b[0m",
  "danger" : "\x1b[31m",
  "success": "\x1b[32m",
  "warning": "\x1b[33m"
};

function debugLog(type, ...args) {
  const stack = new Error().stack.split('\n')[2];
  const match = stack.match(/\s+at\s+(.*)/);
  if (!match) return;
  const location = match[1];
  console.log(`${typeColor[type]}`,`[DEBUG] ${location}:`, ...args, `\x1b[0m`);
}

module.exports = {
  debugLog,
};

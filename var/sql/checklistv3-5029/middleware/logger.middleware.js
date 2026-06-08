let requestCount = 0;

exports.logger = (req, res, next) => {
  const now = new Date();
  const options = {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: true,
    timeZone: "Asia/Manila",
  };
  const localTime = new Intl.DateTimeFormat("en-PH", options).format(now);
  const user = req.user ? req.user : { name: "Anonymous" };
  // Log the info
  console.log(
    `[${localTime}] User: ${user.name}|${user.role} => ${req.method} ${req.originalUrl}`
  );
  next();
};

exports.loggerVerbose = (req, res, next) => {
  requestCount++;
  const startTime = Date.now();

  // Log request details
  console.log(`\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);

  console.log(`Request since start: #${requestCount}`);

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

  console.log(`> Host:`, req.headers.host);
  console.log(`> Client IP: ${req.ip}`);
  console.log(`> Query Params:`, JSON.stringify(req.query));
  console.log(`> Body:`, JSON.stringify(req.body));
  console.log(`> Cookies:`, req.cookies || "No cookies");
  console.log(`> Headers:`, req.headers);

  // Wait for the response to finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} - ${
        res.statusCode
      } ${duration}ms`
    );
  });

  next();
};

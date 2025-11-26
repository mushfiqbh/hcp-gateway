const axios = require("axios");
const winston = require("winston");
const { loadConfig } = require("../configManager");
const attendanceController = require("../controllers/attendanceController");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const serializedMeta = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `${timestamp} [attendance-forwarder] ${level}: ${message}${serializedMeta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

let isJobRunning = false;

function resolveOptions(overrides = {}) {
  const config = loadConfig();
  return {
    endpoint: overrides.endpoint ?? config.INTEGRATION_ENDPOINT,
  };
}

async function forwardAttendance(endpoint) {
  if (!endpoint) {
    logger.error("Attendance forwarder skipped: endpoint not configured");
    return;
  }

  if (isJobRunning) {
    logger.warn(
      "Attendance forward job skipped because previous invocation is still running"
    );
    return;
  }

  isJobRunning = true;
  try {
    const { status, body } = await attendanceController.fetchAttendance();
    if (status !== 200) {
      logger.warn("Attendance fetch did not succeed", { status });
      return;
    }

    const response = await axios.post(endpoint, body);
    logger.info("Attendance payload forwarded", {
      status: response.status,
      endpoint,
      recordCount: Array.isArray(body?.data) ? body.data.length : 0,
    });
  } catch (error) {
    logger.error("Attendance forward failed", {
      message: error.message,
    });
  } finally {
    isJobRunning = false;
  }
}

async function runAttendanceForwarder(overrides = {}) {
  const options = resolveOptions(overrides);
  if (!options.endpoint) {
    logger.error("Attendance forwarder skipped: endpoint not configured");
    return;
  }
  await forwardAttendance(options.endpoint);
}

module.exports = {
  runAttendanceForwarder,
};

const winston = require("winston");
const { loadConfig } = require("./configManager");
const { startSchedule, stopSchedule } = require("./scheduler");
const { runAttendanceForwarder } = require("./jobs/attendanceForwarder");
const { runCsvSendJob } = require("./jobs/csvSendJob");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const serializedMeta = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `${timestamp} [integration-manager] ${level}: ${message}${serializedMeta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

let activeIntegration = null;

function normalizeIntegration(value) {
  return value === "csvUploader" ? "csvUploader" : "attendanceForwarder";
}

function activateIntegration(type) {
  const normalized = normalizeIntegration(type);

  stopSchedule();

  let snapshot = null;

  if (normalized === "csvUploader") {
    const result = startSchedule(runCsvSendJob, {
      jobLabel: "CSV data sender",
    });
    snapshot = result.snapshot;
    activeIntegration = "csvUploader";
    logger.info("CSV data sender integration activated", {
      scheduleCount: snapshot?.scheduleCount || 0,
      nextRun: snapshot?.nextRun || null,
    });
  } else {
    const result = startSchedule(runAttendanceForwarder, {
      jobLabel: "Attendance forwarder",
    });
    snapshot = result.snapshot;
    activeIntegration = "attendanceForwarder";
    logger.info("Attendance forwarder integration activated", {
      scheduleCount: snapshot?.scheduleCount || 0,
      nextRun: snapshot?.nextRun || null,
    });
  }
}

function startIntegrationManager() {
  const config = loadConfig();
  const desired = normalizeIntegration(config.ACTIVE_INTEGRATION);
  activateIntegration(desired);
}

function reloadIntegration() {
  startIntegrationManager();
}

function stopIntegrationManager() {
  stopSchedule();
  activeIntegration = null;
  logger.info("Integrations stopped");
}

function getActiveIntegration() {
  return activeIntegration;
}

module.exports = {
  startIntegrationManager,
  reloadIntegration,
  stopIntegrationManager,
  getActiveIntegration,
};

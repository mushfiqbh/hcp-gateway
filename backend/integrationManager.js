const winston = require("winston");
const { loadConfig } = require("./configManager");
const { startSchedule, stopSchedule } = require("./scheduler");
const { runCsvSendJob } = require("./csvSendJob");

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



function activateIntegration() {
  stopSchedule();

  let snapshot = null;

  const result = startSchedule(runCsvSendJob, {
    jobLabel: "CSV data sender",
  });
  snapshot = result.snapshot;
  logger.info("CSV data sender integration activated", {
    scheduleCount: snapshot?.scheduleCount || 0,
    nextRun: snapshot?.nextRun || null,
  });
}

function startIntegrationManager() {
  activateIntegration();
}

function reloadIntegration() {
  startIntegrationManager();
}

function stopIntegrationManager() {
  stopSchedule();
  logger.info("Integrations stopped");
}

function getActiveIntegration() {
  return "csvUploader";
}

module.exports = {
  startIntegrationManager,
  reloadIntegration,
  stopIntegrationManager,
  getActiveIntegration,
};

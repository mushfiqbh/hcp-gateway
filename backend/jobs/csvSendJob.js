const winston = require("winston");
const { loadConfig, INTEGRATION_ENDPOINT } = require("../configManager");
const {
  sendDailyCsvData,
  CsvFileNotFoundError,
  CsvEndpointMissingError,
  CsvDirectoryMissingError,
} = require("../uploader");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const serializedMeta = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `${timestamp} [csv-job] ${level}: ${message}${serializedMeta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

let isJobRunning = false;

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveOptions(overrides = {}) {
  const config = loadConfig();

  const directory = overrides.directory ?? config.CSV_UPLOAD_DIR;
  const endpoint = overrides.endpoint ?? INTEGRATION_ENDPOINT;
  const maxRetries = toPositiveInteger(
    overrides.maxRetries ?? config.CSV_UPLOAD_MAX_RETRIES,
    3
  );
  const retryDelaySeconds = toPositiveInteger(
    overrides.retryDelaySeconds ?? config.CSV_UPLOAD_RETRY_DELAY_SECONDS,
    60
  );
  const timeoutMs = toPositiveInteger(
    overrides.timeoutMs ?? config.CSV_UPLOAD_TIMEOUT_MS,
    120000
  );

  return {
    directory,
    endpoint,
    maxRetries,
    retryDelayMs: retryDelaySeconds * 1000,
    timeoutMs,
    schoolId: overrides.schoolId ?? config.SCHOOL_ID,
    schoolDomain: overrides.schoolDomain ?? config.SCHOOL_DOMAIN,
  };
}

async function runCsvSendJob(overrides = {}) {
  if (isJobRunning) {
    logger.warn("CSV send job skipped because the previous run is still in progress");
    return;
  }

  const options = resolveOptions(overrides);
  if (!options.endpoint) {
    const error = new CsvEndpointMissingError();
    logger.error(error.message);
    return;
  }

  if (!options.directory) {
    const error = new CsvDirectoryMissingError();
    logger.error(error.message);
    return;
  }

  isJobRunning = true;
  try {
    await sendDailyCsvData(options);
  } catch (error) {
    if (error instanceof CsvFileNotFoundError) {
      logger.warn("CSV file for data send not found", {
        directory: options.directory,
        day: error.referenceDate,
      });
    } else if (error instanceof CsvEndpointMissingError) {
      logger.error("CSV data send skipped because endpoint is missing in configuration");
    } else if (error instanceof CsvDirectoryMissingError) {
      logger.error("CSV data send skipped because directory is missing in configuration");
    } else {
      logger.error("CSV send job failed", {
        message: error.message,
      });
    }
  } finally {
    isJobRunning = false;
  }
}

module.exports = { runCsvSendJob };

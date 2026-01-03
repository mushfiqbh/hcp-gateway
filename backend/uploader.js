const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("csv-parse/sync");
const dayjs = require("dayjs");
const winston = require("winston");

const fsPromises = fs.promises;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const serializedMeta = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `${timestamp} [csv-sender] ${level}: ${message}${serializedMeta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

class CsvProcessingError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CsvProcessingError";
    if (options.cause) this.cause = options.cause;
    if (Error.captureStackTrace)
      Error.captureStackTrace(this, CsvProcessingError);
  }
}

class CsvFileNotFoundError extends CsvProcessingError {
  constructor(directory, referenceDate) {
    super("CSV file not found for the configured day");
    this.code = "CSV_FILE_NOT_FOUND";
    this.directory = directory;
    this.referenceDate = dayjs(referenceDate).format("YYYY-MM-DD");
  }
}

class CsvEndpointMissingError extends CsvProcessingError {
  constructor() {
    super("CSV endpoint is not configured");
    this.code = "CSV_ENDPOINT_MISSING";
  }
}

class CsvDirectoryMissingError extends CsvProcessingError {
  constructor() {
    super("CSV directory is not configured");
    this.code = "CSV_DIRECTORY_MISSING";
  }
}

function normalizeDirectory(directory) {
  if (!directory) return directory;
  return path.isAbsolute(directory)
    ? directory
    : path.resolve(process.cwd(), directory);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findTodayCsvFile(directory, referenceDate = new Date()) {
  const resolvedDir = normalizeDirectory(directory);

  try {
    await fsPromises.access(resolvedDir, fs.constants.R_OK);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      logger.warn("CSV directory does not exist", {
        directory: resolvedDir,
      });
      return null;
    }
    throw new CsvProcessingError("Unable to access CSV directory", {
      cause: error,
    });
  }

  let entries;
  try {
    entries = await fsPromises.readdir(resolvedDir, { withFileTypes: true });
  } catch (error) {
    throw new CsvProcessingError("Failed to read CSV directory", {
      cause: error,
    });
  }

  const targetDay = dayjs(referenceDate).format("YYYY-MM-DD");
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".csv")) continue;

    const fullPath = path.join(resolvedDir, entry.name);

    let stats;
    try {
      stats = await fsPromises.stat(fullPath);
    } catch (error) {
      logger.warn("Skipping CSV file with unreadable stats", {
        file: fullPath,
        error: error.message,
      });
      continue;
    }

    const modifiedDay = dayjs(stats.mtime).format("YYYY-MM-DD");
    const createdDay = dayjs(stats.birthtime).format("YYYY-MM-DD");

    if (modifiedDay === targetDay || createdDay === targetDay) {
      candidates.push({ fullPath, stats });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  return candidates[0].fullPath;
}

async function parseCsvFile(filePath) {
  const fileContent = await fsPromises.readFile(filePath, "utf-8");
  
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Transform CSV records to the expected format
  const attendanceData = records.map(record => ({
    personCode: record["Person ID"] || record["\tPerson ID"],
    fullName:  record["First Name"] || record["\tFirst Name"],
    phone: record["Last Name"] || record["\tLast Name"],  // LastName used as phone number
    department: record["Department"] || record["\tDepartment"],
    mask: record["Mask"] || record["\tMask"],
    attendanceDate: record["Access Date"] || record["\tAccess Date"],
    attendanceTime: record["Card Swiping Time"] || record["\tCard Swiping Time"],
    attendanceStatus: record["Attendance Status"] || record["\tAttendance Status"],
  }));

  return attendanceData;
}

async function sendJsonData(data, endpoint, timeoutMs, extraFields = {}) {
  const payload = {
    ...extraFields,
    data,
  };

  const response = await axios.post(endpoint, payload, {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: timeoutMs,
  });

  return response;
}

async function sendDailyCsvData(options) {
  const {
    directory,
    endpoint,
    maxRetries = 3,
    retryDelayMs = 60000,
    timeoutMs = 120000,
    referenceDate = new Date(),
    schoolId,
    schoolDomain,
  } = options;

  if (!endpoint) {
    const error = new CsvEndpointMissingError();
    logger.error(error.message);
    throw error;
  }

  if (!directory) {
    const error = new CsvDirectoryMissingError();
    logger.error(error.message);
    throw error;
  }

  const todayFile = await findTodayCsvFile(directory, referenceDate);

  if (!todayFile) {
    const error = new CsvFileNotFoundError(directory, referenceDate);
    logger.warn(error.message, {
      directory: normalizeDirectory(directory),
      day: error.referenceDate,
    });
    throw error;
  }

  // Parse the CSV file
  let parsedData;
  try {
    parsedData = await parseCsvFile(todayFile);
    logger.info("CSV file parsed successfully", {
      file: todayFile,
      recordCount: parsedData.length,
    });
  } catch (error) {
    const parseError = new CsvProcessingError("Failed to parse CSV file", {
      cause: error,
    });
    parseError.code = "CSV_PARSE_FAILED";
    parseError.filePath = todayFile;
    logger.error("CSV parse failed", {
      file: todayFile,
      error: error.message,
    });
    throw parseError;
  }

  let attempt = 0;
  let lastError = null;

  const metadata = {
    date: dayjs(referenceDate).format("YYYY-MM-DD"),
    school_id: schoolId || "",
    school_domain: schoolDomain || "",
  };

  while (attempt < maxRetries) {
    attempt += 1;

    try {
      const response = await sendJsonData(parsedData, endpoint, timeoutMs, metadata);
      logger.info("CSV data sent successfully as JSON", {
        file: todayFile,
        endpoint,
        status: response.status,
        recordCount: parsedData.length,
        attempt,
      });
      return {
        filePath: todayFile,
        status: response.status,
        recordCount: parsedData.length,
        attempt,
      };
    } catch (error) {
      lastError = error;
      logger.error("CSV data send attempt failed", {
        file: todayFile,
        endpoint,
        attempt,
        error: error.message,
      });

      if (attempt >= maxRetries) {
        break;
      }

      await delay(retryDelayMs);
    }
  }

  const finalError = new CsvProcessingError(
    `Failed to send CSV data after ${maxRetries} attempts`,
    { cause: lastError }
  );
  finalError.code = "CSV_SEND_FAILED";
  finalError.filePath = todayFile;
  finalError.attempts = attempt;
  throw finalError;
}

module.exports = {
  sendDailyCsvData,
  findTodayCsvFile,
  parseCsvFile,
  CsvProcessingError,
  CsvFileNotFoundError,
  CsvEndpointMissingError,
  CsvDirectoryMissingError,
};

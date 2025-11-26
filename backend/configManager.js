const fs = require("fs");
const path = require("path");
let app = null;
try {
  ({ app } = require("electron"));
} catch (err) {
  app = null;
}

const CONFIG_DIR =
  app && typeof app.getPath === "function"
    ? app.getPath("userData")
    : path.join(process.cwd(), "user-data");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const INTEGRATION_ENDPOINT = "https://cloud.barnomala.com/api/attendance/receive";

const defaultConfig = {
  ACTIVE_INTEGRATION: "attendanceForwarder",
  INTEGRATION_ENDPOINT: INTEGRATION_ENDPOINT,
  CRON_SCHEDULE: "",
  DAILY_RUN_TIMES: ["09:00", "18:00"],
  HIKCENTRAL_BASE_URI: "https://127.0.0.1:443",
  HIKCENTRAL_APP_KEY: "58091009",
  HIKCENTRAL_APP_SECRET: "MEDn5akD4lxlAAJGs2lO",
  HIKCENTRAL_USER_ID: "admin",
  SCHOOL_ID: "0",
  SCHOOL_DOMAIN: "example.edu.bd",
  CSV_UPLOAD_DIR: "C:/Users/HP/Downloads/AcsRecords",
  CSV_UPLOAD_MAX_RETRIES: 3,
  CSV_UPLOAD_RETRY_DELAY_SECONDS: 60,
  CSV_UPLOAD_TIMEOUT_MS: 120000,
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      saveConfig(defaultConfig);
      return defaultConfig;
    }
    const data = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(data);
    const merged = { ...defaultConfig, ...parsed };
    delete merged.CSV_UPLOAD_CRON;
    delete merged.CSV_UPLOAD_RUN_TIMES;
    merged.INTEGRATION_ENDPOINT = INTEGRATION_ENDPOINT;
    return merged;
  } catch (error) {
    console.error("Failed to load config:", error);
    return defaultConfig;
  }
}

function saveConfig(newConfig) {
  try {
    // Ensure directory exists before writing (useful when running outside Electron)
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    } catch (e) {
      // ignore mkdir errors and let write fail if necessary
    }
    const sanitized = { ...newConfig };
    delete sanitized.CSV_UPLOAD_CRON;
    delete sanitized.CSV_UPLOAD_RUN_TIMES;
    sanitized.INTEGRATION_ENDPOINT = INTEGRATION_ENDPOINT;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitized, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save config:", error);
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  CONFIG_PATH,
  INTEGRATION_ENDPOINT,
};

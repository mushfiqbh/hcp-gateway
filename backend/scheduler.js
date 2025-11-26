const cron = require("node-cron");
const winston = require("winston");
const { loadConfig } = require("./configManager");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const serializedMeta = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `${timestamp} [integration-scheduler] ${level}: ${message}${serializedMeta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

let scheduledTasks = [];
let scheduleSnapshot = null;
let isJobRunning = false;

function normalizeRunTimes(value) {
  if (!Array.isArray(value)) return [];
  const valid = [];
  value.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (!normalized) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
      logger.warn("Ignoring invalid run time", { time: entry });
      return;
    }
    valid.push(normalized);
  });
  return Array.from(new Set(valid));
}

function resolveScheduleOptions(overrides = {}) {
  const config = loadConfig();
  const cronExpression = overrides.cronExpression ?? config.CRON_SCHEDULE;
  const runTimes = normalizeRunTimes(overrides.runTimes ?? config.DAILY_RUN_TIMES);
  return {
    cronExpression,
    runTimes,
  };
}

function collectNextRun(task) {
  if (!task || typeof task.nextDates !== "function") return null;
  try {
    return task.nextDates();
  } catch (error) {
    return null;
  }
}

function formatNextRun(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike.toISO === "function") return dateLike.toISO();
  if (typeof dateLike.toISOString === "function") return dateLike.toISOString();
  return String(dateLike);
}

function stopSchedule() {
  if (!scheduledTasks.length) {
    scheduleSnapshot = null;
    isJobRunning = false;
    return;
  }

  scheduledTasks.forEach((task) => {
    try {
      task.stop();
    } catch (error) {
      logger.error("Failed to stop scheduled task", {
        message: error.message,
      });
    }
  });
  scheduledTasks = [];
  scheduleSnapshot = null;
  isJobRunning = false;
  logger.info("Integration scheduler stopped");
}

function createCronTask(cronExpression, jobLabel, runner) {
  try {
    const task = cron.schedule(cronExpression, runner, {
      scheduled: false,
    });
    logger.info("Integration job scheduled", { cronExpression, jobLabel });
    return task;
  } catch (error) {
    logger.error("Failed to schedule integration job", {
      cronExpression,
      jobLabel,
      message: error.message,
    });
    return null;
  }
}

function startSchedule(jobRunner, options = {}) {
  if (typeof jobRunner !== "function") {
    throw new TypeError("jobRunner must be a function");
  }

  const {
    jobLabel = "integration-job",
    runImmediately = true,
    scheduleOverrides = {},
  } = options;

  stopSchedule();

  const scheduleOptions = resolveScheduleOptions(scheduleOverrides);
  const { cronExpression, runTimes } = scheduleOptions;

  const tasks = [];

  const execute = () => {
    if (isJobRunning) {
      logger.warn("Integration job skipped because previous run is still in progress", {
        jobLabel,
      });
      return;
    }
    isJobRunning = true;
    Promise.resolve()
      .then(() => jobRunner())
      .catch((error) => {
        logger.error("Integration job execution failed", {
          jobLabel,
          message: error && error.message ? error.message : String(error),
        });
      })
      .finally(() => {
        isJobRunning = false;
      });
  };

  if (runTimes.length > 0) {
    runTimes.forEach((time) => {
      const [hour, minute] = time.split(":");
      const expression = `${minute} ${hour} * * *`;
      const task = createCronTask(expression, `${jobLabel} (daily@${time})`, execute);
      if (task) tasks.push(task);
    });
  } else if (cronExpression) {
    if (!cron.validate(cronExpression)) {
      logger.error("Integration scheduler not started: invalid cron expression", {
        jobLabel,
        cronExpression,
      });
      return { tasks: [], snapshot: null };
    }
    const task = createCronTask(cronExpression, jobLabel, execute);
    if (task) tasks.push(task);
  } else {
    logger.warn(
      "Integration scheduler not started: configure run times or a cron expression",
      { jobLabel }
    );
    return { tasks: [], snapshot: null };
  }

  if (!tasks.length) {
    logger.warn("Integration scheduler not started: no valid schedules configured", {
      jobLabel,
    });
    return { tasks: [], snapshot: null };
  }

  scheduledTasks = tasks;
  scheduledTasks.forEach((task) => task.start());

  const nextRuns = scheduledTasks
    .map(collectNextRun)
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = typeof a.valueOf === "function" ? a.valueOf() : new Date(a).getTime();
      const bTime = typeof b.valueOf === "function" ? b.valueOf() : new Date(b).getTime();
      return aTime - bTime;
    });

  scheduleSnapshot = {
    jobLabel,
    cronExpression: cronExpression || "",
    runTimes,
    nextRun: formatNextRun(nextRuns[0]) || null,
    scheduleCount: scheduledTasks.length,
  };

  logger.info("Integration scheduler started", scheduleSnapshot);

  if (runImmediately && scheduledTasks.length > 0) {
    execute();
  }

  return { tasks: scheduledTasks, snapshot: { ...scheduleSnapshot } };
}

function getScheduleSnapshot() {
  if (!scheduleSnapshot) return null;
  return { ...scheduleSnapshot };
}

module.exports = {
  startSchedule,
  stopSchedule,
  getScheduleSnapshot,
};

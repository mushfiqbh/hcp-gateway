// renderer.js — handles UI for attendance forwarder and CSV uploader settings

(function () {
  const MAIN_TAB_KEY = "lastTab";

  let configState = null;

  function $id(id) {
    return document.getElementById(id);
  }

  function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  function toNonNegativeInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
  }

  function showMessage(text, isError = false) {
    const msg = $id("message");
    const row = $id("messageRow");
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? "#b91c1c" : "var(--accent)";
    if (row) row.removeAttribute("hidden");
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => {
      msg.textContent = "";
    }, 4000);
  }



  function formatRunTimes(times) {
    if (!Array.isArray(times) || times.length === 0) return "Not set";
    return times.join(", ");
  }

  function updateHomeStatus() {
    if (!configState) return;

    const cronEl = $id("homeCronValue");
    if (cronEl) {
      if (configState.SCHEDULE_MODE === "interval") {
        cronEl.textContent = "Every 5 Minutes";
      } else {
        cronEl.textContent = configState.CRON_SCHEDULE || "Not set";
      }
    }

    const runTimesEl = $id("homeRunTimesValue");
    if (runTimesEl) {
      if (configState.SCHEDULE_MODE === "interval") {
        runTimesEl.textContent = "Disabled (using interval)";
      } else {
        runTimesEl.textContent = formatRunTimes(configState.DAILY_RUN_TIMES);
      }
    }

    const lastUploadEl = $id("statusLastUpload");
    if (lastUploadEl) {
      if (configState.LAST_UPLOAD_TIME) {
        try {
          lastUploadEl.textContent = new Date(
            configState.LAST_UPLOAD_TIME
          ).toLocaleString();
        } catch (e) {
          lastUploadEl.textContent = configState.LAST_UPLOAD_TIME;
        }
      } else {
        lastUploadEl.textContent = "Never";
      }
    }
  }

  async function refreshSystemStatus() {
    if (!window.statuscheckAPI) return;
    try {
      const results = await window.statuscheckAPI.check();
      const setStatus = (id, info) => {
        const el = $id(id);
        if (!el) return;
        el.textContent = info.message;
        el.style.color = info.ok ? "green" : "red";
      };

      setStatus("statusEndpoint", results.endpoint);
      setStatus("statusCsv", results.csv);
    } catch (error) {
      console.error("Status check failed", error);
    }
  }

  function applyConfigToUI() {
    if (!configState) return;

    const times = Array.isArray(configState.DAILY_RUN_TIMES)
      ? configState.DAILY_RUN_TIMES
      : [];
    $DailyTime1 = $id("dailyTime1");
    if ($DailyTime1) $DailyTime1.value = times[0] || "";
    $DailyTime2 = $id("dailyTime2");
    if ($DailyTime2) $DailyTime2.value = times[1] || "";
    $ScheduleMode = $id("scheduleMode");
    if ($ScheduleMode) $ScheduleMode.value = configState.SCHEDULE_MODE || "daily";
    $id("schoolId").value = configState.SCHOOL_ID || "";
    $id("schoolDomain").value = configState.SCHOOL_DOMAIN || "";

    $CSVDir = $id("csvDirectory");
    if ($CSVDir) $CSVDir.value = configState.CSV_UPLOAD_DIR || "";



    updateHomeStatus();
    
    // Update time fields state if the helper exists
    const scheduleModeSelect = $id("scheduleMode");
    if (scheduleModeSelect) {
      const mode = scheduleModeSelect.value;
      const t1 = $id("dailyTime1");
      const t2 = $id("dailyTime2");
      if (t1) t1.disabled = mode === "interval";
      if (t2) t2.disabled = mode === "interval";
    }
  }

  async function loadConfig() {
    try {
      configState = await window.configAPI.get();
      applyConfigToUI();
      refreshSystemStatus();
    } catch (error) {
      console.error("Failed to load configuration", error);
      showMessage("Failed to load settings", true);
    }
  }

  function gatherConfigFromForm() {
    const next = { ...(configState || {}) };
    $ScheduleMode = $id("scheduleMode");
    if ($ScheduleMode) next.SCHEDULE_MODE = $ScheduleMode.value;
    const runTimes = [
      ($id("dailyTime1").value || "").trim(),
      ($id("dailyTime2").value || "").trim(),
    ].filter(Boolean);
    next.DAILY_RUN_TIMES = Array.from(new Set(runTimes));
    $SchoolId = $id("schoolId");
    if ($SchoolId) next.SCHOOL_ID = $SchoolId.value.trim();
    $SchoolDomain = $id("schoolDomain");
    if ($SchoolDomain) next.SCHOOL_DOMAIN = $SchoolDomain.value.trim();

    $CSVDir = $id("csvDirectory");
    if ($CSVDir) next.CSV_UPLOAD_DIR = $CSVDir.value.trim();

    delete next.CSV_UPLOAD_RUN_TIMES;
    delete next.CSV_UPLOAD_CRON;
    delete next.INTEGRATION_ENDPOINT;
    delete next.INTEGRATION_ENDPOINT;

    return next;
  }

  function validateRunTimes(times) {
    for (const t of times) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
        return { ok: false, message: `Invalid time format: ${t}` };
      }
    }
    return { ok: true };
  }

  function hasSchedule(times, cron) {
    return (Array.isArray(times) && times.length > 0) || Boolean(cron);
  }

  function validateConfig(config) {
    const runTimes = Array.isArray(config.DAILY_RUN_TIMES)
      ? config.DAILY_RUN_TIMES
      : [];
    const cronExpression = config.CRON_SCHEDULE || "";

    if (config.SCHEDULE_MODE === "daily") {
      if (runTimes.length === 0) {
        return {
          ok: false,
          message: "Provide at least one run time",
        };
      }
      const validation = validateRunTimes(runTimes);
      if (!validation.ok) {
        return validation;
      }
    }

    if (!config.CSV_UPLOAD_DIR) {
      return { ok: false, message: "CSV directory is required" };
    }
    return { ok: true };
  }



  function showTab(name) {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      const isActive = tab.id === `tab-${name}`;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    const mainPanels = ["home", "settings"];
    mainPanels.forEach((panelName) => {
      const panel = $id(`${panelName}Panel`);
      if (!panel) return;
      if (panelName === name) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    const configForm = $id("configForm");
    if (configForm) {
      const shouldShowForm = name !== "home";
      if (shouldShowForm) configForm.removeAttribute("hidden");
      else configForm.setAttribute("hidden", "");
    }

    const messageRow = $id("messageRow");
    if (messageRow) {
      if (name !== "home") messageRow.removeAttribute("hidden");
      else messageRow.setAttribute("hidden", "");
    }

    loadConfig();
  }

  async function handleSave(event) {
    if (event) event.preventDefault();
    const saveButtons = Array.from(
      document.querySelectorAll('[data-action="save"]')
    );
    saveButtons.forEach((btn) => {
      btn.disabled = true;
    });

    const updatedConfig = gatherConfigFromForm();
    const validation = validateConfig(updatedConfig);
    if (!validation.ok) {
      showMessage(validation.message, true);
      saveButtons.forEach((btn) => {
        btn.disabled = false;
      });
      return;
    }

    try {
      const saved = await window.configAPI.save(updatedConfig);
      configState = saved;
      applyConfigToUI();
      showMessage("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save configuration", error);
      showMessage("Failed to save settings", true);
    } finally {
      saveButtons.forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const tabHome = $id("tab-home");
    const tabSettings = $id("tab-settings");
    if (tabHome) tabHome.addEventListener("click", () => showTab("home"));
    if (tabSettings)
      tabSettings.addEventListener("click", () => showTab("settings"));

    const openSettings = $id("openSettings");
    if (openSettings)
      openSettings.addEventListener("click", (event) => {
        event.preventDefault();
        showTab("settings");
      });

    const scheduleModeSelect = $id("scheduleMode");
    const updateTimeFieldsVisibility = () => {
      const mode = scheduleModeSelect.value;
      const t1 = $id("dailyTime1");
      const t2 = $id("dailyTime2");
      if (t1) t1.disabled = mode === "interval";
      if (t2) t2.disabled = mode === "interval";
    };
    if (scheduleModeSelect) {
      scheduleModeSelect.addEventListener("change", updateTimeFieldsVisibility);
    }

    const checkBtn = $id("checkUpdates");
    const homeMsg = $id("homeMessage");
    let unsubscribeUpdates = null;

    if (window.updateAPI && typeof window.updateAPI.onEvent === "function") {
      unsubscribeUpdates = window.updateAPI.onEvent((data) => {
        if (!homeMsg) return;
        switch (data && data.status) {
          case "available":
            homeMsg.textContent = "Update available — downloading...";
            break;
          case "downloaded":
            homeMsg.textContent = `Update downloaded: ${data.version || ""}`;
            break;
          case "not-available":
            homeMsg.textContent = "No update available";
            break;
          case "error":
            homeMsg.textContent = `Update error: ${data.message || data}`;
            break;
          default:
            homeMsg.textContent = "";
        }
      });
    }

    if (checkBtn) {
      checkBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        if (
          !window.updateAPI ||
          typeof window.updateAPI.checkForUpdates !== "function"
        ) {
          if (homeMsg) homeMsg.textContent = "Update API not available";
          return;
        }
        checkBtn.disabled = true;
        if (homeMsg) homeMsg.textContent = "Checking for updates...";
        try {
          const response = await window.updateAPI.checkForUpdates();
          if (!response || !response.ok) {
            homeMsg.textContent = `Check failed: ${
              response && response.error ? response.error : "unknown"
            }`;
          } else {
            const info = response.info || {};
            if (info.updateInfo && info.updateInfo.version)
              homeMsg.textContent = `Checked — ${info.updateInfo.version}`;
            else homeMsg.textContent = "Check completed";
          }
        } catch (error) {
          console.error("checkUpdates failed", error);
          if (homeMsg)
            homeMsg.textContent = `Check failed: ${
              error && error.message ? error.message : error
            }`;
        } finally {
          checkBtn.disabled = false;
        }
      });
    }

    const form = $id("configForm");
    if (form) form.addEventListener("submit", handleSave);
    document.querySelectorAll('[data-action="save"]').forEach((btn) => {
      btn.addEventListener("click", handleSave);
    });
    document.querySelectorAll('[data-action="reset"]').forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadConfig();
        showMessage("Reverted to saved settings");
      });
    });

    const csvDirectoryBrowse = $id("csvDirectoryBrowse");
    if (csvDirectoryBrowse && window.dialogAPI) {
      csvDirectoryBrowse.addEventListener("click", async () => {
        try {
          const result = await window.dialogAPI.selectDirectory(
            $id("csvDirectory").value || ""
          );
          if (
            result &&
            result.canceled === false &&
            Array.isArray(result.filePaths)
          ) {
            const selected = result.filePaths[0];
            if (selected) {
              $id("csvDirectory").value = selected;
            }
          }
        } catch (error) {
          console.error("Directory selection failed", error);
          showMessage("Failed to select directory", true);
        }
      });
    }

    showTab("home");
    setInterval(refreshSystemStatus, 30000); // refresh every 30s

    window.addEventListener("beforeunload", () => {
      if (typeof unsubscribeUpdates === "function") unsubscribeUpdates();
    });
  });
})();

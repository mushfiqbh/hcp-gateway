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

  function humanizeIntegration(value) {
    if (value === "csvUploader") return "Attendance CSV Uploader";
    if (value === "attendanceForwarder" || !value) return "Attendance Forwarder";
    return value;
  }

  function formatRunTimes(times) {
    if (!Array.isArray(times) || times.length === 0) return "Not set";
    return times.join(", ");
  }

  function updateHomeStatus() {
    if (!configState) return;

    const integrationEl = $id("homeActiveIntegrationValue");
    if (integrationEl)
      integrationEl.textContent = humanizeIntegration(
        configState.ACTIVE_INTEGRATION
      );

    const cronEl = $id("homeCronValue");
    if (cronEl)
      cronEl.textContent = configState.CRON_SCHEDULE
        ? configState.CRON_SCHEDULE
        : "Not set";

    const runTimesEl = $id("homeRunTimesValue");
    if (runTimesEl)
      runTimesEl.textContent = formatRunTimes(configState.DAILY_RUN_TIMES);
  }

  function applyConfigToUI() {
    if (!configState) return;

    const times = Array.isArray(configState.DAILY_RUN_TIMES)
      ? configState.DAILY_RUN_TIMES
      : [];
    $id("dailyTime1").value = times[0] || "";
    $id("dailyTime2").value = times[1] || "";
    $id("scheduleCron").value = configState.CRON_SCHEDULE || "";
    $id("hikcentralBaseUri").value = configState.HIKCENTRAL_BASE_URI || "";
    $id("hikcentralAppKey").value = configState.HIKCENTRAL_APP_KEY || "";
    $id("hikcentralAppSecret").value = configState.HIKCENTRAL_APP_SECRET || "";
    $id("hikcentralUserId").value = configState.HIKCENTRAL_USER_ID || "";
    $id("schoolId").value = configState.SCHOOL_ID || "";
    $id("schoolDomain").value = configState.SCHOOL_DOMAIN || "";

    $id("csvDirectory").value = configState.CSV_UPLOAD_DIR || "";
    $id("csvMaxRetries").value =
      configState.CSV_UPLOAD_MAX_RETRIES ?? 3;
    $id("csvRetryDelay").value =
      configState.CSV_UPLOAD_RETRY_DELAY_SECONDS ?? 60;
    $id("csvTimeout").value = configState.CSV_UPLOAD_TIMEOUT_MS ?? 120000;

    const activeIntegration =
      configState.ACTIVE_INTEGRATION || "attendanceForwarder";
    const enableForwarderBtn = $id("enableForwarder");
    if (enableForwarderBtn) {
      const isActive = activeIntegration === "attendanceForwarder";
      enableForwarderBtn.disabled = isActive;
      enableForwarderBtn.textContent = isActive ? "Active" : "Enable";
      enableForwarderBtn.setAttribute("aria-pressed", String(isActive));
    }

    const enableCsvBtn = $id("enableCsv");
    if (enableCsvBtn) {
      const isActive = activeIntegration === "csvUploader";
      enableCsvBtn.disabled = isActive;
      enableCsvBtn.textContent = isActive ? "Active" : "Enable";
      enableCsvBtn.setAttribute("aria-pressed", String(isActive));
    }

    updateHomeStatus();
  }

  async function loadConfig() {
    try {
      configState = await window.configAPI.get();
      applyConfigToUI();
    } catch (error) {
      console.error("Failed to load configuration", error);
      showMessage("Failed to load settings", true);
    }
  }

  function gatherConfigFromForm() {
    const next = { ...(configState || {}) };
    next.CRON_SCHEDULE = $id("scheduleCron").value.trim();
    const runTimes = [
      ($id("dailyTime1").value || "").trim(),
      ($id("dailyTime2").value || "").trim(),
    ].filter(Boolean);
    next.DAILY_RUN_TIMES = Array.from(new Set(runTimes));
    next.HIKCENTRAL_BASE_URI = $id("hikcentralBaseUri").value.trim();
    next.HIKCENTRAL_APP_KEY = $id("hikcentralAppKey").value.trim();
    next.HIKCENTRAL_APP_SECRET = $id("hikcentralAppSecret").value;
    next.HIKCENTRAL_USER_ID = $id("hikcentralUserId").value.trim();
    next.SCHOOL_ID = $id("schoolId").value.trim();
    next.SCHOOL_DOMAIN = $id("schoolDomain").value.trim();

    next.CSV_UPLOAD_DIR = $id("csvDirectory").value.trim();
    next.CSV_UPLOAD_MAX_RETRIES = toPositiveInteger(
      $id("csvMaxRetries").value,
      configState?.CSV_UPLOAD_MAX_RETRIES ?? 3
    );
    next.CSV_UPLOAD_RETRY_DELAY_SECONDS = toPositiveInteger(
      $id("csvRetryDelay").value,
      configState?.CSV_UPLOAD_RETRY_DELAY_SECONDS ?? 60
    );
    next.CSV_UPLOAD_TIMEOUT_MS = toNonNegativeInteger(
      $id("csvTimeout").value,
      configState?.CSV_UPLOAD_TIMEOUT_MS ?? 120000
    );

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

    if (!hasSchedule(runTimes, cronExpression)) {
      return {
        ok: false,
        message: "Provide a cron expression or at least one run time",
      };
    }

    const validation = validateRunTimes(runTimes);
    if (!validation.ok) {
      return validation;
    }

    if (config.ACTIVE_INTEGRATION === "csvUploader") {
      if (!config.CSV_UPLOAD_DIR) {
        return { ok: false, message: "CSV directory is required" };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  async function handleEnableIntegration(type) {
    const allowed = ["attendanceForwarder", "csvUploader"];
    if (!allowed.includes(type)) return;

    if (!window.configAPI || typeof window.configAPI.save !== "function") {
      showMessage("Configuration API not available", true);
      return;
    }

    if (configState && configState.ACTIVE_INTEGRATION === type) {
      showMessage(`${humanizeIntegration(type)} already active`);
      return;
    }

    const buttonId = type === "attendanceForwarder" ? "enableForwarder" : "enableCsv";
    const button = $id(buttonId);
    if (button) button.disabled = true;

    try {
      const saved = await window.configAPI.save({ ACTIVE_INTEGRATION: type });
      configState = saved;
      applyConfigToUI();
      showMessage(`${humanizeIntegration(type)} enabled`);
    } catch (error) {
      console.error("Failed to enable integration", error);
      showMessage("Failed to enable integration", true);
    } finally {
      if (button) {
        const isActive = configState?.ACTIVE_INTEGRATION === type;
        button.disabled = isActive;
        button.textContent = isActive ? "Active" : "Enable";
        button.setAttribute("aria-pressed", String(isActive));
      }
    }
  }

  function showTab(name) {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      const isActive = tab.id === `tab-${name}`;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    const mainPanels = ["home", "settings", "forwarder", "uploader"]; 
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

    try {
      localStorage.setItem(MAIN_TAB_KEY, name);
    } catch (e) {}

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
    const tabForwarder = $id("tab-forwarder");
    const tabUploader = $id("tab-uploader");
    if (tabHome) tabHome.addEventListener("click", () => showTab("home"));
    if (tabSettings)
      tabSettings.addEventListener("click", () => showTab("settings"));
    if (tabForwarder)
      tabForwarder.addEventListener("click", () => showTab("forwarder"));
    if (tabUploader)
      tabUploader.addEventListener("click", () => showTab("uploader"));

    const openSettings = $id("openSettings");
    if (openSettings)
      openSettings.addEventListener("click", (event) => {
        event.preventDefault();
        showTab("settings");
      });

    const enableForwarderBtn = $id("enableForwarder");
    if (enableForwarderBtn)
      enableForwarderBtn.addEventListener("click", () =>
        handleEnableIntegration("attendanceForwarder")
      );

    const enableCsvBtn = $id("enableCsv");
    if (enableCsvBtn)
      enableCsvBtn.addEventListener("click", () =>
        handleEnableIntegration("csvUploader")
      );

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
          if (result && result.canceled === false && Array.isArray(result.filePaths)) {
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

    let initialMainTab = "home";
    try {
      initialMainTab = localStorage.getItem(MAIN_TAB_KEY) || "home";
    } catch (error) {}
    showTab(initialMainTab);

    window.addEventListener("beforeunload", () => {
      if (typeof unsubscribeUpdates === "function") unsubscribeUpdates();
    });
  });
})();

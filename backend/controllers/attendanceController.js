const dayjs = require("dayjs");
const AttendanceService = require("../services/attendanceService");
const { loadConfig } = require("../configManager");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
});

class AttendanceController {
  constructor() {
    this.attendanceService = new AttendanceService();
  }

  async fetchAttendance() {
    try {
      const begin = dayjs().startOf("day").toISOString();
      const end = dayjs().endOf("day").toISOString();

      console.log(begin);

      const data = await this.attendanceService.fetchAttendance(begin, end);

      if (!data) {
        return {
          status: 502,
          body: {
            success: false,
            message: "No response body received from HikCentral.",
            data: null,
          },
        };
      }

      const config = loadConfig();
      const schoolId = config.SCHOOL_ID || 0;
      const schoolDomain = config.SCHOOL_DOMAIN || "";
      const records = data?.data?.record ?? [];
      const personInfoCache = {};
      const payload = [];
      const fetchedAt = dayjs().toISOString();

      for (const record of records) {
        const personCode = record?.personInfo?.personCode;
        if (!personCode) continue;

        if (!personInfoCache[personCode]) {
          personInfoCache[personCode] =
            await this.attendanceService.fetchPersonInfo(personCode);
        }

        const personInfo = personInfoCache[personCode]?.data ?? {};
        const phoneNo =
          personInfo.phoneNo ||
          personInfo?.personInfo?.phoneNo ||
          personInfo?.[0]?.phoneNo ||
          null;

        let attendanceDate = record?.date;

        const attendanceStatus = String(
          record?.attendanceBaseInfo?.attendanceStatus ?? ""
        );
        const attendanceData = {
          schoolId: schoolId,
          schoolDomain: schoolDomain,
          personCode,
          attendanceDate,
          fullName: record?.personInfo?.fullName,
          phoneNo,
          attendanceStatus,
        };

        payload.push(attendanceData);
      }

      return {
        status: 200,
        body: {
          success: true,
          fetched_at: fetchedAt,
          data: payload,
        },
      };
    } catch (err) {
      logger.error("Failed to fetch attendance data", { error: err.message });
      return {
        status: 500,
        body: {
          success: false,
          message: "Failed to fetch attendance data.",
          error: err.message,
        },
      };
    }
  }
}

module.exports = new AttendanceController();

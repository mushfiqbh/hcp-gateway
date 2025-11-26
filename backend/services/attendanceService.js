const winston = require('winston');
const OpenAPIService = require('./openAPIService');

const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()],
});

class AttendanceService {
  constructor() {
    this.openAPIService = new OpenAPIService();
  }

  async fetchAttendance(beginTime, endTime) {
    const body = {
      attendanceReportRequest: {
        pageNo: 1,
        pageSize: 100,
        queryInfo: {
          beginTime,
          endTime,
          sortInfo: { sortField: 1, sortType: 1 },
        },
      },
    };

    const response = await this.openAPIService.sendRequest('getAttendance', body);

    if (!response || typeof response.status !== 'number') {
      logger.error('Attendance API returned unexpected response type');
      return null;
    }

    if (response.status < 200 || response.status >= 300) {
      logger.warn('Attendance API request failed', {
        status: response.status,
        body: response.data,
      });
      return null;
    }

    return response.data;
  }

  async fetchPersonInfo(personCode) {
    if (!personCode) return null;

    const body = { personCode };
    const response = await this.openAPIService.sendRequest('getPersonInfo', body);

    if (!response || typeof response.status !== 'number') {
      logger.error('Person info API returned unexpected response type', { personCode });
      return null;
    }

    if (response.status < 200 || response.status >= 300) {
      logger.warn('Person info API request failed', {
        personCode,
        status: response.status,
        body: response.data,
      });
      return null;
    }

    return response.data;
  }
}

module.exports = AttendanceService;
const winston = require('winston');
const OpenAPIService = require('./openAPIService');

const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()],
});

class PersonService {
  constructor() {
    this.openAPIService = new OpenAPIService();
  }

  async fetchPersonList() {
    const body = {
      pageNo: 1,
      pageSize: 100,
    };

    try {
      const response = await this.openAPIService.sendRequest('getPersonList', body);
      if (!response || typeof response.status !== 'number') {
        logger.error('Person list API returned unexpected response type');
        return null;
      }

      if (response.status < 200 || response.status >= 300) {
        logger.warn('Person list API request failed', {
          status: response.status,
          body: response.data,
        });
        return null;
      }

      return response.data;
    } catch (error) {
      logger.error('Person list API request failed', { error });
      return null;
    }
  }
}

module.exports = PersonService;

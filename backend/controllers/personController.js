const PersonService = require("../services/personService");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
});

class PersonController {
  constructor() {
    this.personService = new PersonService();
  }

  async getPersonList(req, res) {
    try {
      const data = await this.personService.fetchPersonList();      

      if (!data) {
        return res.status(502).json({
          success: false,
          message: "No response body received from HikCentral.",
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        data: data,
      });
    } catch (err) {
      logger.error("Failed to fetch person list", { error: err.message });
      return res.status(500).json({
        success: false,
        message: "Failed to fetch person list.",
        error: err.message,
      });
    }
  }
}

module.exports = new PersonController();
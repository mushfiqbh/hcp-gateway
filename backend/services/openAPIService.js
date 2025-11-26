const axios = require("axios");
const crypto = require("crypto");
const { loadConfig } = require("../configManager");

class OpenAPIService {
  constructor() {
    const config = loadConfig();
    this.baseUri = config.HIKCENTRAL_BASE_URI;
    this.appKey = config.HIKCENTRAL_APP_KEY;
    this.appSecret = config.HIKCENTRAL_APP_SECRET;
    this.userId = config.HIKCENTRAL_USER_ID;

    this.uriEnums = {
      getAttendance: "/artemis/api/attendance/v1/report",
      getPersonInfo: "/artemis/api/resource/v1/person/personCode/personInfo",
      getPersonList: "/artemis/api/resource/v1/person/personList",
    };
  }

  async sendRequest(enumKey, body) {
    const uri = this.uriEnums[enumKey];
    if (!uri) throw new Error(`Invalid API endpoint key: ${enumKey}`);

    const bodyString = JSON.stringify(body);
    const contentMD5 = crypto
      .createHash("md5")
      .update(bodyString)
      .digest("base64");
    const accept = "*/*";
    const contentType = "application/json;charset=UTF-8";
    const timestamp = Date.now();
    const headersToSign = ["x-ca-key", "x-ca-timestamp"];
    const signatureHeaders = headersToSign.join(",");

    const stringToSign =
      `POST\n${accept}\n${contentMD5}\n${contentType}\n` +
      `x-ca-key:${this.appKey}\n` +
      `x-ca-timestamp:${timestamp}\n` +
      uri;

    const signature = crypto
      .createHmac("sha256", this.appSecret)
      .update(stringToSign)
      .digest("base64");

    const headers = {
      Accept: accept,
      "Content-Type": contentType,
      "Content-MD5": contentMD5,
      userId: this.userId,
      "X-Ca-Key": this.appKey,
      "X-Ca-Timestamp": timestamp,
      "X-Ca-Signature-Headers": signatureHeaders,
      "X-Ca-Signature": signature,
    };

    try {
      const response = await axios.post(`${this.baseUri}${uri}`, body, {
        headers,
        httpsAgent: new (
          await import("https")
        ).Agent({ rejectUnauthorized: false }), // disable SSL verify
      });
      
      return response;
    } catch (error) {
      return error.response || { status: 500, data: { error: error.message } };
    }
  }
}

module.exports = OpenAPIService;

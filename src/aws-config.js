(function (exports) {
  const fs = require("fs");

  class AwsConfig {
    constructor(arg = {}) {
      var opts = typeof arg === "string" ? { configPath: arg } : arg;
      var { configPath } = opts;
      var fileCfg = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath))
        : {};
      var envCfg = {
        region: process.env.aws_config_region,
        accessKeyId: process.env.aws_config_accessKeyId,
        secretAccessKey: process.env.aws_config_secretAccessKey,
      };
      var props = Object.assign({}, envCfg, fileCfg, opts);
      delete props.configPath;
      var { region, secretAccessKey, accessKeyId, sayAgain } = Object.assign(
        this,
        props
      );

      this.polly = Object.assign(
        {
          region,
          secretAccessKey,
          accessKeyId,
          signatureVersion: "v4",
          apiVersion: "2016-06-10",
        },
        fileCfg.polly,
        opts.polly
      );

      this.s3 = Object.assign(
        {
          region,
          secretAccessKey,
          accessKeyId,
          apiVersion: "2006-03-01",
          endpoint: "https://s3.us-west-1.amazonaws.com",
        },
        fileCfg.s3,
        opts.s3
      );

      this.sayAgain = Object.assign(
        {
          Bucket: "say-again.say-again",
        },
        sayAgain
      );
    }
  }

  module.exports = exports.AwsConfig = AwsConfig;
})(typeof exports === "object" ? exports : (exports = {}));

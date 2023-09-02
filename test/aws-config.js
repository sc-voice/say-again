typeof describe === "function" &&
  describe("aws-config", function () {
    const fs = require("fs");
    const path = require("path");
    const should = require("should");
    const { MerkleJson } = require("merkle-json");
    const { AwsConfig } = require("../index");
    const TESTDATA = path.join(__dirname, "data");
    const TESTCFG = path.join(TESTDATA, "aws.json");
    const JSON00C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.json`;
    const MP300C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.mp3`;
    const mj = new MerkleJson({ hashTag: "guid" });

    it("default ctor", () => {
      /////////////// TEST ONLY (BEGIN)
      var {
        aws_config_region,
        aws_config_secretAccessKey,
        aws_config_accessKeyId,
      } = process.env;
      process.env.aws_config_region = "env_region";
      process.env.aws_config_accessKeyId = "env_accessKeyId";
      process.env.aws_config_secretAccessKey = "env_secretAccessKey";
      /////////////// TEST ONLY (END)

      var awsCfg = new AwsConfig();

      /////////////// TEST ONLY (BEGIN)
      process.env.aws_config_region = aws_config_region;
      process.env.aws_config_accessKeyId = aws_config_accessKeyId;
      process.env.aws_config_secretAccessKey = aws_config_secretAccessKey;
      /////////////// TEST ONLY (END)

      should.deepEqual(Object.keys(awsCfg).sort(), [
        "accessKeyId",
        "polly",
        "pollyV3",
        "region",
        "s3",
        "s3V3",
        "sayAgain",
        "secretAccessKey",
      ]);
      should(awsCfg.polly).properties({
        signatureVersion: "v4",
        apiVersion: "2016-06-10",
        region: "env_region",
      });
    });
    it("ctor({configPath})", () => {
      // configuration path is ctor option
      var awsCfg = new AwsConfig({ configPath: TESTCFG });
      should.deepEqual(Object.keys(awsCfg).sort(), [
        "accessKeyId",
        "myApp",
        "polly",
        "pollyV3",
        "region",
        "s3",
        "s3V3",
        "sayAgain",
        "secretAccessKey",
      ]);
      should(awsCfg.polly).properties({
        signatureVersion: "test_polly_signatureVersion",
        apiVersion: "test_polly_apiVersion",
        region: "test-region",
        secretAccessKey: "test_secretAccessKey",
        accessKeyId: "test_accessKeyId",
      });
      should(awsCfg.s3).properties({
        region: "test_s3_region",
        secretAccessKey: "test_secretAccessKey",
        accessKeyId: "test_accessKeyId",
      });
      should(awsCfg.sayAgain).properties({
        Bucket: "say-again.test",
      });
      should(awsCfg.myApp).properties({
        color: "red",
      });
    });
    it("ctor() looks at environment", () => {
      process.env.aws_config_region = "env_region";
      process.env.aws_config_secretAccessKey = "env_secretAccessKey";
      process.env.aws_config_accessKeyId = "env_accessKeyId";
      var awsCfg = new AwsConfig();
      should(awsCfg.s3).properties({
        region: "env_region",
        secretAccessKey: "env_secretAccessKey",
        accessKeyId: "env_accessKeyId",
      });
      should(awsCfg.s3).properties({
        region: "env_region",
        secretAccessKey: "env_secretAccessKey",
        accessKeyId: "env_accessKeyId",
      });
    });
  });

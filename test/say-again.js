typeof describe === "function" &&
  describe("say-again", function () {
    const fs = require("fs");
    const path = require("path");
    const should = require("should");
    const AWS = require("aws-sdk");
    const { MerkleJson } = require("merkle-json");
    const { logger, LogInstance } = require("log-instance");
    const { AwsConfig, TtsPolly, SayAgain } = require("../index");
    const TESTDATA = path.join(__dirname, "data");
    const JSON00C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.json`;
    const MP300C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.mp3`;
    const HELLOPATH = `${TESTDATA}/hello.mp3`;
    const mj = new MerkleJson({ hashTag: "guid" });

    // Testing requires a configuration file in local/aws.json
    // See test/data/aws-sample.json for an example
    const LOCALDIR = path.join(__dirname, "..", "local");
    const CFGPATH = path.join(LOCALDIR, "aws.json");
    const awsConfig = new AwsConfig(CFGPATH);
    this.timeout(10 * 1000);
    logger.level = "warn";

    class TestTTS {
      speak(request) {
        var guid = mj.hash(request);
        if (guid === "00c6495507e72cd16a6f992c15b92c95") {
          var base64 = fs.readFileSync(MP300C6).toString("base64");
          return Promise.resolve({
            mime: "audio/mpeg",
            base64,
          });
        }
        return Promise.resolve(undefined);
      }
    }

    class TestLogger extends LogInstance {
      _log(handlerLevel, logLevel, args) {
        super._log(handlerLevel, logLevel, ["custom-test", ...args]);
      }
    }

    function validate00C6(say, req, res) {
      var { hits, misses } = say;
      should.deepEqual(Object.keys(res), ["request", "s3Key", "response"]);
      var { request, s3Key, response } = res;
      should({ hits, misses }).properties({ hits: 0, misses: 1 });
      should.deepEqual(request, req);
      should(s3Key).equal(
        "hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json"
      );
      should.deepEqual(Object.keys(response), ["mime", "base64"]);
      should(response.mime).equal("audio/mpeg");
      var actual = response.base64;
      var expected = fs.readFileSync(MP300C6).toString("base64");
      var n = 200;
      should(actual.substring(0, n)).equal(expected.substring(0, n));
      should(actual.slice(-n)).equal(expected.slice(-n));
    }

    it("default ctor", () => {
      var say = new SayAgain();
      should(say).properties({
        verbose: undefined,
        hits: 0,
        misses: 0,
        errors: 0,
        s3Reads: 0,
        s3Writes: 0,
        initialized: undefined,
        ignoreCache: undefined,
      });
      should(say.name).match(/^SayAgain_[0-9]+$/);
      should(say.awsConfig).instanceOf(AwsConfig);
      should(say.logger).instanceOf(LogInstance);
      should(say.logger).equal(logger);

      // Default instance name suffix is the instance count
      var say2 = new SayAgain();
      should(Number(say2.name.split("_")[1])).equal(
        Number(say.name.split("_")[1]) + 1
      );
    });
    it("custom ctor", () => {
      var awsConfig = new AwsConfig();
      var tts = new TestTTS();
      var logger = new TestLogger();
      var say = new SayAgain({
        name: "Test-SayAgain",
        awsConfig,
        hits: 911, // ignored
        misses: 911, // ignored
        errors: 911, // ignored
        initialized: 911, // ignored
        verbose: true,
        ignoreCache: true,
        tts,
        logger,
      });
      should(say).properties({
        verbose: true,
        hits: 0,
        misses: 0,
        errors: 0,
        initialized: undefined,
        ignoreCache: true,
        tts,
      });
      should(say.awsConfig).equal(awsConfig);

      // Verify custom logger
      should(say.logger).equal(logger);
      say.log("test-log");
      should(logger.lastLog())
        .match(/ I custom-test/)
        .match(/Test-SayAgain: test-log/);
    });
    it("initialize() is required", async()=>{
      should(fs.existsSync(CFGPATH)).equal(
        true,
        `Tests require AWS credentials stored in ${CFGPATH}`
      );
      var say = new SayAgain(awsConfig);
      should(say.initialized).equal(undefined);

      // initialize executes once but can be called multiple times
      should(await say.initialize()).equal(say);
      should(await say.initialize()).equal(say);
      should(!!say.initialized).equal(true);
      should(say.bucketName).equal(awsConfig.sayAgain.Bucket);
    });
    it("tts logLevel follows sayAgain", (done) => {
      (async function () {
        try {
          // clear lastLog
          var logLevel = logger.logLevel;
          logger.logLevel = "debug";
          logger.debug("debug.none");
          logger.info("info.none");
          logger.warn("warn.none");
          logger.error("error.none");
          logger.logLevel = "warn"; // ignore info and debug

          var say = await new SayAgain(awsConfig).initialize();
          should(say.logger).equal(logger);
          should(say.tts.logger).equal(say);
          say.logLevel = "info"; // ignore debug
          say.info("Say info");
          should(logger.lastLog("info")).match(/Say info/);

          // TtsPolly module inside SayAgain should log
          // according to SayAgain logLevel
          should(say.tts.logLevel).equal(false); // follow SayAgain
          say.tts.info("Tts info");
          should(logger.lastLog("info")).match(/Tts info/);

          // TtsPolly module can have its own level
          say.tts.logLevel = "debug";
          logger.debug("Logger debug"); // ignored by logger logLevel
          should(logger.lastLog("debug")).match(/debug.none/);
          say.log("Say debug"); // ignored by say logLevel
          should(logger.lastLog("debug")).match(/debug.none/);
          say.tts.debug("Tts debug"); // allowed by tts logLevel
          should(logger.lastLog("debug")).match(/Tts debug/);

          logger.logLevel = logLevel;
          done();
        } catch (e) {
          done(e);
        }
      })();
    });
    it("s3Key(req) => s3 storage key", () => {
      var req = JSON.parse(fs.readFileSync(JSON00C6));
      var say = new SayAgain(awsConfig);
      should(say.s3Key(req)).equal(
        "hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json"
      );
    });
    it("speak(req) => cached response", async () => {
      var logger = new LogInstance();
      var say = await new SayAgain({
        name: "Test-SayAgain",
        ignoreCache: true,
        logger,
        awsConfig,
      }).initialize();
      var { tts } = say;
      var req = JSON.parse(fs.readFileSync(JSON00C6));

      // first request will ignore cache and call tts
      say.logLevel = "debug";
      var res1 = await say.speak(req);
      should(logger.lastLog("info"))
        .match(/Test-SayAgain: speak\(\) misses:1 hits:0 usage:34/)
        .match(/00c6495507e72cd16a6f992c15b92c95.json/);
      should(logger.lastLog("debug")).match(
        /TtsPolly: polly.synthesizeSpeech\(\)/
      );
      validate00C6(say, req, res1);
      should(say.tts.usage).equal(34);

      // second request should be cached
      say.ignoreCache = false;
      var res2 = await say.speak(req);
      should(logger.lastLog("debug"))
        .match(/SayAgain: speak\(\) hits:1 misses:1 usage:34/)
        .match(/00c6495507e72cd16a6f992c15b92c95.json/);
      should.deepEqual(res2, res1);
      var { hits, misses, errors } = say;
      should({ hits, misses, errors }).properties({
        hits: 1,
        misses: 1,
        errors: 0,
      });
    });
    it("inject custom TTS engine", (done) => {
      (async function () {
        try {
          var tts = new TestTTS();
          var say = new SayAgain({
            ignoreCache: true,
            tts,
            awsConfig,
          });
          var req = JSON.parse(fs.readFileSync(JSON00C6));
          var res = await say.speak(req);
          validate00C6(say, req, res);
          done();
        } catch (e) {
          done(e);
        }
      })();
    });
    it("deleteEntry(s3Key) => removes cached guid", (done) => {
      (async function () {
        try {
          var say = new SayAgain(awsConfig);
          var guid = "00c6495507e72cd16a6f992c15b92c95";
          var s3Key = `hi-IN/Aditi/00/${guid}.json`;
          var request = JSON.parse(fs.readFileSync(JSON00C6));
          var res = await say.deleteEntry(s3Key);
          if (res) {
            // deleteEntry returns deleted entry
            should(res).properties(["request", "s3Key", "response"]);
            should.deepEqual(res.request, request);
            should.deepEqual(res.s3Key, s3Key);
            var actual = res.response.base64;
            var expected = fs.readFileSync(MP300C6).toString("base64");
            var n = 200;
            should(actual.substring(0, n)).equal(expected.substring(0, n));
            should(actual.slice(-n)).equal(expected.slice(-n));

            // deleteEntry of non-existent entry returns null
            res = await say.deleteEntry(s3Key);
            should(res).equal(null);
          }

          // first request will regenerate
          var { hits, misses } = say;
          should({ hits, misses }).properties({ hits: 0, misses: 0 });
          var res = await say.speak(request);
          var { hits, misses } = say;
          should({ hits, misses }).properties({ hits: 0, misses: 1 });
          done();
        } catch (e) {
          done(e);
        }
      })();
    });
    it("preload(req,res) => preloads S3 cache", (done) => {
      (async function () {
        try {
          var say = new SayAgain(awsConfig);
          var request = JSON.parse(fs.readFileSync(JSON00C6));

          // response1 is valid TTS response
          var s3Key = say.s3Key(request);
          await say.deleteEntry(s3Key);
          should(say.s3Writes).equal(1);
          var { response: response1 } = await say.speak(request);
          should(say.s3Writes).equal(2);
          should(say.s3Reads).equal(2);
          var { hits, misses } = say;

          // preload a different TTS response
          var response2 = {
            mime: "audio/mpeg",
            base64: "something-different",
          };
          var res = await say.preload(request, response2);
          should(say.s3Writes).equal(3);
          should.deepEqual(res, {
            s3Key,
            updated: true,
          });
          var resSpeak = await say.speak(request);
          should(say.hits).equal(hits + 1);
          should(say.misses).equal(misses);
          should(resSpeak.response.mime).equal(response2.mime);
          should(resSpeak.response.base64).equal(response2.base64);

          // Redundant preloads are ignored to avoid S3 write costs
          var res = await say.preload(request, response2);
          should.deepEqual(res, {
            s3Key,
            updated: false,
          });
          var res = await say.speak(request);
          should(say.s3Writes).equal(3);
          should(say.hits).equal(hits + 2);
          should(say.misses).equal(misses);
          should(res.response.base64).equal("something-different");

          // restore valid TTS response
          var res = await say.preload(request, response1);
          should.deepEqual(res, {
            s3Key,
            updated: true,
          });
          should(say.s3Writes).equal(4);
          var res = await say.speak(request);
          should(say.s3Writes).equal(4);
          should(say.hits).equal(hits + 3);
          should(say.misses).equal(misses);
          should(res.response.base64).equal(response1.base64);

          done();
        } catch (e) {
          done(e);
        }
      })();
    });
    it("example", async () => {
      var say = new SayAgain(awsConfig);
      var request = {
        api: "aws-polly",
        apiVersion: "v4",
        audioFormat: "mp3",
        voice: "Amy",
        language: "en-GB",
        text: `<prosody rate="-30%" pitch="-10%">hello</prosody>`,
      };
      var res = await say.speak(request);
      var m3path = path.join(LOCALDIR, "test-example.mp3");
      fs.writeFileSync(m3path, Buffer.from(res.response.base64, "base64"));
      should.deepEqual(res.request, request);
      should(res.s3Key).equal(
        "en-GB/Amy/d5/d55689bac089ac2e607efd53efe0d499.json"
      );
      var base64 = fs.readFileSync(HELLOPATH).toString("base64");

      /*
       * AWS Polly sometimes changes its voices.
       * If the following test fails, verify that local/test-example.mp3
       * sounds as expected (i.e., "hello"). If it is acceptable,
       * replace test/data/hello.mp3 with test-example.mp3 contents.
       */
      should.deepEqual(res.response, {
        mime: "audio/mpeg",
        base64,
      });
    });
    it("speak() rejects errors", (done) => {
      (async function () {
        try {
          var say = await new SayAgain({
            ignoreCache: true,
            awsConfig,
          }).initialize();
          var { tts } = say;

          tts.logLevel = "info";
          var eCaught;
          var res;
          var req = JSON.parse(fs.readFileSync(JSON00C6));
          logger.error("///////// EXPECTED ERROR (BEGIN)");
          try {
            req.text = req.text.substring(1); // invalid SSML
            res = await say.speak(req);
          } catch (e) {
            eCaught = e;
          }
          should(eCaught).instanceOf(Error);
          should(eCaught.message).match("Invalid SSML request");
          should(logger.lastLog("error")).match(/Invalid SSML request/);
          logger.error("///////// EXPECTED ERROR (END)");

          logger.error("///////// EXPECTED ERROR (BEGIN)");
          var req = JSON.parse(fs.readFileSync(JSON00C6));
          try {
            req.api = "invalid-api";
            res = await say.speak(req);
          } catch (e) {
            eCaught = e;
          }
          should(eCaught).instanceOf(Error);
          should(eCaught.message).match(/expected api:aws-polly/);
          should(logger.lastLog("error")).match(/expected api:aws-polly/);
          logger.error("///////// EXPECTED ERROR (END)");

          done();
        } catch (e) {
          done(e);
        }
      })();
    });
  });

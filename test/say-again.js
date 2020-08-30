(typeof describe === 'function') && describe("say-again", function() {
    const fs = require('fs');
    const path = require('path');
    const should = require("should");
    const AWS = require("aws-sdk");
    const { MerkleJson } = require("merkle-json");
    const {
        AwsConfig,
        TtsPolly,
        SayAgain,
    } = require('../index');
    const { LogInstance } = require("log-instance");
    const TESTDATA = path.join(__dirname, 'data');
    const JSON00C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.json`;
    const MP300C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.mp3`;
    const HELLOPATH = `${TESTDATA}/hello.mp3`;
    const mj = new MerkleJson({hashTag: "guid"});

    // Testing requires a configuration file in local/aws.json
    // See test/data/aws-sample.json for an example
    const CFGPATH = path.join(__dirname, '..', 'local', 'aws.json');
    const awsConfig = new AwsConfig(CFGPATH);

    class TestTTS {
        speak(request) {
            var guid = mj.hash(request);
            if (guid === "00c6495507e72cd16a6f992c15b92c95") {
                var base64 = fs.readFileSync(MP300C6).toString('base64');
                return Promise.resolve({
                    mime: 'audio/mpeg',
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
        should.deepEqual(Object.keys(res), [
            "request", "s3Key", "response",
        ]);
        var {
            request,
            s3Key,
            response,
        } = res;
        should({hits,misses}).properties({hits:0, misses:1});
        should.deepEqual(request, req);
        should(s3Key).equal(
            "hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json");
        should.deepEqual(Object.keys(response), [
            "mime", "base64",
        ]);
        should(response.mime).equal("audio/mpeg");
        var actual = response.base64;
        var expected = fs.readFileSync(MP300C6).toString('base64');
        var n = 200;
        should(actual.substring(0,n)).equal(expected.substring(0,n));
        should(actual.slice(-n)).equal(expected.slice(-n));
    }

    it("default ctor", ()=>{
        var say = new SayAgain();
        should(say).properties({
            verbose: undefined,
            hits: 0,
            misses: 0,
            errors: 0,
            initialized: undefined,
            ignoreCache: undefined,
        });
        should(say.awsConfig).instanceOf(AwsConfig);
        should(say.logger).instanceOf(LogInstance);
    });
    it("TESTTESTcustom ctor", ()=>{
        var awsConfig = new AwsConfig();
        var tts = new TestTTS();
        var logger = new TestLogger();
        var say = new SayAgain({
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
        say.log('test-log');
        const timestamp = logger.last.info[0];
        should.deepEqual(logger.last.info, [
            timestamp,              // LogInstance 
            'I',                    // LogInstance
            'custom-test',          // TestLogger
            'SayAgain: test-log',   // LogInstance
        ]);
    });
    it("initialize() is required", done=>{ 
        (async function() { try {
            var say = new SayAgain(awsConfig);
            should(say.initialized).equal(undefined);

            // initialize executes once but can be called multiple times
            should(await say.initialize()).equal(say);
            should(await say.initialize()).equal(say); 
            should(!!say.initialized).equal(true);
            should(say.bucketName).equal(awsConfig.s3.Bucket);
            done();
        } catch(e) {done(e);}})();
    });
    it("s3Key(req) => s3 storage key", ()=>{
        var req = JSON.parse(fs.readFileSync(JSON00C6));
        var say = new SayAgain(awsConfig);
        should(say.s3Key(req))
            .equal("hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json");
    });
    it("TESTTESTspeak(req) => cached response", done=>{
        (async function() { try {
            var say = new SayAgain({
                ignoreCache: true,
                awsConfig,
            });
            var req = JSON.parse(fs.readFileSync(JSON00C6));

            // first request will ignore cache and call tts
            var res1 = await say.speak(req);
            validate00C6(say, req, res1);
            should(say.tts.usage).equal(34);

            // second request should be cached
            say.ignoreCache = false;
            var res2 = await say.speak(req);
            var { hits, misses } = say;
            should.deepEqual(res2, res1);
            should({hits,misses}).properties({hits:1, misses:1});

            done();
        } catch(e) {done(e);}})();
    });
    it("inject custom TTS engine", done=>{
        (async function() { try {
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
        } catch(e) {done(e);}})();
    });
    it("deleteEntry(s3Key) => removes cached guid", done=>{ 
        (async function() { try {
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
                var expected = fs.readFileSync(MP300C6).toString('base64');
                var n = 200;
                should(actual.substring(0,n)).equal(expected.substring(0,n));
                should(actual.slice(-n)).equal(expected.slice(-n));

                // deleteEntry of non-existent entry returns null
                res = await say.deleteEntry(s3Key);
                should(res).equal(null);
            }

            // first request will regenerate
            var { hits, misses } = say;
            should({hits,misses}).properties({ hits: 0, misses: 0, });
            var res = await say.speak(request);
            var { hits, misses } = say;
            should({hits,misses}).properties({ hits: 0, misses: 1, });
            done();
        } catch(e) {done(e);}})();
    });
    it("preload(req,res) => preloads S3 cache", done=>{ 
        (async function() { try {
            var say = new SayAgain(awsConfig);
            var guid = "00c6495507e72cd16a6f992c15b92c95";
            var s3Key = `hi-IN/Aditi/00/${guid}.json`;
            await say.deleteEntry(s3Key);
            var request = JSON.parse(fs.readFileSync(JSON00C6));
            var response = fs.readFileSync(MP300C6).toString("base64");
            var res = await say.preload(request, {
                request,
                response,
            });

            // first request will use preloaded
            var res = await say.speak(request);
            var { hits, misses } = say;
            should.deepEqual({hits,misses},{hits:1,misses:0});
            done();
        } catch(e) {done(e);}})();
    });
    it("example", done=>{
        (async function() { try {
            var say = new SayAgain(awsConfig);
            var request = {
              "api": "aws-polly",
              "apiVersion": "v4",
              "audioFormat": "mp3",
              "voice": "Amy",
              "language": "en-GB",
              "text": `<prosody rate="-30%" pitch="-10%">hello</prosody>`,
            }
            var res = await say.speak(request);
            should.deepEqual(res.request, request);
            should(res.s3Key)
                .equal('en-GB/Amy/d5/d55689bac089ac2e607efd53efe0d499.json');
            var buf = Buffer.from(res.response.base64, "base64");
            fs.writeFileSync(HELLOPATH, buf);
            done();
        } catch(e) {done(e);}})();
    });

})

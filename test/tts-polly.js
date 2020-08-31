(typeof describe === 'function') && describe("tts-polly", function() {
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
    const TESTDATA = path.join(__dirname, 'data');
    const CFGPATH = path.join(__dirname, '..', 'local', 'aws.json');
    const JSON00C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.json`;
    const MP300C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.mp3`;
    const mj = new MerkleJson({hashTag: "guid"});
    const awsConfig = new AwsConfig({configPath:CFGPATH});
    const { logger, LogInstance } = require('log-instance');
    this.timeout(5*1000);

    it("TESTTESTdefault ctor", ()=>{
        /////////////// TEST ONLY (BEGIN)
        // Save and set environment
        var {
            aws_config_secretAccessKey,
            aws_config_accessKeyId,
            aws_config_region,
        } = process.env;
        process.env.aws_config_secretAccessKey = "env_secretAccessKey";
        process.env.aws_config_accessKeyId = "env_accessKeyId";
        process.env.aws_config_region = "env_region";
        /////////////// TEST ONLY (END)

        // Default ctor reads environment
        var tts = new TtsPolly();

        /////////////// TEST ONLY (BEGIN)
        // Restore environment
        process.env.aws_config_secretAccessKey = aws_config_secretAccessKey;
        process.env.aws_config_accessKeyId = aws_config_accessKeyId;
        process.env.aws_config_region = aws_config_region;
        /////////////// TEST ONLY (END)

        should(tts).properties({
            usage: 0,
        });
        should(tts.polly).equal(undefined);
        should(tts.logger).instanceOf(LogInstance);
        should(tts.logger).equal(logger);
        should(tts.awsConfig).instanceOf(AwsConfig);
        should(tts.awsConfig.s3).properties({
            secretAccessKey: "env_secretAccessKey",
            accessKeyId: "env_accessKeyId",
            region: "env_region",
        });
        should(tts.awsConfig.polly).properties({
            secretAccessKey: "env_secretAccessKey",
            accessKeyId: "env_accessKeyId",
            region: "env_region",
        });

    });
    it("initialize() is required", done=>{ 
        (async function() { try {
            var tts = new TtsPolly(CFGPATH);
            var res = await tts.initialize();
            should(res).equal(tts);

            // AWS default configuration is stored in CFGPATH
            var json = JSON.parse(fs.readFileSync(CFGPATH));
            Object.keys(json.polly || {}).forEach(k=>{
                should(tts.polly.config[k]).equal(json.polly[k]);
            });

            // initialize executes once but can be called multiple times
            should(await tts.initialize()).equal(tts); 
            done();
        } catch(e) {done(e);}})();
    });
    it("speak(request) => cached TTS", done=>{ 
        (async function() { try {
            var tts = new TtsPolly({configPath:CFGPATH});
            var request = JSON.parse(fs.readFileSync(JSON00C6));
            var res = await tts.speak(request);
            should.deepEqual(Object.keys(res), ["mime", "base64"]);
            should(tts.usage).equal(34); // $4.00 / million
            should(res.mime).equal("audio/mpeg");
            var actual = res.base64;
            var expected = fs.readFileSync(MP300C6).toString('base64');
            should(actual.length).equal(expected.length);
            var n = 200;
            should(actual.substring(0,n)).equal(expected.substring(0,n));
            should(actual.slice(-n)).equal(expected.slice(-n));
            done();
        } catch(e) {done(e);}})();
    });

})

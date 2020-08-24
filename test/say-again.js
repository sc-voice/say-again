(typeof describe === 'function') && describe("say-again", function() {
    const fs = require('fs');
    const path = require('path');
    const should = require("should");
    const AWS = require("aws-sdk");
    const { MerkleJson } = require("merkle-json");
    const {
        TtsPolly,
        SayAgain,
    } = require('../index');
    const TESTDATA = path.join(__dirname, 'data');
    const JSON00C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.json`;
    const MP300C6 = `${TESTDATA}/00c6495507e72cd16a6f992c15b92c95.mp3`;
    const HELLOPATH = `${TESTDATA}/hello.mp3`;
    const mj = new MerkleJson({hashTag: "guid"});

    // Testing requires a configuration file in local/aws.json
    // See test/data/aws-sample.json for an example
    const CFGPATH = path.join(__dirname, '..', 'local', 'aws.json');

    class TestTTS {
        speak(request) {
            var guid = mj.hash(request);
            if (guid === "00c6495507e72cd16a6f992c15b92c95") {
                var base64 = fs.readFileSync(MP300C6).toString('base64');
                return Promise.resolve({
                    mime: 'audio/mpeg',
                    usage: 34,
                    base64,
                });
            }
            return Promise.resolve(undefined);
        }
    }

    it("default ctor", ()=>{
        var say = new SayAgain();
        should(say).properties({
            name: "test-voice",
            application: "test-application",
            bucketName: "test-application.say-again",
        });
        should(say.s3).instanceOf(AWS.S3);
        should(say.tts).instanceOf(TtsPolly);

        // AWS default configuration is stored in CFGPATH
        var json = JSON.parse(fs.readFileSync(CFGPATH));
        Object.keys(json.s3).forEach(k=>{
            should(say.s3.config[k]).equal(json.s3[k]);
        });
    });
    it("initialize() is required", done=>{ 
        (async function() { try {
            var say = new SayAgain(CFGPATH);
            should(say.initialized).equal(undefined);

            // initialize executes once but can be called multiple times
            should(await say.initialize()).equal(say);
            should(await say.initialize()).equal(say); 
            should(!!say.initialized).equal(true);
            done();
        } catch(e) {done(e);}})();
    });
    it("s3Key(req) => s3 storage key", ()=>{
        var req = JSON.parse(fs.readFileSync(JSON00C6));
        var say = new SayAgain();
        should(say.s3Key(req))
            .equal("hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json");
    });
    it("TESTTESTspeak(req) => cached TTS", done=>{ 
        (async function() { try {
            var say = new SayAgain({
                tts: new TestTTS(),
                configPath: CFGPATH,
            });
            var req = JSON.parse(fs.readFileSync(JSON00C6));

            // first request may call tts
            var res = await say.speak(req);
            var { hits, misses } = say;
            should.deepEqual(Object.keys(res), [
                "request", "s3key", "response",
            ]);
            var {
                request,
                s3key,
                response,
            } = res;
            should(hits+misses).equal(1);
            should.deepEqual(request, req);
            should(s3key).equal(
                "hi-IN/Aditi/00/00c6495507e72cd16a6f992c15b92c95.json");
            should.deepEqual(Object.keys(response), [
                "mime", "usage", "base64",
            ]);
            should(response.usage).equal(34);
            should(response.mime).equal("audio/mpeg");
            var actual = response.base64;
            var expected = fs.readFileSync(MP300C6).toString('base64');
            var n = 200;
            should(actual.substring(0,n)).equal(expected.substring(0,n));
            should(actual.slice(-n)).equal(expected.slice(-n));

            // second request should be cached
            var res = await say.speak(request);
            should(say.hits).equal(hits+1);

            done();
        } catch(e) {done(e);}})();
    });
    it("deleteEntry(s3key) => removes cached guid", done=>{ 
        (async function() { try {
            var say = new SayAgain({
                tts: new TestTTS(),
                configPath: CFGPATH,
            });
            var guid = "00c6495507e72cd16a6f992c15b92c95";
            var bucketName = `test-application.say-again`;
            var s3key = `hi-IN/Aditi/00/${guid}.json`;
            var res = await say.deleteEntry(s3key);
            should.deepEqual(res, {
                Bucket: bucketName,
                Key: s3key,
            });
            var request = JSON.parse(fs.readFileSync(JSON00C6));
            // first request will regenerate
            var res = await say.speak(request);
            var { hits, misses } = say;
            should(misses).equal(1);
            done();
        } catch(e) {done(e);}})();
    });
    it("example", done=>{
        (async function() { try {
            var say = new SayAgain(CFGPATH);
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
            should(res.s3key)
                .equal('en-GB/Amy/d5/d55689bac089ac2e607efd53efe0d499.json');
            var buf = Buffer.from(res.response.base64, "base64");
            fs.writeFileSync(HELLOPATH, buf);
            done();
        } catch(e) {done(e);}})();
    });

})

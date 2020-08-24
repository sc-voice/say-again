(function(exports) {
    const fs = require("fs");
    const path = require("path");
    const AWS = require("aws-sdk");
    const pkg = require("../package.json");
    const { MerkleJson } = require("merkle-json");
    const AwsConfig = require('./aws-config');
    const TtsPolly = require('./tts-polly');

    class Voice {
        constructor(opts = {}) {
            // options
            this.name = opts.name || "test-voice";
            this.application = opts.application || "sc-voice";
            this.bucketName = opts.bucketName ||
                `${this.application}.${pkg.name}`;
            this.mj = new MerkleJson({
                hashTag: "guid",
            });
            this.tts = opts.tts || new TtsPolly(opts);
            this.s3 = Voice.createS3(opts);
            this.ignoreCache = opts.ignoreCache;

            // instance
            this.hits = 0;
            this.misses = 0;
            this.errors = 0;
        }

        static createS3(opts={}) {
            var { s3 } = opts;
            if (!s3) {
                var awsCfg = new AwsConfig(opts);
                s3 = new AWS.S3(awsCfg.s3);
            }
            return s3;
        }

        initialize() {
            var that = this;
            if (that.initialized) {
                return that.initialized;
            }
            var { s3, bucketName } = this;
            var pbody = (resolve, reject) => (async function() { try {
                var buckets = (await s3.listBuckets().promise()).Buckets;
                var bucket = buckets.filter(b=>b.Name === bucketName)[0];
                if (!bucket) {
                    var params = {
                        Bucket: bucketName,
                        CreateBucketConfiguration: {
                            LocationConstraint: s3.config.region,
                        }
                    }
                    var res = await s3.createBucket(params).promise();
                    console.log(`createBucket`, res);
                }
                resolve(that);
            } catch(e) { 
                console.error(e.message);
                reject(e); 
            } })();
            that.initialized = new Promise(pbody);
            return that.initialized;
        }

        deleteEntry(s3key) {
            var that = this;
            var { bucketName, s3 } = that;
            var pbody = (resolve, reject) => { (async function() { try {
                await that.initialize();
                var params = {
                    Bucket: bucketName,
                    Key: s3key,
                };
                var res = await s3.deleteObject(params).promise();
                resolve(params);
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        s3Key(request={}) {
            var {language,voice,guid} = request;
            guid = guid || this.mj.hash(request);
            var guidDir = guid.substring(0,2);
            language = language || 'any-lang';
            voice = voice || 'any-voice';
            return `${language}/${voice}/${guidDir}/${guid}.json`;
        }

        speak(request={}) {
            var that = this;
            var { ignoreCache, mj, tts, bucketName, s3 } = that;
            var pbody = (resolve, reject) => { (async function() { try {
                await that.initialize();
                var s3key = that.s3Key(request);
                var params = {
                    Bucket: bucketName,
                    Key: s3key,
                };
                var err;
                var res;
                try {
                    if (!ignoreCache) {
                        res = await s3.getObject(params).promise();
                        that.hits++;
                        var json = JSON.parse(res.Body);
                        resolve(json);
                    }
                } catch (e) {
                    err = e;
                }
                if (!res || err && err.code === 'NoSuchKey') {
                    that.misses++;
                    res = tts && await tts.speak(request);

                    var response = {
                        request,
                        s3key,
                        response: res,
                    };
                    var s3opts = {
                        Bucket: bucketName,
                        Key: s3key,
                        Body: JSON.stringify(response),
                    };
                    await s3.putObject(s3opts).promise();

                    resolve(response);
                } else if (err) {
                    console.error(e);
                    that.errors++;
                    reject(e);
                }
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        hash(obj) {
            return this.mj.hash(obj, false);
        }

    } 

    module.exports = exports.Voice = Voice;
})(typeof exports === "object" ? exports : (exports = {}));


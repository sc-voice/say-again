(function(exports) {
    const fs = require("fs");
    const path = require("path");
    const AWS = require("aws-sdk");
    const pkg = require("../package.json");
    const { MerkleJson } = require("merkle-json");
    const AwsConfig = require('./aws-config');
    const TtsPolly = require('./tts-polly');
    const { LogInstance } = require('log-instance');

    class SayAgain {
        constructor(opts = {}) {
            if (opts instanceof AwsConfig) {
                opts = { awsConfig: opts };
            }
            var logger = opts.logger || LogInstance.singleton;
            logger.logInstance(this);

            // options
            this.mj = new MerkleJson({
                hashTag: "guid",
            });
            this.s3 = opts.s3;
            if (this.s3 && !(this.s3 instanceof AWS.S3)) {
                throw new Error("expected instance of AWS.S3");
            }
            this.tts = opts.tts;
            this.awsConfig = opts.awsConfig instanceof AwsConfig
                ? opts.awsConfig
                : new AwsConfig(opts);
            this.ignoreCache = opts.ignoreCache;
            this.verbose = opts.verbose;

            // instance
            this.hits = 0;
            this.misses = 0;
            this.errors = 0;
            this.initialized = undefined;
        }

        initialize() {
            var that = this;
            if (that.initialized) {
                return that.initialized;
            }
            var { verbose, awsConfig } = that;
            var pbody = (resolve, reject) => (async function() { try {
                var tts = that.tts = that.tts || new TtsPolly(awsConfig.polly);
                var s3 = that.s3 = that.s3 || new AWS.S3(awsConfig.s3);
                var { Bucket } = awsConfig.s3;
                that.bucketName = Bucket;
                var buckets = (await s3.listBuckets().promise()).Buckets;
                var bucket = buckets.filter(b=>b.Name === Bucket)[0];
                if (!bucket) {
                    var params = {
                        Bucket,
                        CreateBucketConfiguration: {
                            LocationConstraint: s3.config.region,
                        }
                    }
                    var res = await s3.createBucket(params).promise();
                    verbose && that.log(
                        `SayAgain.initialize() createBucket ${Bucket}`, 
                        res);
                }
                resolve(that);
            } catch(e) { 
                that.error(e.message);
                reject(e); 
            } })();
            that.initialized = new Promise(pbody);
            return that.initialized;
        }

        getEntry(s3Key) {
            var that = this;
            var pbody = (resolve, reject) => { (async function() { try {
                var { bucketName, s3 } = await that.initialize();
                var params = {
                    Bucket: bucketName,
                    Key: s3Key,
                }
                try {
                    var res = await s3.getObject(params).promise();
                    var Body = JSON.parse(res.Body);
                } catch(e) {
                    if (e.code === "NoSuchKey") {
                        resolve(null);
                        return;
                    }
                    throw e;
                }
                resolve(Body);
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        deleteEntry(s3Key) {
            var that = this;
            var pbody = (resolve, reject) => { (async function() { try {
                var { bucketName, s3 } = await that.initialize();
                var Body = await that.getEntry(s3Key);
                var params = {
                    Bucket: bucketName,
                    Key: s3Key,
                };
                var res = await s3.deleteObject(params).promise();
                resolve(Body);
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

        preload(request, response) {
            var that = this;
            var pbody = (resolve, reject) => { (async function() { try {
                var { bucketName, s3 } = await that.initialize();
                var s3Key = that.s3Key(request);
                var Body = JSON.stringify({
                    request,
                    s3Key,
                    response,
                });
                var s3opts = {
                    Bucket: bucketName,
                    Key: s3Key,
                    Body,
                };
                await s3.putObject(s3opts).promise();

                resolve(Body);
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        speak(request) {
            var that = this;
            if (request == null) {
                return Promise.reject(new Error("expected request"));
            }
            var pbody = (resolve, reject) => { (async function() { try {
                var { 
                    ignoreCache, mj, tts, bucketName, s3 
                } = await that.initialize();
                var s3Key = that.s3Key(request);
                var params = {
                    Bucket: bucketName,
                    Key: s3Key,
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

                    var resSpeak = {
                        request,
                        s3Key,
                        response: res,
                    };
                    var s3opts = {
                        Bucket: bucketName,
                        Key: s3Key,
                        Body: JSON.stringify(resSpeak),
                    };
                    await s3.putObject(s3opts).promise();

                    resolve(resSpeak);
                } else if (err) {
                    that.error(e);
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

    module.exports = exports.SayAgain = SayAgain;
})(typeof exports === "object" ? exports : (exports = {}));


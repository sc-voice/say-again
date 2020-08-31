(function(exports) {
    const fs = require("fs");
    const path = require("path");
    const AWS = require("aws-sdk");
    const pkg = require("../package.json");
    const { MerkleJson } = require("merkle-json");
    const AwsConfig = require('./aws-config');
    const TtsPolly = require('./tts-polly');
    const { logger } = require('log-instance');

    class SayAgain {
        constructor(opts = {}) {
            if (opts instanceof AwsConfig) {
                opts = { awsConfig: opts };
            }
            (opts.logger || logger).logInstance(this);

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
            this.s3Reads = 0;
            this.s3Writes = 0;
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

        s3Key(request={}) {
            var {language,voice,guid} = request;
            guid = guid || this.mj.hash(request);
            var guidDir = guid.substring(0,2);
            language = language || 'any-lang';
            voice = voice || 'any-voice';
            return `${language}/${voice}/${guidDir}/${guid}.json`;
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
                    that.s3Reads++;
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
                that.s3Writes++;
                var res = await s3.deleteObject(params).promise();
                resolve(Body);
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        putEntry(s3Key, s3Value) {
            var that = this;
            if (s3Value.s3Key !== s3Key) {
                return Promise.reject(new Error(
                    `s3Key expected ${s3Key} actual:${s3Value.s3Key}`));
            }
            var pbody = (resolve, reject) => { (async function() { try {
                var { mj, bucketName, s3 } = await that.initialize();
                var exists = true;
                try {
                    let params = {
                        Bucket: bucketName,
                        Key: s3Key,
                    };
                    that.s3Reads++;
                    let res = await s3.getObject(params).promise();
                    var oldS3Value = JSON.parse(res.Body);
                    if (mj.hash(s3Value) !== mj.hash(oldS3Value)) {
                        that.log(`${s3Key} has changed`); 
                        exists = false;
                    }
                } catch(e) {
                    if (e.code === "NoSuchKey") {
                        exists = false;
                    } else {
                        throw e;
                    }
                }
                if (!exists) {
                    var s3opts = {
                        Bucket: bucketName,
                        Key: s3Key,
                        Body: JSON.stringify(s3Value),
                    };
                    that.s3Writes++;
                    var res = await s3.putObject(s3opts).promise();
                }

                resolve({
                    s3Key,
                    updated: !exists,
                });
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        preload(request, response) {
            var that = this;
            var pbody = (resolve, reject) => { (async function() { try {
                var s3Key = that.s3Key(request);
                var s3Value = {
                    request,
                    s3Key,
                    response,
                };
                resolve(await that.putEntry(s3Key, s3Value));
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
                        that.s3Reads++;
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
                    that.s3Writes++;
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


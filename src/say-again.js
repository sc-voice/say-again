(function (exports) {
  const fs = require("fs");
  const path = require("path");
  const { 
    S3Client,
    ListBucketsCommand,
    CreateBucketCommand,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
  } = require("@aws-sdk/client-s3");
  const pkg = require("../package.json");
  const { MerkleJson } = require("merkle-json");
  const AwsConfig = require("./aws-config");
  const TtsPolly = require("./tts-polly");
  const { logger } = require("log-instance");

  var instance = 0;

  class SayAgain {
    constructor(opts = {}) {
      if (opts instanceof AwsConfig) {
        opts = { awsConfig: opts };
      }
      // options
      this.name = `${this.constructor.name}_${++instance}`;
      if (opts.name) {
        this.name += `.${opts.name}`;
      }
      (opts.logger || logger).logInstance(this);

      this.mj = new MerkleJson({
        hashTag: "guid",
      });
      this.s3 = opts.s3;
      this.tts = opts.tts;
      this.awsConfig =
        opts.awsConfig instanceof AwsConfig
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

    static obfuscate(s) {
      if (s == null) {
        return "(no-value)";
      }
      let suffixLen = 1;
      let prefixLen = 1;
      let prefix = s.slice(0, prefixLen);
      let middle = s.slice(prefixLen, s.length - suffixLen).replace(/./gu, "*");
      let suffix = s.slice(-suffixLen);
      return prefix + middle + suffix;
    }

    initialize() {
      const msg = 'SayAgain.initialize() ';
      var that = this;
      if (that.initialized) {
        return that.initialized;
      }
      var { verbose, awsConfig } = that;
      var pbody = (resolve, reject) =>
        (async function () {
          try {
            var ttsOpts = Object.assign({}, awsConfig.polly, { logger: that });
            var tts = (that.tts = that.tts || new TtsPolly(ttsOpts));
            var s3 = (that.s3 = that.s3 || new S3Client(awsConfig.s3V3));
            var { Bucket } = awsConfig.sayAgain;
            that.bucketName = Bucket;
            let listBucketsCmd = new ListBucketsCommand({});
            var buckets = (await s3.send(listBucketsCmd)).Buckets;
            var bucket = buckets.filter((b) => b.Name === Bucket)[0];
            if (bucket) {
              let pollyAccessKeyId = awsConfig.polly.accessKeyId;
              let s3AccessKeyId = awsConfig.s3.accessKeyId;
              that.info(
                `initialize() Bucket:${JSON.stringify(bucket)}`,
                `polly.AccessKeyId:${SayAgain.obfuscate(pollyAccessKeyId)}`,
                `s3.AccessKeyId:${SayAgain.obfuscate(s3AccessKeyId)}`
              );
            } else {
              var params = {
                Bucket,
                CreateBucketConfiguration: {
                  LocationConstraint: await s3.config.region(),
                },
              };
              let createBucketCmd = new CreateBucketCommand(params);
              var res = await s3.send(createBucketCmd);
              that.log(`initialize() createBucket:${Bucket}`, res);
            }
            resolve(that);
          } catch (e) {
            that.warn(`initialize()`, e.message);
            reject(e);
          }
        })();
      that.initialized = new Promise(pbody);
      return that.initialized;
    }

    s3Key(request = {}) {
      var { language, voice, guid } = request;
      guid = guid || this.mj.hash(request);
      var guidDir = guid.substring(0, 2);
      language = language || "any-lang";
      voice = voice || "any-voice";
      return `${language}/${voice}/${guidDir}/${guid}.json`;
    }

    getEntry(s3Key) {
      const msg = 'SayAgain.getEntry() ';
      var that = this;
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            var { bucketName, s3 } = await that.initialize();
            var params = {
              Bucket: bucketName,
              Key: s3Key,
            };
            try {
              that.s3Reads++;
              let getObjectCmd = new GetObjectCommand(params);
              var res = await s3.send(getObjectCmd);
              var Body = JSON.parse(await res.Body.transformToString());
            } catch (e) {
              if (e.name === "NoSuchKey") {
                resolve(null);
                return;
              }
              throw e;
            }
            resolve(Body);
          } catch (e) {
            that.warn(`getEntry()`, e.message);
            reject(e);
          }
        })();
      };
      return new Promise(pbody);
    }

    deleteEntry(s3Key) {
      var that = this;
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            var { bucketName, s3 } = await that.initialize();
            var Body = await that.getEntry(s3Key);
            var params = {
              Bucket: bucketName,
              Key: s3Key,
            };
            that.s3Writes++;
            let deleteObjectCmd = new DeleteObjectCommand(params);
            var res = await s3.send(deleteObjectCmd);
            resolve(Body);
          } catch (e) {
            that.warn(`deleteEntry()`, e.message);
            reject(e);
          }
        })();
      };
      return new Promise(pbody);
    }

    putEntry(s3Key, s3Value) {
      const msg = 'SayAgain.putEntry() ';
      var that = this;
      if (s3Value.s3Key !== s3Key) {
        return Promise.reject(
          new Error(`s3Key expected ${s3Key} actual:${s3Value.s3Key}`)
        );
      }
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            var { mj, bucketName, s3 } = await that.initialize();
            var exists = true;
            try {
              let params = {
                Bucket: bucketName,
                Key: s3Key,
              };
              that.s3Reads++;
              let getObjectCmd = new GetObjectCommand(params);
              let res = await s3.send(getObjectCmd);
              let body = await res.Body.transformToString();
              var oldS3Value = JSON.parse(body);
              if (mj.hash(s3Value) !== mj.hash(oldS3Value)) {
                that.log(`${s3Key} has changed`);
                exists = false;
              }
            } catch (e) {
              if (e.name === "NoSuchKey") {
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
              let putObjectCmd = new PutObjectCommand(s3opts);
              var res = await s3.send(putObjectCmd);
            }

            resolve({
              s3Key,
              updated: !exists,
            });
          } catch (e) {
            that.warn(`putEntry()`, e.message);
            reject(e);
          }
        })();
      };
      return new Promise(pbody);
    }

    preload(request, response) {
      const msg = 'SayAgain.preload() ';
      var that = this;
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            var s3Key = that.s3Key(request);
            var s3Value = {
              request,
              s3Key,
              response,
            };
            resolve(await that.putEntry(s3Key, s3Value));
          } catch (e) {
            reject(e);
          }
        })();
      };
      return new Promise(pbody);
    }

    speak(request) {
      const msg = 'SayAgain.speak() ';
      var that = this;
      if (request == null) {
        return Promise.reject(new Error("expected request"));
      }
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            var { ignoreCache, mj, tts, bucketName, s3 } =
              await that.initialize();
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
                let getObjectCmd = new GetObjectCommand(params);
                res = await s3.send(getObjectCmd);
                that.hits++;
                that.debug(
                  "speak()",
                  `hits:${that.hits}`,
                  `misses:${that.misses}`,
                  `usage:${tts.usage}`,
                  `${s3Key}`,
                  request.text
                );
                let text = await res.Body.transformToString();
                var json = JSON.parse(text);
                resolve(json);
              }
            } catch (e) {
              err = e;
            }
            if (!res || (err && err.code === "NoSuchKey")) {
              res = await tts.speak(request);
              that.misses++;
              that.info(
                "speak()",
                `misses:${that.misses}`,
                `hits:${that.hits}`,
                `usage:${tts.usage}`,
                `${s3Key}`,
                request.text
              );

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
              let putObjectCommand = new PutObjectCommand(s3opts);
              await s3.send(putObjectCommand);

              resolve(resSpeak);
            } else if (err) {
              that.error(err);
              that.errors++;
              reject(err);
            }
          } catch (e) {
            that.error(`SayAgain.speak()`, e.message);
            reject(e);
          }
        })();
      };
      return new Promise(pbody);
    }

    hash(obj) {
      return this.mj.hash(obj, false);
    }
  }

  module.exports = exports.SayAgain = SayAgain;
})(typeof exports === "object" ? exports : (exports = {}));

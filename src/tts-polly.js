(function (exports) {
  const fs = require("fs");
  const path = require("path");
  const { 
    PollyClient, 
    SynthesizeSpeechCommand 
  } = require("@aws-sdk/client-polly");
  const pkg = require("../package.json");
  const AwsConfig = require("./aws-config");
  const { MerkleJson } = require("merkle-json");
  const { logger } = require("log-instance");

  class TtsPolly {
    constructor(opts = {}) {
      (opts.logger || logger).logInstance(this);
      this.awsConfig = opts.awsConfig || new AwsConfig(opts);
      this.polly = opts.polly;
      this.usage = 0;
    }

    initialize() {
      var that = this;
      if (that._initialized) {
        return that._initialized;
      }
      var { polly, awsConfig } = this;
      var pbody = (resolve, reject) =>
        (async function () {
          try {
            if (!polly) {
              let config = Object.assign({}, awsConfig.pollyV3);
              that.polly = new PollyClient(config);
            }
            resolve(that);
          } catch (e) {
            that.error(e.message);
            reject(e);
          }
        })();
      that._initialized = new Promise(pbody);
      return that._initialized;
    }

    speak(request = {}) {
      const msg = 'TtsPolly.speak() ';
      var that = this;
      var { text, voice, language, audioFormat } = request;
      var pbody = (resolve, reject) => {
        (async function () {
          try {
            if (request.api !== "aws-polly") {
              throw new Error(
                `expected api:aws-polly request:${JSON.stringify(request)}`
              );
            }
            await that.initialize();
            var { polly } = that;
            var pollyArgs = {
              Text: `<speak>${text}</speak>`,
              TextType: "ssml",
              OutputFormat: audioFormat,
              VoiceId: voice,
              LanguageCode: language,
            };

            try {
              that.debug(`polly.synthesizeSpeech()`, JSON.stringify(pollyArgs));
              //var res = await polly.synthesizeSpeech(pollyArgs).promise();
              const cmd = new SynthesizeSpeechCommand(pollyArgs);
              var res = await polly.send(cmd);
              var { ContentType, RequestCharacters, AudioStream } = res;
              that.usage += RequestCharacters;
              let base64 = await AudioStream.transformToString("base64");
              resolve({
                mime: ContentType,
                base64,
              });
            } catch (e) {
              that.error(
                `polly.synthesizeSpeech()`,
                JSON.stringify(pollyArgs, null, 2),
                e.message
              );

              reject(e);
            }
          } catch (e) {
            that.error(e.message);
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

  module.exports = exports.TtsPolly = TtsPolly;
})(typeof exports === "object" ? exports : (exports = {}));

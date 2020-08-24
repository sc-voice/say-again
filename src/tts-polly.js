(function(exports) {
    const fs = require("fs");
    const path = require("path");
    const AWS = require("aws-sdk");
    const pkg = require("../package.json");
    const AwsConfig = require("./aws-config");
    const { MerkleJson } = require("merkle-json");

    class TtsPolly {
        constructor(opts = {}) {
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
            var pbody = (resolve, reject) => (async function() { try {
                if (!polly) {
                    that.polly = new AWS.Polly(awsConfig.polly);
                }
                resolve(that);
            } catch(e) { 
                console.error(e.message);
                reject(e); 
            } })();
            that._initialized = new Promise(pbody);
            return that._initialized;
        }

        speak(request={}) {
            var that = this;
            if (request.api !== "aws-polly") {
                return Promise.reject(new Error(
                    `expected api:aws-polly ${JSON.stringify(request)}`));
            }
            var { text, voice, language, audioFormat } = request;
            var pbody = (resolve, reject) => { (async function() { try {
                await that.initialize();
                var { polly } = that;
                var pollyArgs = {
                    Text:`<speak>${text}</speak>`,
                    TextType: 'ssml',
                    OutputFormat: audioFormat,
                    VoiceId: voice,
                    LanguageCode: language,
                }

                try {
                    var res = await polly.synthesizeSpeech(pollyArgs)
                        .promise();
                    var {
                        ContentType,
                        RequestCharacters,
                        AudioStream,
                    } = res;
                    that.usage += RequestCharacters;
                    resolve({
                        mime: ContentType,
                        usage: RequestCharacters,
                        base64: AudioStream.toString('base64'),
                    });
                } catch (e) {
                    reject(e);
                }
            } catch(e) {reject(e);}})()};
            return new Promise(pbody);
        }

        hash(obj) {
            return this.mj.hash(obj, false);
        }

    } 

    module.exports = exports.TtsPolly = TtsPolly;
})(typeof exports === "object" ? exports : (exports = {}));


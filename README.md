# say-again
S3-memoized Text-to-Speech adapter for sayings worth repeating.
Default TTS is AWS Polly.

### Installation
```
npm install --save say-again
```

##### AWS credentials (JSON file)
Configure a SayAgain AWS configuration file 
(e.g., `MY_AWS.json`)
```
cp test/data/aws-sample.json MY_AWS.json
```
Edit MY_AWS.json with your actual AWS credentials.

##### AWS credentials (environment)
You can also configure AWS credentials
using nodejs environment variables:

* `aws_config_region`
* `aws_config_accessKeyId`
* `aws_config_secretAccessKey`

### Example
```
const CFGPATH = "MY_AWS.json";
const { SayAgain, TtsPolly } = require("say-again");

var request = {
  "api": "aws-polly",
  "apiVersion": "v4",
  "audioFormat": "mp3",
  "voice": "Amy",
  "language": "en-GB",
  "text": "<prosody rate=\"-30%\" pitch=\"-10%\">hello</prosody>"
}

var v = new SayAgain(CFGPATH);
var res = await v.speak(request);
// { 
//   request, 
//   s3Key, 
//   response: {
//     mime: "audio/mpeg",
//     base64: "..."
//   }
// }
```

To generate an MP3 file from the result:

```
var buf = Buffer.from(res.response.base64, 'base64');
fs.writeFileSync('hello.mp3', buf);
```


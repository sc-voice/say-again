# say-again
S3-memoized Text-to-Speech adapter for sayings worth repeating.
Default TTS is AWS Polly.

### Installation
```
npm install --save say-again
```

### Example
```
const { SayAgain, TtsPolly } = require("say-again");

var request = {
  "api": "aws-polly",
  "apiVersion": "v4",
  "audioFormat": "mp3",
  "voice": "Amy",
  "language": "en-GB",
  "text": "<prosody rate=\"-30%\" pitch=\"-10%\">hello</prosody>"
}

var v = new SayAgain();
var res = await v.speak(request);
// { 
//   request, 
//   s3key, 
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


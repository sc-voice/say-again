# say-again
S3-memoized Text-to-Speech adapter for sayings worth repeating.
Default TTS is AWS Polly.

### Installation
```
npm install --save say-again
```

### Example
```
const { Voice, TtsPolly } = require("say-again");

var request = {
  "api": "aws-polly",
  "apiVersion": "v4",
  "audioFormat": "mp3",
  "voice": "Amy",
  "language": "en-GB",
  "text": "<prosody rate=\"-30%\" pitch=\"-10%\">hello</prosody>"
}

var v = new Voice();
var res = await v.speak(request);
// Buffer with mp3 
```


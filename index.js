const express = require("express");
const app = express();
app.use(express.static("voice"));
require("dotenv").config();
const fs = require("fs");
const util = require("util");
const { convert } = require("html-to-text");
const Mastodon = require("mastodon-api");
const { AtpAgent, AtpSessionEvent, AtpSessionData, RichText } = require("@atproto/api");
const cron = require("node-cron");
const tracery = require("tracery-grammar");
const rawGrammar = require("./your friendly neighborhood numbers station.json");
const grammar = tracery.createGrammar(rawGrammar);
grammar.addModifiers(tracery.baseEngModifiers);


(function () {
  let myConsole = new console.Console(
    fs.createWriteStream(`./logs/output${new Date().getTime()}.txt`)
  );
  let log_stdout = process.stdout;
  let log_err = process.stderr;

  console.log = function (str) {
    myConsole.log(str);
    log_stdout.write(util.format(str) + "\n");
  };

  console.warn = console.log
  console.info = console.log
  console.error = console.log

})(); //logger

console.log(`⏰ bot start time: ${new Date().toLocaleString()}\n`);

const mastodonClient = new Mastodon({
  access_token: process.env.MASTODON_TOKEN,
  timeout_ms: 60 * 1000, // optional HTTP request timeout to apply to all requests.
  api_url: process.env.BOTSINSPACE_API_URL
}); //establish Mastodon

const agent = new AtpAgent({
  service: "https://bsky.social",
  persistSession: AtpSessionEvent, AtpSessionData,
  // store the session-data for reuse
});

agent.login({
  identifier: process.env.BLUESKY_USERNAME,
  password: process.env.BLUESKY_PASSWORD,
});//ditto Bsky

const botScript = async () => {
  const flatGrammar = grammar.flatten("#origin#");
  const text2wav = require("text2wav");
  let out = await text2wav(`${flatGrammar}`, {
    speed: "115",
    pitch: "45",
    voice: "en-us+aunty",
    hasTags: "true",
    punct: "false",
    wordGap: "11"
  });
  // out is of type Uint8Array
  const assert = require("assert");
  assert.equal(out[0], 82); //R
  assert.equal(out[1], 73); //I
  assert.equal(out[2], 70); //F
  assert.equal(out[3], 70); //F


  console.log(`\nrecording...\n`);
  fs.writeFileSync('voice/numbers.wav', out, (err) => {
    if (err) { console.log(err) };
  });

  const cOptions = { wordwrap: false };
  const statusText = convert(`${flatGrammar}`, cOptions);
  const mediaDescription =
    "a robot voice reading out a series of numbers and occasionally words from the NATO phonetic alphabet, see status text for content";

  console.log(statusText);
  console.log(`${new Date().toLocaleTimeString()} \n`);

  return sendFileToMastodon(
    `./voice/numbers.wav`,
    mediaDescription,
    statusText
  );
}; //main bot stuff, turn text to speach, save the file, generate status text and description, send all that to mastodon.

function sendFileToMastodon(filePath, mediaDescription, statusText, cb) {
  console.log(`sending...\n`)
  mastodonClient.post(
    "media",
    {
      file: fs.createReadStream(filePath),
      description: mediaDescription,
      thumbnail: fs.createReadStream(`./numbersIconTwist.jpg`),
    },
    (err, data, response) => {
      if (err) {
        console.log(`aww crap, a mastodon.postMedia error: ${err}`);
        if (cb) { cb(err, data); }
      }
      else {
        console.log(`upladed! ${new Date().toLocaleTimeString()}`);
        const statusObj = {
          status: statusText,
          // media_ids: new Array(data.media_id_string),
          media_ids: new Array(data.id),
        };

        mastodonClient.post("statuses", statusObj, (err, data, response) => {
          if (err) { console.log("uh, oh, a mastodon.postMedia error:", err); }
          else {
            console.log(`posted! to ${data.url} at ${new Date().toLocaleTimeString()} \n`)
            return postToBsky(statusText, data)
          }
          if (cb) { cb(err, data); }
        });
      }
    }
  )
    .then(() => {

      postToBsky = async (statusText, data) => {
        const rt = new RichText({ text: statusText });
        await rt.detectFacets(agent);
        console.log(`posting to Bsky!\n`);
        const skeet = {
          $type: 'app.bsky.feed.post',
          text: rt.text,
          facets: rt.facets,
          createdAt: new Date().toISOString()
        };
        const response = await agent.post(skeet);
        console.log(response);
        console.log(new Date().toLocaleTimeString());
        delete require.cache[require.resolve("./your friendly neighborhood numbers station.json")];
      };
    });
};//the mastodon bits, uploading the audio and it's info, then the status, then sending the numbers to bluesky.

botScript();

//schedulers
cron.schedule("0 */7 * * *", () => {
  console.log(`\n\n #1 posting at ${new Date().toLocaleTimeString()}\n`);
  botScript();
});

cron.schedule("30 */3 * * *", () => {
  console.log(`\n\n #2 posting at ${new Date().toLocaleTimeString()}\n`);
  botScript();
});
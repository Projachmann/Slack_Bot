require("dotenv").config();

const axios = require("axios");
const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

app.command("/bigbrother-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `I am Watching!\nLatency: ${latency}ms` });
});

app.command("/bigbrother-help", async ({ ack, respond }) => {
  await ack();
  await respond({
    text:
      `Available Commands:
      /bigbrother-ping - Check bot latency
      /bigbrother-help - Shows this interface
      /bigbrother-scanurl - Scans the given URL
      /bigbrother-kanye - Shows a Kanye quote`
  });
});

app.command("/bigbrother-kanye", async ({ ack, respond }) =>{
  await ack();

  try{
    const response = await axios.get("https://api.kanye.rest/");
    await respond({ text: `Kanye once said:\n${response.data.quote}`})
  }catch(err){
    await respond({ text: `Kanye did not say anything.`})
    console.log(err);
  }
})

app.command("/bigbrother-scanurl", async ({ command, ack, respond }) => {
  const url = command.text;

  await ack();

  const encodedParams = new URLSearchParams();
  encodedParams.set('url', url);

  try {
    const res = await axios.request({
      method: 'POST',
      url: 'https://www.virustotal.com/api/v3/urls',
      headers: {
        accept: 'application/json',
        'x-apikey': process.env.VIRUS_TOTAL_APIKEY,
        'content-type': 'application/x-www-form-urlencoded'
      },
      data: encodedParams,
    });

    const analysisId = res.data.data.id;

    let analysisData;
    for (let i = 0; i < 6; i++) {
      const analysisRes = await axios.get(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        { headers: { 'x-apikey': process.env.VIRUS_TOTAL_APIKEY } }
      );

      analysisData = analysisRes.data;

      if (analysisData.data.attributes.status === 'completed') break;

      await new Promise(r => setTimeout(r, 3000));
    }

    const stats = analysisData.data.attributes.stats;
    const finalUrl = analysisData.meta.url_info.url;
    const status = analysisData.data.attributes.status;

    await respond({
      text:
        `*Scan ${status}* for ${finalUrl}\n` +
        `:white_check_mark: Harmless: ${stats.harmless}\n` +
        `:warning: Suspicious: ${stats.suspicious}\n` +
        `:x: Malicious: ${stats.malicious}\n` +
        `:question: Undetected: ${stats.undetected}\n\n`
    });

  } catch (err) {
    console.error(err.response?.data || err);
    await respond({
      text: `Something went wrong scanning that URL.`
    });
  }
});

(async () => {
  await app.start();
  console.log("bot is running!");
})();
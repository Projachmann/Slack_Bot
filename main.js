require("dotenv").config();

const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");
const { App } = require("@slack/bolt");
const Surveillance = require("./Surveillance");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

const surveillance = new Surveillance(app);

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
      /bigbrother-help - Shows this interface`
  });
});

(async () => {
  await app.start();
  // await surveillance.listAllChannels();
  surveillance.historyCheck("U080F22CTJN");
  console.log("bot is running!");
})();
require("dotenv").config();

const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");
const { App } = require("@slack/bolt");
const Surveillance = require("../Code/Surveillance");
const Telescreen = require("../Code/Telescreen");
const Police = require("../Code/Police");
const Truth = require("../Code/Truth");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

const channelID = "C0BBBCER55W";
const negativeThreshold = 0.75;
const positiveThreshold = 0.85;

const surveillance = new Surveillance(app);
const telescreen = new Telescreen(app, channelID);
const police = new Police(app, negativeThreshold, positiveThreshold, channelID);
const truth = new Truth(app);

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

app.command("/bigbrother-loyalty", async ({ command, ack, respond }) =>{
  const userID = command.text.trim();

  await ack();

  const loyaltyScore = await surveillance.calculateLoyalyScore(userID);

  await respond({
    text: `Your Loyalty score is: ${loyaltyScore}`
  });
});

app.command("/bigbrother-news", async ({ ack, respond }) =>{
  await ack();

  const news = await truth.test();

  await respond({
    text: news[0]
  })
})

telescreen.startTelescreen();
police.register();

(async () => {
  await app.start();
  console.log("bot is running!");
})();
require("dotenv").config();

const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");
const { App } = require("@slack/bolt");
const Surveillance = require("../Code/Surveillance");
const Telescreen = require("../Code/Telescreen");
const Police = require("../Code/Police");
const Truth = require("../Code/Truth");
const logger = require("../Code/Logger");
const { unwatchFile } = require("fs");

logger.setSubsystem("Main");

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
const truth = new Truth(app, channelID);

app.command("/bigbrother-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  logger.info("Ping command", { user: command.user_id, latencyMs: latency });
  await respond({ text: `I am Watching!\nLatency: ${latency}ms` });
});

app.command("/bigbrother-help", async ({ ack, respond }) => {
  await ack();

  await respond({
    text:`
      *Available Commands:*
      /bigbrother-ping - Check bot latency
      /bigbrother-loyalty [user] - Check a citizen's loyalty score
      /bigbrother-scoreboard - View the Top 10 most loyal citizens
      /bigbrother-news [count] - Read the latest Ministry of Truth headlines
      /bigbrother-hate boost - FEED THE FURY! Escalate the Two Minute Hate intensity`
  });
});

app.command("/bigbrother-loyalty", async ({ command, ack, respond }) =>{
  let userID = command.text.trim();

  if(userID === ""){
    userID = command.user_id;
  }

  await ack();

  logger.info("Loyalty command", { caller: command.user_id, target: userID });
  const loyaltyScore = await surveillance.calculateLoyalyScore(userID);

  await respond({
    text: `Your Loyalty score is: ${loyaltyScore}`
  });
});

app.command("/bigbrother-news", async ({ command, ack, respond }) =>{
  let count = parseInt(command.text.trim());

  if(!Number.isInteger(count)){
    count = undefined;
  }

  if(count < 1){
    count = undefined;
  }

  await ack();

  logger.info("News command", { caller: command.user_id, count });
  const news = await truth.getRewrite(count);

  await respond({
    text: news
  })
});

app.command("/bigbrother-scoreboard", async ({ command, ack, respond }) =>{
  await ack();

  logger.info("Scoreboard command", { caller: command.user_id });
  const text = await surveillance.getScoreboard(command.user_id);

  await respond({
    text: text
  })
});

app.command("/bigbrother-hate", async ({ ack, respond }) =>{
  await ack();

  try {
    const responseText = await telescreen.handleHateCommand();
    await respond({ text: responseText });
  } catch (err) {
    logger.error("Error in /bigbrother-hate", err);
    await respond({ text: "The Ministry encountered an error processing this request." });
  }
})

telescreen.startTelescreen(truth);
police.register();
surveillance.startSurveillance();

(async () => {
  await app.start();
  logger.info("Bot started", { socketMode: true, channel: channelID });
})();
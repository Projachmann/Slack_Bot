const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");
const logger = require("./Logger");

logger.setSubsystem("Telescreen");

let hate = true;

const HATE_FILE = "JSON files/hateLevel.json";
const HATE_DATA_FILE = "JSON files/twoMinuteHate.json";

const BASE_THRESHOLDS = [5, 15];
const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_MAX = 2.0;
const RECENT_DAYS_WINDOW = 7;

class Telescreen{
    constructor(app, channel){
        this.app = app;
        this.channelID = channel;
    }

    async readFile(file){
        let data;

        try{
            const rawData = await fs.readFile(file, "utf8");
            if(rawData.trim() === "") return [];
            data = JSON.parse(rawData);
        }catch(err){
            logger.error("Failed to read file", err, { file });
        }

        logger.debug("File read", { file, items: Array.isArray(data) ? data.length : undefined });
        return data;
    }

    async writeFile(file, data){
        try{
            await fs.writeFile(file, JSON.stringify(data, null, 2));
        }catch(err){
            logger.error("Failed to write file", err, { file });
            return;
        }
        logger.debug("File written", { file, items: Array.isArray(data) ? data.length : undefined });
    }

    async ensureFile(file, defaultContent = "[]"){
        try{
            await fs.access(file);
            const raw = await fs.readFile(file, "utf8");

            if(raw.trim() === "" || raw.trim() === "null"){
                await fs.writeFile(file, defaultContent);
                logger.warn("Repaired empty file", { file });
            }
        }catch(err){
            await fs.writeFile(file, defaultContent);
            logger.info("Created missing file", { file });
        }
    }

    async propaganda(){
        const data = await this.readFile("JSON files/broadcasts.json");
        const broadcast = await data[Math.floor(Math.random() * data.length)];

        try{
            const res = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: this.channelID, text: broadcast.broadcast }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if(res.data.ok === false){
                logger.warn("Slack API error posting propaganda", { error: res.data.error, channel: this.channelID });
                return;
            }

            logger.info("Propaganda posted", { channel: this.channelID });
        }catch(err){
            logger.error("Failed to post propaganda", err, { channel: this.channelID });
        }
    }

    async twoMinuteHate(){
        const data = await this.readFile(HATE_DATA_FILE);
        const openings = data.filter(d => d.opening);
        const broadcast = openings[Math.floor(Math.random() * openings.length)];

        try{
            const res = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: this.channelID, text: broadcast.opening }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if(res.data.ok === false){
                logger.warn("Slack API error starting two-minute hate", { error: res.data.error, channel: this.channelID });
                return;
            }

            logger.info("Two-minute hate opened", { channel: this.channelID });
        }catch(err){
            logger.error("Failed to start two-minute hate", err, { channel: this.channelID });
        }
    }

    async loadHateLevel(){
        await this.ensureFile(HATE_FILE, JSON.stringify({
            usageCount: 0,
            stage: 0,
            multiplier: 1.0,
            dailyHateCalls: 0,
            lastResetDate: new Date().toISOString().slice(0, 10),
            recentDays: []
        }));

        const raw = await fs.readFile(HATE_FILE, "utf8");
        const data = JSON.parse(raw);

        return {
            usageCount: data.usageCount ?? 0,
            stage: data.stage ?? 0,
            multiplier: data.multiplier ?? 1.0,
            dailyHateCalls: data.dailyHateCalls ?? 0,
            lastResetDate: data.lastResetDate ?? new Date().toISOString().slice(0, 10),
            recentDays: Array.isArray(data.recentDays) ? data.recentDays : []
        };
    }

    async saveHateLevel(state){
        await this.writeFile(HATE_FILE, state);
    }

    pickRandom(arr){
        return arr[Math.floor(Math.random() * arr.length)];
    }

    async postMessage(text){
        try{
            const res = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: this.channelID, text }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if(res.data.ok === false){
                logger.warn("Slack API error posting message", { error: res.data.error, channel: this.channelID });
            }else{
                logger.debug("Message posted", { channel: this.channelID, length: text.length });
            }
        }catch(err){
            logger.error("Failed to post message", err, { channel: this.channelID });
        }
    }

    async postStageContent(stage){
        const data = await this.readFile(HATE_DATA_FILE);

        if(stage === 1){
            const roar = this.pickRandom(data.filter(d => d.roar));
            await this.postMessage(roar.roar);
        }else if(stage === 2){
            const frenzy = this.pickRandom(data.filter(d => d.frenzy));
            await this.postMessage(frenzy.frenzy);
        }
    }

    async postTransition(stage){
        const data = await this.readFile(HATE_DATA_FILE);
        const transitions = data.filter(d => d.transition);
        const tpl = this.pickRandom(transitions).transition;
        const text = tpl.replace("{stage}", String(stage));
        await this.postMessage(text);
    }

    effectiveThreshold(state, nextStage){
        const base = BASE_THRESHOLDS[nextStage - 1] ?? Infinity;
        return Math.max(1, Math.round(base * state.multiplier));
    }

    async hateCounter(){
        const state = await this.loadHateLevel();

        state.usageCount += 1;
        state.dailyHateCalls += 1;

        let newStage = state.stage;
        if(state.stage < 2){
            const threshold = this.effectiveThreshold(state, state.stage + 1);
            if(state.usageCount >= threshold){
                newStage = state.stage + 1;
            }
        }

        const escalated = newStage > state.stage;
        state.stage = newStage;

        await this.saveHateLevel(state);

        if(escalated){
            logger.info("Hate escalated", { stage: newStage, usageCount: state.usageCount });
        }else{
            logger.debug("Hate registered", { stage: state.stage, usageCount: state.usageCount });
        }

        return { state, escalated, newStage };
    }

    async handleHateCommand(){
        if(!hate){
            const data = await this.readFile(HATE_DATA_FILE);
            const refusals = data.filter(d => d.refusal);
            return this.pickRandom(refusals).refusal;
        }

        const { state, escalated, newStage } = await this.hateCounter();

        if(escalated){
            await this.postTransition(newStage);
            this.postStageContent(newStage).catch(err => logger.error("Stage content post failed", err, { stage: newStage }));
        }

        const nextThreshold = newStage < 2
            ? this.effectiveThreshold(state, newStage + 1)
            : null;

        const remain = newStage < 2
            ? Math.max(0, nextThreshold - state.usageCount)
            : 0;

        const head = escalated
            ? `🔥 The Hate escalates to STAGE ${newStage}.`
            : `⚠️ Hate registered. STAGE ${state.stage}.`;

        const tail = newStage < 2
            ? ` ${remain} call(s) until STAGE ${newStage + 1} (threshold ${nextThreshold}, multiplier x${state.multiplier.toFixed(2)}).`
            : ` FRENZY achieved. The Party is satisfied.`;

        return `${head} Total calls: ${state.usageCount}. Today's calls: ${state.dailyHateCalls}.${tail}`;
    }

    async recomputeMultiplier(){
        const state = await this.loadHateLevel();

        const recent = state.recentDays.slice(-RECENT_DAYS_WINDOW);
        const mean = recent.length
            ? recent.reduce((s, d) => s + d.calls, 0) / recent.length
            : 0;

        let multiplier = 1.0;
        if(mean > 0){
            multiplier = state.dailyHateCalls / mean;
        }else if(state.dailyHateCalls > 0){
            multiplier = 1.0;
        }else{
            multiplier = 1.0;
        }

        multiplier = Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, multiplier));

        const today = new Date().toISOString().slice(0, 10);

        state.recentDays.push({ date: state.lastResetDate, calls: state.dailyHateCalls });
        if(state.recentDays.length > RECENT_DAYS_WINDOW){
            state.recentDays = state.recentDays.slice(-RECENT_DAYS_WINDOW);
        }

        state.multiplier = parseFloat(multiplier.toFixed(2));
        state.usageCount = 0;
        state.stage = 0;
        state.dailyHateCalls = 0;
        state.lastResetDate = today;

        await this.saveHateLevel(state);
        logger.info("Multiplier recomputed", { multiplier: state.multiplier, yesterdayCalls: state.recentDays[state.recentDays.length - 1]?.calls ?? 0, mean: Number(mean.toFixed(2)) });
    }

    async hateCounterRestore(){
        const current = await this.loadHateLevel();
        const state = {
            usageCount: 0,
            stage: 0,
            multiplier: 1.0,
            dailyHateCalls: 0,
            lastResetDate: new Date().toISOString().slice(0, 10),
            recentDays: current.recentDays ?? []
        };
        await this.saveHateLevel(state);
    }

    async startTelescreen(truth){
        await this.ensureFile(HATE_FILE, JSON.stringify({
            usageCount: 0,
            stage: 0,
            multiplier: 1.0,
            dailyHateCalls: 0,
            lastResetDate: new Date().toISOString().slice(0, 10),
            recentDays: []
        }));

        let minutePropaganda = Math.floor(Math.random() * 60);
        let hourPropaganda = Math.floor(Math.random() * 24);
        let propagandaJob = null;

        logger.info("Telescreen scheduled", { nextPropaganda: `${hourPropaganda}:${String(minutePropaganda).padStart(2, "0")}` });

        //Daily two minute hate
        cron.schedule(`0 11 * * *`, () => {
            hate = true;
            logger.info("Two-minute hate window opened");
            this.twoMinuteHate();
        });

        //Daily two minute hate end
        cron.schedule(`2 11 * * *`, () => {
            hate = false;
            logger.info("Two-minute hate window closed");
        });

        //Daily multiplier recompute (5 min after midnight)
        cron.schedule(`33 18 * * *`, () => {
            this.recomputeMultiplier();
        });

        //Daily propaganda
        const schedulePropaganda = () => {
            if (propagandaJob) propagandaJob.stop();

            propagandaJob = cron.schedule(`${minutePropaganda} ${hourPropaganda} * * *`, () => {
                this.propaganda();

                minutePropaganda = Math.floor(Math.random() * 60);
                hourPropaganda = Math.floor(Math.random() * 24);
                logger.debug("Next propaganda scheduled", { time: `${hourPropaganda}:${String(minutePropaganda).padStart(2, "0")}` });

                schedulePropaganda();
                });
        };

        schedulePropaganda();
        truth.dailyNews();
    }
}

module.exports = Telescreen;

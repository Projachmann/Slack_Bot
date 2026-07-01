const axios = require("axios");
const fs = require("fs/promises");
const cron = require("node-cron");
const logger = require("./Logger");

logger.setSubsystem("Surveillance");

let channels = [];

class Surveillance{
    constructor(app){
        this.app = app;
    }

    async presenceCheck(user){
        this.user = user;
        try{
            const res = await axios.get("https://slack.com/api/users.getPresence", {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                params: { user: this.user }
            });
            this.data = res.data;
        }catch(err){
            logger.error("Presence check failed", err, { user });
        }

        if(this.data.ok === false){
            logger.warn("Slack API returned error for presence", { user, error: this.data.error });
            return;
        }

        let present;

        switch(this.data.presence){
            case "active":
                present = 50;
                break;
            case "away":
                present = 0;
                break;
        }

        logger.debug("Presence retrieved", { user, presence: this.data.presence, score: present });
        return present;
    }

    async readFile(file = "JSON files/channels.json"){
        let rawData = [];

        try{
            const data = await fs.readFile(file, "utf8");
            if(data.trim() === "") return [];
            rawData = JSON.parse(data);
        }catch(err){
            logger.error("Failed to read file", err, { file });
        }

        logger.debug("File read", { file, items: rawData.length });
        return rawData;
    }

    async writeFile(data, file = "JSON files/allMessages.json"){
        try{
            await fs.writeFile(file, JSON.stringify(data));
        }catch(err){
            logger.error("Failed to write file", err, { file });
            return;
        }

        logger.debug("File written", { file, items: Array.isArray(data) ? data.length : undefined });
    }

    async getMessages(oldest = Math.floor(Date.now() / 1000) - 604800){
        let cursor;
        let allMessages = [];

        logger.info("Starting message fetch", { channels: channels.length, oldest });

        for(let i = 0; i < channels.length; i++){
            cursor = undefined;
            const channel = channels[i].id;

            logger.info("Fetching channel history", { channel, index: i + 1, total: channels.length });

            try{
                do{
                    while(true){
                        const res = await axios.get("https://slack.com/api/conversations.history", {
                            headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                            params: { channel: channel, oldest: oldest, cursor: cursor },
                            validateStatus: () => true
                        });

                        if (res.status === 429){
                            const retryAfter = res.headers['retry-after'] || 10;
                            logger.warn("Rate limited, waiting", { channel, seconds: retryAfter });
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            continue;
                        }

                        if (!res.data.ok) {
                            logger.warn("Slack API returned error for history", { channel, error: res.data.error });
                            break;
                        }

                        const messages = res.data.messages.map(m => ({ ...m, channel: channels[i].id }));
                        allMessages = allMessages.concat(messages);

                        cursor = res.data.response_metadata?.next_cursor;
                        break;
                    }
                }while(cursor);
            }catch(err){
                logger.error("Failed to fetch channel history", err, { channel });
            }
        }

        logger.info("Message fetch complete", { total: allMessages.length });
        return allMessages;
    }

    async historyCheck(user){
        const allMessages = await this.readFile("JSON files/allMessages.json");
        const userMessages = allMessages.filter(m => m.user === user);

        return userMessages;
    }

    async sentimentCheck(user){
        const allMessages = await this.readFile("JSON files/userSentiment.json");
        const userMessages = allMessages.filter(m => m.user === user);

        return userMessages;
    }

    async updateFiles(){
        const oldMsg = await this.readFile("JSON files/allMessages.json");
        const youngest = oldMsg.reduce((a, b) => a.ts > b.ts ? a : b);
        const newMsg = await this.getMessages(youngest.ts);

        const cutoff = Math.floor(Date.now() / 1000) - 604800;
        const merged = [...oldMsg.filter(m => parseFloat(m.ts) > cutoff), ...newMsg];

        await this.writeFile(merged);

        logger.info("All messages file updated", { added: newMsg.length, kept: merged.length });
    }

    async calculateLoyalyScore(user){
        await this.updateFiles();

        const userMessages = await this.historyCheck(user);
        const userSentiment = await this.sentimentCheck(user);

        const activeDays = new Set(userMessages.map(msg => new Date(msg.ts * 1000).toDateString())).size;
        const messageCount = userMessages.length;
        const channelCount = new Set(userMessages.map(msg => msg.channel)).size;
        const present = await this.presenceCheck(user);

        const positiveMsg = userSentiment.filter(msg => msg.sentiment === "positive").length;
        const negativeMsg = userSentiment.filter(msg => msg.sentiment === "negative").length;

        const loyaltyScore = (messageCount * 2) + (activeDays * 5) + (channelCount * 3) + present + (positiveMsg * 10) + (-negativeMsg * 20);

        logger.info("Loyalty score computed", { user, score: loyaltyScore, messageCount, activeDays, channelCount, present, positiveMsg, negativeMsg });

        await this.scoreboard(user, loyaltyScore);

        return loyaltyScore;
    }

    async startSurveillance(){
        await this.ensureFile("JSON files/scoreboard.json");
        await this.ensureFile("JSON files/allMessages.json");
        await this.ensureFile("JSON files/userSentiment.json");

        channels = await this.readFile("JSON files/channels.json");

        const allMessages = await this.getMessages();
        this.writeFile(allMessages);

        this.dailyUpdate();
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

    async scoreboard(user, score){
        const scoreboard = await this.readFile("JSON files/scoreboard.json");

        const userCheck = scoreboard.findIndex(e => e.user === user);

        if(userCheck !== -1){
            scoreboard[userCheck].score = score;
            logger.info("Scoreboard updated", { user, score });
        }else{
            scoreboard.push({ user, score });
            logger.info("Scoreboard entry added", { user, score });
        }

        scoreboard.sort((a, b) => b.score - a.score);

        await this.writeFile(scoreboard, "JSON files/scoreboard.json");
    }

    async getScoreboard(user){
        const scoreboard = await this.readFile("JSON files/scoreboard.json");
        const top = scoreboard.slice(0, 10).map((entry, i) => `${i + 1}. <@${entry.user}> — ${entry.score} pts`).join("\n");

        const userRank = scoreboard.findIndex(e => e.user === user);
        const yourPlace = userRank === -1
            ? "You are not on the scoreboard yet. Run /bigbrother-loyalty first."
            : userRank < 10
                ? "You are already in the top 10!"
                : `${userRank + 1}. <@${scoreboard[userRank].user}> — ${scoreboard[userRank].score} pts`;
        
        return `*Loyalty Scoreboard:*\n${top}\n\n*Your place:*\n${yourPlace}`;
    }

    async dailyUpdate(){
        cron.schedule(`0 0 * * *`, async () => {
            this.updateFiles();
        });
    }

    //Lists all existing channels in workspace
    async listAllChannels(){
        let cursor;
        let allChannelNames = [];
        let allChannelIDs = [];
        let i = 0;

        try{
            do{
                i++;
                logger.info("Listing channels page", { page: i });

                let res;
                while(true){
                    res = await axios.get("https://slack.com/api/conversations.list", {
                        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`},
                        params: {
                            exclude_archived: true,
                            limit: 250,
                            cursor: cursor
                        },
                        validateStatus: () => true
                    });

                    if(res.status === 429){
                        const retryAfter = res.headers['retry-after'] || 30;
                        logger.warn("Rate limited, waiting", { seconds: retryAfter });
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    } else {
                        break;
                    }
                }

                const ids = res.data.channels.map(channel => channel.id);
                const names = res.data.channels.map(channel => channel.name);

                allChannelIDs = allChannelIDs.concat(ids);
                allChannelNames = allChannelNames.concat(names);

                cursor = res.data.response_metadata.next_cursor;
            }while(cursor);
        }catch(err){
            logger.error("Failed to list channels", err);
        }

        try{
            const combined = allChannelIDs.map((id, i) => ({ id, name: allChannelNames[i] }));
            await fs.writeFile("channels.json", JSON.stringify(combined));
        }catch(err){
            logger.error("Failed to write channels.json", err);
        }

        logger.info("Channels file created", { count: allChannelIDs.length });
    }
}

module.exports = Surveillance;
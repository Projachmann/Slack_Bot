const axios = require("axios");
const fs = require("fs/promises");
const cron = require("node-cron");

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
            console.log(err);
        }

        if(this.data.ok === false){
            console.log(this.data.error);
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

        return present;
    }

    async readFile(file = "JSON files/channels.json"){
        let rawData = [];

        try{
            const data = await fs.readFile(file, "utf8");
            rawData = JSON.parse(data);
            console.log("Json file read!");
        }catch(err){
            console.log(err);
        }

        return rawData;
    }

    async writeFile(data, file = "JSON files/allMessages.json"){
        try{
            await fs.writeFile(file, JSON.stringify(data));
        }catch(err){
            console.log(err);
        }

        console.log("Messages saved!");
    }

    async getMessages(oldest = Math.floor(Date.now() / 1000) - 604800){
        let cursor;
        let allMessages = [];

        console.log("Starting Reading messages");

        for(let i = 0; i < channels.length; i++){
            cursor = undefined;
            const channel = channels[i].id;

            console.log(`Reading channels: ${i + 1}/${channels.length}`);

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
                            console.log(`Rate limited, waiting ${retryAfter}s...`);
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            continue;
                        }

                        if (!res.data.ok) {
                            console.log(res.data.error);
                            break;
                        }

                        const messages = res.data.messages.map(m => ({ ...m, channel: channels[i].id }));
                        allMessages = allMessages.concat(messages);

                        cursor = res.data.response_metadata?.next_cursor;
                        break;
                    }
                }while(cursor);
            }catch(err){
                console.log(err);
            }
        }

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

        console.log(newMsg.length);
        
        const cutoff = Math.floor(Date.now() / 1000) - 604800;
        const merged = [...oldMsg.filter(m => parseFloat(m.ts) > cutoff), ...newMsg];

        await this.writeFile(merged);

        console.log("Updated files!")
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

        console.log(`Loyalty score of user is ${loyaltyScore}!`);

        return loyaltyScore;
    }

    async startSurveillance(){
        channels = await this.readFile("JSON files/channels.json");

        const allMessages = await this.getMessages();
        this.writeFile(allMessages);

        this.dailyUpdate();
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
                console.log(i);

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
                        console.log(`Rate limited, waiting ${retryAfter}s...`);
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
            console.log(err);
        }

        try{
            const combined = allChannelIDs.map((id, i) => ({ id, name: allChannelNames[i] }));
            await fs.writeFile("channels.json", JSON.stringify(combined));
        }catch(err){
            console.log(err);
        }

        console.log("File created!");
    }
}

module.exports = Surveillance;
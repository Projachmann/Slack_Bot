const axios = require("axios");
const fs = require("fs/promises");

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

    async historyCheck(user){
        this.user = user;
        let cursor;
        let allMessages = [];
        let rawData;

        //Reading the json file with all the channels that should be scanned
        try{
            const data = await fs.readFile("channels.json", "utf8");
            rawData = JSON.parse(data);
            console.log("Json read!");
        }catch(err){
            console.log(err);
        }

        //Scannin the channels for messages from this.user => allMessages
        for(let i = 0; i < rawData.length; i++){
            cursor = undefined;
            this.channel = rawData[i].id;

            console.log(`Reading channel ${i + 1}/${rawData.length}`);

            try{
                do{
                    while(true){
                        const res = await axios.get("https://slack.com/api/conversations.history", {
                            headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                            params: { channel: this.channel, oldest: Math.floor(Date.now() / 1000) - 604800, cursor: cursor },
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

                        const messages = res.data.messages.filter(m => m.user === this.user).map(m => ({ ...m, channel: rawData[i].id }));
                        allMessages = allMessages.concat(messages);

                        cursor = res.data.response_metadata?.next_cursor;
                        break;
                    }
                }while(cursor)
            }catch(err){
                console.log(err);
            }
        }

        console.log("Messages extracted!");

        return allMessages;
    }

    async calculateLoyalyScore(user){
        const userMessages = await this.historyCheck(user);

        const activeDays = new Set(userMessages.map(msg => new Date(msg.ts * 1000).toDateString())).size;
        console.log(activeDays);
        const messageCount = userMessages.length;
        console.log(messageCount);
        const channelCount = new Set(userMessages.map(msg => msg.channel)).size;
        console.log(channelCount);
        const present = await this.presenceCheck(this.user);
        console.log(present);

        const loyaltyScore = (messageCount * 2) + (activeDays * 5) + (channelCount * 3) + (present);

        console.log(`Loyalty score of user is ${loyaltyScore}!`);

        return loyaltyScore;
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
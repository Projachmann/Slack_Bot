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
    }

    async historyCheck(user){
        this.user = user;
        let cursor;
        let allMessages = [];
        let rawData;

        try{
            const data = await fs.readFile("testchannels.json", "utf8");
            rawData = JSON.parse(data);
        }catch(err){
            console.log(err);
        }

        for(let i = 0; i < rawData.length; i++){
            cursor = undefined;
            this.channel = rawData[i].id;

            try{
                do{
                    const res = await axios.get("https://slack.com/api/conversations.history", {
                        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                        params: { channel: this.channel, oldest: Math.floor(Date.now() / 1000) - 604800, cursor: cursor }
                    })

                    if (!res.data.ok) {
                        console.log(res.data.error);
                        break;
                    }

                    const messages = res.data.messages.filter(m => m.user === this.user);
                    allMessages = allMessages.concat(messages);

                    cursor = res.data.response_metadata?.next_cursor;
                }while(cursor)
            }catch(err){
                console.log(err);
            }
        }
        console.log(allMessages);
    }

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
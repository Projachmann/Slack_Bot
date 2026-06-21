const axios = require("axios");
const fs = require("fs/promises");

class Telescreen{
    constructor(app){
        this.app = app;
    }

    async readFile(file){
        let data;

        try{
            const rawData = await fs.readFile(file, "utf8");
            data = JSON.parse(rawData);
            console.log("Broadcasts ready!");
        }catch(err){
            console.log(err);
        }

        return data;
    }

    async propaganda(channelID){
        const data = await this.readFile("JSON files/broadcasts.json");
        const broadcast = await data[Math.floor(Math.random() * data.length)];

        try{
            const res = await axios.post('https://slack.com/api/chat.postMessage',{
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                params: { channel: channelID, text: broadcast }
            });

            if(res.data.ok === false){
                console.log(res.data.error);
                return;
            }
        }catch(err){
            console.log(err);
        }
    }

    async twoMinuteHate(channelID){
        const data = await this.readFile("JSON files/twoMinuteHate.json");
        const broadcast = await data[Math.floor(Math.random() * data.length)];

                try{
            const res = await axios.post('https://slack.com/api/chat.postMessage',{
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                params: { channel: channelID, text: broadcast }
            });

            if(res.data.ok === false){
                console.log(res.data.error);
                return;
            }
        }catch(err){
            console.log(err);
        }
    }
}

module.exports = Telescreen;
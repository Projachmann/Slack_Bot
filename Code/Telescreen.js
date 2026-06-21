const axios = require("axios");
const cron = require("node-cron");
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
            const res = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: channelID, text: broadcast.broadcast }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
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
            const res = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: channelID, text: broadcast.opening }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if(res.data.ok === false){
                console.log(res.data.error);
                return;
            }
        }catch(err){
            console.log(err);
        }
    }

    async startTelescreen(channelID){
        let minutePropaganda = Math.floor(Math.random() * 60);
        let hourPropaganda = Math.floor(Math.random() * 24);
        let propagandaJob = null;

        //Daily two minute hate
        cron.schedule(`0 11 * * *`, () => {
            this.twoMinuteHate(channelID);

            console.log("Two minute hate started!");
        });

        //Daily propaganda
        const schedulePropaganda = () => {
            if (propagandaJob) propagandaJob.stop();

            propagandaJob = cron.schedule(`${minutePropaganda} ${hourPropaganda} * * *`, () => {
                this.propaganda(channelID);

                minutePropaganda = Math.floor(Math.random() * 60);
                hourPropaganda = Math.floor(Math.random() * 24);
                console.log(`Next propaganda message ${hourPropaganda}:${minutePropaganda}`);

                schedulePropaganda();
                });
        };

        schedulePropaganda();
    }
}

module.exports = Telescreen;
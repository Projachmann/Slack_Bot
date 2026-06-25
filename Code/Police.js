const axios = require("axios");
const fs = require("fs/promises");

class Police{
    constructor(app, negativeValue, positiveValue, channel){
        this.app = app;
        this.nVal = negativeValue;
        this.pVal = positiveValue;
        this.channelID = channel;
    }

    async preprocess(text){
        let input = text;
        input = input.split(" ");
        input = input.map(t => {
            if(t.startsWith("@") && t.length > 1) return "@user";
            if(t.startsWith("http")) return "http";
            return t;
        }).join(" ");
        return input;
    }

    async callApi(text){
        let data;

        try{
            const res = await axios.post("https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-roberta-base-sentiment-latest", {
                inputs: await this.preprocess(text) }, {
                headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` }
            });

            data = res.data;
            console.log(data);
        }catch(err){
            console.log(err);
        }

        if (!data) return [0, 0];

        data = data[0];
        
        const val = [getValue("positive"), getValue("negative")];

        function getValue(sentiment){
            for(let i = 0; i < data.length; i++){
                if(data[i].label === sentiment){
                    return data[i].score;
                }
            }
        }

        return val;
    }

    async register(){
        this.app.message(async ({ message, client }) => {
            if (message.subtype) return;
            if (!message.text) return;
            if (message.channel !== this.channelID) return;

            console.log("Message received!");

            try{
                const score = await this.callApi(message.text);

                if (score[1] >= this.nVal){
                    await client.chat.postMessage({
                        channel: this.channelID,
                        thread_ts: message.ts,
                        text: await this.getResponse("negative", message.user),
                    });

                    await this.saveSentiment(message, "negative");
                }

                if(score[0] >= this.pVal){
                    await client.chat.postMessage({
                        channel: this.channelID,
                        thread_ts: message.ts,
                        text: await this.getResponse("positive", message.user),
                    });

                    await this.saveSentiment(message, "positive");
                }

                console.log(`Positive ${score[0]} | Negative ${score[1]}`)
            }catch(err){
                console.log(err);
            }
        });
    }

    async getResponse(sent, user){
        let responses;
        let msg = "";

        if(sent === "negative"){
            responses = await this.readFile("JSON files/negativeSentiment.json");
            msg = responses[Math.floor(Math.random() * responses.length)].replace("{user}", user);
        }else if(sent === "positive"){
            responses = await this.readFile("JSON files/positiveSentiment.json");
            msg = responses[Math.floor(Math.random() * responses.length)].replace("{user}", user);
        }else{
            console.warn(`Unknown sentiment: ${sent}`);
            return null;
        }

        return msg;
    }

    async saveSentiment(message, sent){
        const msgToBeSaved = [{
            user: message.user,
            ts: message.ts,
            sentiment: sent
        }];

        await this.updateFiles(msgToBeSaved);
    }

    async updateFiles(msg){
        const oldMsg = await this.readFile("JSON files/userSentiment.json");
        
        const cutoff = Math.floor(Date.now() / 1000) - 2592000;
        const merged = [...oldMsg.filter(m => parseFloat(m.ts) > cutoff), ...msg];

        await this.writeFile(merged);

        console.log("Updated files!")
    }

    async writeFile(data, file = "JSON files/userSentiment.json"){
            try{
                await fs.writeFile(file, JSON.stringify(data));
            }catch(err){
                console.log(err);
            }
    
            console.log("Messages saved!");
    }

    async readFile(file){
        let data;
    
        try{
            const rawData = await fs.readFile(file, "utf8");
            if(rawData.trim() === "") return [];
            data = JSON.parse(rawData);
            console.log("Responding...");
        }catch(err){
            console.log(err);
            return [];
        }

        return data;
    }
}

module.exports = Police;
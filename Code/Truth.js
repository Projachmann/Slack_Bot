const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");

const msg = `
Rewrite news headlines in a style inspired by Orwell's 1984.

Rules:
- Sound like state propaganda.
- Use bureaucratic and euphemistic language.
- Keep it to a single headline.
- Do not explain anything.
`;

class Truth{
    constructor(app, channel){
        this.app = app;
        this.channelID = channel;
    }

    async getNews(count = 1){
        let res;

        try{
            res = await axios.get("https://newsapi.org/v2/top-headlines", {
                params: { language: "en", pageSize: count, apiKey: process.env.NEWS_TOKEN },
            });
        }catch(err){
            console.log(err);
        }

        const data = await res.data.articles.map((a) => a.title).filter(Boolean);
        return data;
    }

    async rewriteHeadline(headline){
        let returnData = [];

        try{
            for(let i = 0; i < headline.length; i++){
                const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.9,
                    messages: [{
                        role: "system",
                        content: msg
                    }, {
                        role: "user",
                        content: headline[i]
                    }]
                }, {
                    headers: { Authorization: `Bearer ${process.env.GROQ_TOKEN}`, }
                });

                const data = res.data.choices.map((c) => c.message.content.trim().replace(/^[""]|[""]$/g, ""));
                returnData = returnData.concat(data);
            }
        }catch(err){
            console.log(err);
        }

        return returnData;
    }

    async getRewrite(count = 1){
        const headline = await this.getNews(count);
        const rewrite = await this.rewriteHeadline(headline);
        const allHeadlines = rewrite.join("\n\n");

        console.log(allHeadlines);

        return allHeadlines;
    }

    async readFile(file = "JSON files/headlines.json"){
        let rawData = [];
    
        try{
            const data = await fs.readFile(file, "utf8");
            if(data.trim() === "") return [];
            rawData = JSON.parse(data);
            console.log("Json file read!");
        }catch(err){
            console.log(err);
        }

        return rawData;
    }
    
    async writeFile(data, file = "JSON files/headlines.json"){
        try{
            await fs.writeFile(file, JSON.stringify(data));
        }catch(err){
            console.log(err);
        }
    
        console.log("Messages saved!");
    }

    async postNews() {
        const headlines = await this.getRewrite();

        try {
            const res = await axios.post("https://slack.com/api/chat.postMessage", {
                channel: this.channelID,
                text: `*📰 Ministry of Truth — Daily Briefing:*\n\n${headlines}`,
            }, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
            });

            if (res.data.ok === false) {
                console.log(res.data.error);
            }
        } catch (err) {
            console.log(err);
        }
    }

    async dailyNews(){
        let minuteNews = Math.floor(Math.random() * 60);
        let hourNews = Math.floor(Math.random() * 24);
        let newsJob = null;

        console.log(`Next news briefing: ${hourNews}:${minuteNews}`);

        const scheduleNews = () => {
            if (newsJob) newsJob.stop();

            newsJob = cron.schedule(`${minuteNews} ${hourNews} * * *`, () => {
                this.postNews();

                minuteNews = Math.floor(Math.random() * 60);
                hourNews = Math.floor(Math.random() * 24);
                console.log(`Next news briefing: ${hourNews}:${minuteNews}`);

                scheduleNews();
            });
        };

        scheduleNews();
    }
}

module.exports = Truth;
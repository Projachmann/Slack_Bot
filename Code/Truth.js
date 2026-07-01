const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs/promises");
const logger = require("./Logger");

logger.setSubsystem("Truth");

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
            logger.error("NewsAPI fetch failed", err, { count });
        }

        if(!res || !res.data){
            logger.warn("No response from NewsAPI", { count });
            return [];
        }

        const data = await res.data.articles.map((a) => a.title).filter(Boolean);
        logger.info("News fetched", { requested: count, received: data.length });
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
            logger.error("Groq rewrite failed", err, { headlines: headline.length });
        }

        logger.info("Headlines rewritten", { count: returnData.length });
        return returnData;
    }

    async getRewrite(count = 1){
        const headline = await this.getNews(count);
        if(headline.length === 0) return "The Ministry has no news to share at this time.";
        const rewrite = await this.rewriteHeadline(headline);
        const allHeadlines = rewrite.join("\n\n");

        return allHeadlines;
    }

    async readFile(file = "JSON files/headlines.json"){
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

    async writeFile(data, file = "JSON files/headlines.json"){
        try{
            await fs.writeFile(file, JSON.stringify(data));
        }catch(err){
            logger.error("Failed to write file", err, { file });
            return;
        }

        logger.debug("File written", { file, items: Array.isArray(data) ? data.length : undefined });
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
                logger.warn("Slack API error posting news briefing", { error: res.data.error, channel: this.channelID });
            }else{
                logger.info("Daily briefing posted", { channel: this.channelID });
            }
        } catch (err) {
            logger.error("Failed to post daily briefing", err, { channel: this.channelID });
        }
    }

    async dailyNews(){
        let minuteNews = Math.floor(Math.random() * 60);
        let hourNews = Math.floor(Math.random() * 24);
        let newsJob = null;

        logger.info("Daily news scheduled", { nextBriefing: `${hourNews}:${String(minuteNews).padStart(2, "0")}` });

        const scheduleNews = () => {
            if (newsJob) newsJob.stop();

            newsJob = cron.schedule(`${minuteNews} ${hourNews} * * *`, () => {
                this.postNews();

                minuteNews = Math.floor(Math.random() * 60);
                hourNews = Math.floor(Math.random() * 24);
                logger.debug("Next news briefing scheduled", { time: `${hourNews}:${String(minuteNews).padStart(2, "0")}` });

                scheduleNews();
            });
        };

        scheduleNews();
    }
}

module.exports = Truth;
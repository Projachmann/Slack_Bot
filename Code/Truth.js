const axios = require("axios");
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
    constructor(app){
        this.app = app;
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
}

module.exports = Truth;
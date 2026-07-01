const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

const COLORS = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

const LEVEL_COLORS = {
    debug: COLORS.gray,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red
};

const SUBSYSTEM_COLORS = {
    Main: COLORS.magenta,
    Police: COLORS.blue,
    Surveillance: COLORS.green,
    Telescreen: COLORS.yellow,
    Truth: COLORS.red
};

const DEFAULT_SUBSYSTEM = "App";

function timestamp(){
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function colorize(text, color){
    if(!color) return text;
    return `${color}${text}${COLORS.reset}`;
}

function formatMeta(meta){
    if(meta === undefined || meta === null) return "";
    if(meta instanceof Error){
        return `\n${COLORS.dim}    ${meta.stack || meta.message || String(meta)}${COLORS.reset}`;
    }
    if(typeof meta === "string") return ` ${meta}`;
    try{
        return ` ${JSON.stringify(meta)}`;
    }catch{
        return ` ${String(meta)}`;
    }
}

class Logger{
    constructor(){
        const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
        this.level = LEVELS[envLevel] !== undefined ? LEVELS[envLevel] : LEVELS.info;
        this.subsystem = DEFAULT_SUBSYSTEM;
    }

    setSubsystem(name){
        this.subsystem = name || DEFAULT_SUBSYSTEM;
    }

    setLevel(level){
        const v = LEVELS[String(level).toLowerCase()];
        if(v !== undefined) this.level = v;
    }

    shouldLog(level){
        return LEVELS[level] >= this.level;
    }

    _log(level, msg, err, meta){
        if(!this.shouldLog(level)) return;

        let errorObj = null;
        let metaObj = meta;

        if(err instanceof Error){
            errorObj = err;
        }else if(meta === undefined && err !== undefined && !(err instanceof Error)){
            metaObj = err;
        }

        const ts = colorize(`[${timestamp()}]`, COLORS.gray);
        const levelTag = colorize(`[${level.toUpperCase().padEnd(5)}]`, LEVEL_COLORS[level]);
        const sub = colorize(`[${this.subsystem}]`, SUBSYSTEM_COLORS[this.subsystem] || COLORS.cyan);

        let line = `${ts} ${levelTag} ${sub} ${msg}`;
        line += formatMeta(metaObj);
        if(errorObj){
            line += formatMeta(errorObj);
        }

        const stream = level === "error" ? process.stderr : process.stdout;
        stream.write(line + "\n");
    }

    debug(msg, meta){
        this._log("debug", msg, undefined, meta);
    }

    info(msg, meta){
        this._log("info", msg, undefined, meta);
    }

    warn(msg, meta){
        this._log("warn", msg, undefined, meta);
    }

    error(msg, err, meta){
        this._log("error", msg, err, meta);
    }
}

module.exports = new Logger();

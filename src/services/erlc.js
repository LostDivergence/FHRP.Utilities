const { performance } = require("node:perf_hooks");

const SERVER_ENDPOINT = "https://api.erlc.gg/v2/server";
const REQUEST_TIMEOUT = 10000;

async function requestServerInfo() {
    if (!process.env.ERLC_API_KEY) {
        throw new Error("ERLC_API_KEY is missing.");
    }

    const response = await fetch(SERVER_ENDPOINT, {
        method: "GET",
        headers: {
            "server-key": process.env.ERLC_API_KEY
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });

    if (!response.ok) {
        throw new Error(`ER:LC API Error: HTTP ${response.status}`);
    }

    return response.json();
}

async function getServerInfo() {
    return requestServerInfo();
}

async function getApiPing() {
    const start = performance.now();
    await requestServerInfo();
    return Math.round(performance.now() - start);
}

module.exports = {
    getServerInfo,
    getApiPing
};

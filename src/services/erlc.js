const { performance } = require("node:perf_hooks");

async function getServerInfo() {
    const response = await fetch("https://api.erlc.gg/v2/server", {
        method: "GET",
        headers: {
            "server-key": process.env.ERLC_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`ERLC API Error: ${response.status}`);
    }

    return await response.json();
}

async function getApiPing() {
    const start = performance.now();

    const response = await fetch("https://api.erlc.gg/v2/server", {
        method: "GET",
        headers: {
            "server-key": process.env.ERLC_API_KEY
        },
        signal: AbortSignal.timeout(10000)
    });

    const latency = Math.round(performance.now() - start);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return latency;
}

module.exports = {
    getServerInfo,
    getApiPing
};
/**
 * api/index.js — Vercel serverless entry point
 *
 * Vercel's Node.js runtime wraps files in api/ as CommonJS modules, but our
 * Express app lives in server/server.js which is a native ES module
 * ("type":"module" in server/package.json).
 *
 * This thin CJS shim performs a dynamic import() of the ESM app the first time
 * a request arrives, caches the result, and forwards every subsequent request
 * directly — giving us warm-container re-use without any build step.
 */

'use strict';

let appPromise = null;

function loadApp() {
    if (!appPromise) {
        // Dynamic import works from CJS in Node ≥ 14
        appPromise = import('../server/server.js').then(mod => mod.default);
    }
    return appPromise;
}

module.exports = async (req, res) => {
    try {
        const app = await loadApp();
        app(req, res);
    } catch (err) {
        console.error('[api/index.js] Failed to load app:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, message: 'Server initialization failed.' }));
    }
};

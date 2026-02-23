import express from 'express';
import { createIceRouter } from './routes/ice.js';
export function createApp(input) {
    const app = express();
    app.use(express.json());
    app.use('/api', createIceRouter({ iceServers: input.iceServers }));
    app.get('/healthz', (_request, response) => {
        response.status(200).json({ ok: true });
    });
    return app;
}

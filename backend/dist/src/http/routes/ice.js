import { Router } from 'express';
export function createIceRouter(input) {
    const router = Router();
    router.get('/ice', (_request, response) => {
        response.json({
            iceServers: input.iceServers
        });
    });
    return router;
}

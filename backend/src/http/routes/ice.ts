import { Router } from 'express';
import type { IceServerDto } from '../../config/readConfig.js';

export function createIceRouter(input: { iceServers: IceServerDto[] }): Router {
  const router = Router();

  router.get('/ice', (_request, response) => {
    response.json({
      iceServers: input.iceServers
    });
  });

  return router;
}
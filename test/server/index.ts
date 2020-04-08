import express from 'express';
import { resolve } from 'path';

import { queryType, stringArg, makeSchema } from '@nexus/schema';
import bodyParser from 'body-parser';
import { createGraphqlMiddleware } from 'express-gql';

const app = express();

app.use(bodyParser.json());

const Query = queryType({
  definition(t) {
    t.string('hello', {
      args: { name: stringArg({ nullable: true }) },
      resolve: (parent, { name }) => `Hello ${name || 'World'}!`,
    });
  },
});

const schema = makeSchema({
  types: [Query] as any,
  outputs: {
    schema: resolve(__dirname, '../generated/schema.graphql'),
    typegen: resolve(__dirname, '../generated/typings.ts'),
  },
});

app.post(
  '/graphql',
  createGraphqlMiddleware({
    context: ({ req, res }) => {},
    schema,
  })
);

let resolveListening: () => void;
let resolveClosed: () => void;

export const isClosed = new Promise<void>((resolve) => {
  resolveClosed = resolve;
});

export const isListening = new Promise<void>((resolve) => {
  resolveListening = resolve;
});

export const listeningPort = 9999;

const maxTimeoutClose = 10000;

let timeoutClose: NodeJS.Timeout;

const server = app.listen(listeningPort, (err) => {
  if (!err && process.env.NODE_ENV !== 'test') {
    console.log(`gql server listening on port ${listeningPort}`);
  }

  resolveListening();

  timeoutClose = setTimeout(() => {
    serverClose();
  }, maxTimeoutClose);
});

const serverClose = () => {
  server.close(() => {
    resolveClosed();
  });
};

export const close = () => {
  clearTimeout(timeoutClose);
  serverClose();
};

process.on('SIGTERM', () => {
  close();
});

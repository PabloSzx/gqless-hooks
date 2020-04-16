import express from 'express';
import { resolve } from 'path';
import { queryType, stringArg, makeSchema, mutationType } from '@nexus/schema';
import bodyParser from 'body-parser';
import { createGraphqlMiddleware } from 'express-gql';
import { loremIpsum } from 'lorem-ipsum';
const app = express();
import wait from 'waait';
app.use(bodyParser.json());

const loremIpsumArray: string[] = [];

const Query = queryType({
  definition(t) {
    t.string('hello', {
      args: { name: stringArg({ nullable: false }) },
      resolve: (parent, { name }) => `query ${name}!`,
    });
    t.list.string('loremIpsum', {
      nullable: false,
      resolve: async () => {
        // await wait(300);

        loremIpsumArray.push(loremIpsum());

        return loremIpsumArray;
      },
    });
  },
});

const Mutation = mutationType({
  definition(t) {
    t.string('helloMutation', {
      args: { arg1: stringArg({ nullable: false }) },
      resolve: (parent, { arg1 }) => `mutation ${arg1}`,
    });
    t.list.string('resetLoremIpsum', {
      nullable: false,
      resolve: async () => {
        // await wait(200);

        loremIpsumArray.splice(0, loremIpsumArray.length);

        return loremIpsumArray;
      },
    });
  },
});

const schema = makeSchema({
  types: [Query, Mutation] as any,
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

const closeEvent = () => close();

process.on('SIGTERM', closeEvent);

process.on('SIGHUP', closeEvent);

process.on('SIGINT', closeEvent);

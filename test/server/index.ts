import bodyParser from 'body-parser';
import express from 'express';
import { createGraphqlMiddleware } from 'express-gql';
import { loremIpsum } from 'lorem-ipsum';
import { resolve } from 'path';
import wait from 'waait';

import {
  makeSchema,
  mutationType,
  queryType,
  stringArg,
  arg,
} from '@nexus/schema';

import { NODE_ENV } from '../../src/common';

const app = express();

app.use(bodyParser.json());

const loremIpsumArray: string[] = [];

export const loremIpsumPaginationArray = new Array(50).fill(0).map(() => {
  return loremIpsum();
});

const randomDelay = async () => {
  await wait(Math.round(Math.random() * 300) + 50);
};

const Query = queryType({
  definition(t) {
    t.list.string('loremIpsumPagination', {
      args: {
        limit: arg({
          type: 'Int',
          required: true,
        }),
        skip: arg({
          type: 'Int',
          required: true,
        }),
      },
      async resolve(_root, { skip, limit }) {
        await randomDelay();
        return loremIpsumPaginationArray.slice(skip).slice(0, limit);
      },
    });
    t.string('hello', {
      args: { name: stringArg({ nullable: false }) },
      resolve: (_root, { name }) => `query ${name}!`,
    });
    t.list.string('loremIpsum', {
      nullable: false,
      async resolve() {
        await randomDelay();

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
      resolve: (_root, { arg1 }) => `mutation ${arg1}`,
    });
    t.list.string('resetLoremIpsum', {
      nullable: false,
      async resolve() {
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
  if (!err && NODE_ENV !== 'test') {
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

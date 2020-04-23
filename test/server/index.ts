import bodyParser from 'body-parser';
import express from 'express';
import { createGraphqlMiddleware } from 'express-gql';
import { loremIpsum } from 'lorem-ipsum';
import { resolve } from 'path';

import { makeSchema, mutationType, queryType, stringArg } from '@nexus/schema';

import { NODE_ENV } from '../../src/common';

const app = express();

app.use(bodyParser.json());

const loremIpsumArray: string[] = [];

const loremIpsumPaginationArray = new Array(50).fill(0).map(() => {
  return loremIpsum();
});

const Query = queryType({
  definition(t) {
    t.list.string('loremIpsumPagination', {
      resolve(_root, _args) {
        return loremIpsumPaginationArray;
      },
    });
    t.string('hello', {
      args: { name: stringArg({ nullable: false }) },
      resolve: (_root, { name }) => `query ${name}!`,
    });
    t.list.string('loremIpsum', {
      nullable: false,
      async resolve() {
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

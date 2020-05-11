import { schema, Query, Mutation } from './generated';
import { createUseQuery, createUseMutation } from '../../../src';

export const endpoint = 'http://localhost:9999/graphql';

export const { useQuery, prepareQuery } = createUseQuery<Query>({
  endpoint,
  schema,
  creationHeaders: {
    authorization: 'any_token',
  },
});

export const useMutation = createUseMutation<Mutation>({
  endpoint,
  schema,
});

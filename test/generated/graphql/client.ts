import { schema, Query, Mutation } from './generated';
import { createUseQuery, createUseMutation } from '../../../src';

const endpoint = 'http://localhost:9999/graphql';

export const { useQuery } = createUseQuery<Query>({
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

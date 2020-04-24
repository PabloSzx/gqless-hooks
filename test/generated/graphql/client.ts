import { Client, QueryFetcher } from 'gqless';
import { schema, Query, Mutation } from './generated';
import { createUseQuery, createUseMutation } from '../../../src';

const endpoint = 'http://localhost:9999/graphql';

const fetchQuery: QueryFetcher = async (query, variables) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
    mode: 'cors',
  });

  if (!response.ok) {
    throw new Error(`Network error, received status code ${response.status}`);
  }

  const json = await response.json();

  return json;
};

export const client = new Client<Query>(schema.Query, fetchQuery);

export const query = client.query;

export const useQuery = createUseQuery<Query>({
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

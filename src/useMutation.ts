import { Client, ObjectNode } from 'gqless';

import { useCallback, useMemo, useReducer, useRef, useState } from 'react';

import {
  StateReducer,
  IState,
  LazyInitialState,
  Maybe,
  useFetchCallback,
  CreateOptions,
  MutationOptions,
  logDevErrors,
  SharedCache,
} from './common';

const defaultOptions = <TData>(options: MutationOptions<TData>) => {
  const { fetchTimeout = 10000, ...rest } = options;
  return { fetchTimeout, ...rest };
};

export type MutationFn<TData, Mutation> = (
  schema: Client<Mutation>['query']
) => TData;

export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>({
  endpoint,
  schema,
  headers: creationHeaders,
}: CreateOptions<Schema>) => <TData = unknown>(
  mutationFn: MutationFn<TData, Mutation>,
  options: MutationOptions<TData> = {}
): [
  (mutationFn?: MutationFn<TData, Mutation>) => Promise<TData>,
  IState & { data: Maybe<TData> }
] => {
  const optionsRef = useRef(options);
  const { fetchPolicy, headers } = (optionsRef.current = defaultOptions(
    options
  ));

  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;

  const [state, dispatch] = useReducer(StateReducer, LazyInitialState);

  const [data, setData] = useState<Maybe<TData>>();

  const fetchMutation = useFetchCallback({
    dispatch,
    endpoint,
    fetchPolicy,
    effects: {
      onPreEffect: () => {
        switch (fetchPolicy) {
          case 'no-cache':
          case undefined: {
            setData(undefined);
          }
        }
      },
      onErrorEffect: logDevErrors,
    },
    type: 'mutation',
    creationHeaders,
    headers,
  });

  const mutationCallback = useCallback<
    (mutationFnArg?: MutationFn<TData, Mutation>) => Promise<TData>
  >(
    async (mutationFnArg) => {
      const mutation = mutationFnArg || mutationFnRef.current;

      const mutationClient = new Client<Mutation>(
        schema.Mutation,
        fetchMutation
      );

      mutation(mutationClient.query);

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, optionsRef.current.fetchTimeout);

        mutationClient.scheduler.commit.onFetched(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const val = mutation(mutationClient.query);

      setData(val);
      dispatch({
        type: 'done',
      });

      SharedCache.mergeCache(mutationClient.cache.rootValue);

      return val;
    },
    [setData, fetchMutation, mutationFnRef]
  );

  return useMemo(() => [mutationCallback, { ...state, data }], [
    state,
    data,
    mutationCallback,
  ]);
};

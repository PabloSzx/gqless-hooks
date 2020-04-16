import { Client, ObjectNode } from 'gqless';

import { useCallback, useMemo, useReducer, useRef } from 'react';

import {
  StateReducer,
  IState,
  Maybe,
  useFetchCallback,
  CreateOptions,
  MutationOptions,
  logDevErrors,
  SharedCache,
  StateReducerInitialState,
  IStateReducer,
  IVariables,
} from './common';

type MutationCallback<
  TData,
  Mutation,
  TVariables extends IVariables
> = (mutationArgs?: {
  mutation?: MutationFn<TData, Mutation, TVariables>;
  variables?: TVariables;
}) => Promise<TData>;

const defaultOptions = <TData, TVariables extends IVariables>(
  options: MutationOptions<TData, TVariables>
) => {
  const { fetchTimeout = 10000, ...rest } = options;
  return { fetchTimeout, ...rest };
};

export type MutationFn<TData, Mutation, TVariables extends IVariables> = (
  schema: Client<Mutation>['query'],
  variables: TVariables
) => TData;

export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>({
  endpoint,
  schema,
  headers: creationHeaders,
}: CreateOptions<Schema>) => <TData, TVariables extends IVariables>(
  mutationFn: MutationFn<TData, Mutation, TVariables>,
  options: MutationOptions<TData, TVariables> = {}
): [
  MutationCallback<TData, Mutation, TVariables>,
  IState<TData> & { data: Maybe<TData> }
] => {
  const optionsRef = useRef(options);
  const { fetchPolicy, headers } = (optionsRef.current = defaultOptions(
    options
  ));

  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;

  const [state, dispatch] = useReducer<IStateReducer<TData>>(
    StateReducer,
    StateReducerInitialState<TData>(true)
  );

  const fetchMutation = useFetchCallback({
    dispatch,
    endpoint,
    fetchPolicy,
    effects: {
      onPreEffect: () => {
        switch (fetchPolicy) {
          case 'no-cache':
          case undefined: {
            dispatch({
              type: 'setData',
              payload: undefined,
            });
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
    MutationCallback<TData, Mutation, TVariables>
  >(
    async (mutationArgs) => {
      let { mutation = mutationFnRef.current, variables: variablesArgs } =
        mutationArgs || {};

      const variables: TVariables =
        variablesArgs || optionsRef.current.variables || ({} as TVariables);

      const mutationClient = new Client<Mutation>(
        schema.Mutation,
        fetchMutation
      );

      mutation(mutationClient.query, variables);

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, optionsRef.current.fetchTimeout);

        mutationClient.scheduler.commit.onFetched(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const dataValue = mutation(mutationClient.query, variables);

      dispatch({
        type: 'done',
        payload: dataValue,
      });

      SharedCache.mergeCache(mutationClient.cache.rootValue);

      return dataValue;
    },
    [fetchMutation]
  );

  return useMemo(() => [mutationCallback, state], [state, mutationCallback]);
};

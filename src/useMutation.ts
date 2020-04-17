import { Client, ObjectNode } from 'gqless';
import { useCallback, useMemo, useReducer, useRef } from 'react';

import {
  CreateOptions,
  defaultEmptyObject,
  IState,
  IStateReducer,
  IVariables,
  logDevErrors,
  Maybe,
  MutationOptions,
  SharedCache,
  StateReducer,
  StateReducerInitialState,
  useFetchCallback,
} from './common';

type MutationCallback<
  TData,
  Mutation,
  TVariables extends IVariables
> = (mutationArgs?: {
  mutation?: MutationFn<TData, Mutation, TVariables>;
  variables?: TVariables;
}) => Promise<Maybe<TData>>;

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
  options: MutationOptions<TData, TVariables> = defaultEmptyObject
): [
  MutationCallback<TData, Mutation, TVariables>,
  IState<TData> & { query: Mutation }
] => {
  const optionsRef = useRef(options);
  const { fetchPolicy } = (optionsRef.current = defaultOptions(options));

  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;

  const [state, dispatch] = useReducer<IStateReducer<TData>>(
    StateReducer,
    StateReducerInitialState<TData>(true)
  );

  const fetchMutation = useFetchCallback<TData, TVariables>({
    dispatch,
    endpoint,
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
    optionsRef,
  });

  const initialMutationClient = useMemo(() => {
    const client = new Client<Mutation>(schema.Mutation, fetchMutation);

    client.cache.rootValue = SharedCache.initialCache(client.cache.rootValue);

    return client;
  }, [fetchMutation]);

  const mutationClientRef = useRef<Client<Mutation>>(initialMutationClient);

  const mutationCallback = useCallback<
    MutationCallback<TData, Mutation, TVariables>
  >(
    async (mutationArgs = defaultEmptyObject) => {
      const {
        mutation = mutationFnRef.current,
        variables: variablesArgs,
      } = mutationArgs;

      const variables: TVariables =
        variablesArgs ||
        optionsRef.current.variables ||
        (defaultEmptyObject as TVariables);

      const client = new Client<Mutation>(schema.Mutation, fetchMutation);

      mutation(client.query, variables);

      const isFetchingGqless = client.scheduler.commit.accessors.size !== 0;

      if (isFetchingGqless) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, optionsRef.current.fetchTimeout);

          client.scheduler.commit.onFetched.then(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      const dataValue = mutation(client.query, variables);

      client.cache.rootValue = SharedCache.mergeCache(client.cache.rootValue);

      mutationClientRef.current = client;

      dispatch({
        type: 'done',
        payload: dataValue,
      });

      optionsRef.current.onCompleted?.(dataValue);

      return dataValue;
    },
    [fetchMutation]
  );

  return useMemo(
    () => [
      mutationCallback,
      { ...state, query: mutationClientRef.current.query },
    ],
    [state, mutationCallback]
  );
};

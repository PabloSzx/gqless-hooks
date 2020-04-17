import { Client, ObjectNode } from 'gqless';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  CreateOptions,
  defaultEmptyObject,
  FetchPolicy,
  IState,
  IStateReducer,
  IVariables,
  logDevErrors,
  Maybe,
  QueryOptions,
  SharedCache,
  StateReducer,
  StateReducerInitialState,
  useFetchCallback,
} from './common';

export type QueryFn<TData, Query, TVariables extends IVariables> = (
  schema: Client<Query>['query'],
  variables: TVariables
) => TData;

type QueryCallback<TData, Query, TVariables extends IVariables> = (queryArgs?: {
  query?: QueryFn<TData, Query, TVariables>;
  fetchPolicy?: FetchPolicy;
  variables?: TVariables;
}) => Promise<Maybe<TData>>;

type QueryQuickCallback<TData, TVariables extends IVariables> = (queryArgs?: {
  variables?: TVariables;
}) => Promise<Maybe<TData>>;

const defaultOptions = <TData, TVariables extends IVariables>(
  options: QueryOptions<TData, TVariables>
) => {
  const {
    lazy = false,
    fetchPolicy = options.lazy ? 'cache-and-network' : 'cache-first',
    fetchTimeout = 10000,
    pollInterval = 0,
    ...rest
  } = options;
  return {
    lazy,
    fetchPolicy,
    fetchTimeout,
    pollInterval,
    ...rest,
  };
};

export const createUseQuery = <
  Query,
  Schema extends { Query: ObjectNode } = { Query: ObjectNode }
>({
  endpoint,
  schema,
  headers: creationHeaders,
}: CreateOptions<Schema>) => {
  return <TData, TVariables extends IVariables>(
    queryFn: QueryFn<TData, Query, TVariables>,
    options: QueryOptions<TData, TVariables> = defaultEmptyObject
  ): [
    IState<TData> & { data: Maybe<TData> },
    {
      refetch: QueryQuickCallback<TData, TVariables>;
      cacheRefetch: QueryQuickCallback<TData, TVariables>;
      queryCallback: QueryCallback<TData, Query, TVariables>;
      query: Query;
    }
  ] => {
    const optionsRef = useRef(options);
    const {
      lazy,
      pollInterval,
      variables,
      manualCacheRefetch,
      hookId,
    } = (optionsRef.current = defaultOptions(options));

    const isMountedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;

    const [state, dispatch] = useReducer<IStateReducer<TData>>(
      StateReducer,
      StateReducerInitialState<TData>(lazy)
    );
    const stateRef = useRef(state);
    stateRef.current = state;

    const fetchQuery = useFetchCallback<TData, TVariables>({
      dispatch,
      endpoint,
      effects: {
        onErrorEffect: logDevErrors,
      },
      type: 'query',
      creationHeaders,
      optionsRef,
    });

    const initialQueryClient = useMemo(() => {
      const client = new Client<Query>(schema.Query, fetchQuery);

      client.cache.rootValue = SharedCache.initialCache(client.cache.rootValue);

      return client;
    }, [fetchQuery]);

    const queryClientRef = useRef<Client<Query>>(initialQueryClient);

    const queryCallback = useCallback<QueryCallback<TData, Query, TVariables>>(
      async (queryArgs = defaultEmptyObject) => {
        let {
          query = queryFnRef.current,
          fetchPolicy = optionsRef.current.fetchPolicy,
          variables: variablesArgs,
        } = queryArgs;

        optionsRef.current.fetchPolicy = fetchPolicy;

        const variables =
          variablesArgs ||
          optionsRef.current.variables ||
          (defaultEmptyObject as TVariables);

        let client: Client<Query> = queryClientRef.current;

        let dataValue: Maybe<TData> = null;

        let newClientCreated = false;

        let fetchPromise: Promise<void> | undefined;

        let noCache = false;

        if (fetchPolicy === 'network-only' || fetchPolicy === 'no-cache') {
          noCache = true;
        } else {
          dataValue = query(client.query, variables);
        }

        let isFetchingGqless = client.scheduler.commit.accessors.size !== 0;
        if (isFetchingGqless) {
          isFetchingRef.current = isFetchingGqless;
        }

        if (fetchPolicy === 'cache-only') {
          dispatch({
            type: 'done',
            payload: dataValue,
          });
          if (!isFetchingGqless) {
            isFetchingRef.current = false;
          }

          return dataValue;
        }

        const waitForGqlessFetch = () =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              isFetchingRef.current = false;

              resolve();
            }, optionsRef.current.fetchTimeout);

            client.scheduler.commit.onFetched.then(() => {
              isFetchingRef.current = false;
              clearTimeout(timeout);

              resolve();
            });
          });

        if (noCache || !isFetchingGqless) {
          if (fetchPolicy === 'cache-and-network') {
            dispatch({
              type: 'setData',
              payload: dataValue,
            });
          }

          if (
            fetchPolicy === 'no-cache' ||
            fetchPolicy === 'network-only' ||
            fetchPolicy === 'cache-and-network'
          ) {
            client = new Client<Query>(schema.Query, fetchQuery);
            newClientCreated = true;
            queryClientRef.current = client;

            query(client.query, variables);

            fetchPromise = waitForGqlessFetch();
          }
        } else if (isFetchingGqless) {
          fetchPromise = waitForGqlessFetch();
        }

        if (fetchPromise) {
          await fetchPromise;
          dataValue = query(client.query, variables);
        }

        if (newClientCreated) {
          client.cache.rootValue = SharedCache.mergeCache(
            client.cache.rootValue
          );
        }

        dispatch({
          type: 'done',
          payload: dataValue,
        });

        return dataValue;
      },
      [fetchQuery]
    );

    const queryCallbackRef = useRef(queryCallback);
    queryCallbackRef.current = queryCallback;

    if (!isMountedRef.current && !isFetchingRef.current && !lazy) {
      isFetchingRef.current = true;
      queryCallback().catch((error) => {
        console.error(error);
      });
    }

    useEffect(() => {
      if (pollInterval > 0) {
        const interval = setInterval(async () => {
          if (!isFetchingRef.current) {
            isFetchingRef.current = true;
            await queryCallbackRef
              .current({ fetchPolicy: 'network-only' })
              .catch(console.error);
            isFetchingRef.current = false;
          }
        }, pollInterval);

        return () => {
          clearInterval(interval);
        };
      }

      return undefined;
    }, [pollInterval]);

    const isFirstMountRef = useRef(true);

    const serializedVariables = variables ? JSON.stringify(variables) : '';

    useEffect(() => {
      if (isFirstMountRef.current) {
        isMountedRef.current = true;
        isFirstMountRef.current = false;
      } else if (
        optionsRef.current.variables &&
        (optionsRef.current.lazy ? stateRef.current.called : true)
      ) {
        isFetchingRef.current = true;
        queryCallbackRef.current().catch(console.error);
      }
    }, [serializedVariables]);

    const helpers = useMemo<{
      refetch: QueryQuickCallback<TData, TVariables>;
      cacheRefetch: QueryQuickCallback<TData, TVariables>;
      queryCallback: QueryCallback<TData, Query, TVariables>;
      query: Query;
    }>(() => {
      return {
        refetch: (args) => {
          return queryCallbackRef.current({
            variables: args?.variables,
            fetchPolicy: 'cache-and-network',
          });
        },
        cacheRefetch: (args) => {
          return queryCallbackRef.current({
            variables: args?.variables,
            fetchPolicy: 'cache-only',
          });
        },
        queryCallback: queryCallbackRef.current,
        query: queryClientRef.current.query,
      };
    }, []);

    useEffect(() => {
      if (!manualCacheRefetch) {
        return SharedCache.subscribeCache(async () => {
          if (
            !isFetchingRef.current && optionsRef.current.lazy
              ? stateRef.current.called
              : true
          ) {
            isFetchingRef.current = true;

            await queryCallbackRef.current({
              fetchPolicy: 'cache-only',
            });
          }
        });
      }
      return undefined;
    }, [manualCacheRefetch]);

    useEffect(() => {
      if (hookId) {
        return SharedCache.subscribeHookPool(hookId, {
          callback: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            const fetchPolicy = args?.fetchPolicy;
            return (await queryCallbackRef.current({
              variables,
              fetchPolicy,
            })) as any;
          },
          state: stateRef,
        });
      }
      return undefined;
    }, [hookId]);

    const isStateDone = state.state === 'done';

    useEffect(() => {
      const onCompleted = optionsRef.current.onCompleted;
      if (isStateDone && onCompleted) {
        onCompleted(stateRef.current.data, SharedCache.hooksPool);
      }
    }, [isStateDone]);

    return useMemo(() => [state, helpers], [state, helpers]);
  };
};

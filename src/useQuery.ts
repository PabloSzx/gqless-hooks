import { Client, ObjectNode } from 'gqless';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  CommonHookOptions,
  CreateOptions,
  defaultEmptyObject,
  FetchPolicy,
  IState,
  IStateReducer,
  IVariables,
  logDevErrors,
  Maybe,
  SharedCache,
  StateReducer,
  stringifyIfNeeded,
  useFetchCallback,
  useSubscribeCache,
} from './common';

/**
 * Query function, it receives the query schema from
 * **gqless** and the variables, if any.
 *
 * It should return the **data** expected from the hook.
 */
type QueryFn<Query, TData, TVariables extends IVariables> = (
  /**
   * Schema generated by **gqless**
   */
  schema: Client<Query>['query'],
  /**
   * Optional variables to receive and use
   */
  variables: TVariables
) => TData;

/**
 * Query callback arguments
 */
interface QueryCallbackArgs<Query, TData, TVariables extends IVariables> {
  /**
   * Function override of the initial query schema function
   */
  query?: QueryFn<Query, TData, TVariables>;
  /**
   * fetchPolicy to override the policy given in the hook itself.
   */
  fetchPolicy?: FetchPolicy;
  /**
   * Variables to be used instead of the specified in the hook.
   */
  variables?: TVariables;
}

/**
 * Fully featured hook callback
 */
type QueryCallback<TData, Query, TVariables extends IVariables> = (
  queryArgs?: QueryCallbackArgs<Query, TData, TVariables>
) => Promise<Maybe<TData>>;

/**
 * Shorthand query callback args
 */
interface QueryQuickCallbackArgs<TVariables extends IVariables> {
  /**
   * Variables to specify if needed
   */
  variables?: TVariables;
}

/**
 * Shorthand hook callback, only **variables** to specify
 */
type QueryQuickCallback<TData, TVariables extends IVariables> = (
  queryArgs?: QueryQuickCallbackArgs<TVariables>
) => Promise<Maybe<TData>>;

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

/**
 * **useQuery** helpers returned from hook
 */
interface UseQueryHelpers<Query, TData, TVariables extends IVariables> {
  /**
   * Query callback using **cache-and-network** fetchPolicy.
   */
  refetch: QueryQuickCallback<TData, TVariables>;
  /**
   * Query callback using **cache-only** fetchPolicy.
   */
  cacheRefetch: QueryQuickCallback<TData, TVariables>;
  /**
   * Generic query callback.
   */
  callback: QueryCallback<TData, Query, TVariables>;
  /**
   * *Vanilla* **gqless** Client query.
   */
  query: Query;
}

/**
 * **useQuery** hook
 */
export type UseQuery<Query> = <TData, TVariables extends IVariables>(
  /**
   * Query function, it should return the data expected from the mutation
   */
  queryFn: QueryFn<Query, TData, TVariables>,
  /**
   * Optional options to give the query hook
   */
  options?: QueryOptions<TData, TVariables>
) => [IState<TData>, UseQueryHelpers<Query, TData, TVariables>];

/**
 * Options of useQuery
 */
export interface QueryOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {
  /**
   * Fetch policy used for the query hook.
   *
   * If not specified, by default is "cache-first", but if **lazy**
   * is **true**, it's default is "cache-and-network"
   */
  fetchPolicy?: FetchPolicy;
  /**
   * Specify **lazy** behaviour of the query.
   *
   * Wait until explicit query call.
   */
  lazy?: boolean;
  /**
   * Activate and specify milliseconds polling interval of the hook call;
   */
  pollInterval?: number;
  /**
   * Shared hook cache id
   *
   * In order to be able to sync different query hooks data
   * you can specify a shared cache id between those hooks which
   * will update each other data
   */
  sharedCacheId?: string;
}

/**
 * **useQuery** constructor
 */
export const createUseQuery = <
  Query,
  Schema extends { Query: ObjectNode } = { Query: ObjectNode }
>(
  createOptions: CreateOptions<Schema>
): UseQuery<Query> => {
  const { endpoint, schema, creationHeaders } = createOptions;
  const useQuery: UseQuery<Query> = <TData, TVariables extends IVariables>(
    queryFn: QueryFn<Query, TData, TVariables>,
    options: QueryOptions<TData, TVariables> = defaultEmptyObject
  ) => {
    const optionsRef = useRef(options);
    const {
      lazy,
      pollInterval,
      variables,
      sharedCacheId,
      hookId,
    } = (optionsRef.current = defaultOptions(options));

    const isMountedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;

    const [state, dispatch] = useReducer<IStateReducer<TData>, IState<TData>>(
      StateReducer,
      undefined as any,
      () => {
        if (lazy) {
          return { fetchState: 'waiting', called: false, data: undefined };
        }
        return { fetchState: 'loading', called: true, data: undefined };
      }
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
      stateRef,
    });

    const initialQueryClient = useMemo(() => {
      const client = new Client<Query>(schema.Query, fetchQuery);

      return client;
    }, [fetchQuery]);

    const queryClientRef = useRef<Client<Query>>(initialQueryClient);

    const { foundCache, cacheSubscribeFn } = useSubscribeCache({
      sharedCacheId,
      dispatch,
      stateRef,
      optionsRef,
    });

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

        let fetchPromise: Promise<void> | undefined;

        let noCache = false;

        let lazyCacheAndNetworkFoundCache = false;

        if (fetchPolicy === 'network-only' || fetchPolicy === 'no-cache') {
          noCache = true;
        } else {
          if (optionsRef.current.lazy && !stateRef.current.called) {
            // if this query is lazy, and it's first time called
            if (optionsRef.current.sharedCacheId) {
              const cacheData =
                SharedCache.cacheData[optionsRef.current.sharedCacheId];
              if (cacheData) {
                stateRef.current.data = cacheData;
                stateRef.current.errors = undefined;
                stateRef.current.called = true;
                if (fetchPolicy === 'cache-and-network') {
                  lazyCacheAndNetworkFoundCache = true;
                  stateRef.current.fetchState = 'loading';
                } else {
                  isFetchingRef.current = false;
                  stateRef.current.fetchState = 'done';
                  return cacheData;
                }
              }
            }
          }

          dataValue = query(client.query, variables);
        }

        let isFetchingGqless = client.scheduler.commit.accessors.size !== 0;
        if (isFetchingGqless) {
          isFetchingRef.current = isFetchingGqless;
        }

        if (fetchPolicy === 'cache-only') {
          if (!isFetchingGqless) {
            isFetchingRef.current = false;
          }

          if (
            stateRef.current.fetchState === 'done' &&
            stringifyIfNeeded(stateRef.current.data) ===
              stringifyIfNeeded(dataValue)
          ) {
            return dataValue;
          }
          dispatch({
            type: 'done',
            payload: dataValue,
            stateRef,
          });

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
          if (
            fetchPolicy === 'cache-and-network' &&
            !lazyCacheAndNetworkFoundCache
          ) {
            if (
              stringifyIfNeeded(stateRef.current.data) !==
              stringifyIfNeeded(dataValue)
            ) {
              dispatch({
                type: 'setData',
                payload: dataValue,
                stateRef,
              });
            }
          }

          if (
            fetchPolicy === 'no-cache' ||
            fetchPolicy === 'network-only' ||
            fetchPolicy === 'cache-and-network'
          ) {
            client = new Client<Query>(schema.Query, fetchQuery);
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

        dispatch({
          type: 'done',
          payload: dataValue,
          stateRef,
        });

        if (optionsRef.current.sharedCacheId) {
          SharedCache.setCacheData(
            optionsRef.current.sharedCacheId,
            dataValue,
            cacheSubscribeFn
          );
        }

        return dataValue;
      },
      [fetchQuery, cacheSubscribeFn]
    );

    const queryCallbackRef = useRef(queryCallback);
    queryCallbackRef.current = queryCallback;

    if (
      !foundCache &&
      !isMountedRef.current &&
      !isFetchingRef.current &&
      !lazy
    ) {
      isFetchingRef.current = true;
      queryCallback().catch((error) => {
        console.error(error);
      });
    }

    useEffect(() => {
      if (pollInterval > 0) {
        const interval = setInterval(async () => {
          if (
            !isFetchingRef.current && optionsRef.current.lazy
              ? stateRef.current.called
              : true
          ) {
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

      return;
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

    const helpers = useMemo<UseQueryHelpers<Query, TData, TVariables>>(() => {
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
        callback: queryCallbackRef.current,
        query: queryClientRef.current.query,
      };
    }, []);

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
          refetch: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            return (await queryCallbackRef.current({
              variables,
              fetchPolicy: 'cache-and-network',
            })) as any;
          },
          cacheRefetch: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            return (await queryCallbackRef.current({
              variables,
              fetchPolicy: 'cache-only',
            })) as any;
          },
          state: stateRef,
          setData: (data) => {
            dispatch({
              type: 'setData',
              payload: data,
              stateRef,
            });
          },
        });
      }
      return;
    }, [hookId]);

    const isStateDone = state.fetchState === 'done';

    useEffect(() => {
      if (isStateDone && optionsRef.current.onCompleted) {
        optionsRef.current.onCompleted(
          stateRef.current.data,
          SharedCache.hooksPool
        );
      }
    }, [isStateDone]);

    return useMemo(() => [state, helpers], [state, helpers]);
  };

  return useQuery;
};

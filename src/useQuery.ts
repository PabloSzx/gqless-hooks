import { Client, ObjectNode } from 'gqless';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  IState,
  Maybe,
  StateReducer,
  useFetchCallback,
  CreateOptions,
  QueryOptions,
  FetchPolicy,
  emptyCallback,
  logDevErrors,
  SharedCache,
  StateReducerInitialState,
  IStateReducer,
} from './common';

export type QueryFn<TData, Query> = (schema: Client<Query>['query']) => TData;

type QueryCallback<TData, Query> = (
  queryFnArg?: QueryFn<TData, Query>,
  fetchPolicy?: FetchPolicy
) => Promise<Maybe<TData>>;

const defaultOptions = <TData>(options: QueryOptions<TData>) => {
  const {
    lazy = false,
    fetchPolicy = options.lazy ? 'cache-and-network' : 'cache-first',
    fetchTimeout = 10000,
    pollInterval = 0,
    cacheKeys = [],
    ...rest
  } = options;
  return { lazy, fetchPolicy, fetchTimeout, pollInterval, cacheKeys, ...rest };
};

export const createUseQuery = <
  Query,
  Schema extends { Query: ObjectNode } = { Query: ObjectNode }
>({
  endpoint,
  schema,
  headers: creationHeaders,
}: CreateOptions<Schema>) => {
  return <TData = unknown>(
    queryFn: QueryFn<TData, Query>,
    options: QueryOptions<TData> = {}
  ): [IState<TData> & { data: Maybe<TData> }, QueryCallback<TData, Query>] => {
    const optionsRef = useRef(options);
    const {
      lazy,
      fetchPolicy,
      pollInterval,
      headers,
      cacheKeys,
    } = (optionsRef.current = defaultOptions(options));

    const isMountedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;

    const subscribeRef = useRef<(() => void) | undefined>();

    const [state, dispatch] = useReducer<IStateReducer<TData>>(
      StateReducer,
      StateReducerInitialState<TData>(lazy)
    );
    const stateRef = useRef(state);
    stateRef.current = state;

    const fetchQuery = useFetchCallback<TData>({
      dispatch,
      endpoint,
      fetchPolicy,
      effects: {
        onErrorEffect: logDevErrors,
      },
      type: 'query',
      creationHeaders,
      headers,
    });

    const initialQueryClient = useMemo(() => {
      const client = new Client<Query>(schema.Query, fetchQuery);

      client.cache.rootValue = SharedCache.initialCache(client.cache.rootValue);

      return client;
    }, [fetchQuery]);

    const queryClientRef = useRef<Client<Query>>(initialQueryClient);

    const queryCallback = useCallback<QueryCallback<TData, Query>>(
      async (
        query = queryFnRef.current,
        fetchPolicy = optionsRef.current.fetchPolicy
      ) => {
        let client: Client<Query> = queryClientRef.current;

        let dataValue: Maybe<TData> = null;

        let newClientCreated = false;

        let fetchPromise: Promise<void> | undefined;

        let noCache = false;

        if (fetchPolicy === 'network-only' || fetchPolicy === 'no-cache') {
          noCache = true;
        } else {
          dataValue = query(client.query);
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

          return dataValue;
        }

        const waitForGqlessFetch = () =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              isFetchingRef.current = false;

              resolve();
            }, optionsRef.current.fetchTimeout);

            client.scheduler.commit.onFetched(() => {
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

            query(client.query);

            fetchPromise = waitForGqlessFetch();
          }
        } else if (isFetchingGqless) {
          fetchPromise = waitForGqlessFetch();
        }

        if (fetchPromise) {
          await fetchPromise;
          dataValue = query(client.query);
        }

        if (newClientCreated) {
          client.cache.rootValue = SharedCache.mergeCache(
            client.cache.rootValue
          );
        }

        SharedCache.cacheChange(
          subscribeRef.current,
          ...(optionsRef.current.cacheKeys || [])
        );

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

    const { subscribeFn } = useMemo(() => {
      if (cacheKeys.length) {
        const subscribeFn = () => {
          if (
            !isFetchingRef.current &&
            (optionsRef.current.lazy ? stateRef.current.called : true)
          ) {
            isFetchingRef.current = true;
            queryCallbackRef.current(undefined, 'cache-first');
          }
        };

        subscribeRef.current = subscribeFn;

        return {
          subscribeFn,
        };
      }

      subscribeRef.current = undefined;

      return {};
    }, [cacheKeys.length]);

    useEffect(() => {
      if (subscribeFn) {
        SharedCache.subscribeCacheListener(
          subscribeFn,
          ...(optionsRef.current.cacheKeys || [])
        );

        return () => {
          SharedCache.unsubscribeCacheListener(
            subscribeFn,
            ...(optionsRef.current.cacheKeys || [])
          );
        };
      }
      return undefined;
    }, [subscribeFn]);

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
            await queryCallback(undefined, 'network-only').catch(console.error);
            isFetchingRef.current = false;
          }
        }, pollInterval);

        return () => {
          clearInterval(interval);
        };
      }

      return emptyCallback;
    }, [pollInterval, queryCallback]);

    useEffect(() => {
      isMountedRef.current = true;
    }, []);

    return useMemo(() => [state, queryCallback], [state, queryCallback]);
  };
};

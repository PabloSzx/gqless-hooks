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
    fetchPolicy = 'cache-first',
    fetchTimeout = 10000,
    pollInterval = 0,
    ...rest
  } = options;
  return { lazy, fetchPolicy, fetchTimeout, pollInterval, ...rest };
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
    } = (optionsRef.current = defaultOptions(options));

    const isMountedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;

    const [state, dispatch] = useReducer<IStateReducer<TData>>(
      StateReducer,
      StateReducerInitialState<TData>(lazy)
    );

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

        let val: Maybe<TData> = null;

        let newClientCreated = false;

        let promise: Promise<void> | undefined;

        let noCache = false;

        if (fetchPolicy === 'network-only' || fetchPolicy === 'no-cache') {
          noCache = true;
        } else {
          val = query(client.query);
        }

        let isFetchingGqless = client.scheduler.commit.accessors.size !== 0;

        const waitForGqlessFetch = () =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              resolve();
            }, optionsRef.current.fetchTimeout);

            client.scheduler.commit.onFetched(() => {
              isFetchingRef.current = false;
              clearTimeout(timeout);

              resolve();
            });
          });

        if (noCache || !isFetchingGqless) {
          if (fetchPolicy !== 'no-cache') {
            dispatch({
              type: 'setData',
              payload: val,
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

            promise = waitForGqlessFetch();
          }
        } else if (isFetchingGqless) {
          promise = waitForGqlessFetch();
        }

        if (promise) {
          await promise;
          val = query(client.query);
        }

        if (newClientCreated) {
          client.cache.rootValue = SharedCache.mergeCache(
            client.cache.rootValue
          );
        }

        dispatch({
          type: 'done',
          payload: val,
        });

        return val;
      },
      [
        queryClientRef,
        dispatch,
        fetchQuery,
        queryFnRef,
        optionsRef,
        isFetchingRef,
      ]
    );

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
    }, [pollInterval, queryCallback, isFetchingRef]);

    useEffect(() => {
      isMountedRef.current = true;
    }, []);

    return useMemo(() => [state, queryCallback], [state, queryCallback]);
  };
};

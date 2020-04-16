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
  IVariables,
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
    options: QueryOptions<TData, TVariables> = {}
  ): [
    IState<TData> & { data: Maybe<TData> },
    QueryCallback<TData, Query, TVariables>
  ] => {
    const optionsRef = useRef(options);
    const {
      lazy,
      fetchPolicy,
      pollInterval,
      headers,
      variables,
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

    const queryCallback = useCallback<QueryCallback<TData, Query, TVariables>>(
      async (queryArgs) => {
        let {
          query = queryFnRef.current,
          fetchPolicy = optionsRef.current.fetchPolicy,
          variables: variablesArgs,
        } = queryArgs || {};

        const variables =
          variablesArgs || optionsRef.current.variables || ({} as TVariables);

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
            await queryCallback({ fetchPolicy: 'network-only' }).catch(
              console.error
            );
            isFetchingRef.current = false;
          }
        }, pollInterval);

        return () => {
          clearInterval(interval);
        };
      }

      return emptyCallback;
    }, [pollInterval, queryCallback]);

    const isFirstMountRef = useRef(true);

    const serializedVariables = variables ? JSON.stringify(variables) : '';

    useEffect(() => {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false;
      } else if (
        optionsRef.current.variables && optionsRef.current.lazy
          ? stateRef.current.called
          : true
      ) {
        isFetchingRef.current = true;
        queryCallbackRef.current().catch(console.error);
      }
    }, [serializedVariables]);

    useEffect(() => {
      isMountedRef.current = true;
    }, []);

    return useMemo(() => [state, queryCallback], [state, queryCallback]);
  };
};

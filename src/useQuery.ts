import { Client, ObjectNode } from 'gqless';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  IState,
  EarlyInitialState,
  LazyInitialState,
  Maybe,
  NoCacheMergeWarn,
  StateReducer,
  useFetchCallback,
  CreateOptions,
  QueryOptions,
  FetchPolicy,
  emptyCallback,
} from './common';

export type QueryFn<TData, Query> = (schema: Client<Query>['query']) => TData;

type QueryCallback<TData, Query> = (
  queryFnArg?: QueryFn<TData, Query>,
  fetchPolicy?: FetchPolicy
) => Promise<Maybe<TData>>;

const defaultOptions = <TData>(options: QueryOptions<TData>) => {
  const {
    lazy = false,
    fetchPolicy = 'cache-and-network',
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
}: CreateOptions<Schema>) => <TData = unknown>(
  queryFn: QueryFn<TData, Query>,
  options: QueryOptions<TData> = {}
): [IState & { data: Maybe<TData> }, QueryCallback<TData, Query>] => {
  const optionsRef = useRef(options);
  const {
    lazy,
    fetchPolicy,
    pollInterval,
  } = (optionsRef.current = defaultOptions(options));

  const isMountedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const [data, setData] = useState<Maybe<TData>>();
  const [state, dispatch] = useReducer(
    StateReducer,
    lazy ? LazyInitialState : EarlyInitialState
  );

  const fetchQuery = useFetchCallback(dispatch, endpoint, fetchPolicy);

  const initialQueryClient = useMemo(() => {
    return new Client<Query>(schema.Query, fetchQuery);
  }, [fetchQuery]);

  const queryClientRef = useRef<Client<Query>>(initialQueryClient);

  const queryCallback = useCallback<QueryCallback<TData, Query>>(
    async (
      query = queryFnRef.current,
      fetchPolicy = optionsRef.current.fetchPolicy
    ) => {
      let client: Client<Query> = queryClientRef.current;

      let val: Maybe<TData> = null;

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
        if (
          fetchPolicy === 'no-cache' ||
          fetchPolicy === 'network-only' ||
          fetchPolicy === 'cache-and-network'
        ) {
          client = new Client<Query>(schema.Query, fetchQuery);
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

      setData(val);

      return val;
    },
    [queryClientRef, setData, fetchQuery, queryFnRef, optionsRef, isFetchingRef]
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

    if (process.env.NODE_ENV !== 'production') {
      if (fetchPolicy === 'cache-only' || fetchPolicy === 'cache-first') {
        console.warn(NoCacheMergeWarn);
      }
    }
  }, [fetchPolicy]);

  return useMemo(() => [{ ...state, data }, queryCallback], [
    queryCallback,
    state,
    data,
  ]);
};

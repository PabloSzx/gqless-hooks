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
  FetchPolicy,
  EarlyInitialState,
  LazyInitialState,
  Maybe,
  NoCacheMergeWarn,
  StateReducer,
  useFetchCallback,
  CreateOptions,
} from './common';

export type IQueryFn<TData, Query> = (schema: Client<Query>['query']) => TData;

export const createUseQuery = <
  Query,
  Schema extends { Query: ObjectNode } = { Query: ObjectNode }
>({
  endpoint,
  schema,
}: CreateOptions<Schema>) => <TData = unknown>(
  queryFn: IQueryFn<TData, Query>,
  {
    lazy = false,
    fetchPolicy = 'cache-and-network',
  }: {
    lazy?: boolean;
    fetchPolicy?: FetchPolicy;
  } = {}
): [
  IState & { data: Maybe<TData> },
  (queryFn?: IQueryFn<TData, Query>) => Promise<TData>
] => {
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const [data, setData] = useState<Maybe<TData>>();
  const [state, dispatch] = useReducer(
    StateReducer,
    lazy ? LazyInitialState : EarlyInitialState
  );

  const fetchQuery = useFetchCallback(dispatch, endpoint, fetchPolicy);

  const initialQueryClient = useMemo(
    () => new Client<Query>(schema.Query, fetchQuery),
    [fetchQuery]
  );

  const queryClient = useRef<Client<Query>>(initialQueryClient);

  const queryCallback = useCallback<
    (queryFnArg?: IQueryFn<TData, Query>) => Promise<TData>
  >(
    async (queryFnArg) => {
      const query = queryFnArg || queryFnRef.current;
      let client: Client<Query> = queryClient.current;

      query(client.query);

      if (client.scheduler.commit.accessors.size === 0) {
        client = new Client<Query>(schema.Query, fetchQuery);
        queryClient.current = client;
        query(client.query);
      }

      await new Promise((resolve) => {
        client.scheduler.commit.onFetched(() => {
          resolve();
        });
      });
      const val = query(client.query);

      setData(val);

      return val;
    },
    [queryClient, setData, fetchQuery, queryFnRef]
  );

  const isMountedRef = useRef(false);

  if (!isMountedRef.current && !lazy) {
    queryCallback().catch((error) => {
      console.error(error);
    });
  }

  useEffect(() => {
    isMountedRef.current = true;

    if (process.env.NODE_ENV !== 'production') {
      switch (fetchPolicy) {
        case 'cache-only':
        case 'cache-first': {
          console.warn(NoCacheMergeWarn);
          break;
        }

        default: {
          break;
        }
      }
    }
  }, [isMountedRef, fetchPolicy]);

  return useMemo(() => [{ ...state, data }, queryCallback], [
    queryCallback,
    state,
    data,
  ]);
};

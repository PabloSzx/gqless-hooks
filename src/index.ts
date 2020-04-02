import { Client, ObjectNode, QueryFetcher } from 'gqless';
import { GraphQLError } from 'graphql';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

type IQueryFn<TData, Query> = (schema: Client<Query>['query']) => TData;

type IMutationFn<TData, Mutation> = (
  schema: Client<Mutation>['query']
) => TData;

type IReducerState = {
  state: 'waiting' | 'loading' | 'error' | 'done';
  errors?: GraphQLError[];
};

const LazyInitialState: IReducerState = { state: 'waiting' };
const EarlyInitialState: IReducerState = { state: 'loading' };

const StateReducer = (
  reducerState: IReducerState,
  dispatch:
    | { type: 'loading' }
    | { type: 'done' }
    | { type: 'error'; payload: GraphQLError[] }
): IReducerState => {
  switch (dispatch.type) {
    case 'done':
    case 'loading': {
      return {
        state: dispatch.type,
      };
    }
    case 'error': {
      return {
        errors: dispatch.payload,
        state: 'error',
      };
    }
    default:
      return reducerState;
  }
};

export const createUseQuery = <
  Query,
  Schema extends { Query: ObjectNode } = { Query: ObjectNode }
>({
  endpoint,
  schema,
}: {
  endpoint: string;
  schema: Schema;
}) => <TData = unknown>(
  queryFn: IQueryFn<TData, Query>,
  {
    lazy = false,
  }: {
    lazy?: boolean;
  } = {}
): [
  IReducerState & { data: TData | null | undefined },
  (queryFn?: IQueryFn<TData, Query>) => Promise<TData>
] => {
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const [data, setData] = useState<TData | null>();
  const [state, dispatch] = useReducer(
    StateReducer,
    lazy ? LazyInitialState : EarlyInitialState
  );

  const fetchQuery = useCallback<QueryFetcher>(
    async (query, variables) => {
      dispatch({ type: 'loading' });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          variables,
        }),
        mode: 'cors',
      });

      if (!response.ok) {
        try {
          const json = await response.json();

          if (json?.errors) {
            dispatch({
              type: 'error',
              payload: json.errors,
            });
          }
        } catch (err) {
          dispatch({
            type: 'error',
            payload: [],
          });
        }

        throw new Error(
          `Network error, received status code ${response.status}`
        );
      }

      const json = await response.json();

      if (json?.errors) {
        dispatch({
          type: 'error',
          payload: [],
        });
      } else {
        dispatch({
          type: 'done',
        });
      }

      return json;
    },
    [dispatch]
  );

  const initialQueryClient = useMemo(
    () => new Client<Query>(schema.Query, fetchQuery),
    [fetchQuery]
  );

  const queryClient = useRef<Client<Query>>(initialQueryClient);

  const queryCallback = useCallback<
    (queryFnArg?: IQueryFn<TData, Query>) => Promise<TData>
  >(
    async queryFnArg => {
      const query = queryFnArg || queryFnRef.current;
      let client: Client<Query> = queryClient.current;

      query(client.query);

      if (client.scheduler.commit.accessors.size === 0) {
        client = new Client<Query>(schema.Query, fetchQuery);
        queryClient.current = client;
        query(client.query);
      }

      await new Promise(resolve => {
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
    queryCallback().catch(error => {
      console.error(error);
    });
  }

  useEffect(() => {
    isMountedRef.current = true;
  }, [isMountedRef]);

  return useMemo(() => [{ ...state, data }, queryCallback], [
    queryCallback,
    state,
    data,
  ]);
};

export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>({
  endpoint,
  schema,
}: {
  endpoint: string;
  schema: Schema;
}) => <TData = unknown>(
  mutationFn: IMutationFn<TData, Mutation>
): [
  (mutationFn?: IMutationFn<TData, Mutation>) => Promise<TData>,
  IReducerState & { data: TData | null | undefined }
] => {
  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;
  const [state, dispatch] = useReducer(StateReducer, LazyInitialState);

  const [data, setData] = useState<TData | undefined | null>();

  const fetchMutation = useCallback<QueryFetcher>(
    async (query, variables) => {
      dispatch({
        type: 'loading',
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'mutation' + query,
          variables,
        }),
        mode: 'cors',
      });

      if (!response.ok) {
        try {
          const json = await response.json();

          if (json?.errors) {
            dispatch({
              type: 'error',
              payload: json.errors,
            });
          }
        } catch (err) {
          dispatch({
            type: 'error',
            payload: [],
          });
        }
        throw new Error(
          `Network error, received status code ${response.status}`
        );
      }

      const json = await response.json();

      if (json?.errors) {
        dispatch({
          type: 'error',
          payload: json.errors,
        });
      } else {
        dispatch({
          type: 'done',
        });
      }

      return json;
    },
    [dispatch]
  );

  const mutationCallback = useCallback<
    (mutationFnArg?: IMutationFn<TData, Mutation>) => Promise<TData>
  >(
    async mutationFnArg => {
      const mutation = mutationFnArg || mutationFnRef.current;

      const mutationClient = new Client<Mutation>(
        schema.Mutation,
        fetchMutation
      );

      mutation(mutationClient.query);

      await new Promise(resolve => {
        mutationClient.scheduler.commit.onFetched(() => {
          resolve();
        });
      });

      const val = mutation(mutationClient.query);

      setData(val);

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

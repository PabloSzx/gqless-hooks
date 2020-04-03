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
  StateReducer,
  IState,
  FetchPolicy,
  LazyInitialState,
  Maybe,
  NoCacheMergeWarn,
  useFetchCallback,
  CreateOptions,
} from './common';

export type IMutationFn<TData, Mutation> = (
  schema: Client<Mutation>['query']
) => TData;

export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>({
  endpoint,
  schema,
}: CreateOptions<Schema>) => <TData = unknown>(
  mutationFn: IMutationFn<TData, Mutation>,
  {
    fetchPolicy,
  }: {
    fetchPolicy?: FetchPolicy;
  } = {}
): [
  (mutationFn?: IMutationFn<TData, Mutation>) => Promise<TData>,
  IState & { data: Maybe<TData> }
] => {
  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;
  const [state, dispatch] = useReducer(StateReducer, LazyInitialState);

  const [data, setData] = useState<Maybe<TData>>();

  const fetchMutation = useFetchCallback(dispatch, endpoint, fetchPolicy, {
    onPreEffect: () => {
      switch (fetchPolicy) {
        case 'cache-only':
        case 'cache-and-network':
        case 'network-only':
        case 'cache-first': {
          break;
        }
        case 'no-cache':
        default: {
          setData(undefined);
        }
      }
    },
  });

  const mutationCallback = useCallback<
    (mutationFnArg?: IMutationFn<TData, Mutation>) => Promise<TData>
  >(
    async (mutationFnArg) => {
      const mutation = mutationFnArg || mutationFnRef.current;

      const mutationClient = new Client<Mutation>(
        schema.Mutation,
        fetchMutation
      );

      mutation(mutationClient.query);

      await new Promise((resolve) => {
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

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      switch (fetchPolicy) {
        default: {
          console.warn(NoCacheMergeWarn);
        }
      }
    }
  }, [fetchPolicy]);

  return useMemo(() => [mutationCallback, { ...state, data }], [
    state,
    data,
    mutationCallback,
  ]);
};

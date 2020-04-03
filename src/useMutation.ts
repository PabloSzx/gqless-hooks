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
  LazyInitialState,
  Maybe,
  NoCacheMergeWarn,
  useFetchCallback,
  CreateOptions,
  MutationOptions,
} from './common';

const defaultOptions = <TData>(options: MutationOptions<TData>) => {
  const { fetchPolicy = 'cache-and-network', ...rest } = options;
  return { fetchPolicy, ...rest };
};

export type MutationFn<TData, Mutation> = (
  schema: Client<Mutation>['query']
) => TData;

export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>({
  endpoint,
  schema,
}: CreateOptions<Schema>) => <TData = unknown>(
  mutationFn: MutationFn<TData, Mutation>,
  options: MutationOptions<TData> = {}
): [
  (mutationFn?: MutationFn<TData, Mutation>) => Promise<TData>,
  IState & { data: Maybe<TData> }
] => {
  const optionsRef = useRef(options);
  const { fetchPolicy } = (optionsRef.current = defaultOptions(options));

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
    (mutationFnArg?: MutationFn<TData, Mutation>) => Promise<TData>
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

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
  StateReducerInitialState,
  useFetchCallback,
} from './common';

/**
 * Mutation callback arguments
 */
interface MutationCallbackArgs<Mutation, TData, TVariables extends IVariables> {
  /**
   * Function override of the initial mutation schema function
   */
  mutation?: MutationFn<TData, Mutation, TVariables>;
  /**
   * Variables to be used instead of the specified in the hook itself
   */
  variables?: TVariables;
  /**
   * fetchPolicy to override the policy given in the hook itself.
   */
  fetchPolicy?: FetchPolicy;
}

/**
 * Mutation callback
 */
type MutationCallback<TData, Mutation, TVariables extends IVariables> = (
  mutationArgs?: MutationCallbackArgs<Mutation, TData, TVariables>
) => Promise<Maybe<TData>>;

const defaultOptions = <TData, TVariables extends IVariables>(
  options: MutationOptions<TData, TVariables>
) => {
  const { fetchTimeout = 10000, ...rest } = options;
  return { fetchTimeout, ...rest };
};

/**
 * Mutation function, it receives the mutation schema from
 * **gqless** and the variables, if any.
 *
 * It should return the **data** expected from the hook.
 */
type MutationFn<TData, Mutation, TVariables extends IVariables> = (
  /**
   * Schema generated by **gqless**
   */
  schema: Client<Mutation>['query'],
  /**
   * Optional variables to receive and use
   */
  variables: TVariables
) => TData;

/**
 * **useMutation** data state returned from hook.
 */
interface UseMutationState<Mutation, TData> extends IState<TData> {
  /**
   * *Vanilla* **gqless** Client query.
   */
  query: Mutation;
}

/**
 * **useMutation** hook
 */
export type UseMutation<Mutation> = <TData, TVariables extends IVariables>(
  /**
   * Mutation function, it should return the data expected from the mutation
   */
  mutationFn: MutationFn<TData, Mutation, TVariables>,
  /**
   * Optional options to give the mutation hook
   */
  options?: MutationOptions<TData, TVariables>
) => [
  MutationCallback<TData, Mutation, TVariables>,
  UseMutationState<Mutation, TData>
];

/**
 * Options of useMutation
 */
export interface MutationOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {}

/**
 * **useMutation** constructor
 */
export const createUseMutation = <
  Mutation,
  Schema extends { Mutation: ObjectNode } = { Mutation: ObjectNode }
>(
  createOptions: CreateOptions<Schema>
): UseMutation<Mutation> => {
  const { endpoint, schema, creationHeaders } = createOptions;
  const useMutation: UseMutation<Mutation> = <
    TData,
    TVariables extends IVariables
  >(
    mutationFn: MutationFn<TData, Mutation, TVariables>,
    options: MutationOptions<TData, TVariables> = defaultEmptyObject
  ) => {
    const optionsRef = useRef(options);
    const { fetchPolicy, hookId } = (optionsRef.current = defaultOptions(
      options
    ));

    const mutationFnRef = useRef(mutationFn);
    mutationFnRef.current = mutationFn;

    const [state, dispatch] = useReducer<IStateReducer<TData>>(
      StateReducer,
      StateReducerInitialState<TData>(true)
    );
    const stateRef = useRef(state);
    stateRef.current = state;

    const fetchMutation = useFetchCallback<TData, TVariables>({
      dispatch,
      endpoint,
      effects: {
        onPreEffect: () => {
          switch (fetchPolicy) {
            case 'no-cache':
            case undefined: {
              dispatch({
                type: 'setData',
                payload: undefined,
                stateRef,
              });
            }
          }
        },
        onErrorEffect: logDevErrors,
      },
      type: 'mutation',
      creationHeaders,
      optionsRef,
      stateRef,
    });

    const initialMutationClient = useMemo(() => {
      const client = new Client<Mutation>(schema.Mutation, fetchMutation);

      client.cache.rootValue = SharedCache.initialCache(client.cache.rootValue);

      return client;
    }, [fetchMutation]);

    const mutationClientRef = useRef<Client<Mutation>>(initialMutationClient);

    const mutationCallback = useCallback<
      MutationCallback<TData, Mutation, TVariables>
    >(
      async (mutationArgs = defaultEmptyObject) => {
        const {
          mutation = mutationFnRef.current,
          variables: variablesArgs,
          fetchPolicy = optionsRef.current.fetchPolicy,
        } = mutationArgs;

        optionsRef.current.fetchPolicy = fetchPolicy;

        const variables: TVariables =
          variablesArgs ||
          optionsRef.current.variables ||
          (defaultEmptyObject as TVariables);

        const client = new Client<Mutation>(schema.Mutation, fetchMutation);

        mutation(client.query, variables);

        const isFetchingGqless = client.scheduler.commit.accessors.size !== 0;

        if (isFetchingGqless) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              resolve();
            }, optionsRef.current.fetchTimeout);

            client.scheduler.commit.onFetched.then(() => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }

        const dataValue = mutation(client.query, variables);

        if (fetchPolicy !== 'no-cache') {
          client.cache.rootValue = SharedCache.mergeCache(
            client.cache.rootValue
          );

          mutationClientRef.current = client;
        }

        dispatch({
          type: 'done',
          payload: dataValue,
          stateRef,
        });

        return dataValue;
      },
      [fetchMutation]
    );
    const mutationCallbackRef = useRef(mutationCallback);
    mutationCallbackRef.current = mutationCallback;

    useEffect(() => {
      if (hookId) {
        return SharedCache.subscribeHookPool(hookId, {
          callback: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            const fetchPolicy = args?.fetchPolicy;
            return (await mutationCallbackRef.current({
              variables,
              fetchPolicy,
            })) as any;
          },
          refetch: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            return (await mutationCallbackRef.current({
              variables,
              fetchPolicy: 'cache-and-network',
            })) as any;
          },
          cacheRefetch: async (args) => {
            const variables = args?.variables as TVariables | undefined;
            return (await mutationCallbackRef.current({
              variables,
              fetchPolicy: 'cache-only',
            })) as any;
          },
          state: stateRef,
        });
      }
      return;
    }, [hookId]);

    const isStateDone = state.fetchState === 'done';

    useEffect(() => {
      const onCompleted = optionsRef.current.onCompleted;
      if (isStateDone && onCompleted) {
        onCompleted(stateRef.current.data, SharedCache.hooksPool);
      }
    }, [isStateDone]);

    return useMemo(
      () => [
        mutationCallback,
        { ...state, query: mutationClientRef.current.query },
      ],
      [state, mutationCallback]
    );
  };

  return useMutation;
};

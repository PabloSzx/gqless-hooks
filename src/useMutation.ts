import { Client, ObjectNode } from 'gqless';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import {
  CommonHookOptions,
  CreateOptions,
  defaultEmptyObject,
  IState,
  IStateReducer,
  IVariables,
  logDevErrors,
  Maybe,
  SharedCache,
  StateReducer,
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
  extends CommonHookOptions<TData, TVariables> {
  /**
   * Shared hook cache id
   *
   * In order to be able to update a query data based on this mutation result
   * you can specify a shared cache id between those hooks which
   * will update the queries data
   */
  sharedCacheId?: string;
}

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
    const { hookId } = (optionsRef.current = defaultOptions(options));

    const mutationFnRef = useRef(mutationFn);
    mutationFnRef.current = mutationFn;

    const [state, dispatch] = useReducer<IStateReducer<TData>>(StateReducer, {
      fetchState: 'waiting',
      called: false,
      data: undefined,
    });
    const stateRef = useRef(state);
    stateRef.current = state;

    const fetchMutation = useFetchCallback<TData, TVariables>({
      dispatch,
      endpoint,
      effects: {
        onErrorEffect: logDevErrors,
      },
      type: 'mutation',
      creationHeaders,
      optionsRef,
      stateRef,
    });

    const initialMutationClient = useMemo(() => {
      const client = new Client<Mutation>(schema.Mutation, fetchMutation);

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
        } = mutationArgs;

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

        mutationClientRef.current = client;

        dispatch({
          type: 'done',
          payload: dataValue,
          stateRef,
        });

        if (optionsRef.current.sharedCacheId) {
          SharedCache.setCacheData(
            optionsRef.current.sharedCacheId,
            dataValue,
            null
          );
        }

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

            return (await mutationCallbackRef.current({
              variables,
            })) as any;
          },
          refetch: null,
          cacheRefetch: null,
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

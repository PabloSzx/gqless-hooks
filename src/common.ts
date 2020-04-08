import 'isomorphic-unfetch';

import { QueryFetcher } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, useCallback, useRef } from 'react';

export type CreateOptions<Schema> = {
  endpoint: string;
  schema: Schema;
  headers?: Record<string, string>;
};

interface CommonHookOptions<TData> {
  fetchPolicy?: FetchPolicy;
  onCompleted?: (data: Maybe<TData>) => void;
  onError?: (errors: GraphQLError[]) => void;
  context?: Record<string, any>;
  fetchTimeout?: number;
}

export interface QueryOptions<TData> extends CommonHookOptions<TData> {
  lazy?: boolean;
  pollInterval?: number;
}
export interface MutationOptions<TData> extends CommonHookOptions<TData> {}

export type IState = {
  state: 'waiting' | 'loading' | 'error' | 'done';
  errors?: GraphQLError[];
  called: boolean;
};

export type IDispatchAction<
  ActionType extends string,
  ActionPayload = undefined
> = {
  type: ActionType;
  payload?: ActionPayload;
};
export type FetchPolicy =
  | 'cache-first'
  | 'cache-and-network'
  | 'network-only'
  | 'cache-only'
  | 'no-cache';

export type Maybe<T> = T | null | undefined;

export const NoCacheMergeWarn =
  'gqless-hooks | Caching merge still is not being handled in this version';

export const LazyInitialState: IState = { state: 'waiting', called: false };
export const EarlyInitialState: IState = { state: 'loading', called: true };

export type IDispatch =
  | IDispatchAction<'loading'>
  | IDispatchAction<'done'>
  | IDispatchAction<'error', GraphQLError[]>;

export const StateReducer = (
  reducerState: IState,
  { type, payload }: IDispatch
): IState => {
  switch (type) {
    case 'done':
    case 'loading': {
      return {
        called: true,
        state: type,
      };
    }
    case 'error': {
      return {
        called: true,
        errors: payload,
        state: 'error',
      };
    }
    default:
      return reducerState;
  }
};

export const emptyCallback = () => {};

export const useFetchCallback = (
  dispatch: Dispatch<IDispatch>,
  endpoint: string,
  fetchPolicy: FetchPolicy | undefined,
  headers?: Record<string, string>,
  effects?: {
    onPreEffect?: () => void;
    onSuccessEffect?: () => void;
    onErrorEffect?: (err: any) => void;
  },
  type: 'query' | 'mutation' = 'query'
) => {
  const effectsRef = useRef(effects);
  effectsRef.current = effects;

  return useCallback<QueryFetcher>(
    async (query, variables) => {
      effectsRef.current?.onPreEffect?.();

      switch (fetchPolicy) {
        case 'cache-only': {
          return {
            data: null,
          };
        }
      }

      dispatch({ type: 'loading' });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          query: type !== 'query' ? type + query : query,
          variables,
        }),
        mode: 'cors',
      });

      let json: any;

      try {
        json = await response.json();
      } catch (err) {
        effectsRef.current?.onErrorEffect?.(err);
        throw err;
      }

      if (!response.ok) {
        let errorPayload: GraphQLError[] | undefined;

        errorPayload = json?.errors ?? (Array.isArray(json) ? json : undefined);

        const errorText = `Network error, received status code ${response.status} ${response.statusText}`;

        effectsRef.current?.onErrorEffect?.(errorPayload ?? errorText);

        dispatch({
          type: 'error',
          payload: errorPayload ?? [],
        });

        throw new Error(errorText);
      }

      if (json?.errors) {
        effectsRef.current?.onErrorEffect?.(json.errors);
        dispatch({
          type: 'error',
          payload: json.errors,
        });
      } else {
        effectsRef.current?.onSuccessEffect?.();
        dispatch({
          type: 'done',
        });
      }

      return json;
    },
    [dispatch, endpoint, fetchPolicy, headers, type]
  );
};

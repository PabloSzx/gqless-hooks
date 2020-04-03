import 'isomorphic-unfetch';

import { QueryFetcher } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, useCallback, useRef } from 'react';

export type CreateOptions<Schema> = {
  endpoint: string;
  schema: Schema;
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

export const timeoutError = Error('gqless-hooks');

export const emptyCallback = () => {};

export const useFetchCallback = (
  dispatch: Dispatch<IDispatch>,
  endpoint: string,
  fetchPolicy: FetchPolicy | undefined,
  effects?: {
    onPreEffect?: () => void;
    onSuccessEffect?: () => void;
    onErrorEffect?: (err: any) => void;
  }
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

        default: {
          break;
        }
      }

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
            effectsRef.current?.onErrorEffect?.(json.errors);

            dispatch({
              type: 'error',
              payload: json.errors,
            });
          }
        } catch (err) {
          effectsRef.current?.onErrorEffect?.(err);
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
    [dispatch, endpoint, fetchPolicy]
  );
};

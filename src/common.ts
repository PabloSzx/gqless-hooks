import 'isomorphic-unfetch';

import { QueryFetcher, Value, DataTrait } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, useCallback, useRef, useState } from 'react';

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
  headers?: Headers;
}

export interface QueryOptions<TData> extends CommonHookOptions<TData> {
  lazy?: boolean;
  pollInterval?: number;
}
export interface MutationOptions<TData> extends CommonHookOptions<TData> {}

type FetchState = 'waiting' | 'loading' | 'error' | 'done';

export type IState = {
  state: FetchState;
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

type Headers = Record<string, string | number | boolean>;

export type IDispatch =
  | IDispatchAction<'loading'>
  | IDispatchAction<'done'>
  | IDispatchAction<'error', GraphQLError[]>;

const LoadingReducerState: IState = {
  state: 'loading',
  called: true,
};

const DoneReducerState: IState = {
  state: 'done',
  called: true,
};

export const LazyInitialState: IState = {
  state: 'waiting',
  called: false,
};
export const EarlyInitialState: IState = LoadingReducerState;

export const StateReducer = (
  reducerState: IState,
  action: IDispatch
): IState => {
  switch (action.type) {
    case 'done': {
      return DoneReducerState;
    }
    case 'loading': {
      return LoadingReducerState;
    }
    case 'error': {
      return {
        called: true,
        errors: action.payload,
        state: 'error',
      };
    }
    default:
      return reducerState;
  }
};

export const emptyCallback = () => {};

export const logDevErrors =
  process.env.NODE_ENV !== 'production'
    ? (err: any) => {
        console.error(err);
      }
    : undefined;

export const useFetchCallback = (args: {
  dispatch: Dispatch<IDispatch>;
  endpoint: string;
  fetchPolicy: FetchPolicy | undefined;
  effects: {
    onPreEffect?: () => void;
    onSuccessEffect?: () => void;
    onErrorEffect?: (err: any) => void;
  };
  type: 'query' | 'mutation';
  creationHeaders: Headers | undefined;
  headers: Headers | undefined;
}) => {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback<QueryFetcher>(
    async (query, variables) => {
      const {
        dispatch,
        endpoint,
        fetchPolicy,
        effects,
        type = 'query',
        creationHeaders,
        headers,
      } = argsRef.current;

      effects.onPreEffect?.();

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
          ...creationHeaders,
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
        effects.onErrorEffect?.(err);
        throw err;
      }

      if (!response.ok) {
        let errorPayload: GraphQLError[] | undefined;

        errorPayload = json?.errors ?? (Array.isArray(json) ? json : undefined);

        const errorText = `Network error, received status code ${response.status} ${response.statusText}`;

        effects.onErrorEffect?.(errorPayload ?? errorText);

        dispatch({
          type: 'error',
          payload: errorPayload ?? [],
        });

        throw new Error(errorText);
      }

      if (json?.errors) {
        effects.onErrorEffect?.(json.errors);
        dispatch({
          type: 'error',
          payload: json.errors,
        });
      } else {
        effects.onSuccessEffect?.();
      }

      return json;
    },
    [argsRef]
  );
};

function concatCacheMap(
  map: Map<Value<DataTrait>, Set<string | number>>,
  ...iterables: Map<Value<DataTrait>, Set<string | number>>[]
) {
  for (const iterable of iterables) {
    for (const item of iterable) {
      map.set(...item);
    }
  }
}

export const SharedCache = {
  value: undefined as Value<DataTrait> | undefined,
  initialCache: (cacheRootValue: Value<DataTrait>) => {
    return SharedCache.value || (SharedCache.value = cacheRootValue);
  },
  mergeCache: (cacheRootValue: Value<DataTrait>) => {
    if (SharedCache.value) {
      concatCacheMap(SharedCache.value.references, cacheRootValue.references);
      SharedCache.value.data = Object.assign(
        {},
        SharedCache.value.data,
        cacheRootValue.data
      );
    } else {
      SharedCache.value = cacheRootValue;
    }
    return SharedCache.value;
  },
};

const incrementParam = (num: number) => ++num;

export const useUpdate = () => {
  const [, setState] = useState(0);

  return useCallback(() => setState(incrementParam), []);
};

import 'isomorphic-unfetch';

import { QueryFetcher, Value, DataTrait } from 'gqless';
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
  headers?: Headers;
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

type Headers = Record<string, string | number | boolean>;

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
        dispatch({
          type: 'done',
        });
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

import 'isomorphic-unfetch';

import { QueryFetcher, Value, DataTrait } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, useCallback, useRef, useState, Reducer } from 'react';

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

export type IState<TData> = {
  state: FetchState;
  errors?: GraphQLError[];
  called: boolean;
  data: Maybe<TData>;
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

export type IDispatch<TData extends any> =
  | IDispatchAction<'loading'>
  | IDispatchAction<'done', Maybe<TData>>
  | IDispatchAction<'error', GraphQLError[]>
  | IDispatchAction<'setData', Maybe<TData>>;

const LazyInitialState: IState<any> = {
  state: 'waiting',
  called: false,
  data: undefined,
};
const EarlyInitialState: IState<any> = {
  state: 'loading',
  called: true,
  data: undefined,
};
export const StateReducerInitialState = <TData>(
  lazy: boolean
): IState<TData> => {
  if (lazy) return LazyInitialState;

  return EarlyInitialState;
};

export type IStateReducer<TData> = Reducer<IState<TData>, IDispatch<TData>>;

export const StateReducer = <TData>(
  reducerState: IState<TData>,
  action: IDispatch<TData>
): IState<TData> => {
  switch (action.type) {
    case 'done': {
      if (reducerState.state === 'error') {
        if (action.payload !== reducerState.data) {
          return { ...reducerState, data: action.payload };
        }
        return reducerState;
      }
      return {
        called: true,
        state: 'done',
        data: action.payload,
      };
    }
    case 'loading': {
      if (reducerState.state === 'loading') return reducerState;

      return {
        called: true,
        state: 'loading',
        data: reducerState.data,
      };
    }
    case 'error': {
      return {
        called: true,
        state: 'error',
        data: reducerState.data,
        errors: action.payload,
      };
    }
    case 'setData': {
      if (action.payload !== reducerState.data) {
        return {
          ...reducerState,
          data: action.payload,
        };
      }
      return reducerState;
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

export const useFetchCallback = <TData>(args: {
  dispatch: Dispatch<IDispatch<TData>>;
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

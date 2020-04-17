import 'isomorphic-unfetch';

import { DataTrait, QueryFetcher, Value } from 'gqless';
import { GraphQLError } from 'graphql';
import { Dispatch, Reducer, useCallback, useRef } from 'react';

export type CreateOptions<Schema> = {
  endpoint: string;
  schema: Schema;
  headers?: Record<string, string>;
};

export type IVariables = Record<string, unknown>;

interface CommonHookOptions<TData, TVariables extends IVariables> {
  fetchPolicy?: FetchPolicy;
  onCompleted?: (data: Maybe<TData>, hooksPool: HooksPool) => void;
  onError?: (errors: GraphQLError[]) => void;
  fetchTimeout?: number;
  headers?: Headers;
  variables?: TVariables;
  hookId?: string;
}

export interface QueryOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {
  lazy?: boolean;
  pollInterval?: number;
  manualCacheRefetch?: boolean;
}
export interface MutationOptions<TData, TVariables extends IVariables>
  extends CommonHookOptions<TData, TVariables> {}

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

export type IDispatch<TData> =
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

const stringifyIfNecessary = <T>(data: T) => {
  if (data == null) {
    return null;
  } else if (typeof data === 'object') {
    return JSON.stringify(data);
  }
  return data;
};

export const StateReducer = <TData>(
  reducerState: IState<TData>,
  action: IDispatch<TData>
): IState<TData> => {
  switch (action.type) {
    case 'done': {
      if (
        reducerState.state === 'done' &&
        stringifyIfNecessary(action.payload) ===
          stringifyIfNecessary(reducerState.data)
      ) {
        return reducerState;
      }

      if (reducerState.state === 'error') {
        if (
          stringifyIfNecessary(action.payload) !==
          stringifyIfNecessary(reducerState.data)
        ) {
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
      if (
        stringifyIfNecessary(action.payload) !==
        stringifyIfNecessary(reducerState.data)
      ) {
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

export const logDevErrors =
  process.env.NODE_ENV !== 'production'
    ? (err: any) => {
        console.error(err);
      }
    : undefined;

export const defaultEmptyObject = {};

export const useFetchCallback = <TData, TVariables extends IVariables>(args: {
  dispatch: Dispatch<IDispatch<TData>>;
  endpoint: string;
  effects: {
    onPreEffect?: () => void;
    onSuccessEffect?: () => void;
    onErrorEffect?: (err: any) => void;
  };
  type: 'query' | 'mutation';
  creationHeaders: Headers | undefined;
  optionsRef: { current: CommonHookOptions<TData, TVariables> };
}) => {
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback<QueryFetcher>(async (query, variables) => {
    const {
      fetchPolicy,
      headers = defaultEmptyObject,
      onError,
    } = argsRef.current.optionsRef.current;

    switch (fetchPolicy) {
      case 'cache-only': {
        return {
          data: null,
        };
      }
    }

    const {
      dispatch,
      endpoint,
      effects,
      type = 'query',
      creationHeaders = defaultEmptyObject,
    } = argsRef.current;

    effects.onPreEffect?.();

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

      if (Array.isArray(json?.errors)) {
        errorPayload = json.errors;
      } else if (Array.isArray(json)) {
        errorPayload = json;
      }

      const errorText = `Network error, received status code ${response.status} ${response.statusText}`;

      effects.onErrorEffect?.(errorPayload || errorText);

      onError?.(errorPayload || []);

      dispatch({
        type: 'error',
        payload: errorPayload || [],
      });

      throw new Error(errorText);
    }

    if (json?.errors) {
      effects.onErrorEffect?.(json.errors);

      const errorGraphqlError = Array.isArray(json.errors) ? json.errors : [];

      onError?.(errorGraphqlError);

      dispatch({
        type: 'error',
        payload: errorGraphqlError,
      });
    } else {
      effects.onSuccessEffect?.();
    }

    return json;
  }, []);
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

export type HooksPool = Record<string, HookPoolData | undefined>;

export type HookPoolData = {
  callback: <Data = unknown, Variables extends IVariables = IVariables>(args?: {
    variables?: Variables;
    fetchPolicy?: FetchPolicy;
  }) => Promise<Maybe<Data>>;
  state: { current: IState<any> };
};

export const SharedCache = {
  value: undefined as Value<DataTrait> | undefined,

  cacheSubscribers: new Set<() => Promise<void>>(),

  subscribeCache: (fn: () => Promise<void>) => {
    SharedCache.cacheSubscribers.add(fn);
    return () => {
      SharedCache.cacheSubscribers.delete(fn);
    };
  },

  hooksPool: {} as HooksPool,

  subscribeHookPool: (hookId: string, data: HookPoolData) => {
    if (process.env.NODE_ENV !== 'production') {
      if (hookId in SharedCache.hooksPool) {
        console.warn('Duplicated hook id, previous hook overwriten!');
      }
    }
    SharedCache.hooksPool[hookId] = data;
    return () => {
      delete SharedCache.hooksPool[hookId];
    };
  },

  initialCache: (cacheRootValue: Value<DataTrait>) => {
    if (SharedCache.value === undefined) {
      SharedCache.value = cacheRootValue;

      cacheRootValue.onSet(() => {
        if (SharedCache.cacheSubscribers.size) {
          for (const subscriber of SharedCache.cacheSubscribers) {
            subscriber().catch(console.error);
          }
        }
      });
    }

    return SharedCache.value;
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
      SharedCache.value = SharedCache.initialCache(cacheRootValue);
    }
    return SharedCache.value;
  },
};

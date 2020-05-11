import fetchMock from 'fetch-mock';
import { GraphQLError } from 'graphql';
import { useState } from 'react';
import wait from 'waait';
import waitForExpect from 'wait-for-expect';

import {
  act,
  cleanup as cleanupHooks,
  renderHook,
} from '@testing-library/react-hooks';

import {
  clearCacheKey,
  getAccessorFields,
  getArrayAccessorFields,
  setCacheData,
  SharedCache,
  TIMEOUT_ERROR_MESSAGE,
} from '../src/common';
import {
  endpoint,
  prepareQuery,
  useMutation,
  useQuery,
} from './generated/graphql/client';
import {
  close,
  isClosed,
  isListening,
  loremIpsumPaginationArray,
} from './server';

afterEach(async () => {
  await cleanupHooks();
});

beforeAll(async () => {
  await isListening;
});

afterAll(async () => {
  close();
  await isClosed;
});

const renderCount = () => {
  let renders = { n: 0 };

  const render = () => {
    renders.n += 1;
  };

  return {
    renders,
    render,
  };
};

declare global {
  interface gqlessSharedCache {
    queryhello1: string;
  }
}
describe('basic usage and cache', () => {
  test('query works and minimizes renders calls', async () => {
    const nRenderFirst = renderCount();

    expect(nRenderFirst.renders.n).toBe(0);

    const { result } = renderHook(() => {
      nRenderFirst.render();
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          sharedCacheId: 'queryhello1',

          onCompleted: (data) => {},
        }
      );

      return hook;
    });

    expect(result.current[0].data).toBe(undefined);
    expect(result.current[0].fetchState).toBe('loading');
    expect(nRenderFirst.renders.n).toBe(1);

    await act(async () => {
      await waitForExpect(() => {
        expect(nRenderFirst.renders.n).toBe(2);

        expect(result.current[0].fetchState).toBe('done');
      }, 3500);
    });

    expect(nRenderFirst.renders.n).toBe(2);

    expect(result.current[0].data).toBe('query zxc!');

    const nRenderCache = renderCount();

    expect(nRenderCache.renders.n).toBe(0);
    expect(nRenderFirst.renders.n).toBe(2);

    const otherQuery = renderHook(() => {
      nRenderCache.render();
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          sharedCacheId: 'queryhello1',
        }
      );

      return hook;
    });

    expect(nRenderCache.renders.n).toBe(1);

    expect(otherQuery.result.current[0].fetchState).toBe('done');
    expect(otherQuery.result.current[0].data).toBe('query zxc!');

    expect(nRenderCache.renders.n).toBe(1);
    expect(nRenderFirst.renders.n).toBe(2);

    const nRenderCacheAndNetwork = renderCount();

    expect(nRenderCacheAndNetwork.renders.n).toBe(0);

    const otherQueryNetwork = renderHook(() => {
      nRenderCacheAndNetwork.render();
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          sharedCacheId: 'queryhello1',
          fetchPolicy: 'cache-and-network',
        }
      );

      return hook;
    });

    expect(nRenderCache.renders.n).toBe(1);
    expect(nRenderCacheAndNetwork.renders.n).toBe(1);
    expect(nRenderFirst.renders.n).toBe(2);

    expect(otherQueryNetwork.result.current[0].fetchState).toBe('loading');
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');

    await act(async () => {
      await waitForExpect(() => {
        expect(otherQueryNetwork.result.current[0].fetchState).toBe('done');
      }, 1500);
    });
    expect(nRenderCacheAndNetwork.renders.n).toBe(2);
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');
    expect(nRenderFirst.renders.n).toBe(2);

    const nRenderOther = renderCount();
    const otherQueryAfterNewClient = renderHook(() => {
      nRenderOther.render();
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          sharedCacheId: 'queryhello1',
        }
      );

      return hook;
    });
    expect(nRenderFirst.renders.n).toBe(2);

    expect(otherQueryAfterNewClient.result.current[0].fetchState).toBe('done');
    expect(otherQueryAfterNewClient.result.current[0].data).toBe('query zxc!');
    expect(nRenderOther.renders.n).toBe(1);
  });

  test('mutation works', async () => {
    const { result } = renderHook(() => {
      const hook = useMutation(
        ({ helloMutation }) => {
          const result = helloMutation({
            arg1: 'zxc',
          });

          return result;
        },
        {
          headers: {
            a: 1,
          },
        }
      );

      return hook;
    });

    expect(result.current[1].data).toBe(undefined);
    expect(result.current[1].fetchState).toBe('waiting');

    await act(async () => {
      result.current[0]();
      await waitForExpect(() => {
        expect(result.current[1].fetchState).toBe('done');
      }, 500);
    });

    expect(result.current[1].data).toBe('mutation zxc');

    const otherQuery = renderHook(() => {
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          sharedCacheId: 'queryhello1',
        }
      );

      return hook;
    });

    expect(otherQuery.result.current[0].fetchState).toBe('done');
    expect(otherQuery.result.current[0].data).toBe('query zxc!');
  });

  test('initial skip works', async () => {
    const query = renderHook(() => {
      const skipState = useState(true);
      const hook = useQuery(
        ({ hello }) => {
          return hello({
            name: 'olk',
          });
        },
        {
          skip: skipState[0],
        }
      );

      return {
        skipState,
        hook,
      };
    });

    expect(query.result.current.hook[0].fetchState).toBe('waiting');

    await act(async () => {
      query.result.current.skipState[1](false);
      await waitForExpect(() => {
        expect(query.result.current.hook[0].fetchState).toBe('loading');
      }, 1000);

      await waitForExpect(() => {
        expect(query.result.current.hook[0].fetchState).toBe('done');
      }, 1000);
    });

    expect(query.result.current.hook[0].data).toBe('query olk!');
  });
});

describe('detect variables change', () => {
  test('query variables and skip', async () => {
    const query = renderHook(() => {
      const skipState = useState(false);
      const nameState = useState('cvb');
      const hook = useQuery(
        ({ hello }, { name }) => {
          const result = hello({
            name,
          });

          return result;
        },
        {
          sharedCacheId: 'queryvariables',
          skip: skipState[0],
          variables: {
            name: nameState[0],
          },
        }
      );

      return { hook, nameState, skipState };
    });

    await act(async () => {
      await waitForExpect(() => {
        expect(query.result.current.hook[0].fetchState).toBe('done');
      }, 500);
    });
    expect(query.result.current.hook[0].data).toBe('query cvb!');

    await act(async () => {
      query.result.current.nameState[1]('jkl');
      await waitForExpect(() => {
        expect(query.result.current.hook[0].data).toBe('query jkl!');
        expect(query.result.current.hook[0].fetchState).toBe('done');
      }, 500);
    });

    await act(async () => {
      query.result.current.skipState[1](true);
      query.result.current.nameState[1]('bnm');
    });

    expect(query.result.current.hook[0].fetchState).toBe('done');
    expect(query.result.current.hook[0].data).toBe('query jkl!');

    await act(async () => {
      query.result.current.skipState[1](false);

      await waitForExpect(() => {
        expect(query.result.current.hook[0].fetchState).toBe('loading');
      }, 1000);
    });

    await act(async () => {
      await waitForExpect(() => {
        expect(query.result.current.hook[0].data).toBe('query bnm!');

        expect(query.result.current.hook[0].fetchState).toBe('done');
      }, 1000);
    });
  });
});

describe('multiple hooks usage and cache', () => {
  test('array push and reset', async () => {
    let completedMutation1 = false;

    const { result } = renderHook(() => {
      const query1 = useQuery(
        ({ loremIpsum }, args) => {
          return loremIpsum.map((v) => v);
        },
        {
          headers: {
            query1: '',
          },
          sharedCacheId: 'loremipsumarray',
          onCompleted: (data) => {},
        }
      );
      const query2 = useQuery(
        ({ loremIpsum }, args) => {
          return loremIpsum.map((v) => v);
        },
        {
          lazy: true,
          headers: {
            query2: '',
          },
          sharedCacheId: 'loremipsumarray',
          fetchPolicy: 'cache-and-network',
        }
      );

      const mutation1 = useMutation(
        ({ resetLoremIpsum }) => {
          return resetLoremIpsum.map((v) => v);
        },
        {
          onCompleted: () => {
            completedMutation1 = true;
          },
        }
      );

      return {
        query1,
        query2,
        mutation1,
      };
    });

    expect(result.current.query1[0].fetchState).toBe('loading');
    expect(result.current.query2[0].fetchState).toBe('waiting');
    expect(result.current.mutation1[1].fetchState).toBe('waiting');

    await act(async () => {
      await waitForExpect(() => {
        expect(result.current.query1[0].fetchState).toBe('done');
      }, 500);
    });

    expect(result.current.query1[0].data).toHaveLength(1);

    await act(async () => {
      await result.current.query2[1].refetch();

      await waitForExpect(() => {
        expect(result.current.query2[0].data).toHaveLength(2);

        expect(result.current.query2[0].fetchState).toBe('done');
      }, 500);
    });

    await waitForExpect(() => {
      expect(result.current.query1[0].data).toHaveLength(2);
    }, 500);

    expect(result.current.query1[0].fetchState).toBe('done');
    expect(result.current.query2[0].fetchState).toBe('done');

    expect(completedMutation1).toBe(false);
    await act(async () => {
      expect(result.current.mutation1[1].fetchState).toBe('waiting');

      await result.current.mutation1[0]();

      expect(result.current.mutation1[1].fetchState).toBe('done');
      expect(result.current.mutation1[1].data).toHaveLength(0);

      await result.current.query1[1].refetch();
    });

    expect(completedMutation1).toBe(true);

    await waitForExpect(() => {
      expect(result.current.query1[0].data).toHaveLength(1);
    }, 500);

    await waitForExpect(() => {
      expect(result.current.query1[0].data).toHaveLength(1);

      expect(result.current.query1[0].data).toEqual(
        result.current.query2[0].data
      );
    }, 500);
  }, 10000);

  it('mutation updates query', async () => {
    const hook = renderHook(() => {
      const sharedCacheId = 'cacheUpdateHook';
      const query = useQuery(
        (schema) => {
          return schema.hello({
            name: 'asd',
          });
        },
        {
          sharedCacheId,
        }
      );
      const mutation = useMutation(
        (schema) => {
          return schema.helloMutation({
            arg1: 'asd',
          });
        },
        {
          sharedCacheId,
        }
      );

      return {
        query,
        mutation,
      };
    });

    await act(async () => {
      await waitForExpect(() => {
        expect(hook.result.current.query[0].fetchState).toBe('done');
      }, 1000);
    });
    expect(hook.result.current.query[0].data).toBe('query asd!');

    await act(async () => {
      const data = await hook.result.current.mutation[0]();
      expect(data).toBe('mutation asd');
    });

    expect(hook.result.current.mutation[1].data).toBe('mutation asd');
    expect(hook.result.current.query[0].data).toBe('mutation asd');
  });
});

describe('pagination', () => {
  it('fetchMore works as intended', async () => {
    const { result } = renderHook(() => {
      return useQuery(
        ({ loremIpsumPagination }, { skip, limit }) => {
          return loremIpsumPagination({ skip, limit }).map((v) => v);
        },
        {
          sharedCacheId: 'fetchMoreCacheId',
          onCompleted(data) {},
          variables: {
            limit: 5,
            skip: 0,
          },
        }
      );
    });

    expect(result.current[0].fetchState).toBe('loading');

    await act(async () => {
      await waitForExpect(() => {
        expect(result.current[0].fetchState).toBe('done');
      });
    });

    const first5 = result.current[0].data;
    expect(first5).toEqual(loremIpsumPaginationArray.slice(0, 5));
    expect(first5).toHaveLength(5);

    let newData: typeof first5;

    await act(async () => {
      const dataPromise = result.current[1].fetchMore({
        variables: {
          skip: 2,
        },
        updateQuery(previousResult, fetchMoreResult) {
          return fetchMoreResult || previousResult;
        },
      });
      await waitForExpect(() => {
        expect(result.current[0].fetchState).toBe('loading');
      });
      newData = await dataPromise;
    });

    expect(result.current[0].fetchState).toBe('done');

    expect(first5?.slice(2)).toEqual(newData?.slice(0, newData?.length - 2));

    expect(result.current[0].data).toBe(newData);

    await act(async () => {
      const dataPromise = result.current[1].fetchMore({
        variables: {
          skip: first5?.length,
          limit: 40,
        },
        updateQuery(previousResult, fetchMoreResult) {
          if (previousResult == null) return fetchMoreResult;
          if (fetchMoreResult == null) return previousResult;

          return Array.from(new Set([...previousResult, ...fetchMoreResult]));
        },
        notifyLoading: false,
      });

      expect(result.current[0].data).toHaveLength(5);

      const fetchStateIsAlwaysDoneInterval = setInterval(() => {
        expect(result.current[0].fetchState).toBe('done');
      }, 5);

      await dataPromise;

      expect(result.current[0].data).toHaveLength(43);
      expect(result.current[0].data).toEqual(
        loremIpsumPaginationArray.slice(2, 45)
      );
      expect(result.current[0].fetchState).toBe('done');
      clearInterval(fetchStateIsAlwaysDoneInterval);
    });
  });
});

describe('detect cache id changes', () => {
  it('subscribes again after shared cache id changes', async () => {
    const subscribersKeys: (string | number)[] = [];
    const SharedCacheMock = jest
      .spyOn(SharedCache, 'subscribeCache')
      .mockImplementation((cacheKey) => {
        subscribersKeys.push(cacheKey);
        return () => {};
      });

    const Hook1xD = renderHook(() => {
      const state = useState('cacheKey1');
      useQuery(() => {}, {
        sharedCacheId: state[0],
      });

      return state;
    }, {});

    expect(SharedCacheMock).toBeCalledTimes(1);

    expect(subscribersKeys).toEqual(['cacheKey1']);

    act(() => {
      Hook1xD.result.current[1]('cacheKey2');
    });

    expect(SharedCacheMock).toBeCalledTimes(2);

    expect(subscribersKeys).toEqual(['cacheKey1', 'cacheKey2']);
    act(() => {
      Hook1xD.result.current[1]('cacheKey3');
    });
    SharedCacheMock.mockRestore();
  });
});

describe('catches errors', () => {
  it('intentional schema arg error', async () => {
    const errorsMessages: any[] = [];

    const expectedErrorMessage = 'Expected type String!, found 123.';

    const consoleErrorSpy = jest
      .spyOn(global.console, 'error')
      .mockImplementation((error) => {
        errorsMessages.push(error);
      });

    const onErrorEventErrors: GraphQLError[] = [];
    const onError = jest.fn().mockImplementation((errors: GraphQLError[]) => {
      onErrorEventErrors.push(...errors);
    });

    const { result } = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.hello({
            //@ts-ignore
            name: 123,
          });
        },
        {
          onError,
        }
      );
    });

    expect(result.current[0].fetchState).toBe('loading');

    await act(async () => {
      await waitForExpect(() => {
        expect(result.current[0].fetchState).toBe('error');
      }, 500);
    });

    expect(onError).toBeCalledTimes(1);

    expect(onErrorEventErrors).toHaveLength(1);
    expect(errorsMessages).toHaveLength(1);
    expect(result.current[0].errors).toHaveLength(1);
    expect(errorsMessages[0][0].message).toBe(expectedErrorMessage);
    expect(errorsMessages[0]).toEqual(onErrorEventErrors);
    expect(result.current[0].errors?.[0].message).toBe(expectedErrorMessage);
    expect(result.current[0].errors).toEqual(onErrorEventErrors);
    consoleErrorSpy.mockRestore();
  });
});

describe('cache policies prevents fetch', () => {
  it('cache-only at first', () => {
    const { result } = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.hello({
            name: '123',
          });
        },
        {
          fetchPolicy: 'cache-only',
        }
      );
    });

    expect(result.current[0].data).toBeFalsy();
  });

  it('cache-only at callback', async () => {
    const { result } = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.hello({
            name: '123',
          });
        },
        {
          fetchPolicy: 'network-only',
          lazy: true,
        }
      );
    });

    await act(async () => {
      await result.current[1].callback({ fetchPolicy: 'cache-only' });
    });

    expect(result.current[0].data).toBeFalsy();
  });
});

declare global {
  interface gqlessSharedCache {
    manualSetCacheKey: string;
  }
}

describe('manual cache manipulation', () => {
  it('setCache works and prevents fetch', async () => {
    const sharedCacheId = 'manualSetCacheKey';

    const loremString =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ut pretium orci, pellentesque lacinia sem. Suspendisse consectetur dolor dapibus luctus tincidunt. Integer lacinia dictum semper.';

    setCacheData(sharedCacheId, loremString);

    const queryCacheFirst = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.hello({
            name: 'bbbbbb',
          });
        },
        {
          sharedCacheId,
        }
      );
    });

    expect(queryCacheFirst.result.current[0].fetchState).toBe('done');
    expect(queryCacheFirst.result.current[0].data).toBe(loremString);

    const queryCacheFirstSkip = renderHook(() => {
      const [skip, setSkip] = useState(true);

      const query = useQuery(
        (schema) => {
          return schema.hello({
            name: 'mmmm',
          });
        },
        {
          sharedCacheId,
          skip,
          fetchPolicy: 'cache-first',
          headers: {
            a: 1,
          },
        }
      );

      return {
        query,
        skip,
        setSkip,
      };
    });

    expect(queryCacheFirstSkip.result.current.query[0].data).toBe(undefined);
    expect(queryCacheFirstSkip.result.current.query[0].fetchState).toBe(
      'waiting'
    );

    expect(queryCacheFirstSkip.result.current.skip).toBe(true);

    act(() => {
      queryCacheFirstSkip.result.current.setSkip(false);
    });

    expect(queryCacheFirstSkip.result.current.skip).toBe(false);

    expect(queryCacheFirstSkip.result.current.query[0].fetchState).toBe('done');
    expect(queryCacheFirstSkip.result.current.query[0].data).toBe(loremString);

    act(() => {
      setCacheData(sharedCacheId, (prevData) => {
        return `${prevData}_string_concat`;
      });
    });

    const queryCacheAfterConcat = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.hello({
            name: 'zzzz',
          });
        },
        {
          sharedCacheId,
        }
      );
    });

    expect(queryCacheAfterConcat.result.current[0].data).toBe(
      loremString + '_string_concat'
    );

    expect(queryCacheFirst.result.current[0].data).toBe(
      loremString + '_string_concat'
    );

    expect(queryCacheFirstSkip.result.current.query[0].data).toBe(
      loremString + '_string_concat'
    );
  });
});

describe('utility functions', () => {
  it('getAccessorFields works as intended', async () => {
    const query = renderHook(() => {
      return useQuery((schema) => {
        return getAccessorFields(schema.objectA, 'fieldA', 'fieldB');
      });
    });

    await act(async () => {
      await waitForExpect(() => {
        expect(query.result.current[0].fetchState).toBe('done');
      }, 1000);
    });

    expect(query.result.current[0].data).toEqual({
      fieldA: 'asd',
      fieldB: 'zxc',
    });
  });

  it('getArrayAccessorFields works as intended', async () => {
    const query = renderHook(() => {
      return useQuery((schema) => {
        return getArrayAccessorFields(schema.listObject, 'fieldA', 'fieldB');
      });
    });

    await act(async () => {
      await waitForExpect(() => {
        expect(query.result.current[0].fetchState).toBe('done');
      }, 1000);
    });

    expect(query.result.current[0].data).toEqual([
      {
        fieldA: 'asd',
        fieldB: 'zxc',
      },
      {
        fieldA: 'qwe',
        fieldB: 'ghj',
      },
    ]);
  });
});

describe('prepare query', () => {
  it('prepareQuery should work', async () => {
    const preparedQuery1 = prepareQuery({
      cacheId: 'preparedQuery1',
      query: (schema, { name }) => {
        return schema.hello({
          name,
        });
      },
      variables: {
        name: 'prepared',
      },
      headers: {
        a: 1,
      },
    });

    expect(preparedQuery1.cacheId).toBe('preparedQuery1');
    expect(preparedQuery1.dataType).toBe(undefined);
    expect(typeof preparedQuery1.prepare).toBe('function');
    expect(typeof preparedQuery1.useHydrateCache).toBe('function');
    expect(typeof preparedQuery1.query).toBe('function');

    const preparedDataPromise = preparedQuery1.prepare({
      variables: {
        name: 'prepared',
      },
      headers: {
        b: 2,
      },
      checkCache: true,
    });

    expect(preparedDataPromise).toBeInstanceOf(Promise);

    expect(await preparedDataPromise).toBe('query prepared!');

    const hook = renderHook(() => {
      return preparedQuery1.useQuery();
    });

    expect(hook.result.current[0].data).toBe(await preparedDataPromise);
    expect(hook.result.current[0].fetchState).toBe('done');

    const preparedDataCache = preparedQuery1.prepare({
      checkCache: true,
    });

    expect(preparedDataCache).toBe('query prepared!');
  });

  it('prepareQuery hydrate cache', () => {
    const preparedQueryHydrate = prepareQuery({
      cacheId: 'cacheHydrate',
      query: (schema) => {
        return schema.hello({
          name: 'mmm',
        });
      },
    });

    const hookHydrate = renderHook(() => {
      preparedQueryHydrate.useHydrateCache('hello mmm!');
      return useQuery(preparedQueryHydrate.query, {
        sharedCacheId: preparedQueryHydrate.cacheId,
      });
    });

    expect(hookHydrate.result.current[0].data).toBe('hello mmm!');
  });
});

describe('polling', () => {
  it('pollInterval should work', async () => {
    const hook = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.currentSeconds;
        },
        {
          pollInterval: 100,
        }
      );
    });

    let lastTimeSeconds: number | undefined;
    await act(async () => {
      await waitForExpect(() => {
        expect(hook.result.current[0].fetchState).toBe('done');
      }, 2000);
    });

    const hookResult = hook.result.current[0].data;
    expect(hookResult).toBeTruthy();
    if (hookResult) lastTimeSeconds = hookResult;
    expect(lastTimeSeconds).toBeGreaterThan(1);

    await act(async () => {
      await waitForExpect(() => {
        const hookResult = hook.result.current[0].data;
        const expectedNew = (lastTimeSeconds ?? 0) + 1;

        expect(hookResult).toBe(expectedNew);
        if (hookResult) lastTimeSeconds = hookResult;
      }, 2000);
    });
    expect(lastTimeSeconds).toBeGreaterThan(1);

    await act(async () => {
      await waitForExpect(() => {
        const hookResult = hook.result.current[0].data;
        const expectedNew = (lastTimeSeconds ?? 0) + 1;

        expect(hookResult).toBe(expectedNew);
        if (hookResult) lastTimeSeconds = hookResult;
      }, 2000);
    });
    expect(lastTimeSeconds).toBeGreaterThan(1);

    await act(async () => {
      await waitForExpect(() => {
        const hookResult = hook.result.current[0].data;
        const expectedNew = (lastTimeSeconds ?? 0) + 1;

        expect(hookResult).toBe(expectedNew);
        if (hookResult) lastTimeSeconds = hookResult;
      }, 2000);
    });

    expect(lastTimeSeconds).toBeGreaterThan(1);
  });
});

describe('manual cache manipulation', () => {
  it('setCacheData, clearCacheKey and prepareQuery', () => {
    const cacheQuery = prepareQuery({
      cacheId: 'manualCacheManipulation',
      query: (schema) => {
        return schema.hello({
          name: 'manualcache',
        });
      },
    });
    setCacheData(cacheQuery.cacheId, 'hello world!');

    const hook1 = renderHook(() => {
      return useQuery(cacheQuery.query, {
        sharedCacheId: cacheQuery.cacheId,
        fetchPolicy: 'cache-only',
      });
    });

    expect(hook1.result.current[0].fetchState).toBe('done');
    expect(hook1.result.current[0].data).toBe('hello world!');

    clearCacheKey(cacheQuery.cacheId);

    const hook2 = renderHook(() => {
      return useQuery(cacheQuery.query, {
        sharedCacheId: cacheQuery.cacheId,
        fetchPolicy: 'cache-only',
      });
    });

    expect(hook2.result.current[0].fetchState).toBe('done');
    expect(hook2.result.current[0].data).toBe(null);

    expect(hook1.result.current[0].fetchState).toBe('done');
    expect(hook1.result.current[0].data).toBe('hello world!');

    act(() => {
      setCacheData(cacheQuery.cacheId, 'hello world2!');
    });

    expect(hook2.result.current[0].fetchState).toBe('done');
    expect(hook2.result.current[0].data).toBe('hello world2!');
    expect(hook1.result.current[0].fetchState).toBe('done');
    expect(hook1.result.current[0].data).toBe('hello world2!');
  });
});

describe('prepareQuery error handling', () => {
  let errorSpy = jest.spyOn(global.console, 'error');

  beforeEach(() => {
    errorSpy = jest.spyOn(global.console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    await wait(10);
    errorSpy.mockRestore();
    fetchMock.restore();
  });

  test('network status error', async () => {
    const query = prepareQuery({
      cacheId: 'error1',
      query: (schema) => {
        return schema.hello({
          name: 'zxc',
        });
      },
    });
    fetchMock.mock(endpoint, {
      status: 403,
    });

    await expect(query.prepare()).rejects.toThrowError(
      'Network error, received status code 403 Forbidden'
    );
  });

  test('graphql error invalid request', async () => {
    const query = prepareQuery({
      cacheId: 'error2',
      query: (schema) => {
        return schema.currentSeconds;
      },
    });
    fetchMock.mock(endpoint, {
      status: 400,
      body: {
        data: null,
        errors: [new GraphQLError('gql_error_400')],
      },
    });

    await expect(query.prepare()).rejects.toEqual([
      {
        message: 'gql_error_400',
      },
    ]);
  });

  test('graphql error', async () => {
    const query = prepareQuery({
      cacheId: 'error2',
      query: (schema) => {
        return schema.currentSeconds;
      },
    });
    fetchMock.mock(endpoint, {
      status: 200,
      body: {
        data: null,
        errors: [new GraphQLError('any gql error')],
      },
    });

    await expect(query.prepare()).rejects.toEqual([
      {
        message: 'any gql error',
      },
    ]);
  });
});

describe('useQuery error handling', () => {
  let errorSpy = jest.spyOn(global.console, 'error');

  beforeEach(() => {
    errorSpy = jest.spyOn(global.console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    await wait(10);
    errorSpy.mockRestore();
    fetchMock.restore();
  });

  test('graphql error', async () => {
    fetchMock.mock(endpoint, {
      status: 200,
      body: {
        data: null,
        errors: [new GraphQLError('gql_error')],
      },
    });
    const hook = renderHook(() => {
      return useQuery((schema) => {
        return schema.currentSeconds;
      });
    });

    await waitForExpect(() => {
      expect(hook.result.current[0].fetchState).toBe('error');
    }, 500);

    expect(hook.result.current[0].data).toBeUndefined();
    expect(hook.result.current[0].errors).toEqual([
      new GraphQLError('gql_error'),
    ]);
  });

  test('network error', async () => {
    fetchMock.mock(endpoint, {
      status: 403,
    });
    const hook = renderHook(() => {
      return useQuery((schema) => {
        return schema.currentSeconds;
      });
    });

    await waitForExpect(() => {
      expect(hook.result.current[0].fetchState).toBe('error');
    }, 500);

    expect(hook.result.current[0].data).toBeUndefined();
    expect(hook.result.current[0].errors).toEqual([
      new Error('Network error, received status code 403 Forbidden'),
    ]);
  });

  test('fetch error', async () => {
    fetchMock.mock(endpoint, () => {
      throw Error('fetchError!!');
    });

    const hook = renderHook(() => {
      return useQuery((schema) => {
        return schema.currentSeconds;
      });
    });

    await waitForExpect(() => {
      expect(hook.result.current[0].fetchState).toBe('error');
    }, 500);

    expect(hook.result.current[0].data).toBeUndefined();
    expect(hook.result.current[0].errors).toEqual([new Error('fetchError!!')]);
  });
});

describe('timeout works', () => {
  it('useMutation timeout', async () => {
    const mutation = renderHook(() => {
      return useMutation(
        (schema) => {
          return schema.helloMutation({
            arg1: 'zxc',
          });
        },
        {
          fetchTimeout: 0,
        }
      );
    });

    await expect(mutation.result.current[0]()).rejects.toEqual(
      Error(TIMEOUT_ERROR_MESSAGE)
    );
  });

  it('useQuery timeout', async () => {
    const query = renderHook(() => {
      return useQuery(
        (schema) => {
          return schema.currentSeconds;
        },
        {
          lazy: true,
          fetchTimeout: 0,
          notifyOnNetworkStatusChange: false,
          fetchPolicy: 'cache-first',
          sharedCacheId: 'usequerytimeout',
        }
      );
    });

    await expect(query.result.current[1].callback()).rejects.toEqual(
      Error(TIMEOUT_ERROR_MESSAGE)
    );
  });

  it('prepareQuery timeout', async () => {
    const query = prepareQuery({
      cacheId: 'query_timeout',
      query: (schema) => {
        return schema.currentSeconds;
      },
      fetchTimeout: 50,
    });

    await expect(query.prepare()).rejects.toEqual(Error(TIMEOUT_ERROR_MESSAGE));
  });
});

describe('prepareQuery utilities', () => {
  it('refetch', async () => {
    const query = prepareQuery({
      query: (schema, { name }: { name: string }) => {
        return schema.hello({
          name,
        });
      },
      variables: {
        name: '111',
      },
      cacheId: 'prepareQueryRefetch',
    });

    const data = await query.prepare();

    expect(data).toBe('query 111!');

    const hook = renderHook(() => {
      return query.useQuery();
    });

    expect(hook.result.current[0].fetchState).toBe('done');
    expect(hook.result.current[0].data).toBe(data);

    await act(async () => {
      const newData = await query.prepare({
        variables: {
          name: '222',
        },
      });
      expect(newData).toBe('query 222!');
    });

    expect(hook.result.current[0].data).toBe('query 222!');
  });

  it('setData', async () => {
    const query = prepareQuery({
      query: (schema) => {
        return schema.hello({
          name: 'setdata',
        });
      },
      cacheId: 'prepareQuerySetData',
    });

    query.setCacheData('data1');

    const hook = renderHook(() => {
      return query.useQuery();
    });

    expect(hook.result.current[0].data).toBe('data1');

    act(() => {
      query.setCacheData((prevData) => 'data2' + prevData);
    });

    expect(hook.result.current[0].data).toBe('data2data1');
  });
});

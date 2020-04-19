import { useState } from 'react';
import waitForExpect from 'wait-for-expect';

import {
  act,
  cleanup as cleanupHooks,
  renderHook,
} from '@testing-library/react-hooks';

import {
  useMutation,
  useQuery,
  QueryFunction,
} from './generated/graphql/client';
import { close, isClosed, isListening } from './server';

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

describe('basic usage and cache', () => {
  const QueryZxc: QueryFunction<string> = ({ hello }) => {
    return hello({
      name: 'zxc',
    });
  };
  test('query works and minimizes renders calls', async () => {
    const nRenderFirst = renderCount();

    expect(nRenderFirst.renders.n).toBe(0);

    const { result } = renderHook(() => {
      nRenderFirst.render();
      const hook = useQuery(QueryZxc, {
        hookId: 'queryhello1',
      });

      return hook;
    });

    expect(result.current[0].data).toBe(undefined);
    expect(result.current[0].fetchState).toBe('loading');
    expect(nRenderFirst.renders.n).toBe(1);

    await act(async () => {
      await waitForExpect(() => {
        expect(nRenderFirst.renders.n).toBe(2);

        expect(result.current[0].fetchState).toBe('done');
      }, 500);
    });

    expect(nRenderFirst.renders.n).toBe(2);

    expect(result.current[0].data).toBe('query zxc!');

    const nRenderCache = renderCount();

    expect(nRenderCache.renders.n).toBe(0);
    expect(nRenderFirst.renders.n).toBe(2);

    const otherQuery = renderHook(() => {
      nRenderCache.render();
      const hook = useQuery(QueryZxc, {
        hookId: 'queryhello2',
      });

      return hook;
    });

    expect(otherQuery.result.current[0].data).toBe('query zxc!');
    expect(otherQuery.result.current[0].fetchState).toBe('done');
    expect(nRenderCache.renders.n).toBe(2);

    expect(nRenderCache.renders.n).toBe(2);
    expect(nRenderFirst.renders.n).toBe(2);

    const nRenderCacheAndNetwork = renderCount();

    expect(nRenderCacheAndNetwork.renders.n).toBe(0);

    const otherQueryNetwork = renderHook(() => {
      nRenderCacheAndNetwork.render();
      const hook = useQuery(QueryZxc, {
        fetchPolicy: 'cache-and-network',
      });

      return hook;
    });

    expect(nRenderCache.renders.n).toBe(2);
    expect(nRenderCacheAndNetwork.renders.n).toBe(2);
    expect(nRenderFirst.renders.n).toBe(2);

    expect(otherQueryNetwork.result.current[0].fetchState).toBe('loading');
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');

    await act(async () => {
      await waitForExpect(() => {
        expect(otherQueryNetwork.result.current[0].fetchState).toBe('done');
      }, 500);
    });
    expect(nRenderCacheAndNetwork.renders.n).toBe(3);
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');
    expect(nRenderFirst.renders.n).toBe(2);

    const otherQueryAfterNewClient = renderHook(() => {
      const hook = useQuery(QueryZxc);

      return hook;
    });
    expect(nRenderFirst.renders.n).toBe(2);

    expect(otherQueryAfterNewClient.result.current[0].fetchState).toBe('done');
    expect(otherQueryAfterNewClient.result.current[0].data).toBe('query zxc!');
  });

  test('mutation works', async () => {
    const { result } = renderHook(() => {
      const hook = useMutation(({ helloMutation }) => {
        const result = helloMutation({
          arg1: 'zxc',
        });

        return result;
      }, {});

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
      const hook = useQuery(QueryZxc);

      return hook;
    });

    expect(otherQuery.result.current[0].fetchState).toBe('done');
    expect(otherQuery.result.current[0].data).toBe('query zxc!');
  });
});

describe('detect variables change', () => {
  test('query variables', async () => {
    const query = renderHook(() => {
      const nameState = useState('cvb');
      const hook = useQuery(
        ({ hello }, { name }) => {
          console.log({
            name,
          });
          const result = hello({
            name,
          });

          return result;
        },
        {
          hookId: 'querycvb',
          variables: {
            name: nameState[0],
          },
        }
      );

      return { hook, nameState };
    });

    expect(query.result.current.hook[0].fetchState).toBe('loading');

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
  });
});

describe('multiple hooks usage and cache', () => {
  const LoremIpsumQuery: QueryFunction = ({ loremIpsum }) => {
    return loremIpsum.map((v) => v);
  };
  test('array push and reset', async () => {
    const { result } = renderHook(() => {
      const query1 = useQuery(LoremIpsumQuery, {
        headers: {
          query1: '',
        },
        hookId: 'query1',
      });
      const query2 = useQuery(LoremIpsumQuery, {
        lazy: true,
        headers: {
          query2: '',
        },
        hookId: 'query2',
        fetchPolicy: 'cache-and-network',
      });
      const mutation1 = useMutation(({ resetLoremIpsum }) => {
        return resetLoremIpsum.map((v) => v);
      }, {});

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
    });

    expect(result.current.query2[0].fetchState).toBe('done');

    expect(result.current.query2[0].data).toHaveLength(2);

    await act(async () => {
      await waitForExpect(() => {
        console.log(
          result.current.query1[0].data,
          'vs',
          result.current.query2[0].data
        );
        expect(result.current.query1[0].data).toEqual(
          result.current.query2[0].data
        );
      }, 100);
    });

    expect(result.current.query1[0].fetchState).toBe('done');
    expect(result.current.query2[0].fetchState).toBe('done');

    await act(async () => {
      expect(result.current.mutation1[1].fetchState).toBe('waiting');

      await result.current.mutation1[0]();
      expect(result.current.mutation1[1].fetchState).toBe('done');
      expect(result.current.mutation1[1].data).toHaveLength(0);

      await result.current.query1[1].refetch();

      await waitForExpect(() => {
        expect(result.current.query1[0].data).toHaveLength(1);
      }, 500);

      await waitForExpect(() => {
        expect(result.current.query1[0].data).toHaveLength(1);

        expect(result.current.query1[0].data).toEqual(
          result.current.query2[0].data
        );
      }, 500);
    });
  }, 10000);
});

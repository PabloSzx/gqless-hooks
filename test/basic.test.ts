import { useState } from 'react';
import waitForExpect from 'wait-for-expect';

import {
  act,
  cleanup as cleanupHooks,
  renderHook,
} from '@testing-library/react-hooks';

import { useMutation, useQuery } from './generated/graphql/client';
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
          hookId: 'queryhello1',
          onCompleted: (data, hookspool) => {},
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
      }, 500);
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
          hookId: 'queryhello2',
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
});

describe('detect variables change', () => {
  test('query variables', async () => {
    const query = renderHook(() => {
      const nameState = useState('cvb');
      const hook = useQuery(
        ({ hello }, { name }) => {
          const result = hello({
            name,
          });

          return result;
        },
        {
          variables: {
            name: nameState[0],
          },
        }
      );

      return { hook, nameState };
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
  });
});

describe('multiple hooks usage and cache', () => {
  test('array push and reset', async () => {
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
          hookId: 'query1',
          onCompleted: (data, hookspool) => {
            hookspool.query2;
          },
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
          hookId: 'query2',
          sharedCacheId: 'loremipsumarray',
          fetchPolicy: 'cache-and-network',
        }
      );
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

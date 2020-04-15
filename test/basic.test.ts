import { isListening, isClosed, close } from './server';
import {
  cleanup as cleanupHooks,
  renderHook,
  act,
} from '@testing-library/react-hooks';
import { useQuery, useMutation } from './generated/graphql/client';
import waitForExpect from 'wait-for-expect';

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
  test('query works', async () => {
    const nRender = renderCount();
    const { result } = renderHook(() => {
      nRender.render();
      const hook = useQuery(({ hello }) => {
        const result = hello({
          name: 'zxc',
        });

        return result;
      });

      return hook;
    });

    expect(result.current[0].data).toBe(undefined);
    expect(result.current[0].state).toBe('loading');
    expect(nRender.renders.n).toBe(1);

    await act(async () => {
      await waitForExpect(() => {
        expect(nRender.renders.n).toBe(2);

        expect(result.current[0].state).toBe('done');
      });
    });

    expect(result.current[0].data).toBe('query zxc!');

    const nRenderCache = renderCount();

    expect(nRenderCache.renders.n).toBe(0);

    const otherQuery = renderHook(() => {
      nRenderCache.render();
      const hook = useQuery(({ hello }) => {
        const result = hello({
          name: 'zxc',
        });

        return result;
      });

      return hook;
    });

    expect(nRenderCache.renders.n).toBe(2);

    expect(otherQuery.result.current[0].state).toBe('done');
    expect(otherQuery.result.current[0].data).toBe('query zxc!');

    expect(nRenderCache.renders.n).toBe(2);

    const otherQueryNetwork = renderHook(() => {
      const hook = useQuery(
        ({ hello }) => {
          const result = hello({
            name: 'zxc',
          });

          return result;
        },
        {
          fetchPolicy: 'cache-and-network',
        }
      );

      return hook;
    });

    expect(otherQueryNetwork.result.current[0].state).toBe('loading');
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');

    await act(async () => {
      await waitForExpect(() => {
        expect(otherQueryNetwork.result.current[0].state).toBe('done');
      });
    });
    expect(otherQueryNetwork.result.current[0].data).toBe('query zxc!');

    const otherQueryAfterNewClient = renderHook(() => {
      const hook = useQuery(({ hello }) => {
        const result = hello({
          name: 'zxc',
        });

        return result;
      });

      return hook;
    });

    expect(otherQueryAfterNewClient.result.current[0].state).toBe('done');
    expect(otherQueryAfterNewClient.result.current[0].data).toBe('query zxc!');
  });

  test('mutation works', async () => {
    const { result } = renderHook(() => {
      const hook = useMutation(({ helloMutation }) => {
        const result = helloMutation({
          arg1: 'zxc',
        });

        return result;
      });

      return hook;
    });

    expect(result.current[1].data).toBe(undefined);
    expect(result.current[1].state).toBe('waiting');

    await act(async () => {
      result.current[0]();
      await waitForExpect(() => {
        expect(result.current[1].state).toBe('done');
      });
    });

    expect(result.current[1].data).toBe('mutation zxc');

    const otherQuery = renderHook(() => {
      const hook = useQuery(({ hello }) => {
        const result = hello({
          name: 'zxc',
        });

        return result;
      });

      return hook;
    });

    expect(otherQuery.result.current[0].state).toBe('done');
    expect(otherQuery.result.current[0].data).toBe('query zxc!');
  });
});

describe('multiple hooks usage and cache', () => {
  test('array push and reset', async () => {
    const { result } = renderHook(() => {
      const query1 = useQuery(
        ({ loremIpsum }) => {
          return loremIpsum.map((v) => v);
        },
        {
          cacheKeys: ['queryarray'],
        }
      );
      const query2 = useQuery(
        ({ loremIpsum }) => {
          return loremIpsum.map((v) => v);
        },
        {
          lazy: true,
          cacheKeys: ['queryarray'],
        }
      );
      const mutation1 = useMutation(
        ({ resetLoremIpsum }) => {
          return resetLoremIpsum;
        },
        {
          cacheKeys: ['queryarray'],
        }
      );

      return {
        query1,
        query2,
        mutation1,
      };
    });

    expect(result.current.query1[0].state).toBe('loading');
    expect(result.current.query2[0].state).toBe('waiting');
    expect(result.current.mutation1[1].state).toBe('waiting');

    await act(async () => {
      await waitForExpect(() => {
        expect(result.current.query1[0].state).toBe('done');
      });
    });

    expect(result.current.query1[0].data).toHaveLength(1);

    await act(async () => {
      result.current.query2[1]();
      await waitForExpect(() => {
        expect(result.current.query2[0].data).toHaveLength(1);
      });
      await waitForExpect(() => {
        expect(result.current.query2[0].state).toBe('done');
      });
    });

    expect(result.current.query2[0].data).toHaveLength(2);

    expect(result.current.query1[0].data).toHaveLength(2);

    expect(result.current.query1[0].state).toBe('done');
    expect(result.current.query2[0].state).toBe('done');
  });
});

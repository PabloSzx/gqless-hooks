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

describe('serverTest', () => {
  test('query works', async () => {
    const { result } = renderHook(() => {
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

    await act(async () => {
      await waitForExpect(() => {
        expect(result.current[0].state).toBe('done');
      });
    });

    expect(result.current[0].data).toBe('Hello zxc!');
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
        expect(result.current[1].state).toBe('loading');
      });
      await waitForExpect(() => {
        expect(result.current[1].state).toBe('done');
      });
    });

    expect(result.current[1].data).toBe('mutation zxc');
  });
});

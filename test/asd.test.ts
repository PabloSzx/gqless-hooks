import { isListening, isClosed, close } from './server';

beforeAll(async () => {
  await isListening;
});

afterAll(async () => {
  close();
  await isClosed;
});

describe('serverTest', () => {
  test('test', async () => {
    expect('asd').toBe('asd');
  });
});

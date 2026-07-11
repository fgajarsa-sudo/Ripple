import { asyncStoragePersister, queryClient } from './queryClient';

test('queryClient and its offline persister are constructed', () => {
  expect(queryClient).toBeDefined();
  expect(asyncStoragePersister).toBeDefined();
});

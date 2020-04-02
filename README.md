# gqless-hooks

[![npm version](https://badge.fury.io/js/gqless-hooks.svg)](https://badge.fury.io/js/gqless-hooks)
[![bundlephobia](https://badgen.net/bundlephobia/minzip/gqless-hooks)](https://bundlephobia.com/result?p=gqless-hooks)
[![license](https://badgen.net/github/license/pabloszx/gqless-hooks)](https://github.com/pabloszx/gqless-hooks)
[![combined statuses](https://badgen.net/github/status/pabloszx/gqless-hooks)](https://github.com/pabloszx/gqless-hooks)

```sh
yarn add gqless-hooks
# or
npm install gqless-hooks
```

This library creates a couple of hooks to interact with [**gqless**](https://gqless.dev/), all while being type-safe.

## Usage

This library should ideally be imported and used at **src/graphql/client.ts** (_this is default location, could be anywhere you previously set it up_)

```ts
import { Client, QueryFetcher } from 'gqless';

import { Mutation, Query, schema } from './generated';

import { createUseMutation, createUseQuery } from 'gqless-hooks';

const endpoint = '...';

// ...
export const query = client.query;

export const useMutation = createUseMutation<Mutation>({
  endpoint,
  schema,
});
export const useQuery = createUseQuery<Query>({
  endpoint,
  schema,
});
```

Then anywhere you want to use it, you import it just like the default **query**.

```ts
import { useMutation, useQuery } from '../src/graphql';

const Component = () => {
  const [helloWorldMutation, helloWorldData] = useMutation(
    ({ helloWorldMutation }) => {
      const { id, label } = helloWorldMutation({ arg: 'hello' });

      return { id, label };
    }
  );

  // helloWorldData === { data, state = "loading" | "error" | "waiting" | "done", errors = GraphqlError[] | undefined }

  // helloWorldMutation works as initiator of the mutation or refetch.

  const [helloWorldData, helloWorldQuery] = useQuery(
    ({ helloWorldQuery: { id, label } }) => ({ id, label }),
    {
      // if lazy == true, wait until function from returned array is called
      lazy: true,
    }
  );

  // helloWorldData === { data = { id,label } | undefined | null, state = "loading" | "error" | "waiting" | "done", errors = GraphqlError[] | undefined }

  // helloWorldQuery works as initiator of the query or refetch.
};
```

## About it

These hooks are a proof of concept that ended up working and is a good workaround until **React Suspense** is officially released (with **good SSR support**) and [Mutation are officially supported by gqless](https://github.com/samdenty/gqless/issues/51).

If you are only using these hooks and not the default **query** from gqless, you **don't need to use the graphql HOC**.

## Future

- Add support for Pagination, with a **fetchMore**-alike (since gqless doesn't have planned support for it for the foreseeable future)
- Merge the cache of the default client generated for the **query** with the cache of these hooks.
- Optimize these hooks for not having to create an entire new client every time just for cache invalidation.

# gqless-hooks

[![npm version](https://badge.fury.io/js/gqless-hooks.svg)](https://badge.fury.io/js/gqless-hooks)
[![bundlephobia](https://badgen.net/bundlephobia/minzip/gqless-hooks)](https://bundlephobia.com/result?p=gqless-hooks)
[![license](https://badgen.net/github/license/pabloszx/gqless-hooks)](https://github.com/pabloszx/gqless-hooks)
[![combined checks](https://badgen.net/github/status/pabloszx/gqless-hooks/master)](https://github.com/pabloszx/gqless-hooks)
[![codecov](https://codecov.io/gh/PabloSzx/gqless-hooks/branch/master/graph/badge.svg)](https://codecov.io/gh/PabloSzx/gqless-hooks)

```sh
yarn add gqless-hooks
# or
npm install gqless-hooks
```

This library creates a couple of hooks to interact with [**gqless**](https://gqless.dev/), all while being type-safe.

## If you are not familiar with **gqless** please check [**https://gqless.dev/**](https://gqless.dev/)

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Usage](#usage)
- [Features](#features)
- [Docs and API Reference](#docs-and-api-reference)
- [Usage tips](#usage-tips)
  - [Headers](#headers)
  - [Polling](#polling)
  - [Shared cache and in memory persistence](#shared-cache-and-in-memory-persistence)
  - [Hooks pool](#hooks-pool)
  - [Pagination](#pagination)
- [About it](#about-it)
- [Future](#future)
- [Contributing](#contributing)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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

Then anywhere you want to use them, you import them just like the default vanilla **query**.

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

  // helloWorldMutation works as initiator of the mutation or recall.

  const [helloWorldData, { callback, refetch, cacheRefetch }] = useQuery(
    ({ helloWorldQuery: { id, label } }) => ({ id, label }),
    {
      // if lazy == true, wait until function from returned array is called
      lazy: true,
    }
  );

  // helloWorldData === { data = { id,label } | undefined | null, state = "loading" | "error" | "waiting" | "done", errors = GraphqlError[] | undefined }

  // callback and refetch work as initiators of the query or refetch.
};
```

## Features

- Cache policies, somewhat following [Apollo fetchPolicy](https://www.apollographql.com/docs/react/api/react-apollo/#optionsfetchpolicy)
- Shared global cache.
- Polling
- Automatic refetch on variables change
- Shared hooks pool through unique identifiers (_hookId_ hook option), available via **onCompleted** and **fetchMore** event on every hook.
- Support for **Pagination** with a **fetchMore** callback.

## Docs and API Reference

You can check [https://pabloszx.github.io/gqless-hooks/](https://pabloszx.github.io/gqless-hooks/) for some documentation and API Reference, all generated through it's strong type-safety using [TypeDoc](https://typedoc.org/).

Also keep in mind that these hooks are heavily inspired by [React Apollo GraphQL](https://www.apollographql.com/docs/react/)

- **useQuery** is inspired by [Apollo useQuery](https://www.apollographql.com/docs/react/data/queries/#usequery-api)
- **useMutation** is inspired by [Apollo useMutation](https://www.apollographql.com/docs/react/data/mutations/#usemutation-api)

## Usage tips

Due to how **gqless** works, in the **query** and **mutation** hook functions, when you return some data, you have to explicitly access it's properties for it to detect it's requirements, this means in practice that if you have an **object**, you have to explictly explore its properties (_destructuring for example_) and return them, and for **arrays** is the same, but for them it's recommended to use _array_**.map(...)**.

For example

```ts
useQuery(
  (schema, variables) => {
    // variables === { b: 2 }
    const { field1, field2 } = schema.helloWorldObj;

    return { field1, field2 };

    // return helloWorldObj; <- would return an empty object
  },
  {
    variables: {
      b: 2,
    },
  }
);
useQuery(
  (schema, variables) => {
    // variables === { a: 1 }
    const array = schema.helloWorldArray;

    return array.map(({ fieldA, fieldB }) => ({ fieldA, fieldB }));

    // return array; <- would return an empty array
  },
  {
    variables: {
      a: 1,
    },
  }
);
```

### Headers

You can set headers to be added to every fetch call

```ts
export const useQuery = createUseQuery<Query>({
  schema,
  endpoint,
  creationHeaders: {
    authorization: '...',
  },
});
```

or individually

```ts
//useMutation((schema) => {
useQuery(
  (schema) => {
    //...
  },
  {
    //...
    headers: {
      authorization: '...',
    },
  }
);
```

### Polling

You can set a polling interval in milliseconds

```ts
useQuery(
  (schema) => {
    //...
  },
  {
    //...
    pollInterval: 100,
  }
);
```

### Shared cache and in memory persistence

You can specify that some hooks actually refer to the same data, and for that you can specify a **_sharedCacheId_** that will automatically synchronize the hooks data, or persist in memory hooks data.

> _Be careful and make sure the synchronized hooks share the same data type signature_

```ts
// useMutation((schema) => {
useQuery(
  (schema) => {
    //...
  },
  {
    //...
    sharedCacheId: 'hook1',
  }
);

// another component

// useMutation((schema) => {
useQuery(
  (schema) => {
    //...
  },
  {
    // You could also specify the cache-only fetchPolicy
    // To optimize the hook and prevent unwanted
    // network fetches.
    fetchPolicy: 'cache-only',
    //...
    sharedCacheId: 'hook1',
  }
);
```

You also can manipulate the **shared cache** directly using `setCacheData` and **prevent unnecessary network calls** or **synchronize** different hooks.

```ts
import { setCacheData } from 'gqless-hooks';

// This declaration is optional type-safety
declare global {
  interface gqlessSharedCache {
    hookKey1: string[];
  }
}

setCacheData('hookKey1', ['hello', 'world']);

// ...

useQuery(
  (schema) => {
    // ...
  },
  {
    // ...
    sharedCacheId: 'hookKey1',
  }
);
```

### Hooks pool

You can also synchronize different hooks manually using the **gqless "_HooksPool_"**, available through **onCompleted** and **fetchMore "updateCache"** function.

Since this functionality needs more type-safety to work more safely you will need to use some **type augmentation**.

> For example, in any file inside your project:

```ts
// You also could use the same generated types from gqless
declare global {
  interface gqlessHooksPool {
    query1: {
      data: string[];
      variables: {
        variable1: number;
      };
    };
    query2: {
      data: string;
    };
  }
}
```

Then you can use them

```ts
const [, { fetchMore }] = useQuery(
  (schema) => {
    //...
  },
  {
    hookId: 'query1',
    onCompleted(data, hooksPool) {
      /**
       * hooksPool ===
       * {
       *    query1?: {
       *      callback: ({ variables, fetchPolicy }) => Promise<Maybe<TData>>,
       *      refetch: ({ variables }) => Promise<Maybe<TData>>,
       *      state: { current: { fetchState, data, error, called } },
       *      setData: (data: Maybe<TData> | ((previousData: Maybe<TData>) => Maybe<TData>)) => void
       *    },
       *    query2?: {
       *      callback: ({ variables, fetchPolicy }) => Promise<Maybe<TData>>,
       *      refetch: ({ variables }) => Promise<Maybe<TData>>,
       *      state: { current: { fetchState, data, error, called } },
       *      setData: (data: Maybe<TData> | ((previousData: Maybe<TData>) => Maybe<TData>)) => void
       *    }
       * }
       */
    },
  }
);

// ...

fetchMore({
  variables: {
    //...
  },
  updateCache(previousData, resultData, hooksPool) {
    // hooksPool is the same as onCompleted above
    return [...previousData, ...resultData];
  },
});
```

### Pagination

For pagination you can use **fetchMore** from **useQuery**, somewhat following [Apollo fetchMore](https://www.apollographql.com/docs/react/data/pagination/#using-fetchmore) API.

```ts
const [{ data }, { fetchMore }] = useQuery(
  (schema, { skip, limit }) => {
    const {
      nodes,
      pageInfo: { hasNext },
    } = schema.feed({
      skip,
      limit,
    });

    return {
      nodes: nodes.map(({ _id, title }) => {
        return {
          _id,
          title,
        };
      }),
      pageInfo: {
        hasNext,
      },
    };
  },
  {
    variables: {
      skip: 0,
      limit: 5,
    },
  }
);

// ...
if (data?.hasNext) {
  const newData = await fetchMore({
    variables: {
      skip: data.length,
    },
    updateQuery(previousResult, newResult) {
      if (!newResult) return previousResult;

      // Here you are handling the raw data, not "accessors"
      return {
        pageInfo: newResult.pageInfo,
        nodes: [...(previousResult?.nodes ?? []), ...newResult.nodes],
      };
    },
  });
}
```

## About it

These hooks are a proof of concept that ended up working and is a good workaround until **React Suspense** is officially released (with **good SSR support**), along with the lack of functionality out of the box of the official gqless API, and of course, [Mutation is officially supported by gqless](https://github.com/samdenty/gqless/issues/51).

If you are only using these hooks and not the default **query** from gqless, you **don't need to use the graphql HOC**, and it means **less** bundle size.

## Future

- Add more examples of usage
- Suspense support
- Add support for Subscriptions

## Contributing

Everyone is more than welcome to help in this project, there is a lot of work still to do to improve this library, but I hope it's useful, as it has been while I personally use it for some of my new web development projects.

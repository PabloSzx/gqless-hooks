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
- [About it](#about-it)
- [Future](#future)

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

- Shared global cache using policies.
- Polling
- Automatic refetch on variables change
- Shared hooks pool through unique identifiers, available via **onCompleted** event on every hook.

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

## About it

These hooks are a proof of concept that ended up working and is a good workaround until **React Suspense** is officially released (with **good SSR support**) and [Mutation are officially supported by gqless](https://github.com/samdenty/gqless/issues/51).

If you are only using these hooks and not the default **query** from gqless, you **don't need to use the graphql HOC**.

## Future

- Add more examples of usage
- Add support for Subscriptions
- Add support for Pagination with a **fetchMore**-alike (since gqless doesn't have planned support for it for the foreseeable future)

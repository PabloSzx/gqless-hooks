// @ts-nocheck
import * as extensions from '../extensions';
import { lazyGetters } from '@gqless/utils';
import {
  ObjectNode,
  FieldNode,
  ArrayNode,
  Arguments,
  ArgumentsField,
  ScalarNode,
  EnumNode,
} from 'gqless';

export const schema = {
  get Query() {
    return new ObjectNode(
      {
        get hello() {
          return new FieldNode(
            schema.String,
            new Arguments(
              {
                get name() {
                  return new ArgumentsField(schema.String, false);
                },
              },
              true
            ),
            false
          );
        },
        get loremIpsum() {
          return new FieldNode(
            new ArrayNode(schema.String, false),
            undefined,
            false
          );
        },
      },
      { name: 'Query', extension: ((extensions as any) || {}).Query }
    );
  },
  get String() {
    return new ScalarNode({
      name: 'String',
      extension: ((extensions as any) || {}).String,
    });
  },
  get Mutation() {
    return new ObjectNode(
      {
        get helloMutation() {
          return new FieldNode(
            schema.String,
            new Arguments(
              {
                get arg1() {
                  return new ArgumentsField(schema.String, false);
                },
              },
              true
            ),
            false
          );
        },
        get resetLoremIpsum() {
          return new FieldNode(
            new ArrayNode(schema.String, false),
            undefined,
            false
          );
        },
      },
      { name: 'Mutation', extension: ((extensions as any) || {}).Mutation }
    );
  },
  get __Schema() {
    return new ObjectNode(
      {
        get types() {
          return new FieldNode(
            new ArrayNode(schema.__Type, false),
            undefined,
            false
          );
        },
        get queryType() {
          return new FieldNode(schema.__Type, undefined, false);
        },
        get mutationType() {
          return new FieldNode(schema.__Type, undefined, true);
        },
        get subscriptionType() {
          return new FieldNode(schema.__Type, undefined, true);
        },
        get directives() {
          return new FieldNode(
            new ArrayNode(schema.__Directive, false),
            undefined,
            false
          );
        },
      },
      { name: '__Schema', extension: ((extensions as any) || {}).__Schema }
    );
  },
  get __Type() {
    return new ObjectNode(
      {
        get kind() {
          return new FieldNode(schema.__TypeKind, undefined, false);
        },
        get name() {
          return new FieldNode(schema.String, undefined, true);
        },
        get description() {
          return new FieldNode(schema.String, undefined, true);
        },
        get fields() {
          return new FieldNode(
            new ArrayNode(schema.__Field, true),
            new Arguments({
              get includeDeprecated() {
                return new ArgumentsField(schema.Boolean, true);
              },
            }),
            true
          );
        },
        get interfaces() {
          return new FieldNode(
            new ArrayNode(schema.__Type, true),
            undefined,
            true
          );
        },
        get possibleTypes() {
          return new FieldNode(
            new ArrayNode(schema.__Type, true),
            undefined,
            true
          );
        },
        get enumValues() {
          return new FieldNode(
            new ArrayNode(schema.__EnumValue, true),
            new Arguments({
              get includeDeprecated() {
                return new ArgumentsField(schema.Boolean, true);
              },
            }),
            true
          );
        },
        get inputFields() {
          return new FieldNode(
            new ArrayNode(schema.__InputValue, true),
            undefined,
            true
          );
        },
        get ofType() {
          return new FieldNode(schema.__Type, undefined, true);
        },
      },
      { name: '__Type', extension: ((extensions as any) || {}).__Type }
    );
  },
  get __TypeKind() {
    return new EnumNode({ name: '__TypeKind' });
  },
  get Boolean() {
    return new ScalarNode({
      name: 'Boolean',
      extension: ((extensions as any) || {}).Boolean,
    });
  },
  get __Field() {
    return new ObjectNode(
      {
        get name() {
          return new FieldNode(schema.String, undefined, false);
        },
        get description() {
          return new FieldNode(schema.String, undefined, true);
        },
        get args() {
          return new FieldNode(
            new ArrayNode(schema.__InputValue, false),
            undefined,
            false
          );
        },
        get type() {
          return new FieldNode(schema.__Type, undefined, false);
        },
        get isDeprecated() {
          return new FieldNode(schema.Boolean, undefined, false);
        },
        get deprecationReason() {
          return new FieldNode(schema.String, undefined, true);
        },
      },
      { name: '__Field', extension: ((extensions as any) || {}).__Field }
    );
  },
  get __InputValue() {
    return new ObjectNode(
      {
        get name() {
          return new FieldNode(schema.String, undefined, false);
        },
        get description() {
          return new FieldNode(schema.String, undefined, true);
        },
        get type() {
          return new FieldNode(schema.__Type, undefined, false);
        },
        get defaultValue() {
          return new FieldNode(schema.String, undefined, true);
        },
      },
      {
        name: '__InputValue',
        extension: ((extensions as any) || {}).__InputValue,
      }
    );
  },
  get __EnumValue() {
    return new ObjectNode(
      {
        get name() {
          return new FieldNode(schema.String, undefined, false);
        },
        get description() {
          return new FieldNode(schema.String, undefined, true);
        },
        get isDeprecated() {
          return new FieldNode(schema.Boolean, undefined, false);
        },
        get deprecationReason() {
          return new FieldNode(schema.String, undefined, true);
        },
      },
      {
        name: '__EnumValue',
        extension: ((extensions as any) || {}).__EnumValue,
      }
    );
  },
  get __Directive() {
    return new ObjectNode(
      {
        get name() {
          return new FieldNode(schema.String, undefined, false);
        },
        get description() {
          return new FieldNode(schema.String, undefined, true);
        },
        get locations() {
          return new FieldNode(
            new ArrayNode(schema.__DirectiveLocation, false),
            undefined,
            false
          );
        },
        get args() {
          return new FieldNode(
            new ArrayNode(schema.__InputValue, false),
            undefined,
            false
          );
        },
      },
      {
        name: '__Directive',
        extension: ((extensions as any) || {}).__Directive,
      }
    );
  },
  get __DirectiveLocation() {
    return new EnumNode({ name: '__DirectiveLocation' });
  },
};

lazyGetters(schema);

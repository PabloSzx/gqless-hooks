import * as extensions from '../extensions';
import {
  TypeData,
  FieldsType,
  FieldsTypeArg,
  ScalarType,
  EnumType,
} from 'gqless';

type Extension<TName extends string> = TName extends keyof typeof extensions
  ? typeof extensions[TName]
  : any;

/**
 * @name Query
 * @type OBJECT
 */
type t_Query = FieldsType<
  {
    __typename: t_String<'Query'>;
    objectA: t_ObjectA;
    listObject: t_ObjectA[];
    loremIpsumPagination: FieldsTypeArg<
      { limit: number; skip: number },
      t_String[]
    >;
    hello: FieldsTypeArg<{ name: string }, t_String>;
    currentSeconds: t_Int;
    loremIpsum: t_String[];
  },
  Extension<'Query'>
>;

/**
 * @name ObjectA
 * @type OBJECT
 */
type t_ObjectA = FieldsType<
  {
    __typename: t_String<'ObjectA'>;
    fieldA: t_String;
    fieldB: t_String;
  },
  Extension<'ObjectA'>
>;

/**
 * @name String
 * @type SCALAR
 */
type t_String<T extends string = string> = ScalarType<T, Extension<'String'>>;

/**
 * @name Int
 * @type SCALAR
 */
type t_Int<T extends number = number> = ScalarType<T, Extension<'Int'>>;

/**
 * @name Mutation
 * @type OBJECT
 */
type t_Mutation = FieldsType<
  {
    __typename: t_String<'Mutation'>;
    helloMutation: FieldsTypeArg<{ arg1: string }, t_String>;
    resetLoremIpsum: t_String[];
  },
  Extension<'Mutation'>
>;

/**
 * @name __Schema
 * @type OBJECT
 */
type t___Schema = FieldsType<
  {
    __typename: t_String<'__Schema'>;

    /**
     * A list of all types supported by this server.
     */
    types: t___Type[];

    /**
     * The type that query operations will be rooted at.
     */
    queryType: t___Type;

    /**
     * If this server supports mutation, the type that mutation operations will be rooted at.
     */
    mutationType?: t___Type | undefined | null;

    /**
     * If this server support subscription, the type that subscription operations will be rooted at.
     */
    subscriptionType?: t___Type | undefined | null;

    /**
     * A list of all directives supported by this server.
     */
    directives: t___Directive[];
  },
  Extension<'__Schema'>
>;

/**
 * @name __Type
 * @type OBJECT
 */
type t___Type = FieldsType<
  {
    __typename: t_String<'__Type'>;
    kind: t___TypeKind;
    name?: t_String | undefined | null;
    description?: t_String | undefined | null;
    fields?: FieldsTypeArg<
      { includeDeprecated?: boolean | undefined | null },
      t___Field[] | undefined | null
    >;
    interfaces?: t___Type[] | undefined | null;
    possibleTypes?: t___Type[] | undefined | null;
    enumValues?: FieldsTypeArg<
      { includeDeprecated?: boolean | undefined | null },
      t___EnumValue[] | undefined | null
    >;
    inputFields?: t___InputValue[] | undefined | null;
    ofType?: t___Type | undefined | null;
  },
  Extension<'__Type'>
>;

/**
 * @name __TypeKind
 * @type ENUM
 */
type t___TypeKind = EnumType<
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL'
>;

/**
 * @name Boolean
 * @type SCALAR
 */
type t_Boolean<T extends boolean = boolean> = ScalarType<
  T,
  Extension<'Boolean'>
>;

/**
 * @name __Field
 * @type OBJECT
 */
type t___Field = FieldsType<
  {
    __typename: t_String<'__Field'>;
    name: t_String;
    description?: t_String | undefined | null;
    args: t___InputValue[];
    type: t___Type;
    isDeprecated: t_Boolean;
    deprecationReason?: t_String | undefined | null;
  },
  Extension<'__Field'>
>;

/**
 * @name __InputValue
 * @type OBJECT
 */
type t___InputValue = FieldsType<
  {
    __typename: t_String<'__InputValue'>;
    name: t_String;
    description?: t_String | undefined | null;
    type: t___Type;

    /**
     * A GraphQL-formatted string representing the default value for this input value.
     */
    defaultValue?: t_String | undefined | null;
  },
  Extension<'__InputValue'>
>;

/**
 * @name __EnumValue
 * @type OBJECT
 */
type t___EnumValue = FieldsType<
  {
    __typename: t_String<'__EnumValue'>;
    name: t_String;
    description?: t_String | undefined | null;
    isDeprecated: t_Boolean;
    deprecationReason?: t_String | undefined | null;
  },
  Extension<'__EnumValue'>
>;

/**
 * @name __Directive
 * @type OBJECT
 */
type t___Directive = FieldsType<
  {
    __typename: t_String<'__Directive'>;
    name: t_String;
    description?: t_String | undefined | null;
    locations: t___DirectiveLocation[];
    args: t___InputValue[];
  },
  Extension<'__Directive'>
>;

/**
 * @name __DirectiveLocation
 * @type ENUM
 */
type t___DirectiveLocation = EnumType<
  | 'QUERY'
  | 'MUTATION'
  | 'SUBSCRIPTION'
  | 'FIELD'
  | 'FRAGMENT_DEFINITION'
  | 'FRAGMENT_SPREAD'
  | 'INLINE_FRAGMENT'
  | 'VARIABLE_DEFINITION'
  | 'SCHEMA'
  | 'SCALAR'
  | 'OBJECT'
  | 'FIELD_DEFINITION'
  | 'ARGUMENT_DEFINITION'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'ENUM_VALUE'
  | 'INPUT_OBJECT'
  | 'INPUT_FIELD_DEFINITION'
>;

/**
 * @name Query
 * @type OBJECT
 */
export type Query = TypeData<t_Query>;

/**
 * @name ObjectA
 * @type OBJECT
 */
export type ObjectA = TypeData<t_ObjectA>;

/**
 * @name String
 * @type SCALAR
 */
export type String = TypeData<t_String>;

/**
 * @name Int
 * @type SCALAR
 */
export type Int = TypeData<t_Int>;

/**
 * @name Mutation
 * @type OBJECT
 */
export type Mutation = TypeData<t_Mutation>;

/**
 * @name __Schema
 * @type OBJECT
 */
export type __Schema = TypeData<t___Schema>;

/**
 * @name __Type
 * @type OBJECT
 */
export type __Type = TypeData<t___Type>;

/**
 * @name __TypeKind
 * @type ENUM
 */
export type __TypeKind = TypeData<t___TypeKind>;

/**
 * @name Boolean
 * @type SCALAR
 */
export type Boolean = TypeData<t_Boolean>;

/**
 * @name __Field
 * @type OBJECT
 */
export type __Field = TypeData<t___Field>;

/**
 * @name __InputValue
 * @type OBJECT
 */
export type __InputValue = TypeData<t___InputValue>;

/**
 * @name __EnumValue
 * @type OBJECT
 */
export type __EnumValue = TypeData<t___EnumValue>;

/**
 * @name __Directive
 * @type OBJECT
 */
export type __Directive = TypeData<t___Directive>;

/**
 * @name __DirectiveLocation
 * @type ENUM
 */
export type __DirectiveLocation = TypeData<t___DirectiveLocation>;

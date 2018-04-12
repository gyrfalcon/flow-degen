// @flow
import {
  append,
  concat,
  map,
  merge,
  pipe,
  prop,
  reduce,
  tail,
} from 'ramda'

export type DeType =
  | 'Object'
  | 'bool'
  | 'number'
  | 'string'

export type DeImport =
  | 'deBool'
  | 'deField'
  | 'deList'
  | 'deNumber'
  | 'deString'

export type CodeGenDep<CustomType: string, CustomImport: string> = {
  types: Array<DeType | CustomType>,
  imports: Array<DeImport | CustomImport>,
  hoists: Array<string>,
}

export type DeserializerGenerator<CustomType: string, CustomImport: string> = [
  () => string,
  CodeGenDep<CustomType, CustomImport>,
]
export type FieldDeserializer<CustomType, CustomImport> = [
  string,
  DeserializerGenerator<CustomType, CustomImport>,
]

type ErrorPred = (e: Error) => Error
export const maybeMap = <T: mixed, U: mixed>(
  unwrap: (T) => U,
  error: ErrorPred,
  x: T | Error
): U | Error => {
  if(x instanceof Error) {
    return error(x)
  }
  else {
    return unwrap(x)
  }
}

export function mergeDeps<CustomType: string, CustomImport: string>(
  a: CodeGenDep<CustomType, CustomImport>,
  b: CodeGenDep<CustomType, CustomImport>,
): CodeGenDep<CustomType, CustomImport> {
  return {
    imports: concat(a.imports, b.imports),
    types: concat(a.types, b.types),
    hoists: concat(a.hoists, b.hoists),
  }
}

export const degenObject = <CustomType: string, CustomImport: string>(
  deType: DeType,
  fields: Array<FieldDeserializer<CustomType, CustomImport>>,
): DeserializerGenerator<CustomType, CustomImport> => {
  const fieldDeps = reduce(mergeDeps, { imports: [], types: [], hoists: [] },
    map(([, [, deps]]) => deps, fields)
  )
  return [() => {
    // Is there an R.unzip?
    // No.
    const names = map(([n]) => n, fields)
    const fieldDeserializers = map(([, f]) => f[0](), fields)
    return `(json: mixed): ${deType} | Error => {
  if(json === null) {
    return new Error('Could not deserialize json because the value is null.')
  }
  else if(typeof json == 'undefined') {
    return new Error('Could not deserialize json because the value is undefined.')
  }
  else if(json instanceof Error || typeof json != 'object') {
    return new Error('Could not deserialize object "' + String(json) + '"')
  }
  else {
    ${fieldDeserializers.join('\n')}
      const result: ${deType} = {
        ${names.join(',\n')}
      }
      return result
    ${tail(fieldDeserializers.map(() => '}')).join('')}
    }
  }
}
`
  },
    mergeDeps(fieldDeps, { types: [deType], imports: [], hoists: [] })
  ]
}

export const degenField = <CustomType: string, CustomImport: string>(
  fieldName: string,
  deserializer: DeserializerGenerator<CustomType, CustomImport>,
): FieldDeserializer<CustomType, CustomImport> => {
  const [deserializerFn, deps] = deserializer
  return [fieldName, [() => {
    // the `else {` is terminated in deObject during the join.
    return `const ${fieldName} = (
      deField('${fieldName}',
        (${deserializerFn()}),
        json.${fieldName})
    )
if(${fieldName} instanceof Error) {
  const error: Error = ${fieldName}
  return new Error('Could not deserialize field "${fieldName}": ' + error.message)
} else {`
  },
    mergeDeps(deps, { types: [], imports: ['deField'], hoists: [] }),
  ]]
}

export const degenList = <CustomType: string, CustomImport: string>(
  element: DeserializerGenerator<CustomType, CustomImport>,
): DeserializerGenerator<CustomType, CustomImport> => {
  const [elementDeserializer, deps] = element
  return [() => {
    return `deList.bind(null, ${elementDeserializer()})`
  }, mergeDeps(deps, { types: [], imports: ['deList'], hoists: [] }),
  ]
}

export const degenString = <CustomType: string, CustomImport: string>(
): DeserializerGenerator<CustomType, CustomImport> => {
  return [() => {
    return `deString`
  }, {
    types: ['string' ],
    imports: ['deString'],
    hoists: [],
  }]
}

// Right now I don't know how we'd verify what a file path looks like other than
// checking to see if there's an extension (which needn't always be the case).
// For now this gives us semantic expressions at least.
export const degenFilePath = degenString

export const degenEnum = <CustomType: string, CustomImport: string>(
  deType: DeType,
  values: Array<string>
): DeserializerGenerator<CustomType, CustomImport> => {
  const [ stringGen, deps ] = degenString()
  return [() => {
    // Needs triple equals here.
    const check = values.map(x => `'${x}'`).join(' === either || ') + ' === either'
    const oneOf = values.join(', ')
    return `(v: mixed): ${deType} | Error => {
  const either = ${stringGen()}(v)
  if(either instanceof Error) {
    return new Error('Could not deserialize "' + String(v) +'" into enum "${deType}":' + either.message)
  }
  else {
    if(${check}) {
      return either
    }
    else {
      return new Error('Could not deserialize "' + String(v) +"' into one of the enum values: ${oneOf}'")
    }
  }
}`
  },
    mergeDeps(deps, { types: [deType], imports: [], hoists: [] })
  ]
}

export const degenBool = <CustomType: string, CustomImport: string>(
): DeserializerGenerator<CustomType, CustomImport> => {
  return [() => {
    return `deBool`
  }, {
    types: [],
    imports: ['deBool'],
    hoists: [],
  }]
}

export const degenNumber = <CustomType: string, CustomImport: string>(
): DeserializerGenerator<CustomType, CustomImport> => {
  return [() => {
    return `deNumber`
  }, {
    types: [],
    imports: ['deNumber'],
    hoists: [],
  }]
}

export type DeSentinelProp<CustomType: string, CustomImport: string> = {
  key: string,
  deserializer: DeserializerGenerator<CustomType, CustomImport>,
}

export const degenSentinelValue = <CustomType: string, CustomImport: string>(
  key: string,
  deserializer: DeserializerGenerator<CustomType, CustomImport>,
): DeSentinelProp<CustomType, CustomImport> => {
  return { key, deserializer }
}

const sentinelPropToCase = <CustomType: string, CustomImport: string>(
  x: DeSentinelProp<CustomType, CustomImport>,
): string => {
  return `case '${x.key}':
  return (${x.deserializer[0]()})(x)
`
}

const addReturnToCase = (kase: string): string => {
  return `${kase}
return x`
}

export const degenSum = <CustomType: string, CustomImport: string>(
  deType: DeType,
  sentinelField: string,
  sentinelFieldType: DeType,
  props: Array<DeSentinelProp<CustomType, CustomImport>>,
): DeserializerGenerator<CustomType, CustomImport> => {
  const fnName = `${deType}Refine`
  // Type declaration needs to be outside the function or we get "name already
  // bound"
  const hoist = `
// Exhaustive union checks don't work, but there is a workaround.
// See: https://github.com/facebook/flow/issues/3790
type ${deType}UnreachableFix = empty
type ${deType}ExhaustiveUnionFix = ${sentinelFieldType} | ${deType}UnreachableFix
const ${fnName} = (x: mixed): ${deType} | Error => {
  if(x != null && typeof x == 'object' && x.hasOwnProperty('${sentinelField}')
&& typeof x.${sentinelField} == 'string') {
    const sentinelValue = (${degenEnum(sentinelFieldType, props.map(p => p.key))[0]()})(x.${sentinelField})
    if(sentinelValue instanceof Error) {
      return new Error('Sentinel field ${sentinelField} could not deserialize properly: ' + sentinelValue.message)
    }
    else {
      // const union: ${deType}ExhaustiveUnionFix = sentinelValue
      // switch(union) {
      switch(sentinelValue) {
        ${pipe(
          map(sentinelPropToCase),
        )(props).join('\n')}
      default:
        // Fixes Flow's inability to cover exhaustive cases.
        // ;(union: ${deType}UnreachableFix)
        return new Error('unreachable')
      }
    }
  }
  else {
    return new Error('Could not deserialize object into ${deType}: ' + JSON.stringify(x))
  }
}`
  return [() => {return `${fnName}`}, reduce(mergeDeps, {
    types: [deType, sentinelFieldType],
    imports: [],
    hoists: [hoist],
  }, map(
    (y: DeserializerGenerator<CustomType, CustomImport>) => y[1],
    map(prop('deserializer'), props),
  ))]
}

export const degenValue = <CustomType: string, CustomImport: string>(
  type: string,
  value: mixed,
): DeserializerGenerator<CustomType, CustomImport> => {
  return [() => {
    return `(x: mixed) => {
  if(typeof x != '${type}') {
    return new Error('Could not deserialize "' + String(x) + '" into a ${type}.')
  }
  else if(x === ${JSON.stringify(value)}){
    return x
  }
  else {
    return new Error('Could not deserialize "' + String(x) + '" into a ${type} with the value ${JSON.stringify(value)}.')
  }
}`}, {
  types: [],
  imports: [],
  hoists: [],
}]
}

export const de = <CustomType: string, CustomImport: string>(
  type: string,
  deserializer: DeserializerGenerator<CustomType, CustomImport>,
): string => {
  return `genHook.genDe${type} = ${deserializer[0]()}`
}

import type { FetchError, FetchOptions } from 'ofetch'
import type { NitroFetchRequest, TypedInternalResponse, AvailableRouterMethod as _AvailableRouterMethod } from 'nitropack'
import type { MaybeRef, Ref } from 'vue'
import { computed, reactive, unref } from 'vue'
import { hash } from 'ohash'
import { useRequestFetch } from './ssr'
import type { AsyncData, AsyncDataOptions, KeysOf, MultiWatchSources, PickFrom } from './asyncData'
import { useAsyncData } from './asyncData'

// support uppercase methods, detail: https://github.com/nuxt/nuxt/issues/22313
type AvailableRouterMethod<R extends NitroFetchRequest> = _AvailableRouterMethod<R> | Uppercase<_AvailableRouterMethod<R>>

export type FetchResult<ReqT extends NitroFetchRequest, M extends AvailableRouterMethod<ReqT>> = TypedInternalResponse<ReqT, unknown, Lowercase<M>>

type ComputedOptions<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends Function ? T[K] : ComputedOptions<T[K]> | Ref<T[K]> | T[K]
}

interface NitroFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>> extends FetchOptions {
  method?: M;
}

type ComputedFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod<R>> = ComputedOptions<NitroFetchOptions<R, M>>

export interface UseFetchOptions<
  ResT,
  DataT = ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = null,
  R extends NitroFetchRequest = string & {},
  M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>
> extends Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'>, ComputedFetchOptions<R, M> {
  key?: string
  $fetch?: typeof globalThis.$fetch
  watch?: MultiWatchSources | false
}

export function useFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = null,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | null>
export function useFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = DataT,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | null>
export function useFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = null,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  arg1?: string | UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>,
  arg2?: string
) {
  const [opts = {}, autoKey] = typeof arg1 === 'string' ? [{}, arg1] : [arg1, arg2]

  const _request = computed(() => {
    let r = request
    if (typeof r === 'function') {
      r = r()
    }
    return unref(r)
  })

  const _key = opts.key || hash([autoKey, unref(opts.method as MaybeRef<string | undefined> | undefined)?.toUpperCase() || 'GET', unref(opts.baseURL), typeof _request.value === 'string' ? _request.value : '', unref(opts.params || opts.query), unref(opts.headers)])
  if (!_key || typeof _key !== 'string') {
    throw new TypeError('[nuxt] [useFetch] key must be a string: ' + _key)
  }
  if (!request) {
    throw new Error('[nuxt] [useFetch] request is missing.')
  }

  const key = _key === autoKey ? '$f' + _key : _key

  if (!opts.baseURL && typeof _request.value === 'string' && _request.value.startsWith('//')) {
    throw new Error('[nuxt] [useFetch] the request URL must not start with "//".')
  }

  const {
    server,
    lazy,
    default: defaultFn,
    transform,
    pick,
    watch,
    immediate,
    getCachedData,
    deep,
    ...fetchOptions
  } = opts

  const _fetchOptions = reactive({
    ...fetchOptions,
    cache: typeof opts.cache === 'boolean' ? undefined : opts.cache
  })

  const _asyncDataOptions: AsyncDataOptions<_ResT, DataT, PickKeys, DefaultT> = {
    server,
    lazy,
    default: defaultFn,
    transform,
    pick,
    immediate,
    getCachedData,
    deep,
    watch: watch === false ? [] : [_fetchOptions, _request, ...(watch || [])]
  }

  let controller: AbortController

  const asyncData = useAsyncData<_ResT, ErrorT, DataT, PickKeys, DefaultT>(key, () => {
    controller?.abort?.()
    controller = typeof AbortController !== 'undefined' ? new AbortController() : {} as AbortController

    const isLocalFetch = typeof _request.value === 'string' && _request.value.startsWith('/')
    let _$fetch = opts.$fetch || globalThis.$fetch
    // Use fetch with request context and headers for server direct API calls
    if (import.meta.server && !opts.$fetch && isLocalFetch) {
      _$fetch = useRequestFetch()
    }

    return _$fetch(_request.value, { signal: controller.signal, ..._fetchOptions } as any) as Promise<_ResT>
  }, _asyncDataOptions)

  return asyncData
}

export function useLazyFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = null,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts?: Omit<UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>, 'lazy'>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | null>
export function useLazyFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = DataT,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts?: Omit<UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>, 'lazy'>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | null>
export function useLazyFetch<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod<ReqT> ? 'get' : AvailableRouterMethod<ReqT> : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = null,
> (
  request: Ref<ReqT> | ReqT | (() => ReqT),
  arg1?: string | Omit<UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>, 'lazy'>,
  arg2?: string
) {
  const [opts, autoKey] = typeof arg1 === 'string' ? [{}, arg1] : [arg1, arg2]

  return useFetch<ResT, ErrorT, ReqT, Method, _ResT, DataT, PickKeys, DefaultT>(request, {
    ...opts,
    lazy: true
  },
  // @ts-expect-error we pass an extra argument with the resolved auto-key to prevent another from being injected
  autoKey)
}

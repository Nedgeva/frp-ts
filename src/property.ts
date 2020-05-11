import { constVoid } from 'fp-ts/lib/function'
import { sequenceS as sequenceSApply, sequenceT as sequenceTApply } from 'fp-ts/lib/Apply'
import { pipe, pipeable } from 'fp-ts/lib/pipeable'
import { HKT, Kind, Kind2, Kind3, Kind4, URIS, URIS2, URIS3, URIS4 } from 'fp-ts/lib/HKT'
import {
	Observable,
	Observable1,
	Observable2,
	Observable2C,
	Observable3,
	Observable3C,
	Observable4,
} from './observable'
import { array } from 'fp-ts/lib/Array'
import { Applicative1 } from 'fp-ts/lib/Applicative'
import { combineNotifier, Disposable, newEmitter, Notifier } from './emitter'
import { newAtom } from './atom'
import { IO } from 'fp-ts/lib/IO'
import { Env } from './clock'

export const URI = 'frp-ts//Property'
export type URI = typeof URI

export interface Getter<A> {
	(): A
}

export interface Property<A> {
	readonly get: Getter<A>
	readonly notifier: Notifier
}

declare module 'fp-ts/lib/HKT' {
	interface URItoKind<A> {
		readonly [URI]: Property<A>
	}
}

const memo2 = <A, B, C>(f: (a: A, b: B) => C): ((a: A, b: B) => C) => {
	let hasValue = false
	let lastA: A
	let lastB: B
	let lastC: C
	return (a, b) => {
		if (!hasValue || a !== lastA || b !== lastB) {
			hasValue = true
			lastA = a
			lastB = b
			lastC = f(a, b)
		}
		return lastC
	}
}
const memo1 = <A, B>(f: (a: A) => B): ((a: A) => B) => {
	let hasValue = false
	let lastA: A
	let lastB: B
	return (a) => {
		if (!hasValue || a !== lastA) {
			hasValue = true
			lastA = a
			lastB = f(a)
		}
		return lastB
	}
}

const memoApply = memo2(<A, B>(f: (a: A) => B, a: A): B => f(a))

export const instance: Applicative1<URI> & Observable1<URI> = {
	URI,
	map: (fa, f) => {
		const memoF = memo1(f)
		return {
			get: () => memoF(fa.get()),
			notifier: fa.notifier,
		}
	},
	of: (a) => ({ get: () => a, notifier: never }),
	ap: (fab, fa) => ({
		get: () => memoApply(fab.get(), fa.get()),
		notifier: combineNotifier(fab.notifier, fa.notifier),
	}),
	subscribe: (ma, observer) => ({
		unsubscribe: ma.notifier(() => observer.next(ma.get())),
	}),
}

export const flatten = <A>(source: Property<Property<A>>): [Property<A>, Disposable] => {
	// store initial inner source in a mutable reference
	let inner: Property<A> = source.get()
	let innerDisposable: Disposable = constVoid
	const emitter = newEmitter()

	const resubscribeToInner = () => {
		// dispose previous subscription
		innerDisposable()
		// create new subscription
		innerDisposable = inner.notifier(emitter.notify)
	}

	const outerDisposable = source.notifier(() => {
		// update reference to new inner source
		inner = source.get()
		resubscribeToInner()
	})

	resubscribeToInner()

	return [
		{
			get: () => {
				// use extra thunk because reference to inner source changes
				return inner.get()
			},
			notifier: emitter.subscribe,
		},
		outerDisposable,
	]
}

export const tap = <A>(f: (a: A) => unknown) => (fa: Property<A>): Property<A> => ({
	get: fa.get,
	notifier: (listener) =>
		fa.notifier((t) => {
			f(fa.get())
			listener(t)
		}),
})

const { map, ap, apFirst, apSecond } = pipeable(instance)
export { map, ap, apFirst, apSecond }

export const sequenceS = sequenceSApply(instance)
export const sequenceT = sequenceTApply(instance)
export const sequence = <A>(sources: Property<A>[]): Property<A[]> => ({
	get: () => array.map(sources, (source) => source.get()),
	notifier: (listener) => {
		const subscriptions = array.map(sources, (source) => source.notifier(listener))
		return () => {
			for (let i = 0, l = subscriptions.length; i < l; i++) {
				subscriptions[i]()
			}
		}
	},
})

export const never: Notifier = () => constVoid

export function fromObservable<M extends URIS4>(
	M: Observable4<M>,
): (env: Env) => <S, R, E, A>(initial: A, ma: Kind4<M, S, R, E, A>) => [Property<A>, Disposable]
export function fromObservable<M extends URIS3>(
	M: Observable3<M>,
): (env: Env) => <R, E, A>(initial: A, ma: Kind3<M, R, E, A>) => [Property<A>, Disposable]
export function fromObservable<M extends URIS3, E>(
	M: Observable3C<M, E>,
): (env: Env) => <R, A>(initial: A, ma: Kind3<M, R, E, A>) => [Property<A>, Disposable]
export function fromObservable<M extends URIS2>(
	M: Observable2<M>,
): (env: Env) => <E, A>(initial: A, ma: Kind2<M, E, A>) => [Property<A>, Disposable]
export function fromObservable<M extends URIS2, E>(
	M: Observable2C<M, E>,
): (env: Env) => <A>(initial: A, ma: Kind2<M, E, A>) => [Property<A>, Disposable]
export function fromObservable<M extends URIS>(
	M: Observable1<M>,
): (env: Env) => <A>(initial: A, ma: Kind<M, A>) => [Property<A>, Disposable]
export function fromObservable<M>(
	M: Observable<M>,
): (env: Env) => <A>(initial: A, ma: HKT<M, A>) => [Property<A>, Disposable]
export function fromObservable<M>(
	M: Observable<M>,
): (env: Env) => <A>(initial: A, ma: HKT<M, A>) => [Property<A>, Disposable] {
	const scanM = scan(M)
	return (env) => {
		const s = scanM(env)
		return (initial, ma) =>
			pipe(
				ma,
				s((_, a) => a, initial),
			)
	}
}

export function scan<M extends URIS4>(
	M: Observable4<M>,
): (
	env: Env,
) => <S, R, E, A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind4<M, S, R, E, A>) => [Property<B>, Disposable]
export function scan<M extends URIS3>(
	M: Observable3<M>,
): (
	env: Env,
) => <R, E, A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind3<M, R, E, A>) => [Property<B>, Disposable]
export function scan<M extends URIS3, E>(
	M: Observable3C<M, E>,
): (env: Env) => <R, A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind3<M, R, E, A>) => [Property<B>, Disposable]
export function scan<M extends URIS2>(
	M: Observable2<M>,
): (env: Env) => <E, A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind2<M, E, A>) => [Property<B>, Disposable]
export function scan<M extends URIS2, E>(
	M: Observable2C<M, E>,
): (env: Env) => <A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind2<M, E, A>) => [Property<B>, Disposable]
export function scan<M extends URIS>(
	M: Observable1<M>,
): (env: Env) => <A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: Kind<M, A>) => [Property<B>, Disposable]
export function scan<M>(
	M: Observable<M>,
): (env: Env) => <A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: HKT<M, A>) => [Property<B>, Disposable]
export function scan<M>(
	M: Observable<M>,
): (env: Env) => <A, B>(f: (acc: B, a: A) => B, initial: B) => (ma: HKT<M, A>) => [Property<B>, Disposable] {
	return (env) => {
		const producer = newAtom(env)
		return (f, initial) => (ma) => {
			const p = producer(initial)
			const s = M.subscribe(ma, {
				next: (a) => p.set(f(p.get(), a)),
				complete: constVoid,
			})
			return [p, () => s.unsubscribe()]
		}
	}
}

export function sample<M extends URIS4>(
	M: Observable4<M>,
): <S, R, E, A>(e: Kind4<M, S, R, E, A>) => <B>(sb: Property<B>) => Kind4<M, S, R, E, B>
export function sample<M extends URIS3>(
	M: Observable3<M>,
): <R, E, A>(e: Kind3<M, R, E, A>) => <B>(sb: Property<B>) => Kind3<M, R, E, B>
export function sample<M extends URIS3, E>(
	M: Observable3C<M, E>,
): <R, A>(e: Kind3<M, R, E, A>) => <B>(sb: Property<B>) => Kind3<M, R, E, B>
export function sample<M extends URIS2>(
	M: Observable2<M>,
): <E, A>(e: Kind2<M, E, A>) => <B>(sb: Property<B>) => Kind2<M, E, B>
export function sample<M extends URIS2, E>(
	M: Observable2C<M, E>,
): <A>(e: Kind2<M, E, A>) => <B>(sb: Property<B>) => Kind2<M, E, B>
export function sample<M extends URIS>(M: Observable1<M>): <A>(e: Kind<M, A>) => <B>(sb: Property<B>) => Kind<M, B>
export function sample<M>(M: Observable<M>): <A>(e: HKT<M, A>) => <B>(sb: Property<B>) => HKT<M, B>
export function sample<M>(M: Observable<M>): <A>(e: HKT<M, A>) => <B>(sb: Property<B>) => HKT<M, B> {
	return (e) => (sb) => M.map(e, sb.get)
}

export function sampleIO<M extends URIS4>(
	M: Observable4<M>,
): <S, R, E, A>(e: Kind4<M, S, R, E, A>) => <B>(sb: Property<B>) => Kind4<M, S, R, E, IO<B>>
export function sampleIO<M extends URIS3>(
	M: Observable3<M>,
): <R, E, A>(e: Kind3<M, R, E, A>) => <B>(sb: Property<B>) => Kind3<M, R, E, IO<B>>
export function sampleIO<M extends URIS3, E>(
	M: Observable3C<M, E>,
): <R, A>(e: Kind3<M, R, E, A>) => <B>(sb: Property<B>) => Kind3<M, R, E, IO<B>>
export function sampleIO<M extends URIS2>(
	M: Observable2<M>,
): <E, A>(e: Kind2<M, E, A>) => <B>(sb: Property<B>) => Kind2<M, E, IO<B>>
export function sampleIO<M extends URIS2, E>(
	M: Observable2C<M, E>,
): <A>(e: Kind2<M, E, A>) => <B>(sb: Property<B>) => Kind2<M, E, IO<B>>
export function sampleIO<M extends URIS>(
	M: Observable1<M>,
): <A>(e: Kind<M, A>) => <B>(sb: Property<B>) => Kind<M, IO<B>>
export function sampleIO<M>(M: Observable<M>): <A>(e: HKT<M, A>) => <B>(sb: Property<B>) => HKT<M, IO<B>>
export function sampleIO<M>(M: Observable<M>): <A>(e: HKT<M, A>) => <B>(sb: Property<B>) => HKT<M, IO<B>> {
	return (e) => (sb) => M.map(e, () => sb.get)
}
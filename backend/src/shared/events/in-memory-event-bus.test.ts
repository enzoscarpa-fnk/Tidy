import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from './in-memory-event-bus';
import type { DomainEvent } from './domain-event';

// ── Fixture ──────────────────────────────────────────────────────────────────

interface TestEvent extends DomainEvent {
  eventType:  'TestEvent';
  occurredAt: Date;
  payload:    { value: string };
}

function makeTestEvent(value = 'hello'): TestEvent {
  return { eventType: 'TestEvent', occurredAt: new Date(), payload: { value } };
}

/**
 * Draine la queue setImmediate en laissant Node.js faire un tour complet
 * de son event loop. Pas besoin de fake timers : setImmediate est réel.
 */
function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  it('appelle le handler abonné quand l\'event correspondant est publié', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe<TestEvent>('TestEvent', handler);

    bus.publish(makeTestEvent('world'));
    await flushSetImmediate();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.value).toBe('world');
  });

  it('n\'appelle PAS un handler abonné à un autre eventType', async () => {
    const handler = vi.fn();
    bus.subscribe('OtherEvent', handler);

    bus.publish(makeTestEvent());
    await flushSetImmediate();

    expect(handler).not.toHaveBeenCalled();
  });

  it('appelle plusieurs handlers pour le même eventType', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', h1);
    bus.subscribe('TestEvent', h2);

    bus.publish(makeTestEvent());
    await flushSetImmediate();

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('est fire-and-forget : publish() retourne AVANT que les handlers s\'exécutent', () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);

    bus.publish(makeTestEvent());

    // Synchrone : setImmediate n'a pas encore tiré, handler intact
    expect(handler).not.toHaveBeenCalled();
  });

  it('un handler qui throw n\'empêche pas les autres handlers de s\'exécuter', async () => {
    const failing    = vi.fn().mockRejectedValue(new Error('boom'));
    const succeeding = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('TestEvent', failing);
    bus.subscribe('TestEvent', succeeding);

    bus.publish(makeTestEvent());
    await flushSetImmediate();

    expect(failing).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
  });

  it('un handler qui throw ne rejette pas publish() (pas de crash process)', async () => {
    bus.subscribe('TestEvent', vi.fn().mockRejectedValue(new Error('crash')));

    expect(() => bus.publish(makeTestEvent())).not.toThrow();
    await flushSetImmediate(); // drainer sans crash
  });
});

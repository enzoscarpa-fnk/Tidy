import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEventBus } from './in-memory-event-bus';
import type { DomainEvent } from './event-bus.port';
import {
  createDocumentUploadedEvent,
  DOCUMENT_UPLOADED,
} from './domain-events';

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface TestEvent extends DomainEvent {
  type:    'TEST_EVENT';
  payload: string;
}

function makeTestEvent(payload = 'hello'): TestEvent {
  return { type: 'TEST_EVENT', occurredAt: new Date(), payload };
}

const uploadedEventPayload = {
  documentId:   'doc-uuid-1',
  workspaceId:  'ws-uuid-1',
  uploadedById: 'user-uuid-1',
  mimeType:     'application/pdf',
  s3Key:        'uploads/doc-uuid-1/file.pdf',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  // ── publish sans handler ───────────────────────────────────────────────────

  describe('publish — sans handler enregistré', () => {
    it('should resolve without error when no handler is registered', async () => {
      await expect(bus.publish(makeTestEvent())).resolves.toBeUndefined();
    });

    it('should have 0 handlers for unregistered eventType', () => {
      expect(bus.handlerCount('TEST_EVENT')).toBe(0);
    });
  });

  // ── subscribe + publish ────────────────────────────────────────────────────

  describe('subscribe + publish', () => {
    it('should call the handler with the correct event', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe<TestEvent>('TEST_EVENT', handler);

      const event = makeTestEvent('world');
      await bus.publish(event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call multiple handlers for the same eventType', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('TEST_EVENT', handler1);
      bus.subscribe('TEST_EVENT', handler2);

      await bus.publish(makeTestEvent());

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should NOT call handlers of a different eventType', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('OTHER_EVENT', handler);

      await bus.publish(makeTestEvent());

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return correct handlerCount after subscribe', () => {
      bus.subscribe('TEST_EVENT', vi.fn());
      bus.subscribe('TEST_EVENT', vi.fn());

      expect(bus.handlerCount('TEST_EVENT')).toBe(2);
    });
  });

  // ── Isolation des erreurs ──────────────────────────────────────────────────

  describe('isolation des erreurs', () => {
    it('should continue calling remaining handlers when one throws', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('handler crash'));
      const goodHandler    = vi.fn().mockResolvedValue(undefined);

      bus.subscribe('TEST_EVENT', failingHandler);
      bus.subscribe('TEST_EVENT', goodHandler);

      await expect(bus.publish(makeTestEvent())).resolves.toBeUndefined();
      expect(goodHandler).toHaveBeenCalledOnce();
    });

    it('should log the error when a handler throws', async () => {
      const logError = vi.fn();
      const localBus = new InMemoryEventBus({ error: logError });
      localBus.subscribe('TEST_EVENT', vi.fn().mockRejectedValue(new Error('boom')));

      await localBus.publish(makeTestEvent());

      expect(logError).toHaveBeenCalledOnce();
      expect(logError.mock.calls[0][1]).toMatchObject({ eventType: 'TEST_EVENT' });
    });

    it('should not throw even if all handlers fail', async () => {
      bus.subscribe('TEST_EVENT', vi.fn().mockRejectedValue(new Error('err1')));
      bus.subscribe('TEST_EVENT', vi.fn().mockRejectedValue(new Error('err2')));

      await expect(bus.publish(makeTestEvent())).resolves.toBeUndefined();
    });
  });

  // ── DocumentUploadedEvent ─────────────────────────────────────────────────

  describe('DocumentUploadedEvent (event métier)', () => {
    it('should dispatch DocumentUploadedEvent to subscribed handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe(DOCUMENT_UPLOADED, handler);

      const event = createDocumentUploadedEvent(uploadedEventPayload);
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type:        DOCUMENT_UPLOADED,
          documentId:  'doc-uuid-1',
          workspaceId: 'ws-uuid-1',
          mimeType:    'application/pdf',
        }),
      );
    });

    it('createDocumentUploadedEvent should set occurredAt automatically', () => {
      const before = new Date();
      const event  = createDocumentUploadedEvent(uploadedEventPayload);
      const after  = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should NOT dispatch DocumentUploadedEvent to handler of different type', async () => {
      const wrongHandler = vi.fn().mockResolvedValue(undefined);
      bus.subscribe('OTHER_EVENT', wrongHandler);

      await bus.publish(createDocumentUploadedEvent(uploadedEventPayload));

      expect(wrongHandler).not.toHaveBeenCalled();
    });
  });
});

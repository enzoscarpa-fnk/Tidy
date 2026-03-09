import { describe, it, expect, beforeEach } from 'vitest';
import { EntityExtractorAdapter } from './entity-extractor.adapter';

describe('EntityExtractorAdapter', () => {
  let adapter: EntityExtractorAdapter;

  beforeEach(() => {
    adapter = new EntityExtractorAdapter();
  });

  // ── AMOUNT ────────────────────────────────────────────────────────────────

  it('should extract a simple euro amount', () => {
    const entities = adapter.extractEntities('Total à payer : 500 €');
    const amount = entities.find((e) => e.entityType === 'AMOUNT');
    expect(amount).toBeDefined();
    expect(amount!.value).toContain('€');
    expect(amount!.confidence).toBe(0.95);
  });

  it('should extract a formatted amount with thousands separator', () => {
    const entities = adapter.extractEntities('Montant TTC : 1 200,00 €');
    const amount = entities.find((e) => e.entityType === 'AMOUNT');
    expect(amount!.value).toBe('1 200,00 €');
  });

  it('should extract multiple amounts from the same text', () => {
    const entities = adapter.extractEntities('HT : 1 000 € — TVA : 200 € — TTC : 1 200 €');
    const amounts = entities.filter((e) => e.entityType === 'AMOUNT');
    expect(amounts.length).toBe(3);
  });

  // ── DATE ──────────────────────────────────────────────────────────────────

  it('should extract a date in DD/MM/YYYY format', () => {
    const entities = adapter.extractEntities('Émise le 15/03/2024');
    const date = entities.find((e) => e.entityType === 'DATE');
    expect(date!.value).toBe('15/03/2024');
  });

  it('should extract a date in DD-MM-YYYY format', () => {
    const entities = adapter.extractEntities('Date : 01-07-2023');
    const date = entities.find((e) => e.entityType === 'DATE');
    expect(date!.value).toBe('01-07-2023');
  });

  it('should extract an ISO date YYYY-MM-DD', () => {
    const entities = adapter.extractEntities('updatedAt: 2024-03-15');
    const date = entities.find((e) => e.entityType === 'DATE' && e.value === '2024-03-15');
    expect(date).toBeDefined();
  });

  // ── IBAN ──────────────────────────────────────────────────────────────────

  it('should extract a French IBAN', () => {
    const entities = adapter.extractEntities('IBAN : FR76 3000 6000 0112 3456 7890 189');
    const iban = entities.find((e) => e.entityType === 'IBAN');
    expect(iban).toBeDefined();
    expect(iban!.value).toContain('FR76');
    expect(iban!.confidence).toBe(0.98);
  });

  // ── SIRET ─────────────────────────────────────────────────────────────────

  it('should extract a SIRET number', () => {
    const entities = adapter.extractEntities('SIRET : 123 456 789 01234');
    const siret = entities.find((e) => e.entityType === 'SIRET');
    expect(siret).toBeDefined();
    expect(siret!.confidence).toBe(0.9);
  });

  it('should extract a SIRET without spaces', () => {
    const entities = adapter.extractEntities('N° SIRET : 12345678901234');
    const siret = entities.find((e) => e.entityType === 'SIRET');
    expect(siret).toBeDefined();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('should return empty array for empty text', () => {
    expect(adapter.extractEntities('')).toEqual([]);
  });

  it('should return empty array for whitespace-only text', () => {
    expect(adapter.extractEntities('   \n\t  ')).toEqual([]);
  });

  it('should extract multiple entity types from one text', () => {
    const text = 'Facture du 15/03/2024 — Total : 1 200,00 € — SIRET : 123 456 789 01234';
    const entities = adapter.extractEntities(text);
    const types = new Set(entities.map((e) => e.entityType));
    expect(types.has('DATE')).toBe(true);
    expect(types.has('AMOUNT')).toBe(true);
    expect(types.has('SIRET')).toBe(true);
  });

  it('should be idempotent — same result on two successive calls', () => {
    const text = 'Montant : 500 € le 01/01/2024';
    const first  = adapter.extractEntities(text);
    const second = adapter.extractEntities(text);
    expect(first).toEqual(second);
  });
});

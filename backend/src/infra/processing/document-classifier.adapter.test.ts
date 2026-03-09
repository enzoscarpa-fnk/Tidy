import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentClassifierAdapter } from './document-classifier.adapter';

describe('DocumentClassifierAdapter', () => {
  let adapter: DocumentClassifierAdapter;

  beforeEach(() => {
    adapter = new DocumentClassifierAdapter();
  });

  // ── INVOICE ───────────────────────────────────────────────────────────────

  it('should classify invoice text as INVOICE', () => {
    const text = 'Facture N°2024-001 — Montant HT : 1 000 € — TVA 20% — Total TTC : 1 200 €';
    const result = adapter.classify(text);
    expect(result.detectedType).toBe('INVOICE');
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it('should classify english invoice as INVOICE', () => {
    const result = adapter.classify('Invoice #INV-2024 — Total amount TTC due : 500€');
    expect(result.detectedType).toBe('INVOICE');
  });

  // ── CONTRACT ─────────────────────────────────────────────────────────────

  it('should classify contract text as CONTRACT', () => {
    const text = 'Contrat de prestation de services — Les parties signataires conviennent des clauses suivantes.';
    const result = adapter.classify(text);
    expect(result.detectedType).toBe('CONTRACT');
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
  });

  // ── RECEIPT ───────────────────────────────────────────────────────────────

  it('should classify receipt text as RECEIPT', () => {
    const text = 'Reçu de paiement — Merci de votre achat — Ticket de caisse N°1234';
    const result = adapter.classify(text);
    expect(result.detectedType).toBe('RECEIPT');
  });

  // ── ID_DOCUMENT ───────────────────────────────────────────────────────────

  it('should classify identity document text as ID_DOCUMENT', () => {
    const text = "Carte nationale d'identité — République Française — CNI N°123456789";
    const result = adapter.classify(text);
    expect(result.detectedType).toBe('ID_DOCUMENT');
  });

  // ── BANK_STATEMENT ────────────────────────────────────────────────────────

  it('should classify bank statement text as BANK_STATEMENT', () => {
    const text = 'Relevé de compte — IBAN FR76 3000 — Solde créditeur — Virement reçu';
    const result = adapter.classify(text);
    expect(result.detectedType).toBe('BANK_STATEMENT');
  });

  // ── OTHER / edge cases ────────────────────────────────────────────────────

  it('should return OTHER with confidence 1.0 for unrecognized text', () => {
    const result = adapter.classify('Lorem ipsum dolor sit amet consectetur adipiscing elit.');
    expect(result.detectedType).toBe('OTHER');
    expect(result.confidence).toBe(1.0);
  });

  it('should return OTHER for empty string', () => {
    const result = adapter.classify('');
    expect(result.detectedType).toBe('OTHER');
  });

  it('should return OTHER for whitespace-only text', () => {
    const result = adapter.classify('   \n\t  ');
    expect(result.detectedType).toBe('OTHER');
  });

  // ── Confidence ────────────────────────────────────────────────────────────

  it('should return higher confidence when more keywords match', () => {
    const sparse = 'Facture émise.';
    const rich   = 'Facture N°001 — Montant HT : 500 € — TVA incluse — Total TTC : 600 € — Bon de commande';
    const a = adapter.classify(sparse);
    const b = adapter.classify(rich);
    expect(b.confidence).toBeGreaterThan(a.confidence);
  });

  it('should never exceed confidence of 0.95', () => {
    const text = 'Facture invoice Montant TTC HT TVA bon de commande montant total';
    const result = adapter.classify(text);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });
});

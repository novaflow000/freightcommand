import { describe, it, expect } from 'vitest';
import {
  looksLikeContainerNumber,
  buildShipsGoCreatePayload,
  normalizeInjectedInput,
  normalizeCarrier,
} from '../src/modules/carriers/carrier_mapping';

describe('carrier_mapping', () => {
  describe('looksLikeContainerNumber', () => {
    it('accepts valid ISO 6346 format (4 letters + 7 digits)', () => {
      expect(looksLikeContainerNumber('CMAU1234567')).toBe(true);
      expect(looksLikeContainerNumber('HLBU1234567')).toBe(true);
      expect(looksLikeContainerNumber('TIIU2909214')).toBe(true);
    });
    it('rejects booking references', () => {
      expect(looksLikeContainerNumber('CSA0418719')).toBe(false);
      expect(looksLikeContainerNumber('265507346')).toBe(false);
    });
    it('rejects invalid formats', () => {
      expect(looksLikeContainerNumber('')).toBe(false);
      expect(looksLikeContainerNumber('CSA')).toBe(false);
      expect(looksLikeContainerNumber('1234567')).toBe(false);
    });
  });

  describe('buildShipsGoCreatePayload', () => {
    it('sends booking_number when value is CSA0418719 (not container format)', () => {
      const payload = buildShipsGoCreatePayload({
        container_number: 'CSA0418719',
        carrier: 'CMA CGM',
      });
      expect(payload.booking_number).toBe('CSA0418719');
      expect(payload.container_number).toBeUndefined();
      expect(payload.carrier).toBe('CMDU');
    });
    it('sends container_number when value is valid container format', () => {
      const payload = buildShipsGoCreatePayload({
        container_number: 'CMAU1234567',
        carrier: 'CMA CGM',
      });
      expect(payload.container_number).toBe('CMAU1234567');
      expect(payload.booking_number).toBeUndefined();
    });
    it('prefers explicit booking_number over container_number', () => {
      const payload = buildShipsGoCreatePayload({
        bl_number: '265507346',
        container_number: 'CSA0418719',
        carrier: 'Maersk',
      });
      expect(payload.booking_number).toBe('265507346');
      expect(payload.bl_number).toBe('265507346');
      expect(payload.container_number).toBeUndefined();
    });
  });

  describe('normalizeInjectedInput', () => {
    it('moves container_number to booking_number when not container format', () => {
      const out = normalizeInjectedInput({
        container_number: 'CSA0418719',
        bl_number: '',
        booking_number: '',
      });
      expect(out.booking_number).toBe('CSA0418719');
      expect(out.bl_number).toBe('CSA0418719');
      expect(out.container_number).toBe('');
    });
    it('keeps container_number when valid format', () => {
      const out = normalizeInjectedInput({
        container_number: 'CMAU1234567',
        bl_number: '',
        booking_number: '',
      });
      expect(out).toEqual({});
    });
    it('uses explicit booking_number when provided', () => {
      const out = normalizeInjectedInput({
        booking_number: 'CSA0418719',
        bl_number: '',
        container_number: '',
      });
      expect(out.booking_number).toBe('CSA0418719');
      expect(out.bl_number).toBe('CSA0418719');
    });
  });

  describe('normalizeCarrier', () => {
    it('maps CMA CGM to CMDU', () => {
      expect(normalizeCarrier('CMA CGM')).toBe('CMDU');
    });
    it('maps Maersk to MAEU', () => {
      expect(normalizeCarrier('Maersk')).toBe('MAEU');
    });
  });
});

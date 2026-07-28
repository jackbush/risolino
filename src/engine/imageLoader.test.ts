import { describe, it, expect } from 'vitest';
import { isHeicFile } from './imageLoader';

function fileWith(name: string, type: string): File {
  return new File([new Uint8Array()], name, { type });
}

describe('isHeicFile', () => {
  it('detects by HEIC/HEIF MIME type', () => {
    expect(isHeicFile(fileWith('a.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(fileWith('a.heif', 'image/heif'))).toBe(true);
    expect(isHeicFile(fileWith('a', 'image/heic-sequence'))).toBe(true);
  });

  it('falls back to extension when the MIME type is empty', () => {
    expect(isHeicFile(fileWith('IMG_0001.HEIC', ''))).toBe(true);
    expect(isHeicFile(fileWith('photo.heif', ''))).toBe(true);
  });

  it('is false for ordinary images', () => {
    expect(isHeicFile(fileWith('a.png', 'image/png'))).toBe(false);
    expect(isHeicFile(fileWith('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(fileWith('a.pdf', 'application/pdf'))).toBe(false);
  });
});

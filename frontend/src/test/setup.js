import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest globals are off, so unmount rendered trees between tests explicitly.
afterEach(() => cleanup());

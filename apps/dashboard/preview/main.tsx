// Preview build: the same dashboard components mounted without the Next.js runtime, so the page
// can be published as a single self-contained file. Not used by the real app.
import { createRoot } from 'react-dom/client';

import { Dashboard } from '@/components/dashboard';

createRoot(document.getElementById('root')!).render(<Dashboard />);

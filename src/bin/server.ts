import { app, trackingEngine } from '../app.ts';
import axios from 'axios';
import { providerRegistry } from '../app.ts';

const PORT = Number(process.env.PORT) || 3000;
const shouldListen = process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test';

async function runHealthChecks() {
  const providers = providerRegistry.listProviders().filter((p) => p.is_active);
  for (const p of providers) {
    try {
      const start = Date.now();
      await axios.get(p.base_url, { timeout: 5000 });
      const latency = Date.now() - start;
      providerRegistry.upsertHealth({
        provider_id: p.id,
        success_rate: 1,
        avg_latency_ms: latency,
        last_checked_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`Health check failed for provider ${p.name}:`, err.message);
      providerRegistry.upsertHealth({
        provider_id: p.id,
        success_rate: 0,
        avg_latency_ms: 0,
        last_checked_at: new Date().toISOString(),
      });
    }
  }
}

if (shouldListen) {
  // Start background tracking loop for runtime server
  trackingEngine.start_tracking();
  // health monitor every 10 minutes
  runHealthChecks();
  setInterval(runHealthChecks, 10 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}

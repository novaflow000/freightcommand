import { ProviderExecutor } from './provider_executor.ts';
import { ProviderRegistry, ProviderRecord } from './provider_registry.ts';

interface ScoreInput {
  provider: ProviderRecord;
  success_rate?: number;
  avg_latency_ms?: number;
}

const weights = {
  priority: 0.4,
  success_rate: 0.3,
  latency: 0.2,
  cost: 0.1, // reserved
};

function computeScore({ provider, success_rate = 1, avg_latency_ms = 500 }: ScoreInput) {
  const priorityScore = 1 - Math.min(1, (provider.priority ?? 10) / 20); // lower priority -> closer to 1
  const successScore = Math.max(0, Math.min(1, success_rate));
  const latencyScore = 1 - Math.min(1, avg_latency_ms / 5000); // 0ms ->1, 5s ->0
  return (
    priorityScore * weights.priority +
    successScore * weights.success_rate +
    latencyScore * weights.latency
  );
}

export class ProviderRouter {
  private registry: ProviderRegistry;
  private executor: ProviderExecutor;

  constructor(registry?: ProviderRegistry, executor?: ProviderExecutor) {
    this.registry = registry || new ProviderRegistry();
    this.executor = executor || new ProviderExecutor(this.registry);
  }

  public selectProvider(shipment: { container_number?: string; bl_number?: string; carrier?: string; carrier_code?: string }) {
    const providers = this.registry.listProviders().filter((p) => p.is_active);
    const health = this.registry.listHealth();
    const coverage = this.registry.listCoverage();

    const requiresContainer = Boolean(shipment.container_number);
    const requiresBL = Boolean(shipment.bl_number);
    const carrier = shipment.carrier_code || shipment.carrier;

    const candidates = providers.filter((p) => {
      if (requiresContainer && p.supports_container_tracking === false) return false;
      if (requiresBL && p.supports_bl_tracking === false) return false;
      // coverage
      const covered = coverage.filter((c) => c.provider_id === p.id);
      const supportsAll = covered.some((c) => c.carrier_code === 'ALL') || p.multi_carrier;
      if (!carrier) return true; // no carrier, allow any
      if (supportsAll) return true;
      return covered.some((c) => c.carrier_code === carrier);
    });

    const scored = candidates.map((p) => {
      const h = health.find((h) => h.provider_id === p.id);
      return { provider: p, score: computeScore({ provider: p, success_rate: h?.success_rate, avg_latency_ms: h?.avg_latency_ms }) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.provider);
  }

  public async executeWithFailover(endpoint_name: string, shipment: any) {
    const ranked = this.selectProvider(shipment);
    const errors: any[] = [];
    for (let i = 0; i < Math.min(3, ranked.length); i += 1) {
      const provider = ranked[i];
      try {
        const response = await this.executor.executeProviderRequest(provider.id, endpoint_name, {
          container_number: shipment.container_number,
          bl_number: shipment.bl_number,
          carrier: shipment.carrier,
        });
        return { provider, response };
      } catch (err) {
        errors.push({ provider: provider.name, error: (err as any)?.message });
      }
    }
    throw new Error(`All providers failed: ${errors.map((e) => `${e.provider}: ${e.error}`).join(' | ')}`);
  }
}
